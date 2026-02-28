from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import joblib
import numpy as np
import sys
import tempfile
from pathlib import Path
from uuid import uuid4
from . import audio_pipeline

# Ensure `backend` directory is on sys.path so `utils` can be imported
project_root = Path(__file__).resolve().parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from utils.curb65 import calculate_curb65

app = FastAPI()

# Allow React to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

model_dir = Path(__file__).resolve().parent / "models"
log_model_path = model_dir / "logistic_model.pkl"
rf_model_path = model_dir / "rf_model.pkl"
try:
    log_model = joblib.load(str(log_model_path))
    rf_model = joblib.load(str(rf_model_path))
except Exception as e:
    raise RuntimeError(f"Failed to load model files: {e}") from e


REQUIRED_PREDICT_FIELDS = (
    "age",
    "breathlessness",
    "spo2",
    "respiratory_rate",
    "systolic_bp",
    "confusion",
    "urea",
)

NUMERIC_RANGES = {
    "age": (0.0, 120.0),
    "spo2": (50.0, 100.0),
    "respiratory_rate": (5.0, 80.0),
    "systolic_bp": (50.0, 250.0),
    "urea": (0.0, 60.0),
}


def _as_float(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return float(default)


def _as_int(value, default=0):
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return int(default)


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, float(value)))


def _normalize_linear(value: float, low: float, high: float) -> float:
    if high <= low:
        return 0.0
    return _clamp((value - low) / (high - low))


def _risk_level_from_score(score: float) -> str:
    if score >= 0.65:
        return "High"
    if score >= 0.4:
        return "Medium"
    return "Low"


def _score_to_probabilities(score: float) -> dict:
    score = _clamp(score)
    low_raw = max(0.0, 1.0 - (score * 1.6))
    med_raw = max(0.0, 1.0 - (abs(score - 0.5) / 0.3))
    high_raw = max(0.0, (score - 0.35) * 1.6)
    total = low_raw + med_raw + high_raw
    if total <= 0:
        return {"low": 0.0, "medium": 1.0, "high": 0.0}
    return {
        "low": round(low_raw / total, 4),
        "medium": round(med_raw / total, 4),
        "high": round(high_raw / total, 4),
    }


def _parse_float_field(payload: dict, name: str, required: bool = True) -> float | None:
    value = payload.get(name)
    if value in (None, ""):
        if required:
            raise HTTPException(status_code=422, detail=f"Missing required field: {name}")
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail=f"Field '{name}' must be a number.") from None


def _parse_binary_field(payload: dict, name: str, required: bool = True) -> int | None:
    value = payload.get(name)
    if value in (None, ""):
        if required:
            raise HTTPException(status_code=422, detail=f"Missing required field: {name}")
        return None
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail=f"Field '{name}' must be 0 or 1.") from None
    if numeric not in (0.0, 1.0):
        raise HTTPException(status_code=422, detail=f"Field '{name}' must be 0 or 1.")
    return int(numeric)


def _validate_range(name: str, value: float):
    low, high = NUMERIC_RANGES[name]
    if value < low or value > high:
        raise HTTPException(status_code=422, detail=f"Field '{name}' must be between {low} and {high}.")


def _validate_predict_payload(data: dict) -> dict:
    if not isinstance(data, dict):
        raise HTTPException(status_code=422, detail="Payload must be a JSON object.")

    missing = [field for field in REQUIRED_PREDICT_FIELDS if data.get(field) in (None, "")]
    if missing:
        raise HTTPException(status_code=422, detail=f"Missing required fields: {', '.join(missing)}")

    parsed = {
        "age": _parse_float_field(data, "age"),
        "spo2": _parse_float_field(data, "spo2"),
        "respiratory_rate": _parse_float_field(data, "respiratory_rate"),
        "systolic_bp": _parse_float_field(data, "systolic_bp"),
        "urea": _parse_float_field(data, "urea"),
        "breathlessness": _parse_binary_field(data, "breathlessness"),
        "confusion": _parse_binary_field(data, "confusion"),
        "fever": _parse_binary_field(data, "fever", required=False),
        "cough": _parse_binary_field(data, "cough", required=False),
    }

    for field in NUMERIC_RANGES:
        _validate_range(field, parsed[field])
    return parsed


def _extract_high_risk_probability(raw_output) -> float:
    if raw_output is None:
        return 0.5

    try:
        arr = np.asarray(raw_output, dtype=float).flatten()
    except (TypeError, ValueError):
        return 0.5

    if arr.size == 0:
        return 0.5

    if arr.size == 1:
        value = float(arr[0])
        if 0.0 <= value <= 1.0:
            return _clamp(value)
        # Treat single unbounded value as logit.
        return _clamp(1.0 / (1.0 + np.exp(-value)))

    if np.all((arr >= 0.0) & (arr <= 1.0)) and arr.sum() > 0:
        probs = arr / arr.sum()
    else:
        exps = np.exp(arr - np.max(arr))
        probs = exps / np.sum(exps)

    if probs.size == 2:
        return _clamp(float(probs[1]))
    return _clamp(float(probs[-1]))


def _build_audio_response(
    filename: str,
    yamnet_top: str,
    embeddings,
    risk_score: float,
    raw_output=None,
    analysis_label: str | None = None,
    audio_analysis: dict | None = None,
    analysis_engine: str | None = None,
) -> dict:
    score = _clamp(risk_score)
    response = {
        "status": "ok",
        "filename": filename,
        "yamnet_top": yamnet_top,
        "embeddings": embeddings,
        "raw_output": raw_output,
        "risk_score": score,
        "risk_level": _risk_level_from_score(score),
        "risk_confidence": f"{round(score * 100)}%",
        "probabilities": _score_to_probabilities(score),
    }
    if analysis_label:
        response["analysis_label"] = analysis_label
    if audio_analysis:
        response["audio_analysis"] = audio_analysis
    if analysis_engine:
        response["analysis_engine"] = analysis_engine
    return response


def _compute_symptom_risk(
    payload: dict,
    model_risk: float,
    curb_score: int,
    model_weight: float = 0.35,
) -> tuple[float, str, dict]:
    """Compute risk from user test entries + model prediction using weighted logical/math operations."""
    spo2 = _as_float(payload.get("spo2"), 100)
    rr = _as_float(payload.get("respiratory_rate"), 0)
    sbp = _as_float(payload.get("systolic_bp"), 120)
    urea = _as_float(payload.get("urea"), 0)
    age = _as_float(payload.get("age"), 0)
    breathlessness = bool(_as_int(payload.get("breathlessness"), 0))
    confusion = bool(_as_int(payload.get("confusion"), 0))

    # Subscores (0..1)
    spo2_risk = _normalize_linear(95.0 - spo2, 0.0, 10.0)
    rr_risk = _normalize_linear(rr, 18.0, 35.0)
    bp_low_risk = _normalize_linear(100.0 - sbp, 0.0, 40.0)
    bp_high_risk = _normalize_linear(sbp, 140.0, 200.0) * 0.6
    bp_risk = max(bp_low_risk, bp_high_risk)
    urea_risk = _normalize_linear(urea, 5.0, 20.0)
    age_risk = _normalize_linear(age, 50.0, 90.0)
    breath_risk = 1.0 if breathlessness else 0.0
    confusion_risk = 1.0 if confusion else 0.0

    # Weighted average of user-provided test result risk.
    entry_score = (
        0.30 * spo2_risk
        + 0.20 * rr_risk
        + 0.15 * bp_risk
        + 0.10 * urea_risk
        + 0.10 * age_risk
        + 0.05 * breath_risk
        + 0.10 * confusion_risk
    )

    # Logical boosts for dangerous combinations.
    combo_boost = 0.0
    if spo2 < 90 and rr >= 30:
        combo_boost += 0.12
    if confusion and sbp < 90:
        combo_boost += 0.15
    if curb_score >= 4:
        combo_boost += 0.15
    elif curb_score >= 2:
        combo_boost += 0.08

    curb_component = min(0.25, max(0.0, curb_score) * 0.03)
    model_weight = _clamp(model_weight)
    entry_weight = 1.0 - model_weight

    # Final blend: mostly entry/test based, partially ML-based.
    final_score = (entry_weight * entry_score) + (model_weight * _clamp(model_risk)) + curb_component + combo_boost
    # Safety floor: severe vitals should never map to low risk.
    rule_floor = 0.0
    if spo2 <= 88:
        rule_floor = max(rule_floor, 0.75)
    elif spo2 <= 90 and breathlessness:
        rule_floor = max(rule_floor, 0.7)
    if rr >= 30:
        rule_floor = max(rule_floor, 0.72)
    if sbp >= 220 or sbp < 90:
        rule_floor = max(rule_floor, 0.72)
    if confusion:
        rule_floor = max(rule_floor, 0.72)
    if curb_score >= 3:
        rule_floor = max(rule_floor, 0.72)

    final_score = max(final_score, rule_floor)
    final_score = _clamp(final_score)
    return final_score, _risk_level_from_score(final_score), {
        "entry_score": round(_clamp(entry_score), 4),
        "model_component": round(_clamp(model_risk), 4) if model_weight > 0 else None,
        "entry_weight": round(entry_weight, 4),
        "model_weight": round(model_weight, 4),
        "curb_component": round(curb_component, 4),
        "combo_boost": round(combo_boost, 4),
        "rule_floor": round(rule_floor, 4),
    }


@app.post("/predict")
def predict(data: dict):
    payload = _validate_predict_payload(data)
    age = payload["age"]
    fever = payload["fever"]
    cough = payload["cough"]
    breathlessness = payload["breathlessness"]
    spo2 = payload["spo2"]

    model_weight = 0.35
    logistic_risk = None
    rf_risk = None
    model_risk = 0.0
    if fever is not None and cough is not None:
        features = np.array([[age, fever, cough, breathlessness, spo2]], dtype=float)
        logistic_risk = float(log_model.predict_proba(features)[0][1])
        rf_risk = float(rf_model.predict_proba(features)[0][1])
        model_risk = float((logistic_risk + rf_risk) / 2.0)
    else:
        # Disable model blend if required model features were not supplied.
        model_weight = 0.0

    curb_score = calculate_curb65(
        bool(payload["confusion"]),
        payload["urea"],
        payload["respiratory_rate"],
        payload["systolic_bp"],
        age,
    )

    risk_score, risk_level, breakdown = _compute_symptom_risk(payload, model_risk, curb_score, model_weight=model_weight)

    return {
        "logistic_risk": logistic_risk,
        "random_forest_risk": rf_risk,
        "model_risk": model_risk,
        "curb65_score": curb_score,
        "risk_score": risk_score,
        "risk_level": risk_level,
        "risk_confidence": f"{round(risk_score * 100)}%",
        "risk_breakdown": breakdown,
        "probabilities": _score_to_probabilities(risk_score),
    }


@app.post("/analyze_audio")
async def analyze_audio(file: UploadFile = File(...)):
    """Accept cough/breath audio and return an estimated respiratory risk score.

    Notes:
    - If `models/tflite_classifier.tflite` exists, that classifier path is used.
    - Otherwise, a deterministic heuristic cough/breath analyzer is used.
    """
    tmp_path = None
    try:
        if not file or not file.filename:
            raise HTTPException(status_code=422, detail="Audio file is required.")

        contents = await file.read()
        if not contents:
            raise HTTPException(status_code=422, detail="Uploaded audio file is empty.")

        suffix = Path(file.filename).suffix or ".bin"
        tmp_path = Path(tempfile.gettempdir()) / f"respirascan_{uuid4().hex}{suffix}"
        tmp_path.write_bytes(contents)

        # If a TFLite classifier is provided in models/ (tflite_classifier.tflite), run it
        classifier_path = Path(__file__).resolve().parent / "models" / "tflite_classifier.tflite"
        if classifier_path.exists():
            try:
                result = audio_pipeline.run_tflite_classifier_on_file(str(tmp_path), str(classifier_path))
                raw_output = result.get("raw_output")
                risk_score = _extract_high_risk_probability(raw_output)
                return _build_audio_response(
                    filename=file.filename,
                    yamnet_top="server-run-classifier",
                    embeddings=result.get("embedding_summary"),
                    risk_score=risk_score,
                    raw_output=raw_output,
                    analysis_label="ml-audio-classifier",
                    analysis_engine="tflite_classifier",
                )
            except Exception as e:
                # fall back to placeholder if classifier fails
                print("Classifier run failed:", e)

        # Heuristic analysis for cough/breath signal when no TFLite model is configured.
        heuristic = audio_pipeline.run_heuristic_audio_risk_on_file(str(tmp_path))
        return _build_audio_response(
            filename=file.filename,
            yamnet_top=heuristic.get("analysis_label", "audio"),
            embeddings=heuristic.get("feature_vector"),
            risk_score=heuristic.get("risk_score", 0.2),
            raw_output=heuristic.get("raw_output"),
            analysis_label=heuristic.get("analysis_label"),
            audio_analysis=heuristic.get("feature_summary"),
            analysis_engine="heuristic_audio",
        )
    except HTTPException:
        raise
    except Exception as e:
        return {"status": "error", "detail": str(e)}
    finally:
        if tmp_path and tmp_path.exists():
            try:
                tmp_path.unlink()
            except OSError:
                pass

import numpy as np
from pathlib import Path
import wave

try:
    import soundfile as sf
except Exception:
    sf = None

try:
    # Prefer tflite_runtime if available (lighter)
    import tflite_runtime.interpreter as tflite_runtime
    TFLITE_RUNTIME = True
except Exception:
    try:
        import tensorflow as tf
        tflite_runtime = tf.lite
        TFLITE_RUNTIME = False
    except Exception:
        tflite_runtime = None
        TFLITE_RUNTIME = False


def read_audio_file(path, target_sr=16000):
    """Read audio file and resample to target sampling rate (mono).

    Returns:
        waveform: 1D float32 numpy array sampled at target_sr
    """
    data = None
    sr = None
    if sf is not None:
        try:
            data, sr = sf.read(path)
        except Exception:
            data, sr = None, None

    if data is None or sr is None:
        # Fallback path for formats like webm if librosa/audioread backend is available.
        try:
            import librosa

            data, sr = librosa.load(path, sr=None, mono=True)
        except Exception:
            # Last-resort fallback for basic WAV files (no external deps).
            try:
                with wave.open(path, "rb") as wf:
                    n_channels = wf.getnchannels()
                    sr = wf.getframerate()
                    sampwidth = wf.getsampwidth()
                    n_frames = wf.getnframes()
                    raw = wf.readframes(n_frames)
                if sampwidth == 2:
                    pcm = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
                elif sampwidth == 1:
                    pcm = (np.frombuffer(raw, dtype=np.uint8).astype(np.float32) - 128.0) / 128.0
                else:
                    raise RuntimeError("Unsupported WAV sample width.")

                if n_channels > 1:
                    pcm = pcm.reshape(-1, n_channels).mean(axis=1)
                data = pcm
            except Exception as exc:
                raise RuntimeError(
                    "Unable to decode audio. Install soundfile/librosa or upload WAV."
                ) from exc

    if data.ndim > 1:
        data = np.mean(data, axis=1)
    if sr != target_sr:
        # simple resampling using numpy (linear interpolation)
        duration = data.shape[0] / sr
        target_n = int(round(duration * target_sr))
        old_indices = np.linspace(0, data.shape[0] - 1, num=data.shape[0])
        new_indices = np.linspace(0, data.shape[0] - 1, num=target_n)
        data = np.interp(new_indices, old_indices, data)
    return data.astype(np.float32)


class TFLiteClassifier:
    def __init__(self, model_path: str):
        self.model_path = model_path
        self.interpreter = None
        self.input_details = None
        self.output_details = None
        self._load()

    def _load(self):
        if tflite_runtime is None:
            raise RuntimeError("TFLite runtime / TensorFlow not available in environment")
        try:
            self.interpreter = tflite_runtime.Interpreter(model_path=str(self.model_path))
        except Exception:
            # Try tensorflow.lite
            import tensorflow as tf
            self.interpreter = tf.lite.Interpreter(model_path=str(self.model_path))
        self.interpreter.allocate_tensors()
        self.input_details = self.interpreter.get_input_details()
        self.output_details = self.interpreter.get_output_details()

    def predict(self, input_array: np.ndarray):
        """Run classifier. Input must match model input shape.

        Returns raw output as numpy array.
        """
        # Prepare input
        inp = input_array.astype(np.float32)
        # Add batch dim if needed
        if len(inp.shape) == 1:
            inp = inp.reshape(1, -1)
        self.interpreter.set_tensor(self.input_details[0]["index"], inp)
        self.interpreter.invoke()
        out = self.interpreter.get_tensor(self.output_details[0]["index"])
        return out


def run_tflite_classifier_on_file(audio_path: str, classifier_path: str):
    """Scaffold function: reads audio, obtains features, runs tflite classifier.

    NOTE: This function assumes the classifier expects a fixed-size embedding vector (e.g., YAMNet embedding).
    You must adapt preprocessing to match the classifier expected input (e.g., compute YAMNet embeddings first).
    """
    audio_path = Path(audio_path)
    classifier_path = Path(classifier_path)
    if not audio_path.exists():
        raise FileNotFoundError(f"Audio file not found: {audio_path}")
    if not classifier_path.exists():
        raise FileNotFoundError(f"Classifier model not found: {classifier_path}")

    # Try to compute MFCC features (preferred) using librosa if available
    waveform = read_audio_file(str(audio_path), target_sr=16000)
    mfcc_vec = None
    try:
        import librosa
        mf = librosa.feature.mfcc(y=waveform, sr=16000, n_mfcc=13, n_fft=1024, hop_length=512)
        # average across time frames -> 13-d vector
        mfcc_vec = np.mean(mf, axis=1).astype(np.float32)
    except Exception:
        # fallback: compute simple RMS per-frame embedding (pad/trim to 13)
        frame_len = 1024
        hop = 512
        frames = []
        for i in range(0, max(1, len(waveform) - frame_len + 1), hop):
            chunk = waveform[i:i+frame_len]
            frames.append(np.sqrt(np.mean(chunk**2)).astype(np.float32))
        arr = np.array(frames, dtype=np.float32)
        if arr.size == 0:
            mfcc_vec = np.zeros((13,), dtype=np.float32)
        else:
            if arr.size < 13:
                mfcc_vec = np.pad(arr, (0, 13 - arr.size))
            else:
                mfcc_vec = arr[:13]

    classifier = TFLiteClassifier(str(classifier_path))
    # TFLite model may expect different shape; try to match common [1, N]
    inp = mfcc_vec.astype(np.float32)
    if inp.ndim == 1:
        inp = inp.reshape(1, -1)
    out = classifier.predict(inp)
    return {
        "raw_output": out.tolist(),
        "embedding_summary": mfcc_vec.tolist()[:13],
    }


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, float(value)))


def _normalize(value: float, low: float, high: float) -> float:
    if high <= low:
        return 0.0
    return _clamp((float(value) - low) / (high - low))


def _frames(waveform: np.ndarray, frame_len: int = 1024, hop: int = 512) -> np.ndarray:
    if waveform.size == 0:
        return np.zeros((1, frame_len), dtype=np.float32)
    if waveform.size < frame_len:
        padded = np.pad(waveform, (0, frame_len - waveform.size))
        return padded.reshape(1, frame_len).astype(np.float32)
    slices = []
    for i in range(0, waveform.size - frame_len + 1, hop):
        slices.append(waveform[i : i + frame_len])
    return np.asarray(slices, dtype=np.float32)


def _count_bursts(rms: np.ndarray) -> int:
    if rms.size == 0:
        return 0
    if rms.size < 4:
        return int(np.max(rms) > 0.0)

    # Smooth frame-energy to avoid counting micro-fluctuations as separate bursts.
    kernel = np.ones(5, dtype=np.float32) / 5.0
    smooth = np.convolve(rms.astype(np.float32), kernel, mode="same")

    peak = float(np.max(smooth))
    mean = float(np.mean(smooth))
    std = float(np.std(smooth))
    threshold = max(0.5 * peak, mean + 1.2 * std)
    active = smooth >= threshold

    # Count only segments with enough duration and spacing.
    min_len = 2
    min_gap = 2
    bursts = 0
    idx = 0
    n = active.size
    last_end = -999
    while idx < n:
        if not active[idx]:
            idx += 1
            continue
        start = idx
        while idx < n and active[idx]:
            idx += 1
        end = idx
        seg_len = end - start
        if seg_len >= min_len and (start - last_end) >= min_gap:
            bursts += 1
            last_end = end
    return bursts


def _safe_mean(x: np.ndarray) -> float:
    return float(np.mean(x)) if x.size else 0.0


def _safe_std(x: np.ndarray) -> float:
    return float(np.std(x)) if x.size else 0.0


def _extract_signal_features(waveform: np.ndarray, sr: int = 16000) -> dict:
    frames = _frames(waveform, frame_len=1024, hop=512)
    window = np.hanning(frames.shape[1]).astype(np.float32)
    freqs = np.fft.rfftfreq(frames.shape[1], d=1.0 / sr).astype(np.float32)
    high_band_mask = freqs >= 1000.0
    eps = 1e-8

    rms = np.sqrt(np.mean(np.square(frames), axis=1) + eps)
    zcr = np.mean(frames[:, :-1] * frames[:, 1:] < 0.0, axis=1).astype(np.float32)

    centroid = []
    bandwidth = []
    high_ratio = []
    for frame in frames:
        spec = np.abs(np.fft.rfft(frame * window)).astype(np.float32) + eps
        total = float(np.sum(spec))
        c = float(np.sum(freqs * spec) / total)
        b = float(np.sqrt(np.sum(((freqs - c) ** 2) * spec) / total))
        h = float(np.sum(spec[high_band_mask]) / total)
        centroid.append(c)
        bandwidth.append(b)
        high_ratio.append(h)

    centroid = np.asarray(centroid, dtype=np.float32)
    bandwidth = np.asarray(bandwidth, dtype=np.float32)
    high_ratio = np.asarray(high_ratio, dtype=np.float32)

    mean_rms = _safe_mean(rms)
    std_rms = _safe_std(rms)
    peak = float(np.max(np.abs(waveform))) if waveform.size else 0.0
    peak_to_rms = peak / (mean_rms + eps)
    rms_cv = std_rms / (mean_rms + eps)
    bursts = _count_bursts(rms)

    return {
        "duration_seconds": float(waveform.size / sr) if sr > 0 else 0.0,
        "rms_mean": mean_rms,
        "rms_std": std_rms,
        "rms_cv": rms_cv,
        "peak_amplitude": peak,
        "peak_to_rms": peak_to_rms,
        "zcr_mean": _safe_mean(zcr),
        "zcr_std": _safe_std(zcr),
        "centroid_mean": _safe_mean(centroid),
        "centroid_std": _safe_std(centroid),
        "bandwidth_mean": _safe_mean(bandwidth),
        "high_freq_ratio_mean": _safe_mean(high_ratio),
        "burst_count": bursts,
    }


def _score_to_three_way(score: float) -> dict:
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


def run_heuristic_audio_risk_on_file(audio_path: str):
    """Heuristic cough/breath analysis and risk estimate.

    This is a deterministic fallback that does not require trained audio models.
    """
    waveform = read_audio_file(audio_path, target_sr=16000)
    if waveform.size == 0:
        return {
            "analysis_label": "unknown",
            "risk_score": 0.1,
            "probabilities": _score_to_three_way(0.1),
            "feature_summary": {"duration_seconds": 0.0},
            "feature_vector": [0.0] * 13,
            "raw_output": [[0.9, 0.1]],
        }

    features = _extract_signal_features(waveform, sr=16000)

    duration = features["duration_seconds"]
    bursts = float(features["burst_count"])
    zcr_mean = features["zcr_mean"]
    centroid_mean = features["centroid_mean"]
    peak_to_rms = features["peak_to_rms"]
    high_ratio = features["high_freq_ratio_mean"]
    rms_cv = features["rms_cv"]

    burst_norm = _normalize(bursts, 1.0, max(4.0, duration * 1.4))
    zcr_norm = _normalize(zcr_mean, 0.04, 0.22)
    centroid_norm = _normalize(centroid_mean, 700.0, 2500.0)
    peak_norm = _normalize(peak_to_rms, 2.0, 8.0)
    duration_shortness = 1.0 - _normalize(duration, 2.0, 12.0)

    cough_probability = _clamp(
        (0.28 * burst_norm)
        + (0.22 * zcr_norm)
        + (0.2 * centroid_norm)
        + (0.15 * peak_norm)
        + (0.15 * duration_shortness)
    )

    breath_probability = _clamp(
        (0.35 * _normalize(duration, 4.0, 20.0))
        + (0.2 * (1.0 - zcr_norm))
        + (0.2 * (1.0 - burst_norm))
        + (0.15 * (1.0 - centroid_norm))
        + (0.1 * _normalize(1.0 - rms_cv, 0.0, 1.0))
    )

    if cough_probability >= 0.62 and cough_probability >= breath_probability + 0.08:
        label = "cough-dominant"
    elif breath_probability >= 0.55 and breath_probability >= cough_probability + 0.05:
        label = "breathing-dominant"
    else:
        label = "mixed-cough-breath"

    cough_severity = _clamp((0.5 * cough_probability) + (0.3 * burst_norm) + (0.2 * peak_norm))
    breathing_distress = _clamp(
        (0.25 * _normalize(high_ratio, 0.35, 0.75))
        + (0.2 * zcr_norm)
        + (0.35 * _normalize(rms_cv, 0.45, 1.4))
        + (0.2 * _normalize(centroid_mean, 1600.0, 4500.0))
    )

    if label == "cough-dominant":
        risk_score = 0.14 + (0.72 * cough_severity)
    elif label == "breathing-dominant":
        risk_score = 0.1 + (0.65 * breathing_distress)
    else:
        risk_score = 0.12 + (0.62 * max(cough_severity, breathing_distress))

    if bursts >= 7 and cough_probability > 0.7:
        risk_score = max(risk_score, 0.7)
    if high_ratio > 0.55 and zcr_mean > 0.18:
        risk_score = max(risk_score, 0.68)

    risk_score = _clamp(risk_score)

    feature_vector = [
        features["rms_mean"],
        features["rms_std"],
        features["rms_cv"],
        features["peak_amplitude"],
        features["peak_to_rms"],
        features["zcr_mean"],
        features["zcr_std"],
        features["centroid_mean"],
        features["centroid_std"],
        features["bandwidth_mean"],
        features["high_freq_ratio_mean"],
        float(features["burst_count"]),
        features["duration_seconds"],
    ]

    return {
        "analysis_label": label,
        "risk_score": float(risk_score),
        "probabilities": _score_to_three_way(risk_score),
        "feature_summary": {
            "duration_seconds": round(features["duration_seconds"], 3),
            "burst_count": int(features["burst_count"]),
            "zcr_mean": round(features["zcr_mean"], 4),
            "centroid_mean_hz": round(features["centroid_mean"], 2),
            "bandwidth_mean_hz": round(features["bandwidth_mean"], 2),
            "high_freq_ratio_mean": round(features["high_freq_ratio_mean"], 4),
            "peak_to_rms": round(features["peak_to_rms"], 4),
            "cough_probability": round(cough_probability, 4),
            "breath_probability": round(breath_probability, 4),
        },
        "feature_vector": [float(x) for x in feature_vector],
        "raw_output": [[round(1.0 - risk_score, 6), round(risk_score, 6)]],
    }

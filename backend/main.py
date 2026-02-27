from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import joblib
import numpy as np
import sys
from pathlib import Path

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

@app.post("/predict")
def predict(data: dict):

    features = np.array([[ 
        data["age"],
        data["fever"],
        data["cough"],
        data["breathlessness"],
        data["spo2"]
    ]])

    logistic_risk = float(log_model.predict_proba(features)[0][1])
    rf_risk = float(rf_model.predict_proba(features)[0][1])

    curb_score = calculate_curb65(
        data["confusion"],
        data["urea"],
        data["respiratory_rate"],
        data["systolic_bp"],
        data["age"]
    )

    return {
        "logistic_risk": logistic_risk,
        "random_forest_risk": rf_risk,
        "curb65_score": curb_score
    }

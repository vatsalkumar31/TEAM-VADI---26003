from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import joblib
import numpy as np
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

log_model = joblib.load("models/logistic_model.pkl")
rf_model = joblib.load("models/rf_model.pkl")

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

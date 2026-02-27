import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
import joblib
import os

# Make sure models folder exists
os.makedirs("models", exist_ok=True)

# Dummy dataset
X = np.random.rand(200, 5)
y = np.random.randint(0, 2, 200)

log_model = LogisticRegression()
rf_model = RandomForestClassifier()

log_model.fit(X, y)
rf_model.fit(X, y)

joblib.dump(log_model, "models/logistic_model.pkl")
joblib.dump(rf_model, "models/rf_model.pkl")

print("Models saved successfully!")

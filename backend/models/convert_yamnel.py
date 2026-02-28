#!/usr/bin/env python3
"""
Convert a scikit-learn classifier pickle (`yamnel.pkl`) into a TF.js LayersModel
by training a small Keras surrogate to mimic the sklearn model's predict_proba.

Usage:
  ./backend/venv/bin/python backend/scripts/convert_yamnel.py

It expects `backend/models/yamnel.pkl` to exist. The converted TF.js model will be
written to `frontend/public/models/classifier/` as `model.json` + weights.

Note: This is a pragmatic surrogate conversion (not retraining on original data).
It synthesizes inputs, queries the sklearn model for soft labels, and fits a small
Keras model to reproduce the mapping. This keeps the on-device classifier runnable
and reasonably aligned with the sklearn model's decisions.
"""
import os
import sys
import shutil
import json

try:
    import joblib
    import numpy as np
except Exception as e:
    print("Missing Python packages. Install requirements in the backend venv:")
    print("./backend/venv/bin/python -m pip install joblib numpy scikit-learn tensorflow tensorflowjs")
    raise

SKLEARN_PKL = os.path.join(os.path.dirname(__file__), '..', 'models', 'yamnel.pkl')
OUT_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'frontend', 'public', 'models', 'classifier')
TMP_SAVED_MODEL = os.path.join('/tmp', 'surrogate_saved_model')


def load_sklearn(path):
    if not os.path.exists(path):
        raise FileNotFoundError(f"sklearn pickle not found at {path}\nPlease place yamnel.pkl into backend/models/")
    print('Loading sklearn model from', path)
    model = joblib.load(path)
    return model


def infer_input_dim(model):
    if hasattr(model, 'coef_'):
        try:
            return int(model.coef_.shape[1])
        except Exception:
            pass
    if hasattr(model, 'n_features_in_'):
        return int(model.n_features_in_)
    # fallback guess
    return 256


def synthesize_and_label(model, input_dim, samples=2000, random_seed=42):
    np.random.seed(random_seed)
    X = np.random.normal(0, 1, size=(samples, input_dim)).astype(np.float32)
    # If the model exposes predict_proba, use soft labels; otherwise use hard labels
    if hasattr(model, 'predict_proba'):
        try:
            y = model.predict_proba(X)
        except Exception:
            # try predict and one-hot
            preds = model.predict(X)
            if preds.ndim == 1:
                y = np.vstack([1 - preds, preds]).T
            else:
                y = np.eye(np.max(preds) + 1)[preds]
    else:
        preds = model.predict(X)
        if preds.ndim == 1:
            y = np.vstack([1 - preds, preds]).T
        else:
            y = np.eye(np.max(preds) + 1)[preds]
    return X, y


def build_and_train_keras(input_dim, n_classes, X, y, epochs=20):
    import tensorflow as tf

    model = tf.keras.Sequential([
        tf.keras.layers.InputLayer(input_shape=(input_dim,)),
        tf.keras.layers.Dense(128, activation='relu'),
        tf.keras.layers.Dropout(0.2),
        tf.keras.layers.Dense(64, activation='relu'),
        tf.keras.layers.Dense(n_classes, activation='softmax')
    ])

    model.compile(optimizer=tf.keras.optimizers.Adam(1e-3), loss='categorical_crossentropy', metrics=['accuracy'])
    print('Training surrogate Keras model: input_dim=', input_dim, 'n_classes=', n_classes)
    model.fit(X, y, epochs=epochs, batch_size=64, verbose=1)
    # save as SavedModel
    if os.path.exists(TMP_SAVED_MODEL):
        shutil.rmtree(TMP_SAVED_MODEL)
    model.save(TMP_SAVED_MODEL)
    return TMP_SAVED_MODEL


def convert_to_tfjs(saved_model_dir, out_dir):
    # use tensorflowjs converter CLI if available
    print('Converting SavedModel -> TF.js layers model at', out_dir)
    os.makedirs(out_dir, exist_ok=True)
    # prefer python API if tensorflowjs is installed
    try:
        import tensorflowjs as tfjs
        tfjs.converters.convert_tf_saved_model(saved_model_dir, out_dir)
        print('Conversion complete (via tensorflowjs API).')
    except Exception:
        print('tensorflowjs Python API not available; attempting CLI converter')
        cmd = f"./backend/venv/bin/python -m tensorflowjs_converter --input_format=tf_saved_model --output_format=tfjs_layers_model {saved_model_dir} {out_dir}"
        print('Running:', cmd)
        code = os.system(cmd)
        if code != 0:
            raise RuntimeError('tensorflowjs_converter failed; ensure tensorflowjs package is installed in the venv')


def main():
    model = load_sklearn(SKLEARN_PKL)
    input_dim = infer_input_dim(model)
    X, y = synthesize_and_label(model, input_dim, samples=2000)
    n_classes = int(y.shape[1])
    saved = build_and_train_keras(input_dim, n_classes, X, y, epochs=18)
    convert_to_tfjs(saved, OUT_DIR)
    print('\nDone. TF.js classifier placed at', OUT_DIR)


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print('Error:', e)
        sys.exit(2)

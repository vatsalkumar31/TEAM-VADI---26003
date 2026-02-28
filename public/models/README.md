Place converted TF.js model files here for on-device inference.

Expected layout:

frontend/public/models/
  ├─ yamnet/
  │   ├─ model.json
  │   ├─ group1-shard1of1.bin  (or multiple shard files)
  │   └─ ...
  └─ classifier/
      ├─ model.json
      ├─ weights.bin (or multiple weight shards)
      └─ assets/ (optional: labels.json)

Conversion commands
-------------------

1) Convert YAMNet SavedModel → TF.js GraphModel

# If you have a SavedModel directory for YAMNet (serving embeddings), run:

tensorflowjs_converter \
  --input_format=tf_saved_model \
  --output_format=tfjs_graph_model \
  --signature_name=serving_default \
  /path/to/yamnet/saved_model \
  frontend/public/models/yamnet

Notes:
- Use the correct signature_name if your SavedModel exposes one for embeddings.
- The TF.js GraphModel will create `model.json` and one or more `group*-shard*.bin` weight files.
- YAMNet in TF expects 16 kHz mono float waveform input. Confirm the model's input name (often `wav` or `input_audio`) and adapt the client preprocessing accordingly.

2) Convert Keras classifier → TF.js LayersModel

# If your classifier is a Keras `.h5` or SavedModel:

# From Keras .h5
tensorflowjs_converter \
  --input_format=keras \
  /path/to/classifier.h5 \
  frontend/public/models/classifier

# Or from a SavedModel (if using TF 2.x):
tensorflowjs_converter \
  --input_format=tf_saved_model \
  --output_format=tfjs_layers_model \
  /path/to/classifier/saved_model \
  frontend/public/models/classifier

Notes:
- This produces `model.json` and `weights.bin` (or shards).
- Ensure classifier's input shape matches the embeddings the client will pass (e.g., an embedding vector length). If necessary, add a small adapter model in Keras that accepts YAMNet embeddings then export that.

3) (Optional) Convert classifier to TFLite for server-side inference

# From Keras model in Python:

import tensorflow as tf
converter = tf.lite.TFLiteConverter.from_keras_model(keras_model)
converter.optimizations = [tf.lite.Optimize.DEFAULT]
tflite_model = converter.convert()
with open('tflite_classifier.tflite','wb') as f:
    f.write(tflite_model)

Place the resulting `tflite_classifier.tflite` in `backend/models/` to enable server-side inference (the backend scaffold already looks for this file).

Client-side usage notes
----------------------
- Put the converted TF.js model files into the directories above. Because `frontend/public` is served as static files, `/models/yamnet/model.json` and `/models/classifier/model.json` will be fetchable by the page.
- `frontend/src/services/yamnet.js` in this project attempts to load `/models/yamnet/model.json` and `/models/classifier/model.json` — ensure file names match.
- YAMNet expects 16 kHz waveform input; the client helper resamples decoded audio to 16 kHz. Confirm the exact input tensor name and shape of your converted YAMNet. You may need to adapt `yamnet.js` to call the correct input/output node names.

If you want, I can:
- Provide exact `tensorflowjs_converter` flags for a specific YAMNet variant you have.
- Help produce a tiny adapter Keras model that accepts YAMNet embeddings and outputs a risk-level classifier, then convert that to TF.js and TFLite.

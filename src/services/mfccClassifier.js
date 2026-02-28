import * as tf from '@tensorflow/tfjs';

let mfccModel = null;

export async function loadOrTrainMfccClassifier(inputDim = 13) {
  if (mfccModel) return mfccModel;
  // try load from public models
  try {
    mfccModel = await tf.loadLayersModel('/models/mfcc_classifier/model.json');
    return mfccModel;
  } catch (e) {
    console.warn('No prebuilt MFCC classifier found, training demo surrogate', e);
  }

  // build small dense model and train on synthetic MFCC-like data
  const model = tf.sequential();
  model.add(tf.layers.dense({ inputShape: [inputDim], units: 64, activation: 'relu' }));
  model.add(tf.layers.dropout({ rate: 0.2 }));
  model.add(tf.layers.dense({ units: 32, activation: 'relu' }));
  model.add(tf.layers.dense({ units: 3, activation: 'softmax' }));

  model.compile({ optimizer: tf.train.adam(0.001), loss: 'categoricalCrossentropy', metrics: ['accuracy'] });

  const samples = 600;
  const xs = [];
  const ys = [];
  for (let i = 0; i < samples; i++) {
    const cls = Math.floor(i / (samples / 3));
    const base = new Float32Array(inputDim);
    for (let d = 0; d < inputDim; d++) base[d] = (Math.random() - 0.5) * 0.2;
    if (cls === 1) for (let d = 0; d < Math.min(4, inputDim); d++) base[d] += 0.7;
    if (cls === 2) for (let d = 0; d < Math.min(6, inputDim); d++) base[d] += 0.4 * Math.sin(d + i * 0.2);
    xs.push(base);
    const one = new Array(3).fill(0); one[cls] = 1; ys.push(one);
  }

  const xT = tf.tensor2d(xs);
  const yT = tf.tensor2d(ys);
  await model.fit(xT, yT, { epochs: 20, batchSize: 32, shuffle: true, verbose: 0 });
  xT.dispose(); yT.dispose();

  mfccModel = model;
  return mfccModel;
}

export async function predictMfccProbabilities(mfccVector) {
  const inputDim = mfccVector.length;
  const model = await loadOrTrainMfccClassifier(inputDim);
  const t = tf.tensor2d([mfccVector]);
  const pred = model.predict(t);
  const probs = Array.from((await pred.data()));
  t.dispose(); pred.dispose();
  return probs;
}

export default { loadOrTrainMfccClassifier, predictMfccProbabilities };

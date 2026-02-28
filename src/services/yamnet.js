// TF.js-based YAMNet + classifier scaffold
// Expects model files in `public/models/yamnet/model.json` and `public/models/classifier/model.json`.

import * as tf from '@tensorflow/tfjs';

let yamnetModel = null;
let classifierModel = null;

export async function loadModels() {
  if (!yamnetModel) {
    try {
      yamnetModel = await tf.loadGraphModel('/models/yamnet/model.json');
    } catch (err) {
      console.warn('YAMNet model not found or failed to load', err);
    }
  }
  if (!classifierModel) {
    try {
      classifierModel = await tf.loadLayersModel('/models/classifier/model.json');
    } catch (err) {
      console.warn('Classifier model not found or failed to load', err);
    }
  }
  return { yamnetModel, classifierModel };
}

function downsampleBuffer(buffer, sampleRate, outSampleRate) {
  if (outSampleRate === sampleRate) {
    return buffer;
  }
  const sampleRateRatio = sampleRate / outSampleRate;
  const newLength = Math.round(buffer.length / sampleRateRatio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accum = 0, count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    result[offsetResult] = accum / count;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

export async function getEmbeddingFromBlob(blob) {
  await loadModels();
  if (!yamnetModel) {
    // no model: return placeholder
    return { embedding: new Array(1024).fill(0), top: 'unknown', probs: null };
  }

  // decode audio
  const arrayBuffer = await blob.arrayBuffer();
  // decode using AudioContext
  const actx = new (window.AudioContext || window.webkitAudioContext)();
  const decoded = await actx.decodeAudioData(arrayBuffer.slice(0));

  // get channel data and resample to 16000
  const channelData = decoded.numberOfChannels > 0 ? decoded.getChannelData(0) : new Float32Array();
  const sr = decoded.sampleRate || 44100;
  const waveform = downsampleBuffer(channelData, sr, 16000);

  // YAMNet usually expects waveform as float32 [num_samples]
  const input = tf.tensor1d(waveform);
  // model signature may differ — here we assume a simple graph model that accepts waveform and returns embeddings
  let embeddings = null;
  try {
    // many TF.js GraphModels expect a batch dimension
    let out = null;
    try {
      out = yamnetModel.predict(input.expandDims(0));
    } catch (err) {
      // try execute with common input names
      try {
        out = yamnetModel.execute(input.expandDims(0));
      } catch (e) {
        console.warn('YAMNet model execution failed', e);
      }
    }
    if (out) {
      // out may be a tensor or array of tensors
      if (Array.isArray(out)) {
        embeddings = out[0].dataSync();
        out.forEach(t => t.dispose && t.dispose());
      } else {
        embeddings = out.dataSync();
        out.dispose && out.dispose();
      }
    }
  } catch (err) {
    console.warn('YAMNet predict failed', err);
  }
  input.dispose();

  let probs = null;
  let top = null;
  if (classifierModel && embeddings) {
    try {
      const embTensor = tf.tensor2d([embeddings]);
      const pred = classifierModel.predict(embTensor);
      const p = pred.dataSync();
      // interpret p
      probs = Array.from(p);
      const maxIdx = probs.indexOf(Math.max(...probs));
      top = maxIdx; // label mapping left to implement
      embTensor.dispose();
      pred.dispose();
    } catch (e) {
      console.warn('Classifier predict failed', e);
    }
  }

  // If no classifier model is available, use a lightweight heuristic
  // to provide an immediate risk estimate so the UI remains functional.
  if (!classifierModel && embeddings) {
    try {
      const heuristic = heuristicClassifier(embeddings, waveform);
      probs = heuristic.probs;
      top = heuristic.top;
    } catch (e) {
      console.warn('Heuristic classifier failed', e);
    }
  }

  return { embedding: embeddings ? Array.from(embeddings.slice(0, 256)) : null, top, probs };
}

// A simple fallback classifier that uses embedding statistics (and optionally
// waveform energy) to compute a coarse risk score when a trained classifier
// isn't present. This is NOT a clinical model — it's a pragmatic placeholder
// so the app can demonstrate on-device flow until a proper classifier model
// is provided.
function heuristicClassifier(embeddings, waveform) {
  // embeddings: Float32Array or Array-like
  const embArr = Array.from(embeddings || []);
  // feature: embedding L2 norm
  const l2 = Math.sqrt(embArr.reduce((s, v) => s + v * v, 0) + 1e-9);
  // feature: embedding mean magnitude
  const mean = embArr.reduce((s, v) => s + Math.abs(v), 0) / (embArr.length || 1);
  // waveform energy (if available)
  let energy = 0;
  if (waveform && waveform.length) {
    energy = Math.sqrt(waveform.reduce((s, v) => s + v * v, 0) / waveform.length + 1e-9);
  }

  // Combine features into a pseudo-score between 0 and 1.
  // Tunable coefficients: we bias slightly toward embedding norms.
  let score = 0.6 * (1 - Math.exp(-l2 / 50)) + 0.3 * (1 - Math.exp(-mean * 10)) + 0.1 * (1 - Math.exp(-energy * 10));
  // clamp
  score = Math.max(0, Math.min(1, score));

  // Return as a two-class probability [low_risk, high_risk]
  const high = score;
  const low = 1 - high;
  const probs = [low, high];
  const top = high >= 0.5 ? 1 : 0;
  return { probs, top };
}

// Build and train a tiny demo classifier in the browser using TF.js.
// This trains on synthetic data (fast) to provide a real, runnable
// LayersModel for on-device inference when no pretrained classifier
// has been provided. Training is intentionally small to keep it quick.
async function buildAndTrainDemoClassifier(inputDim) {
  if (classifierModel) return classifierModel;

  const model = tf.sequential();
  model.add(tf.layers.dense({ inputShape: [inputDim], units: 64, activation: 'relu' }));
  model.add(tf.layers.dropout({ rate: 0.2 }));
  model.add(tf.layers.dense({ units: 32, activation: 'relu' }));
  model.add(tf.layers.dense({ units: 2, activation: 'softmax' }));

  model.compile({ optimizer: tf.train.adam(0.001), loss: 'categoricalCrossentropy', metrics: ['accuracy'] });

  // Create synthetic data: class 0 = noise, class 1 = noise + structured bump
  const samples = 400;
  const xs = [];
  const ys = [];
  for (let i = 0; i < samples; i++) {
    const isPos = i < samples / 2 ? 0 : 1;
    const base = new Float32Array(inputDim);
    for (let d = 0; d < inputDim; d++) {
      // noise
      base[d] = (Math.random() - 0.5) * 0.2;
    }
    if (isPos) {
      // structured pattern in first 12 dims
      for (let d = 0; d < Math.min(12, inputDim); d++) {
        base[d] += 0.6 + 0.2 * Math.sin(d + i * 0.1);
      }
    }
    xs.push(base);
    ys.push(isPos === 1 ? [0, 1] : [1, 0]);
  }

  const xT = tf.tensor2d(xs);
  const yT = tf.tensor2d(ys);

  // Train briefly
  await model.fit(xT, yT, { epochs: 18, batchSize: 32, shuffle: true, verbose: 0 });

  xT.dispose();
  yT.dispose();

  classifierModel = model;
  return classifierModel;
}

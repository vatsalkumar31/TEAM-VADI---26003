import Meyda from 'meyda';

export async function extractMfccFromBlob(blob, options = { sampleRate: 16000, mfcc: 13 }) {
  // decode audio
  const arrayBuffer = await blob.arrayBuffer();
  const actx = new (window.AudioContext || window.webkitAudioContext)();
  const decoded = await actx.decodeAudioData(arrayBuffer.slice(0));
  const sr = decoded.sampleRate || 44100;
  const channelData = decoded.numberOfChannels > 0 ? decoded.getChannelData(0) : new Float32Array();

  // simple resample if needed (linear)
  let waveform = channelData;
  if (sr !== options.sampleRate) {
    const sampleRateRatio = sr / options.sampleRate;
    const newLength = Math.round(waveform.length / sampleRateRatio);
    const result = new Float32Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;
    while (offsetResult < result.length) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
      let accum = 0, count = 0;
      for (let i = offsetBuffer; i < nextOffsetBuffer && i < waveform.length; i++) {
        accum += waveform[i];
        count++;
      }
      result[offsetResult] = accum / Math.max(1, count);
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }
    waveform = result;
  }

  // Meyda expects a buffer for frame-based extraction; we'll compute MFCC per frame and average
  const frameSize = 1024;
  const hop = 512;
  const mfccs = [];
  for (let i = 0; i + frameSize <= waveform.length; i += hop) {
    const frame = waveform.slice(i, i + frameSize);
    const mf = Meyda.extract('mfcc', frame, { sampleRate: options.sampleRate, bufferSize: frameSize, melBands: 26, numberOfMFCCCoefficients: options.mfcc });
    if (mf && mf.length) mfccs.push(mf);
  }

  if (mfccs.length === 0) {
    return new Array(options.mfcc).fill(0);
  }

  // average across frames
  const avg = new Array(options.mfcc).fill(0);
  for (const f of mfccs) for (let j = 0; j < options.mfcc; j++) avg[j] += f[j] / mfccs.length;
  return avg;
}

export default extractMfccFromBlob;

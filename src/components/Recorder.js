import React, { useRef, useState, useEffect } from "react";
import { analyzeAudio } from "../services/api";
import { getEmbeddingFromBlob, loadModels } from "../services/yamnet";
import { computeRiskLevel } from "../services/risk";

function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeString = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // PCM header size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits/sample
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

async function convertBlobToWav(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const decoded = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
  const n = decoded.length;
  const channels = decoded.numberOfChannels;
  const mono = new Float32Array(n);
  for (let c = 0; c < channels; c++) {
    const ch = decoded.getChannelData(c);
    for (let i = 0; i < n; i++) mono[i] += ch[i] / channels;
  }
  return encodeWav(mono, decoded.sampleRate || 16000);
}

function Recorder({ onResult, onAudioResult }) {
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const [recording, setRecording] = useState(false);
  const [permissionError, setPermissionError] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [useOnDevice, setUseOnDevice] = useState(false);
  const [symptoms] = useState({});

  useEffect(() => {
    if (useOnDevice) {
      loadModels();
    }
  }, [useOnDevice]);

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const startRecording = async () => {
    setPermissionError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      audioChunksRef.current = [];

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mr.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        if (useOnDevice) {
          setAnalyzing(true);
          try {
            // Try MFCC classifier path first (preferred for respiratory sounds)
            try {
              const mf = await import('../services/mfcc');
                const clf = await import('../services/mfccClassifier');
                const mfcc = await mf.extractMfccFromBlob(blob);
                const probs = await clf.predictMfccProbabilities(mfcc);
                const base = { status: 'ok', yamnet_top: 'mfcc', embeddings: mfcc, probs, symptoms: {} };
              const risk = computeRiskLevel(base, symptoms);
              console.debug('On-device MFCC result', { base, risk });
              if (typeof onAudioResult === 'function') onAudioResult({ ...base, risk_score: risk.score, risk_level: risk.level, risk_confidence: `${risk.percent}%` });
              else if (typeof onResult === 'function') onResult({ ...base, risk_score: risk.score, risk_level: risk.level, risk_confidence: `${risk.percent}%` });
            } catch (innerErr) {
              // Fallback to YAMNet embedding/classifier path
              const local = await getEmbeddingFromBlob(blob);
              const base = { status: 'ok', yamnet_top: local.top, embeddings: local.embedding, probs: local.probs || null, symptoms: {} };
              const risk = computeRiskLevel(base, symptoms);
              console.debug('On-device YAMNet fallback result', { base, risk });
              if (typeof onAudioResult === 'function') onAudioResult({ ...base, risk_score: risk.score, risk_level: risk.level, risk_confidence: `${risk.percent}%` });
              else if (typeof onResult === 'function') onResult({ ...base, risk_score: risk.score, risk_level: risk.level, risk_confidence: `${risk.percent}%` });
            }
          } catch (err) {
            console.error('On-device analysis failed', err);
          } finally {
            setAnalyzing(false);
          }
        } else {
          await sendAudio(blob);
        }
      };

      mr.start();
      setRecording(true);
    } catch (err) {
      console.error(err);
      setPermissionError("Microphone access denied or unavailable.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  const sendAudio = async (blob) => {
    setAnalyzing(true);
    try {
      const formData = new FormData();
      let uploadBlob = blob;
      let fileName = "recording.webm";
      try {
        uploadBlob = await convertBlobToWav(blob);
        fileName = "recording.wav";
      } catch (convertErr) {
        console.warn("WAV conversion failed, sending original recording", convertErr);
      }
      formData.append("file", uploadBlob, fileName);
      // no fever/cough fields — only send the audio
      const res = await analyzeAudio(formData);
      if (res.data) {
        if (res.data.status === "error") {
          const detail = res.data.detail || "Audio analysis failed";
          if (typeof onAudioResult === 'function') onAudioResult({ status: "error", detail });
          else if (typeof onResult === 'function') onResult({ status: "error", detail });
          return;
        }

        const base = { ...res.data, symptoms: res.data.symptoms || {} };
        const risk = computeRiskLevel(base, symptoms);
        console.debug('Server analysis result', { base, risk });
        if (typeof onAudioResult === 'function') onAudioResult({ ...base, risk_score: risk.score, risk_level: risk.level, risk_confidence: `${risk.percent}%` });
        else if (typeof onResult === 'function') onResult({ ...base, risk_score: risk.score, risk_level: risk.level, risk_confidence: `${risk.percent}%` });
      }
    } catch (err) {
      console.error(err);
      onResult({ status: "error", detail: "Upload failed" });
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
        <button className="btn" onClick={startRecording} disabled={recording}>Start Recording</button>
        <button className="btn" onClick={stopRecording} disabled={!recording}>Stop</button>
        <label style={{ marginLeft: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={useOnDevice} onChange={(e) => setUseOnDevice(e.target.checked)} />
          <span className="muted">Run on-device</span>
        </label>
        {/* Fever/Cough checkboxes removed per request */}
        <div style={{ marginLeft: 8 }}>{permissionError}</div>
      </div>
      {analyzing && <div className="muted">Analyzing audio…</div>}
    </div>
  );
}

export default Recorder;

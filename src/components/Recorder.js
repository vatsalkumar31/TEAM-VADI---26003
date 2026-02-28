import React, { useRef, useState, useEffect } from "react";
import { analyzeAudio } from "../services/api";
import { getEmbeddingFromBlob, loadModels } from "../services/yamnet";
import { computeRiskLevel } from "../services/risk";

function Recorder({ onResult, onAudioResult }) {
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const [recording, setRecording] = useState(false);
  const [permissionError, setPermissionError] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [useOnDevice, setUseOnDevice] = useState(false);
  const [symptoms, setSymptoms] = useState({});

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
              if (typeof onAudioResult === 'function') onAudioResult({ ...base, risk_level: risk.level, risk_confidence: risk.percent });
              else if (typeof onResult === 'function') onResult({ ...base, risk_level: risk.level, risk_confidence: risk.percent });
            } catch (innerErr) {
              // Fallback to YAMNet embedding/classifier path
              const local = await getEmbeddingFromBlob(blob);
              const base = { status: 'ok', yamnet_top: local.top, embeddings: local.embedding, probs: local.probs || null, symptoms: {} };
              const risk = computeRiskLevel(base, symptoms);
              console.debug('On-device YAMNet fallback result', { base, risk });
              if (typeof onAudioResult === 'function') onAudioResult({ ...base, risk_level: risk.level, risk_confidence: risk.percent });
              else if (typeof onResult === 'function') onResult({ ...base, risk_level: risk.level, risk_confidence: risk.percent });
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
      formData.append("file", blob, "recording.webm");
      // no fever/cough fields — only send the audio
      const res = await analyzeAudio(formData);
        if (res.data) {
        const base = { ...res.data, symptoms: res.data.symptoms || {} };
        const risk = computeRiskLevel(base, symptoms);
        console.debug('Server analysis result', { base, risk });
        if (typeof onAudioResult === 'function') onAudioResult({ ...base, risk_level: risk.level, risk_confidence: risk.percent });
        else if (typeof onResult === 'function') onResult({ ...base, risk_level: risk.level, risk_confidence: risk.percent });
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

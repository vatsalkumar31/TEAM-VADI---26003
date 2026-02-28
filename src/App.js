import React, { useState } from "react";
import SymptomForm from "./components/SymptomForm";
import Recorder from "./components/Recorder";
import { generateFeedback } from './services/feedback';
import Dashboard from "./components/Dashboard";
import Hero from "./components/Hero";
import './App.css';
// computeRiskLevel no longer used here

function App() {
  const [audioResult, setAudioResult] = useState(null);
  const [symptomResult, setSymptomResult] = useState(null);
  const [view, setView] = useState("home"); // home | screen | dashboard
  const formatConfidence = (value) => (typeof value === 'number' ? `${Math.round(value)}%` : value);

  return (
    <div className="app-container">
      <div className="top-nav">
        <div className="brand">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 12a4 4 0 014-4h9a3 3 0 100-6" stroke="#0b7dd7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          RespiraScan
        </div>
        <div className="nav-right">
          <button className="btn" onClick={() => setView('home')}>Home</button>
          <button className="btn" onClick={() => setView('screen')}>Screen</button>
          <button className="btn" onClick={() => setView('dashboard')}>Dashboard</button>
        </div>
      </div>

      {view === 'home' && (
        <>
          <Hero onStart={() => setView('screen')} />
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Quick Symptom Check</h3>
            <SymptomForm onSymptomResult={setSymptomResult} />
          </div>
        </>
      )}

      {view === 'screen' && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Screen by Audio</h3>
          <Recorder onResult={setAudioResult} />
          <div style={{ marginTop: 16 }}>
            <SymptomForm onSymptomResult={setSymptomResult} />
          </div>

          {(audioResult || symptomResult) && (
            (() => {
              const audio = audioResult || {};
              const symptom = symptomResult || {};
              const audioError = audio.error || (audio.status === "error" ? audio.detail : null);
              const symptomError = symptom.error || (symptom.status === "error" ? symptom.detail : null);
              const hasAudioRisk = typeof audio.risk_score === "number" || typeof audio.risk_level === "string";
              const hasSymptomRisk = typeof symptom.risk_score === "number" || typeof symptom.risk_level === "string";
              const hasAnyRisk = hasAudioRisk || hasSymptomRisk;
              const warnings = [audio.warning, symptom.warning].filter(Boolean);
              if (audioError) warnings.push(`Audio note: ${audioError}`);
              if (symptomError) warnings.push(`Symptom note: ${symptomError}`);

              if (!hasAnyRisk && (audioError || symptomError)) {
                const message = symptomError || audioError || "Risk calculation failed.";
                return (
                  <div style={{ marginTop: 12 }}>
                    <h4>Feedback</h4>
                    <div className="muted">- {message}</div>
                  </div>
                );
              }

              const feedback = generateFeedback(audio, symptom);

              const displayRisk = audio.risk_level || symptom.risk_level || feedback.audio.level || feedback.symptom.level || 'unknown';
              const confidence = formatConfidence(audio.risk_confidence) || formatConfidence(symptom.risk_confidence) || `${feedback.audio.percent || 0}%`;
              const audioPattern = (typeof audio.analysis_label === 'string' && audio.analysis_label)
                || (typeof audio.yamnet_top === 'string' && audio.yamnet_top)
                || null;
              const audioEngine = (typeof audio.analysis_engine === 'string' && audio.analysis_engine) ? audio.analysis_engine : null;

              return (
                <div>
                  <div className="result">
                    <div className="result-item">
                      <div className="muted">Risk Level</div>
                      <div className="percent">{displayRisk + (confidence ? ` (${confidence})` : '')}</div>
                    </div>
                    {audioPattern && (
                      <div className="result-item">
                        <div className="muted">Audio Pattern</div>
                        <div>{audioPattern}{audioEngine ? ` (${audioEngine})` : ''}</div>
                      </div>
                    )}
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <h4>Feedback</h4>
                    {warnings.map((w, i) => (
                      <div key={`w-${i}`} className="muted">- {w}</div>
                    ))}
                    {feedback.messages.map((m, i) => (
                      <div key={`m-${i}`} className="muted">- {m}</div>
                    ))}
                    <div style={{ marginTop: 8 }}>
                      <strong>Recommended actions:</strong>
                      <ul>
                        {feedback.actions.map((a, i) => (<li key={`a-${i}`}>{a}</li>))}
                      </ul>
                    </div>
                  </div>
                </div>
              );
            })()
          )}
        </div>
      )}

      {view === 'dashboard' && (
        <div className="card">
          <Dashboard />
        </div>
      )}
    </div>
  );
}

export default App;

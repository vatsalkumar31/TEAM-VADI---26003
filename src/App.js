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
              const feedback = generateFeedback(audio, symptom);

              const displayRisk = audio.risk_level || symptom.risk_level || feedback.audio.level || feedback.symptom.level || 'unknown';
              const confidence = audio.risk_confidence || symptom.risk_confidence || `${feedback.audio.percent || 0}%`;

              return (
                <div>
                  <div className="result">
                    <div className="result-item">
                      <div className="muted">Risk Level</div>
                      <div className="percent">{displayRisk + (confidence ? ` (${confidence})` : '')}</div>
                    </div>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <h4>Feedback</h4>
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

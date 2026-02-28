import React from "react";

const IconWind = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 12a4 4 0 014-4h9a3 3 0 100-6" stroke="#0b7dd7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M3 16a2 2 0 012-2h9a2 2 0 100-4" stroke="#0b7dd7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function Hero({ onStart }) {
  return (
    <div className="hero">
      <div className="hero-badge"><IconWind /> AI-Powered Early Detection</div>
      <div className="hero-title">Early Respiratory Risk Screening</div>
      <div className="hero-sub">Detect potential respiratory conditions like asthma and COPD at an early stage. Record your breathing or cough sounds, answer simple questions, and get an instant risk assessment—all offline.</div>
      <button className="hero-cta" onClick={onStart}>Start Screening →</button>

      <div className="features-grid" style={{ gridTemplateColumns: '1fr', marginTop: 24 }}>
        <div className="feature-card" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div className="feature-icon" style={{ background: 'rgba(59,130,246,0.12)', color: '#0369a1' }}>
            <IconWind />
          </div>
          <div>
            <h4 style={{ margin: 0 }}>Audio Analysis</h4>
            <div className="muted">Records breathing or cough sounds using your phone's microphone with MFCC feature extraction.</div>
          </div>
        </div>

        <div className="feature-card" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div className="feature-icon" style={{ background: 'rgba(34,197,94,0.12)', color: '#059669' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 21s8-4 8-10V6" stroke="#059669" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M4 7v1c0 6 8 12 8 12" stroke="#059669" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <div>
            <h4 style={{ margin: 0 }}>Symptom Assessment</h4>
            <div className="muted">Combines audio analysis with basic symptom inputs for comprehensive risk evaluation.</div>
          </div>
        </div>

        <div className="feature-card" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div className="feature-icon" style={{ background: 'rgba(168,85,247,0.12)', color: '#8b5cf6' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 12c2.21 0 4-1.79 4-4S14.21 4 12 4 8 5.79 8 8s1.79 4 4 4z" stroke="#8b5cf6" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/><path d="M6 20v-1c0-2.5 5-4 6-4s6 1.5 6 4v1" stroke="#8b5cf6" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <div>
            <h4 style={{ margin: 0 }}>Accessible & Offline</h4>
            <div className="muted">Works completely offline, designed for rural and low-resource populations.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Hero;

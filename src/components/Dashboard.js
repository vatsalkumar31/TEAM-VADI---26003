import React from "react";

function Dashboard() {
  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2>AI-Powered Early Detection</h2>
        <p className="muted">Detect potential respiratory conditions like asthma and COPD at an early stage.</p>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        <div className="feature-card">
          <div style={{ display: 'flex', alignItems:'center', gap: 12 }}>
            <div className="feature-icon" style={{ background: 'rgba(59,130,246,0.12)', color: '#0369a1' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 12a4 4 0 014-4h9a3 3 0 100-6" stroke="#0b7dd7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <div>
              <h3 style={{ margin: 0 }}>Audio Analysis</h3>
              <p className="muted">Records breathing or cough sounds using your phone's microphone with MFCC feature extraction.</p>
            </div>
          </div>
        </div>

        <div className="feature-card">
          <div style={{ display: 'flex', alignItems:'center', gap: 12 }}>
            <div className="feature-icon" style={{ background: 'rgba(34,197,94,0.12)', color: '#059669' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 21s8-4 8-10V6" stroke="#059669" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <div>
              <h3 style={{ margin: 0 }}>Symptom Assessment</h3>
              <p className="muted">Combines audio analysis with basic symptom inputs for comprehensive risk evaluation.</p>
            </div>
          </div>
        </div>

        <div className="feature-card">
          <div style={{ display: 'flex', alignItems:'center', gap: 12 }}>
            <div className="feature-icon" style={{ background: 'rgba(168,85,247,0.12)', color: '#8b5cf6' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 12c2.21 0 4-1.79 4-4S14.21 4 12 4 8 5.79 8 8s1.79 4 4 4z" stroke="#8b5cf6" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <div>
              <h3 style={{ margin: 0 }}>Accessible & Offline</h3>
              <p className="muted">Works completely offline, designed for rural and low-resource populations.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;

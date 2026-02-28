import React, { useState } from "react";
import { predictRisk } from "../services/api";

function SymptomForm({ setResult, onSymptomResult }) {

  const [form, setForm] = useState({
    age: "",
    breathlessness: 0,
    spo2: "",
    respiratory_rate: "",
    systolic_bp: "",
    confusion: 0,
    urea: ""
  });
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value === "" ? "" : Number(value) }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await predictRisk(form);
      if (typeof onSymptomResult === 'function') onSymptomResult(res.data);
      else if (typeof setResult === 'function') setResult(res.data);
    } catch (err) {
      console.error(err);
      if (typeof onSymptomResult === 'function') onSymptomResult({ error: "Failed to get prediction" });
      else if (typeof setResult === 'function') setResult({ error: "Failed to get prediction" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field">
            <label className="label">Age</label>
            <input className="input" name="age" type="number" min="0" placeholder="Years" value={form.age} onChange={handleChange} required />
          </div>

          <div className="field">
            <label className="label">SpO2</label>
            <input className="input" name="spo2" type="number" min="50" max="100" placeholder="e.g. 95" value={form.spo2} onChange={handleChange} required />
          </div>

          <div className="field">
            <label className="label">Respiratory Rate</label>
            <input className="input" name="respiratory_rate" type="number" min="0" placeholder="breaths/min" value={form.respiratory_rate} onChange={handleChange} required />
          </div>

          <div className="field">
            <label className="label">Systolic BP</label>
            <input className="input" name="systolic_bp" type="number" min="0" placeholder="mmHg" value={form.systolic_bp} onChange={handleChange} required />
          </div>

          <div className="field">
            <label className="label">Urea</label>
            <input className="input" name="urea" type="number" step="0.1" min="0" placeholder="mmol/L" value={form.urea} onChange={handleChange} required />
          </div>

          {/* Fever and Cough fields removed per request */}

          <div className="field">
            <label className="label">Breathlessness</label>
            <select className="select" name="breathlessness" value={form.breathlessness} onChange={handleChange}>
              <option value={1}>Yes</option>
              <option value={0}>No</option>
            </select>
          </div>

          <div className="field">
            <label className="label">Confusion</label>
            <select className="select" name="confusion" value={form.confusion} onChange={handleChange}>
              <option value={1}>Yes</option>
              <option value={0}>No</option>
            </select>
          </div>
        </div>

        <div className="actions">
          <button className="btn" type="submit" disabled={loading}>{loading ? 'Checking...' : 'Check Risk'}</button>
        </div>
      </form>
    </div>
  );
}

export default SymptomForm;

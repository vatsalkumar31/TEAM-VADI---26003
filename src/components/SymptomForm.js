import React, { useState } from "react";
import { predictRisk } from "../services/api";

const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

const scoreToLevel = (score) => {
  if (score >= 0.65) return "High";
  if (score >= 0.4) return "Medium";
  return "Low";
};

function computeLocalSymptomRisk(form) {
  const age = Number(form.age) || 0;
  const spo2 = Number(form.spo2) || 100;
  const rr = Number(form.respiratory_rate) || 0;
  const sbp = Number(form.systolic_bp) || 120;
  const urea = Number(form.urea) || 0;
  const breathlessness = Number(form.breathlessness) === 1;
  const confusion = Number(form.confusion) === 1;

  const spo2Risk = clamp01((95 - spo2) / 10);
  const rrRisk = clamp01((rr - 18) / 17);
  const bpLowRisk = clamp01((100 - sbp) / 40);
  const bpHighRisk = clamp01((sbp - 140) / 60) * 0.6;
  const bpRisk = Math.max(bpLowRisk, bpHighRisk);
  const ureaRisk = clamp01((urea - 5) / 15);
  const ageRisk = clamp01((age - 50) / 40);
  const breathRisk = breathlessness ? 1 : 0;
  const confusionRisk = confusion ? 1 : 0;

  const entryScore =
    0.3 * spo2Risk +
    0.2 * rrRisk +
    0.15 * bpRisk +
    0.1 * ureaRisk +
    0.1 * ageRisk +
    0.05 * breathRisk +
    0.1 * confusionRisk;

  let curb = 0;
  if (confusion) curb += 1;
  if (urea > 7) curb += 1;
  if (rr >= 30) curb += 1;
  if (sbp < 90) curb += 1;
  if (age >= 65) curb += 1;
  const curbComponent = Math.min(0.25, curb * 0.03);

  let comboBoost = 0;
  if (spo2 < 90 && rr >= 30) comboBoost += 0.12;
  if (confusion && sbp < 90) comboBoost += 0.15;
  if (curb >= 4) comboBoost += 0.15;
  else if (curb >= 2) comboBoost += 0.08;

  let ruleFloor = 0;
  if (spo2 <= 88) ruleFloor = Math.max(ruleFloor, 0.75);
  else if (spo2 <= 90 && breathlessness) ruleFloor = Math.max(ruleFloor, 0.7);
  if (rr >= 30) ruleFloor = Math.max(ruleFloor, 0.72);
  if (sbp >= 220 || sbp < 90) ruleFloor = Math.max(ruleFloor, 0.72);
  if (confusion) ruleFloor = Math.max(ruleFloor, 0.72);
  if (curb >= 3) ruleFloor = Math.max(ruleFloor, 0.72);

  let riskScore = entryScore + curbComponent + comboBoost;
  riskScore = clamp01(Math.max(riskScore, ruleFloor));
  const riskLevel = scoreToLevel(riskScore);

  return {
    risk_score: riskScore,
    risk_level: riskLevel,
    risk_confidence: `${Math.round(riskScore * 100)}%`,
    probabilities: {
      low: clamp01(1 - riskScore),
      medium: clamp01(1 - Math.abs(riskScore - 0.5) / 0.3),
      high: clamp01(riskScore),
    },
    risk_breakdown: {
      entry_score: Number(entryScore.toFixed(4)),
      curb_component: Number(curbComponent.toFixed(4)),
      combo_boost: Number(comboBoost.toFixed(4)),
      rule_floor: Number(ruleFloor.toFixed(4)),
      local_fallback: true,
    },
  };
}

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
      const backendDetail = err?.response?.data?.detail;
      const detail = Array.isArray(backendDetail) ? backendDetail.map((x) => x?.msg || String(x)).join(", ") : backendDetail;
      const message = detail || err?.message || "Failed to get prediction";
      const fallback = computeLocalSymptomRisk(form);
      const payload = {
        ...fallback,
        warning: `Backend prediction failed: ${message}. Showing local estimate.`,
      };
      if (typeof onSymptomResult === 'function') onSymptomResult(payload);
      else if (typeof setResult === 'function') setResult(payload);
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

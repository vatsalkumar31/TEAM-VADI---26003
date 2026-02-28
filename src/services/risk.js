function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function scoreToLevel(score) {
  if (score >= 0.65) return 'High';
  if (score >= 0.4) return 'Medium';
  return 'Low';
}

function normalizeLevel(level) {
  if (typeof level !== 'string') return null;
  const clean = level.trim().toLowerCase();
  if (clean === 'high') return 'High';
  if (clean === 'medium' || clean === 'moderate') return 'Medium';
  if (clean === 'low') return 'Low';
  return null;
}

function levelToScore(level) {
  if (level === 'High') return 0.8;
  if (level === 'Medium') return 0.5;
  return 0.2;
}

export function computeRiskLevel(result = {}, symptoms = {}) {
  // Prefer backend score. If only backend level is available, map it to a midpoint score.
  const backendScore = Number(result.risk_score);
  const hasBackendScore = Number.isFinite(backendScore);
  const backendLevel = normalizeLevel(result.risk_level);
  if (hasBackendScore || backendLevel) {
    const score = hasBackendScore ? clamp01(backendScore) : levelToScore(backendLevel);
    const level = backendLevel || scoreToLevel(score);
    const percent = Math.round(score * 100);
    return { level, score, percent };
  }

  // extract p_high (0..1)
  let p_high = 0;
  const { probabilities, probs, logistic_risk, random_forest_risk } = result;
  if (probabilities && typeof probabilities === 'object') {
    if ('high' in probabilities || 'High' in probabilities) {
      p_high = Number(probabilities.high ?? probabilities.High) || 0;
    } else if ('low' in probabilities || 'Low' in probabilities) {
      const low = Number(probabilities.low ?? probabilities.Low);
      p_high = Number.isFinite(low) ? 1 - low : 0;
    } else {
      const entries = Object.entries(probabilities);
      entries.sort((a, b) => b[1] - a[1]);
      p_high = Number(entries[0] ? entries[0][1] : 0) || 0;
    }
  } else if (Array.isArray(probs)) {
    if (probs.length === 2) p_high = Number(probs[1] || 0) || 0;
    else p_high = Number(probs[probs.length - 1] || 0) || 0;
  } else if (typeof logistic_risk === 'number' || typeof random_forest_risk === 'number') {
    const available = [Number(logistic_risk), Number(random_forest_risk)].filter(Number.isFinite);
    if (available.length) {
      p_high = clamp01(available.reduce((a, b) => a + b, 0) / available.length);
    } else {
      p_high = 0;
    }
  } else {
    p_high = 0;
  }
  p_high = clamp01(p_high);

  // symptom boost: only consider breathlessness now
  const breath = !!symptoms.breathlessness;
  const s = breath ? 0.4 : 0;

  const score = 0.75 * Number(p_high) + 0.25 * s;
  const percent = Math.round(score * 100);
  const level = scoreToLevel(score);

  return { level, score, percent };
}

export default { computeRiskLevel };

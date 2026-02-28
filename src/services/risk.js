export function computeRiskLevel(result = {}, symptoms = {}) {
  // extract p_high (0..1)
  let p_high = 0;
  const { probabilities, probs } = result;
  if (probabilities && typeof probabilities === 'object') {
    if ('high' in probabilities) p_high = Number(probabilities.high) || 0;
    else {
      const entries = Object.entries(probabilities);
      entries.sort((a, b) => b[1] - a[1]);
      p_high = Number(entries[0] ? entries[0][1] : 0) || 0;
    }
  } else if (Array.isArray(probs)) {
    p_high = Number(probs[probs.length - 1] || 0) || 0;
  } else {
    p_high = 0;
  }

  // symptom boost: only consider breathlessness now
  const breath = !!symptoms.breathlessness;
  let s = (breath ? 0.4 : 0);
  s = Math.max(0, Math.min(1, s));

  const score = 0.75 * Number(p_high) + 0.25 * s;
  const percent = Math.round(score * 100);

  let level = 'Low';
  if (score >= 0.65) level = 'High';
  else if (score >= 0.4) level = 'Medium';

  return { level, score, percent };
}

export default { computeRiskLevel };

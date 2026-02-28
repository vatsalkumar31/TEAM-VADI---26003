import { computeRiskLevel } from './risk';

export function generateFeedback(audioResult = {}, symptomResult = {}) {
  // compute numeric scores where possible
  const audioScoreObj = computeRiskLevel(audioResult, audioResult.symptoms || {});
  const symptomScoreObj = computeRiskLevel(symptomResult, symptomResult || {});

  const aScore = Number(audioScoreObj.score || 0);
  const sScore = Number(symptomScoreObj.score || 0);
  const aLevel = audioScoreObj.level || 'Low';
  const sLevel = symptomScoreObj.level || 'Low';

  const messages = [];

  // Primary combined interpretation
  if (aScore >= 0.65 && sScore >= 0.65) {
    messages.push('Both audio screening and symptom assessment indicate High risk — seek medical attention promptly.');
  } else if (aScore >= 0.65 && sScore < 0.65) {
    messages.push('Audio screening suggests High risk while symptoms are less severe. Consider repeating the audio test and monitor symptoms closely; if symptoms worsen, contact a clinician.');
  } else if (sScore >= 0.65 && aScore < 0.65) {
    messages.push('Symptom assessment indicates High risk but audio screening is lower. Prioritise clinical evaluation based on symptoms.');
  } else if ((aScore >= 0.4 && sScore >= 0.4)) {
    messages.push('Both sources indicate Moderate risk — monitor closely and consider professional advice.');
  } else if (aScore >= 0.4) {
    messages.push('Audio screening suggests Moderate risk — repeat test and observe symptoms.');
  } else if (sScore >= 0.4) {
    messages.push('Symptom assessment suggests Moderate risk — monitor and consider follow-up if symptoms persist.');
  } else {
    messages.push('Low risk on both audio screening and symptom check. Continue routine monitoring.');
  }

  // Changes / trends hint: compare levels
  if (aLevel !== sLevel) {
    messages.push(`Screening level: ${aLevel}; Symptom level: ${sLevel}. These differ — use the higher result for safety.`);
  }

  // Practical next steps
  const actions = [];
  if (Math.max(aScore, sScore) >= 0.65) {
    actions.push('Seek immediate medical attention or teleconsultation.');
  } else if (Math.max(aScore, sScore) >= 0.4) {
    actions.push('Repeat test in 24 hours and monitor oxygen saturation and breathlessness.');
  } else {
    actions.push('Continue self-monitoring; if new or worsening symptoms occur, seek advice.');
  }

  return { messages, actions, audio: audioScoreObj, symptom: symptomScoreObj };
}

export default { generateFeedback };

/**
 * CVSS 3.1 Calculator
 * Pre-built vector templates per security category with confidence-based adjustment.
 */

const { severityFromCVSS } = require('./findings');

const CATEGORY_VECTORS = {
  MALICIOUS_CODE: { vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H', baseScore: 9.8 },
  DATA_EXFILTRATION: { vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N', baseScore: 9.1 },
  BACKDOOR: { vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H', baseScore: 10.0 },
  PRIVILEGE_ABUSE: { vector: 'CVSS:3.1/AV:L/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H', baseScore: 8.4 },
  PROMPT_INJECTION: { vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:N', baseScore: 9.3 },
  SUPPLY_CHAIN: { vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:H', baseScore: 8.8 },
  WEB_SECURITY: { vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N', baseScore: 9.1 },
  DEPENDENCY: { vector: 'CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:U/C:L/I:L/A:N', baseScore: 4.2 }
};

function adjustForConfidence(baseScore, confidence) {
  let multiplier;
  if (confidence >= 90) multiplier = 1.0;
  else if (confidence >= 70) multiplier = 0.9;
  else if (confidence >= 50) multiplier = 0.7;
  else multiplier = 0.5;
  return Math.round(baseScore * multiplier * 10) / 10;
}

function calculateCVSS(category, confidence) {
  const template = CATEGORY_VECTORS[category];
  if (!template) return null;
  const adjustedScore = adjustForConfidence(template.baseScore, confidence);
  return {
    vector: template.vector,
    baseScore: template.baseScore,
    adjustedScore,
    severityRating: severityFromCVSS(adjustedScore).toUpperCase()
  };
}

module.exports = { calculateCVSS, adjustForConfidence, CATEGORY_VECTORS };

/**
 * Finding data structure for the security scan engine.
 */

function createFinding(opts) {
  const content = opts.content || '';
  return {
    ruleId: opts.ruleId || null,
    detector: opts.detector,
    category: opts.category,
    name: opts.name,
    severity: opts.severity,
    confidence: opts.confidence != null ? opts.confidence : 75,
    file: opts.file || null,
    line: opts.line || null,
    content: content.length > 200 ? content.slice(0, 200) : content,
    match: opts.match || null,
    suggestion: opts.suggestion || null,
    reference: opts.reference || null,
    cvss: null
  };
}

function severityFromCVSS(score) {
  if (score >= 9.0) return 'critical';
  if (score >= 7.0) return 'high';
  if (score >= 4.0) return 'medium';
  return 'low';
}

module.exports = { createFinding, severityFromCVSS };

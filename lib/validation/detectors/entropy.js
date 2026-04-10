/**
 * Shannon Entropy Detector
 * Flags lines with suspiciously high entropy that may indicate obfuscated payloads.
 */

const { createFinding } = require('../engine/findings');

const SKIP_FILE_PATTERNS = /\.(lock|min\.js|min\.css|map)$|-lock\.json$/i;
const COMMENT_PATTERNS = /^\s*(\/\/|#|\/\*|\*|"""|''')/;
const BASE64_CONTEXT = /data:[a-z]+\/[a-z]+;base64,|['"]\s*base64\s*['"]|;base64,/i;
const MIN_LINE_LENGTH = 40;
const DEFAULT_THRESHOLD = 5.5;
const CJK_THRESHOLD = 6.5;
const CJK_REGEX = /[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f]/g;

function shannonEntropy(str) {
  if (!str || str.length === 0) return 0;
  const freq = {};
  for (const ch of str) { freq[ch] = (freq[ch] || 0) + 1; }
  let entropy = 0;
  const len = str.length;
  for (const count of Object.values(freq)) {
    const p = count / len;
    if (p > 0) entropy -= p * Math.log2(p);
  }
  return entropy;
}

class EntropyDetector {
  constructor(options = {}) {
    this.threshold = options.threshold || DEFAULT_THRESHOLD;
    this.cjkThreshold = options.cjkThreshold || CJK_THRESHOLD;
  }

  _isCJKHeavy(lines) {
    const sample = lines.slice(0, 50).join('\n');
    if (sample.length === 0) return false;
    const cjkMatches = sample.match(CJK_REGEX) || [];
    return cjkMatches.length / sample.length > 0.3;
  }

  scanFile(filePath, lines) {
    if (SKIP_FILE_PATTERNS.test(filePath)) return [];
    const isCJK = this._isCJKHeavy(lines);
    const threshold = isCJK ? this.cjkThreshold : this.threshold;
    const findings = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.length < MIN_LINE_LENGTH) continue;
      if (COMMENT_PATTERNS.test(line)) continue;
      if (BASE64_CONTEXT.test(line)) continue;
      const entropy = shannonEntropy(line);
      if (entropy > threshold) {
        findings.push(createFinding({
          ruleId: 'ENTROPY001', detector: 'entropy', category: 'MALICIOUS_CODE',
          name: `High entropy line (${entropy.toFixed(2)} bits)`,
          severity: 'medium', confidence: 60,
          file: filePath, line: i + 1, content: line,
          match: `entropy=${entropy.toFixed(2)}`
        }));
      }
    }
    return findings;
  }
}

module.exports = { EntropyDetector, shannonEntropy };

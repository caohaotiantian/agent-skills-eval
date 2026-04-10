/**
 * Hidden Character Detector
 * Detects zero-width characters, Unicode bidi control chars (Trojan Source),
 * and homoglyph substitutions.
 */

const { createFinding } = require('../engine/findings');

const ZERO_WIDTH = /[\u200B\u200C\u200D]/;
const BOM = '\uFEFF';
const BIDI_REGEX = /[\u202A-\u202E\u2066-\u2069]/;
const HOMOGLYPH_REGEX = /[\u0430\u0435\u043E\u0440\u0441\u0443\u0445]/;
const CODE_FILE_PATTERN = /\.(js|ts|mjs|jsx|tsx|py|sh|bash|c|cpp|java|go|rs|rb)$/i;

class HiddenCharDetector {
  scanFile(filePath, lines) {
    const findings = [];
    const isCodeFile = CODE_FILE_PATTERN.test(filePath);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      if (ZERO_WIDTH.test(line)) {
        findings.push(createFinding({
          ruleId: 'HIDDEN001', detector: 'hidden-char', category: 'MALICIOUS_CODE',
          name: 'Zero-width character detected', severity: 'high', confidence: 70,
          file: filePath, line: lineNum, content: line, match: 'zero-width char',
          suggestion: 'Remove zero-width characters — they can hide malicious code'
        }));
      }

      if (line.includes(BOM)) {
        const isStartOfFile = i === 0 && line.indexOf(BOM) === 0;
        if (!isStartOfFile) {
          findings.push(createFinding({
            ruleId: 'HIDDEN002', detector: 'hidden-char', category: 'MALICIOUS_CODE',
            name: 'BOM character mid-file', severity: 'high', confidence: 70,
            file: filePath, line: lineNum, content: line, match: 'U+FEFF mid-file',
            suggestion: 'BOM should only appear at the start of a file'
          }));
        }
      }

      if (BIDI_REGEX.test(line)) {
        findings.push(createFinding({
          ruleId: 'HIDDEN003', detector: 'hidden-char', category: 'MALICIOUS_CODE',
          name: 'Unicode bidi control character (Trojan Source)', severity: 'critical',
          confidence: 90, file: filePath, line: lineNum, content: line,
          match: 'bidi control char',
          suggestion: 'Remove bidi override characters — they can disguise malicious code',
          reference: 'https://trojansource.codes/'
        }));
      }

      if (isCodeFile && HOMOGLYPH_REGEX.test(line)) {
        findings.push(createFinding({
          ruleId: 'HIDDEN004', detector: 'hidden-char', category: 'SUPPLY_CHAIN',
          name: 'Cyrillic homoglyph in code', severity: 'high', confidence: 60,
          file: filePath, line: lineNum, content: line, match: 'Cyrillic homoglyph',
          suggestion: 'Replace Cyrillic look-alike characters with their Latin equivalents'
        }));
      }
    }
    return findings;
  }
}

module.exports = { HiddenCharDetector };

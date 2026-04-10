const { EntropyDetector, shannonEntropy } = require('../../../lib/validation/detectors/entropy');

describe('shannonEntropy', () => {
  it('should return 0 for single-char string', () => {
    expect(shannonEntropy('aaaaaa')).toBeCloseTo(0, 1);
  });
  it('should return ~1 for two equally distributed chars', () => {
    expect(shannonEntropy('ababababab')).toBeCloseTo(1.0, 1);
  });
  it('should return high entropy for random-looking string', () => {
    expect(shannonEntropy('aB3$xY9!mK7@pL2&qR5*wZ0#')).toBeGreaterThan(4.0);
  });
  it('should return 0 for empty string', () => {
    expect(shannonEntropy('')).toBe(0);
  });
});

describe('EntropyDetector', () => {
  let detector;
  beforeEach(() => { detector = new EntropyDetector(); });

  it('should flag high-entropy lines', () => {
    const highEntropy = 'aB3$xY9!mK7@pL2&qR5*wZ0#jF8%cN6^dH4+eG1=fI~tU;oW<vQ>';
    const lines = ['const x = 42;', highEntropy, 'const y = "hello";'];
    const findings = detector.scanFile('test.js', lines);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].detector).toBe('entropy');
    expect(findings[0].category).toBe('MALICIOUS_CODE');
  });

  it('should skip short lines (< 40 chars)', () => {
    expect(detector.scanFile('test.js', ['abc123!@#'])).toHaveLength(0);
  });

  it('should skip comment lines', () => {
    const comment = '// ' + 'xK9$mP2!bR7@nL4&qT6*wZ0#aB3$xY9!mK7@pL2&q';
    expect(detector.scanFile('test.js', [comment])).toHaveLength(0);
  });

  it('should skip lock files', () => {
    const high = 'aB3$xY9!mK7@pL2&qR5*wZ0#jF8%cN6^dH4+eG1=fI~tU;oW<vQ>';
    expect(detector.scanFile('package-lock.json', [high])).toHaveLength(0);
  });

  it('should skip minified files', () => {
    const high = 'aB3$xY9!mK7@pL2&qR5*wZ0#jF8%cN6^dH4+eG1=fI~tU;oW<vQ>';
    expect(detector.scanFile('bundle.min.js', [high])).toHaveLength(0);
  });

  it('should skip base64 data URI lines', () => {
    const dataUri = 'background: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAA);';
    expect(detector.scanFile('style.css', [dataUri])).toHaveLength(0);
  });

  it('should not flag normal code', () => {
    const lines = [
      'const express = require("express");',
      'const app = express();',
      'app.get("/api/users", async (req, res) => {',
      '  const users = await db.query("SELECT * FROM users");',
      '  res.json(users);',
      '});'
    ];
    expect(detector.scanFile('server.js', lines)).toHaveLength(0);
  });
});

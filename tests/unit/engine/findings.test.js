const { createFinding, severityFromCVSS } = require('../../../lib/validation/engine/findings');

describe('createFinding', () => {
  it('should create a finding with all required fields', () => {
    const f = createFinding({
      ruleId: 'MAL001', detector: 'rule-engine', category: 'MALICIOUS_CODE',
      name: 'dangerous function', severity: 'critical', confidence: 85,
      file: 'lib/index.js', line: 42, content: 'some matched line content here', match: 'matched text'
    });
    expect(f.ruleId).toBe('MAL001');
    expect(f.detector).toBe('rule-engine');
    expect(f.category).toBe('MALICIOUS_CODE');
    expect(f.severity).toBe('critical');
    expect(f.confidence).toBe(85);
    expect(f.file).toBe('lib/index.js');
    expect(f.line).toBe(42);
    expect(f.cvss).toBeNull();
  });

  it('should truncate content to 200 chars', () => {
    const longContent = 'a'.repeat(300);
    const f = createFinding({
      ruleId: 'X', detector: 'test', category: 'TEST', name: 'test',
      severity: 'low', confidence: 50, file: 'a.js', line: 1,
      content: longContent, match: 'a'
    });
    expect(f.content.length).toBe(200);
  });

  it('should default confidence to 75 when not provided', () => {
    const f = createFinding({
      ruleId: 'X', detector: 'test', category: 'TEST', name: 'test',
      severity: 'low', file: 'a.js', line: 1, content: 'x', match: 'x'
    });
    expect(f.confidence).toBe(75);
  });
});

describe('severityFromCVSS', () => {
  it('should return CRITICAL for >= 9.0', () => {
    expect(severityFromCVSS(9.0)).toBe('critical');
    expect(severityFromCVSS(10.0)).toBe('critical');
  });
  it('should return HIGH for 7.0-8.9', () => {
    expect(severityFromCVSS(7.0)).toBe('high');
    expect(severityFromCVSS(8.9)).toBe('high');
  });
  it('should return MEDIUM for 4.0-6.9', () => {
    expect(severityFromCVSS(4.0)).toBe('medium');
    expect(severityFromCVSS(6.9)).toBe('medium');
  });
  it('should return LOW for 0.1-3.9', () => {
    expect(severityFromCVSS(0.1)).toBe('low');
    expect(severityFromCVSS(3.9)).toBe('low');
  });
  it('should return LOW for 0', () => {
    expect(severityFromCVSS(0)).toBe('low');
  });
});

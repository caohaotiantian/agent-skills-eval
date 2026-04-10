const { calculateCVSS, adjustForConfidence, CATEGORY_VECTORS } = require('../../../lib/validation/engine/cvss');

describe('CATEGORY_VECTORS', () => {
  it('should have vectors for all 8 categories', () => {
    const expected = [
      'MALICIOUS_CODE', 'DATA_EXFILTRATION', 'BACKDOOR', 'PRIVILEGE_ABUSE',
      'PROMPT_INJECTION', 'SUPPLY_CHAIN', 'WEB_SECURITY', 'DEPENDENCY'
    ];
    for (const cat of expected) {
      expect(CATEGORY_VECTORS[cat]).toBeDefined();
      expect(CATEGORY_VECTORS[cat].vector).toMatch(/^CVSS:3\.1\//);
      expect(typeof CATEGORY_VECTORS[cat].baseScore).toBe('number');
    }
  });
});

describe('calculateCVSS', () => {
  it('should return full CVSS object for known category', () => {
    const result = calculateCVSS('MALICIOUS_CODE', 95);
    expect(result.vector).toMatch(/^CVSS:3\.1\//);
    expect(result.baseScore).toBe(CATEGORY_VECTORS.MALICIOUS_CODE.baseScore);
    expect(result.adjustedScore).toBe(result.baseScore);
    expect(result.severityRating).toBe('CRITICAL');
  });

  it('should apply 0.9 multiplier for confidence 70-89', () => {
    const result = calculateCVSS('MALICIOUS_CODE', 75);
    expect(result.adjustedScore).toBeCloseTo(result.baseScore * 0.9, 1);
  });

  it('should apply 0.7 multiplier for confidence 50-69', () => {
    const result = calculateCVSS('MALICIOUS_CODE', 55);
    expect(result.adjustedScore).toBeCloseTo(result.baseScore * 0.7, 1);
  });

  it('should apply 0.5 multiplier for confidence < 50', () => {
    const result = calculateCVSS('MALICIOUS_CODE', 30);
    expect(result.adjustedScore).toBeCloseTo(result.baseScore * 0.5, 1);
  });

  it('should return null for unknown category', () => {
    expect(calculateCVSS('UNKNOWN_CATEGORY', 80)).toBeNull();
  });

  it('should downgrade severity based on adjusted score', () => {
    const result = calculateCVSS('DEPENDENCY', 30);
    expect(result.severityRating).toBe('LOW');
  });
});

describe('adjustForConfidence', () => {
  it('should not adjust for confidence >= 90', () => {
    expect(adjustForConfidence(9.8, 90)).toBe(9.8);
    expect(adjustForConfidence(9.8, 100)).toBe(9.8);
  });
  it('should multiply by 0.9 for 70-89', () => {
    expect(adjustForConfidence(10.0, 70)).toBeCloseTo(9.0, 1);
  });
  it('should multiply by 0.7 for 50-69', () => {
    expect(adjustForConfidence(10.0, 50)).toBeCloseTo(7.0, 1);
  });
  it('should multiply by 0.5 for < 50', () => {
    expect(adjustForConfidence(10.0, 49)).toBeCloseTo(5.0, 1);
  });
});

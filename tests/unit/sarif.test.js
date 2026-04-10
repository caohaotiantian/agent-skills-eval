const { generateSARIF } = require('../../lib/skills/reporting/sarif');

describe('generateSARIF', () => {
  const sampleFindings = [
    {
      ruleId: 'MAL001', detector: 'rule-engine', category: 'MALICIOUS_CODE',
      name: 'dangerous function usage', severity: 'critical', confidence: 90,
      file: 'index.js', line: 10, content: 'some code', match: 'matched',
      suggestion: 'Use safer alternative', reference: 'https://example.com',
      cvss: { vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
              baseScore: 9.8, adjustedScore: 9.8, severityRating: 'CRITICAL' }
    },
    {
      ruleId: 'DATA001', detector: 'rule-engine', category: 'DATA_EXFILTRATION',
      name: 'env file read', severity: 'high', confidence: 80,
      file: 'lib/config.js', line: 25, content: 'read .env', match: '.env',
      suggestion: 'Use secure config', reference: null,
      cvss: { vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N',
              baseScore: 9.1, adjustedScore: 8.19, severityRating: 'HIGH' }
    }
  ];

  it('should return valid SARIF 2.1.0 JSON', () => {
    const parsed = JSON.parse(generateSARIF(sampleFindings));
    expect(parsed.version).toBe('2.1.0');
    expect(parsed.$schema).toContain('sarif-schema');
    expect(parsed.runs).toHaveLength(1);
  });

  it('should include tool driver info', () => {
    const parsed = JSON.parse(generateSARIF(sampleFindings));
    const driver = parsed.runs[0].tool.driver;
    expect(driver.name).toBe('agent-skills-eval');
    expect(driver.rules.length).toBeGreaterThan(0);
  });

  it('should map findings to results', () => {
    const parsed = JSON.parse(generateSARIF(sampleFindings));
    const results = parsed.runs[0].results;
    expect(results).toHaveLength(2);
    expect(results[0].ruleId).toBe('MAL001');
    expect(results[0].level).toBe('error');
    expect(results[0].locations[0].physicalLocation.artifactLocation.uri).toBe('index.js');
    expect(results[0].locations[0].physicalLocation.region.startLine).toBe(10);
  });

  it('should map severity to SARIF level', () => {
    const parsed = JSON.parse(generateSARIF(sampleFindings));
    expect(parsed.runs[0].results[0].level).toBe('error');
    expect(parsed.runs[0].results[1].level).toBe('error');
  });

  it('should include CVSS in properties', () => {
    const parsed = JSON.parse(generateSARIF(sampleFindings));
    expect(parsed.runs[0].results[0].properties.cvss).toBeDefined();
    expect(parsed.runs[0].results[0].properties.cvss.baseScore).toBe(9.8);
  });

  it('should handle empty findings', () => {
    const parsed = JSON.parse(generateSARIF([]));
    expect(parsed.runs[0].results).toHaveLength(0);
  });
});

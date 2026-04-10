const path = require('path');
const { ScanEngine } = require('../../../lib/validation/engine');

const VULN_SKILL = path.join(__dirname, '..', '..', 'fixtures', 'vuln-skill');
const SAFE_SKILL = path.join(__dirname, '..', '..', 'fixtures', 'coding-agent');

describe('ScanEngine', () => {
  let engine;
  beforeAll(() => { engine = new ScanEngine({}); });

  describe('scan', () => {
    it('should return findings for a vulnerable skill', async () => {
      const result = await engine.scan(VULN_SKILL);
      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.findings[0].file).toBeDefined();
      expect(result.findings[0].line).toBeDefined();
      expect(result.findings[0].cvss).toBeDefined();
    });

    it('should return CVSS scores on findings', async () => {
      const result = await engine.scan(VULN_SKILL);
      const withCVSS = result.findings.filter(f => f.cvss !== null);
      expect(withCVSS.length).toBeGreaterThan(0);
      expect(withCVSS[0].cvss.vector).toMatch(/^CVSS:3\.1\//);
      expect(typeof withCVSS[0].cvss.adjustedScore).toBe('number');
    });

    it('should include per-file relative paths', async () => {
      const result = await engine.scan(VULN_SKILL);
      const files = result.findings.map(f => f.file);
      expect(files.some(f => f === 'index.js')).toBe(true);
    });

    it('should respect fileTypes filters from rules', async () => {
      const result = await engine.scan(VULN_SKILL);
      // safe.py has no vulnerable patterns for Python rules
      const pyFindings = result.findings.filter(f => f.file === 'safe.py');
      expect(pyFindings).toHaveLength(0);
    });

    it('should include cvss summary', async () => {
      const result = await engine.scan(VULN_SKILL);
      expect(result.cvss).toBeDefined();
      expect(typeof result.cvss.maxScore).toBe('number');
      expect(result.cvss.distribution).toBeDefined();
    });

    it('should include detectorResults', async () => {
      const result = await engine.scan(VULN_SKILL);
      expect(result.detectorResults).toBeDefined();
      expect(typeof result.detectorResults['rule-engine']).toBe('object');
      expect(typeof result.detectorResults.entropy).toBe('object');
      expect(typeof result.detectorResults['hidden-char']).toBe('object');
      expect(typeof result.detectorResults.compound).toBe('object');
      expect(typeof result.detectorResults.ioc).toBe('object');
    });

    it('should return minimal findings for a safe skill', async () => {
      const result = await engine.scan(SAFE_SKILL);
      const criticals = result.findings.filter(f => f.severity === 'critical');
      expect(criticals).toHaveLength(0);
    });

    it('should handle nonexistent path gracefully', async () => {
      const result = await engine.scan('/nonexistent/path/xyz');
      expect(result.findings).toHaveLength(0);
      expect(result.error).toBeDefined();
    });
  });
});

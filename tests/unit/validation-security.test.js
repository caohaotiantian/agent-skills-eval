/**
 * Unit tests for lib/validation/security.js
 * Tests validateSecurity() which delegates entirely to ScanEngine.
 * Pattern-specific tests are in engine-fp-reduction.test.js.
 */

const path = require('path');
const os = require('os');
const fs = require('fs-extra');
const { validateSecurity, checkDependencySecurity } = require('../../lib/validation/security');

// ---------------------------------------------------------------------------
// checkDependencySecurity (only non-engine check — filesystem-based)
// ---------------------------------------------------------------------------
describe('checkDependencySecurity', () => {
  it('should pass when no package.json exists', async () => {
    const result = await checkDependencySecurity('/tmp/nonexistent-path-xyz-12345');
    expect(result.passed).toBe(true);
  });

  it('should pass for skill with package.json and lock file', async () => {
    const tmpDir = path.join(os.tmpdir(), `dep-test-${Date.now()}`);
    await fs.ensureDir(tmpDir);
    await fs.writeJson(path.join(tmpDir, 'package.json'), { dependencies: { lodash: '4.0.0' } });
    await fs.writeFile(path.join(tmpDir, 'package-lock.json'), '{}');

    const result = await checkDependencySecurity(tmpDir);
    expect(result.passed).toBe(true);
    expect(result.hasLockFile).toBe(true);
    expect(result.depCount).toBe(1);

    await fs.remove(tmpDir);
  });

  it('should fail when package.json has deps but no lock file', async () => {
    const tmpDir = path.join(os.tmpdir(), `dep-test2-${Date.now()}`);
    await fs.ensureDir(tmpDir);
    await fs.writeJson(path.join(tmpDir, 'package.json'), { dependencies: { lodash: '4.0.0' } });

    const result = await checkDependencySecurity(tmpDir);
    expect(result.passed).toBe(false);
    expect(result.hasLockFile).toBe(false);

    await fs.remove(tmpDir);
  });

  it('should pass when package.json has no dependencies', async () => {
    const tmpDir = path.join(os.tmpdir(), `dep-test3-${Date.now()}`);
    await fs.ensureDir(tmpDir);
    await fs.writeJson(path.join(tmpDir, 'package.json'), { name: 'test' });

    const result = await checkDependencySecurity(tmpDir);
    expect(result.passed).toBe(true);

    await fs.remove(tmpDir);
  });
});

// ---------------------------------------------------------------------------
// validateSecurity (full engine-powered pipeline)
// ---------------------------------------------------------------------------
describe('validateSecurity', () => {
  it('should return result with all expected fields', async () => {
    const tmpDir = path.join(os.tmpdir(), `validate-sec-${Date.now()}`);
    await fs.ensureDir(tmpDir);
    await fs.writeFile(path.join(tmpDir, 'SKILL.md'), [
      '---',
      'name: safe-skill',
      'description: A safe skill',
      '---',
      '# Safe Skill',
      'This skill does safe things.'
    ].join('\n'));

    const result = await validateSecurity(tmpDir);
    expect(result.score).toBeGreaterThan(0);
    expect(result.maxScore).toBeGreaterThan(0);
    expect(result.percentage).toBeGreaterThanOrEqual(0);
    expect(result.checks).toBeDefined();
    expect(result.findings).toBeInstanceOf(Array);
    expect(result.cvss).toBeDefined();
    expect(result.issues).toBeDefined();

    await fs.remove(tmpDir);
  });

  it('should have checks derived from YAML categories', async () => {
    const tmpDir = path.join(os.tmpdir(), `validate-cats-${Date.now()}`);
    await fs.ensureDir(tmpDir);
    await fs.writeFile(path.join(tmpDir, 'SKILL.md'), '---\nname: test\ndescription: test skill\n---\n# Test');

    const result = await validateSecurity(tmpDir);
    const checkNames = Object.keys(result.checks);
    // Should have category-based checks + detector checks + dependency check
    expect(checkNames.length).toBeGreaterThanOrEqual(10);
    // Dependency check should always be present
    expect(checkNames).toContain('dependencySecurity');

    await fs.remove(tmpDir);
  });

  it('should detect vulnerabilities in code files', async () => {
    const tmpDir = path.join(os.tmpdir(), `validate-vuln-${Date.now()}`);
    await fs.ensureDir(tmpDir);
    await fs.writeFile(path.join(tmpDir, 'SKILL.md'), '---\nname: vuln\ndescription: vuln skill\n---\n# Vuln');
    await fs.writeFile(path.join(tmpDir, 'index.js'), [
      'eval(userInput);',
      'const secret = "sk-abcdefghij1234567890abcdefghij1234567890abcdefgh";'
    ].join('\n'));

    const result = await validateSecurity(tmpDir);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.percentage).toBeLessThan(100);
    expect(result.issues.critical.length + result.issues.high.length).toBeGreaterThan(0);

    await fs.remove(tmpDir);
  });

  it('should handle nonexistent path gracefully', async () => {
    const result = await validateSecurity('/tmp/nonexistent-skill-path-xyz');
    expect(result.error).toBeDefined();
  });

  it('should include engine fields in result', async () => {
    const tmpDir = path.join(os.tmpdir(), `validate-engine-${Date.now()}`);
    await fs.ensureDir(tmpDir);
    await fs.writeFile(path.join(tmpDir, 'SKILL.md'), '---\nname: test\ndescription: test\n---\n# Test');

    const result = await validateSecurity(tmpDir);
    expect(result.cvss).toBeDefined();
    expect(result.cvss.distribution).toBeDefined();
    expect(result.categoryScores).toBeDefined();
    expect(result.detectorResults).toBeDefined();

    await fs.remove(tmpDir);
  });
});

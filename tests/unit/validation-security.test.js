/**
 * Unit tests for lib/validation/security.js
 * Tests static security validation of skill source code.
 */

const path = require('path');
const fs = require('fs-extra');
const {
  scanSecurity,
  checkHardcodedSecrets,
  checkInjectionVulnerabilities,
  checkPathTraversal,
  checkInsecureOperations,
  checkNetworkSecurity,
  checkInputSanitization,
  checkFilePermissions,
  checkDependencySecurity,
  validateSecurity
} = require('../../lib/validation/security');

// ---------------------------------------------------------------------------
// checkHardcodedSecrets
// ---------------------------------------------------------------------------
describe('checkHardcodedSecrets', () => {
  it('should pass for clean content', () => {
    const result = checkHardcodedSecrets('const x = 42; const name = "hello";');
    expect(result.passed).toBe(true);
    expect(result.score).toBe(3);
  });

  it('should detect API keys', () => {
    const result = checkHardcodedSecrets('const api_key = "sk-abcdefghij1234567890abcd";');
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.secrets.length).toBeGreaterThan(0);
  });

  it('should detect passwords', () => {
    const result = checkHardcodedSecrets('const password = "mysecretpassword123";');
    expect(result.passed).toBe(false);
  });

  it('should detect tokens', () => {
    const result = checkHardcodedSecrets('const token = "abcdefghij1234567890abcd";');
    expect(result.passed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkInjectionVulnerabilities
// ---------------------------------------------------------------------------
describe('checkInjectionVulnerabilities', () => {
  it('should pass for safe code', () => {
    const result = checkInjectionVulnerabilities('const x = JSON.parse(data);');
    expect(result.passed).toBe(true);
    expect(result.score).toBe(2);
  });

  it('should detect eval usage', () => {
    const result = checkInjectionVulnerabilities('const result = eval(userInput);');
    expect(result.passed).toBe(false);
    expect(result.vulnerabilities.some(v => v.name.includes('eval'))).toBe(true);
  });

  it('should detect new Function constructor', () => {
    const result = checkInjectionVulnerabilities('const fn = new Function("return " + code);');
    expect(result.passed).toBe(false);
  });

  it('should detect innerHTML assignment', () => {
    const result = checkInjectionVulnerabilities('el.innerHTML = data;');
    expect(result.passed).toBe(false);
  });

  it('should detect document.write', () => {
    const result = checkInjectionVulnerabilities('document.write("<script>" + code + "</script>");');
    expect(result.passed).toBe(false);
  });

  it('should give score 0 for high severity', () => {
    const result = checkInjectionVulnerabilities('eval(x); new Function(y);');
    expect(result.score).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// checkPathTraversal
// ---------------------------------------------------------------------------
describe('checkPathTraversal', () => {
  it('should pass for safe paths', () => {
    const result = checkPathTraversal('const file = path.join(__dirname, "data.json");');
    expect(result.passed).toBe(true);
    expect(result.score).toBe(2);
  });

  it('should detect ../ traversal in readFile', () => {
    const result = checkPathTraversal('readFile("../../etc/passwd")');
    expect(result.passed).toBe(false);
    expect(result.traversalCount).toBeGreaterThan(0);
  });

  it('should NOT flag require with relative paths (standard Node.js)', () => {
    // require('../utils/helper') is standard Node.js, not a security issue
    const result = checkPathTraversal('require("../../secret/config")');
    expect(result.passed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// checkInsecureOperations
// ---------------------------------------------------------------------------
describe('checkInsecureOperations', () => {
  it('should pass for safe operations', () => {
    const result = checkInsecureOperations('const hash = crypto.createHash("sha256");');
    expect(result.passed).toBe(true);
    expect(result.score).toBe(2);
  });

  it('should detect weak hash algorithms', () => {
    const result = checkInsecureOperations('const hash = MD5(data);');
    expect(result.passed).toBe(false);
  });

  it('should detect weak encryption', () => {
    const result = checkInsecureOperations('const cipher = DES.encrypt(data, key);');
    expect(result.passed).toBe(false);
  });

  it('should detect Math.random for crypto', () => {
    const result = checkInsecureOperations('const token = Math.random().toString(36);');
    expect(result.passed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkNetworkSecurity
// ---------------------------------------------------------------------------
describe('checkNetworkSecurity', () => {
  it('should pass when only HTTPS is used', () => {
    const result = checkNetworkSecurity('fetch("https://api.example.com/data");');
    expect(result.passed).toBe(true);
    expect(result.score).toBe(1);
  });

  it('should fail when HTTP is used without HTTPS', () => {
    const result = checkNetworkSecurity('fetch("http://api.example.com/data");');
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
  });

  it('should pass when HTTP count is less than HTTPS count', () => {
    const result = checkNetworkSecurity(
      'fetch("http://localhost:3000"); fetch("https://api.a.com"); fetch("https://api.b.com");'
    );
    expect(result.passed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// checkInputSanitization
// ---------------------------------------------------------------------------
describe('checkInputSanitization', () => {
  it('should pass when sanitization is present', () => {
    const result = checkInputSanitization('const clean = sanitizeInput(data);');
    expect(result.passed).toBe(true);
    expect(result.score).toBe(2);
  });

  it('should pass when schema validation library is used', () => {
    const result = checkInputSanitization('const schema = zod.string().email();');
    expect(result.passed).toBe(true);
  });

  it('should pass when DOMPurify is used', () => {
    const result = checkInputSanitization('const clean = DOMPurify.sanitize(html);');
    expect(result.passed).toBe(true);
  });

  it('should fail when no sanitization patterns found', () => {
    const result = checkInputSanitization('const x = 42; console.log(x);');
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
  });

  it('should not false-positive on generic function names like check()', () => {
    const result = checkInputSanitization('if (check(value)) return true; assert(1 === 1);');
    expect(result.passed).toBe(false); // These are NOT sanitization
  });
});

// ---------------------------------------------------------------------------
// checkFilePermissions
// ---------------------------------------------------------------------------
describe('checkFilePermissions', () => {
  it('should pass when no file operations or dangerous perms', () => {
    const result = checkFilePermissions('const x = 42;');
    expect(result.passed).toBe(true);
    expect(result.score).toBe(1);
  });

  it('should pass when file ops have permission handling', () => {
    const result = checkFilePermissions('writeFileSync(path, data); chmod(path, 0o644);');
    expect(result.passed).toBe(true);
  });

  it('should fail when chmod 777 is used', () => {
    const result = checkFilePermissions('exec("chmod 777 /var/www");');
    expect(result.passed).toBe(false);
    expect(result.hasDangerousPerms).toBe(true);
  });

  it('should fail when chown root is used', () => {
    const result = checkFilePermissions('exec("chown root /tmp/file");');
    expect(result.passed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkDependencySecurity
// ---------------------------------------------------------------------------
describe('checkDependencySecurity', () => {
  it('should pass when no package.json exists', async () => {
    const result = await checkDependencySecurity('/tmp/nonexistent-path-xyz-12345');
    expect(result.passed).toBe(true);
  });

  it('should pass for skill with package.json and lock file', async () => {
    const tmpDir = path.join(__dirname, 'tmp-dep-test');
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
    const tmpDir = path.join(__dirname, 'tmp-dep-test-2');
    await fs.ensureDir(tmpDir);
    await fs.writeJson(path.join(tmpDir, 'package.json'), { dependencies: { lodash: '4.0.0' } });

    const result = await checkDependencySecurity(tmpDir);
    expect(result.passed).toBe(false);
    expect(result.hasLockFile).toBe(false);

    await fs.remove(tmpDir);
  });

  it('should pass when package.json has no dependencies', async () => {
    const tmpDir = path.join(__dirname, 'tmp-dep-test-3');
    await fs.ensureDir(tmpDir);
    await fs.writeJson(path.join(tmpDir, 'package.json'), { name: 'test' });

    const result = await checkDependencySecurity(tmpDir);
    expect(result.passed).toBe(true); // No deps = no lock file needed

    await fs.remove(tmpDir);
  });
});

// ---------------------------------------------------------------------------
// scanSecurity (integration of all patterns)
// ---------------------------------------------------------------------------
describe('scanSecurity', () => {
  it('should return passed for safe content', () => {
    const result = scanSecurity('const x = 42;');
    expect(result.passed).toBe(true);
    expect(result.critical).toHaveLength(0);
  });

  it('should detect multiple issue categories', () => {
    const content = [
      'const api_key = "sk-1234567890abcdefghijklmn";',
      'eval(userInput);',
      'readFile("../../secret")',
      'fetch("http://insecure.com")'
    ].join('\n');
    const result = scanSecurity(content);
    expect(result.passed).toBe(false);
    expect(result.critical.length + result.high.length + result.medium.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// validateSecurity (full pipeline)
// ---------------------------------------------------------------------------
describe('validateSecurity', () => {
  it('should validate a skill directory with SKILL.md', async () => {
    const tmpDir = path.join(__dirname, 'tmp-validate-sec');
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

    await fs.remove(tmpDir);
  });

  it('should detect issues in a vulnerable skill', async () => {
    const tmpDir = path.join(__dirname, 'tmp-validate-sec-vuln');
    await fs.ensureDir(tmpDir);
    await fs.writeFile(path.join(tmpDir, 'SKILL.md'), [
      '---',
      'name: vuln-skill',
      'description: A vulnerable skill',
      '---',
      '# Vulnerable Skill',
      'Run this: eval(userInput)',
      'Access: readFile("../../etc/passwd")',
      'Token: api_key = "sk-abcdefghij1234567890abcd"'
    ].join('\n'));

    const result = await validateSecurity(tmpDir);
    expect(result.percentage).toBeLessThan(100);
    expect(result.issues.critical.length + result.issues.high.length).toBeGreaterThan(0);

    await fs.remove(tmpDir);
  });
});

/**
 * Security Validation Module
 * Comprehensive security checks for agent skills
 */

const fs = require('fs-extra');
const path = require('path');
const glob = require('glob');
const { loadConfig } = require('../utils/paths');

/**
 * Convert a JSON pattern entry (with string pattern + flags) to a RegExp-based entry.
 */
function toRegExpEntry(entry) {
  return { ...entry, pattern: new RegExp(entry.pattern, entry.flags || '') };
}

/**
 * Load security patterns from config/security/static-patterns.json.
 * Falls back to hardcoded defaults if the file doesn't exist.
 */
function loadStaticPatterns() {
  const configPath = path.join(__dirname, '..', '..', 'config', 'security', 'static-patterns.json');
  try {
    if (fs.existsSync(configPath)) {
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return {
        HARDCODED_SECRETS: (raw.hardcodedSecrets || []).map(toRegExpEntry),
        INJECTION: (raw.injectionVulnerabilities || []).map(toRegExpEntry),
        PATH_TRAVERSAL: (raw.pathTraversal || []).map(toRegExpEntry),
        INSECURE_OPS: (raw.insecureOperations || []).map(toRegExpEntry),
        SENSITIVE_DATA: (raw.sensitiveData || []).map(toRegExpEntry)
      };
    }
  } catch (_e) {
    // Fall through to hardcoded defaults
  }
  return null;
}

/**
 * Hardcoded fallback patterns (used when JSON config is missing)
 */
const HARDCODED_PATTERNS = {
  // Hardcoded secrets
  HARDCODED_SECRETS: [
    { pattern: /api[_-]?key\s*[:=]\s*['"][a-zA-Z0-9_-]{20,}['"]/gi, severity: 'critical', name: 'API Key' },
    { pattern: /apikey\s*[:=]\s*['"][a-zA-Z0-9_-]{20,}['"]/gi, severity: 'critical', name: 'API Key' },
    { pattern: /secret\s*[:=]\s*['"][a-zA-Z0-9_-]{20,}['"]/gi, severity: 'critical', name: 'Secret' },
    { pattern: /token\s*[:=]\s*['"][a-zA-Z0-9_-]{20,}['"]/gi, severity: 'critical', name: 'Token' },
    { pattern: /password\s*[:=]\s*['"][^'"]+['"]/gi, severity: 'critical', name: 'Password' },
    { pattern: /private[_-]?key\s*[:=]\s*['"][^-"']+['"]/gi, severity: 'critical', name: 'Private Key' },
    { pattern: /aws[_-]?secret/i, severity: 'critical', name: 'AWS Secret' },
    { pattern: /openai[_-]?api[_-]?key/i, severity: 'critical', name: 'OpenAI API Key' }
  ],

  // Injection vulnerabilities
  INJECTION: [
    { pattern: /\beval\s*\(/gi, severity: 'high', name: 'eval() usage', fix: 'Use JSON.parse() or safer alternatives' },
    { pattern: /new\s+Function\s*\(/gi, severity: 'high', name: 'Function constructor', fix: 'Avoid dynamic code execution' },
    { pattern: /\bexec\s*\(/gi, severity: 'high', name: 'exec() usage', fix: 'Use execFile() with array arguments' },
    { pattern: /\.innerHTML\s*=/gi, severity: 'high', name: 'innerHTML assignment', fix: 'Use textContent or DOMPurify' },
    { pattern: /dangerouslySetInnerHTML/gi, severity: 'medium', name: 'React dangerouslySetInnerHTML', fix: 'Sanitize content first' },
    { pattern: /document\.write\s*\(/gi, severity: 'high', name: 'document.write', fix: 'Use DOM manipulation methods' },
    { pattern: /\bsql\s*Interpolat|interpolate.*sql/i, severity: 'high', name: 'SQL interpolation', fix: 'Use parameterized queries' },
    { pattern: /`.*\$\{/gi, severity: 'medium', name: 'Template literal injection', fix: 'Validate and sanitize input' },
    { pattern: /format\s*\(.*%[sb]/gi, severity: 'medium', name: 'String format injection', fix: 'Use template literals or safe formatting' }
  ],

  // Path traversal
  PATH_TRAVERSAL: [
    { pattern: /\.\.\//gi, severity: 'medium', name: 'Path traversal (../)' },
    { pattern: /readFile\s*\([^)]*\.\.[^)]*\)/gi, severity: 'high', name: 'readFile with path traversal' },
    { pattern: /writeFile\s*\([^)]*\.\.[^)]*\)/gi, severity: 'high', name: 'writeFile with path traversal' },
    { pattern: /import\s*\(.*\.\.\//gi, severity: 'medium', name: 'Dynamic import with traversal' },
    { pattern: /require\s*\([^)]*\.\.\//gi, severity: 'medium', name: 'require with path traversal' }
  ],

  // Insecure operations
  INSECURE_OPS: [
    { pattern: /http:\/\//gi, severity: 'medium', name: 'HTTP (non-TLS)', fix: 'Use HTTPS instead' },
    { pattern: /Math\.random\s*\(/gi, severity: 'medium', name: 'Math.random for crypto', fix: 'Use crypto.getRandomValues()' },
    { pattern: /crypto\.random\s*\(/gi, severity: 'medium', name: 'Insecure random', fix: 'Use crypto.getRandomValues()' },
    { pattern: /DES\.|3DES\.|RC4\b/gi, severity: 'high', name: 'Weak encryption algorithm', fix: 'Use AES-256 or ChaCha20' },
    { pattern: /MD5\b|SHA1\b/gi, severity: 'medium', name: 'Weak hash algorithm', fix: 'Use SHA-256 or stronger' },
    { pattern: /ECB\b/gi, severity: 'medium', name: 'ECB mode encryption', fix: 'Use CBC or GCM mode' },
    { pattern: /PKCS1v1_5\b|PKCS#1\s*v1\.5/gi, severity: 'medium', name: 'Insecure padding', fix: 'Use OAEP padding' }
  ],

  // Sensitive data exposure
  SENSITIVE_DATA: [
    { pattern: /console\.(log|info)\s*\([^)]*(password|secret|token|key|credential)/gi, severity: 'medium', name: 'Sensitive data in logs' },
    { pattern: /error\s*\(.*password/i, severity: 'high', name: 'Password in error messages' },
    { pattern: /JSON\.stringify\s*\([^)]*(password|secret|token|key)/gi, severity: 'high', name: 'Sensitive data serialization' },
    { pattern: /process\.env\[.*(PASSWORD|SECRET|KEY|TOKEN)/gi, severity: 'low', name: 'Sensitive env var access' }
  ]
};

/**
 * Security patterns for detection — loaded from JSON config with hardcoded fallback
 */
const SECURITY_PATTERNS = loadStaticPatterns() || HARDCODED_PATTERNS;

/**
 * Scan content for security issues
 * @param {string} content - Content to scan
 * @returns {Object} - Security scan results
 */
function scanSecurity(content) {
  const issues = {
    critical: [],
    high: [],
    medium: [],
    low: [],
    passed: true
  };
  
  for (const [category, patterns] of Object.entries(SECURITY_PATTERNS)) {
    for (const { pattern, severity, name, fix } of patterns) {
      pattern.lastIndex = 0; // Reset stateful global regex
      const matches = content.match(pattern) || [];
      if (matches.length > 0) {
        issues.passed = false;
        issues[severity].push({
          category,
          name,
          count: matches.length,
          example: matches[0].substring(0, 80),
          fix
        });
      }
    }
  }
  
  return issues;
}

/**
 * Check for hardcoded secrets
 * @param {string} content - Content to scan
 * @returns {Object} - Secret check result
 */
function checkHardcodedSecrets(content) {
  const secrets = [];
  let hasSecrets = false;
  
  for (const pattern of SECURITY_PATTERNS.HARDCODED_SECRETS) {
    const regex = pattern.regex || pattern.pattern;
    regex.lastIndex = 0; // Reset stateful global regex
    const matches = content.match(regex) || [];
    if (matches.length > 0) {
      hasSecrets = true;
      secrets.push({
        name: pattern.name,
        severity: pattern.severity,
        count: matches.length,
        examples: matches.slice(0, 3).map(m => m.substring(0, 50))
      });
    }
  }
  
  return {
    passed: !hasSecrets,
    hasSecrets,
    secrets,
    score: hasSecrets ? 0 : 3,
    maxScore: 3
  };
}

/**
 * Check for injection vulnerabilities
 * @param {string} content - Content to scan
 * @returns {Object} - Injection check result
 */
function checkInjectionVulnerabilities(content) {
  const vulnerabilities = [];
  
  for (const pattern of SECURITY_PATTERNS.INJECTION) {
    pattern.pattern.lastIndex = 0; // Reset stateful global regex
    const matches = content.match(pattern.pattern) || [];
    if (matches.length > 0) {
      vulnerabilities.push({
        name: pattern.name,
        severity: pattern.severity,
        count: matches.length,
        examples: matches.slice(0, 3),
        fix: pattern.fix
      });
    }
  }
  
  const hasHighSeverity = vulnerabilities.some(v => v.severity === 'high');
  const hasMediumSeverity = vulnerabilities.some(v => v.severity === 'medium');
  
  let score = 2;
  if (hasHighSeverity) score = 0;
  else if (hasMediumSeverity) score = 1;
  
  return {
    passed: vulnerabilities.length === 0,
    vulnerabilities,
    score,
    maxScore: 2
  };
}

/**
 * Check for path traversal
 * @param {string} content - Content to scan
 * @returns {Object} - Path traversal check result
 */
function checkPathTraversal(content) {
  const traversalMatches = content.match(/\.\.\//g) || [];
  let hasHighSeverity = false;
  const found = [];

  for (const pattern of SECURITY_PATTERNS.PATH_TRAVERSAL) {
    const regex = pattern.pattern;
    regex.lastIndex = 0;
    const matches = content.match(regex);
    if (matches && matches.length > 0) {
      found.push({ name: pattern.name, severity: pattern.severity, count: matches.length });
      if (pattern.severity === 'high') hasHighSeverity = true;
    }
  }

  const hasThreat = found.length > 0;

  return {
    passed: !hasThreat,
    traversalCount: traversalMatches.length,
    findings: found,
    score: hasThreat ? (hasHighSeverity ? 0 : 1) : 2,
    maxScore: 2
  };
}

/**
 * Check for insecure operations
 * @param {string} content - Content to scan
 * @returns {Object} - Insecure ops check result
 */
function checkInsecureOperations(content) {
  const issues = [];
  
  for (const pattern of SECURITY_PATTERNS.INSECURE_OPS) {
    pattern.pattern.lastIndex = 0; // Reset stateful global regex
    const matches = content.match(pattern.pattern) || [];
    if (matches.length > 0) {
      issues.push({
        name: pattern.name,
        severity: pattern.severity,
        count: matches.length,
        fix: pattern.fix
      });
    }
  }
  
  return {
    passed: issues.length === 0,
    issues,
    score: issues.length === 0 ? 2 : (issues.some(i => i.severity === 'high') ? 0 : 1),
    maxScore: 2
  };
}

/**
 * Check network security
 * @param {string} content - Content to scan
 * @returns {Object} - Network security check result
 */
function checkNetworkSecurity(content) {
  const httpMatches = (content.match(/http:\/\//gi) || []).length;
  const httpsMatches = (content.match(/https:\/\//gi) || []).length;
  
  const usesUnsafeHttp = httpMatches > 0 && httpsMatches < httpMatches;
  
  return {
    passed: !usesUnsafeHttp,
    httpCount: httpMatches,
    httpsCount: httpsMatches,
    usesUnsafeHttp,
    score: usesUnsafeHttp ? 0 : 1,
    maxScore: 1
  };
}

/**
 * Check dependency security
 * @param {string} skillPath - Path to skill directory
 * @returns {Object} - Dependency security check result
 */
async function checkDependencySecurity(skillPath) {
  const hasLockFile = await fs.pathExists(path.join(skillPath, 'package-lock.json'));
  const hasYarnLock = await fs.pathExists(path.join(skillPath, 'yarn.lock'));
  const hasPnpmLock = await fs.pathExists(path.join(skillPath, 'pnpm-lock.yaml'));
  
  const pkgPath = path.join(skillPath, 'package.json');
  const hasPackageJson = await fs.pathExists(pkgPath);
  
  let depCount = 0;

  if (hasPackageJson) {
    try {
      const pkg = await fs.readJson(pkgPath);
      depCount = Object.keys(pkg.dependencies || {}).length;
    } catch (e) {
      // Ignore parse errors
    }
  }

  const hasLock = hasLockFile || hasYarnLock || hasPnpmLock;
  // Only require a lock file when the skill has a package.json with dependencies
  const needsLock = hasPackageJson && depCount > 0;

  return {
    passed: !needsLock || hasLock,
    hasLockFile: hasLock,
    depCount,
    score: (!needsLock || hasLock) ? 1 : 0,
    maxScore: 1
  };
}

/**
 * Check input sanitization
 * @param {string} content - Content to scan
 * @returns {Object} - Input sanitization check result
 */
function checkInputSanitization(content) {
  // Look for deliberate sanitization/validation patterns, not generic function names
  const hasSanitization = /sanitize\w*\s*\(|escape\w*\s*\(|encodeURI|DOMPurify|xss\s*\(|filter.*input|whitelist|blacklist|allowlist|denylist/i.test(content);
  const hasInputValidation = /validate.*input|validateInput|validate\w*\(\s*(?:req|input|params|body|query)/i.test(content);
  const hasSchemaValidation = /joi\.|yup\.|zod\.|ajv\.|express-validator|celebrate/i.test(content);

  const passed = hasSanitization || hasInputValidation || hasSchemaValidation;

  return {
    passed,
    hasSanitization,
    hasInputValidation,
    hasSchemaValidation,
    score: passed ? 2 : 0,
    maxScore: 2
  };
}

/**
 * Check file permissions
 * @param {string} content - Content to scan
 * @returns {Object} - File permission check result
 */
function checkFilePermissions(content) {
  const hasPermHandling = /chmod|chown|umask|permissions?|mode\s*=/i.test(content);
  const hasFileOps = /readFileSync|writeFileSync|createReadStream|createWriteStream/i.test(content);
  // Check for dangerous permission patterns (chmod 777, chown root, setuid)
  const hasDangerousPerms = /chmod\s+777|chown\s+root|chmod\s+\+s/i.test(content);

  // Pass if: no dangerous permissions AND (has safe permission handling OR no file operations)
  const passed = !hasDangerousPerms && (hasPermHandling || !hasFileOps);

  return {
    passed,
    hasPermHandling,
    hasFileOps,
    hasDangerousPerms,
    score: passed ? 1 : 0,
    maxScore: 1
  };
}

/**
 * Run comprehensive security validation
 * @param {string} skillPath - Path to skill directory
 * @returns {Object} - Complete security validation report
 */
async function validateSecurity(skillPath) {
  const result = {
    path: skillPath,
    timestamp: new Date().toISOString(),
    valid: true,
    score: 0,
    maxScore: 0,
    percentage: 0,
    checks: {},
    issues: {
      critical: [],
      high: [],
      medium: [],
      low: []
    }
  };
  
  // Read all content
  let allContent = '';
  try {
    const skillMdPath = path.join(skillPath, 'SKILL.md');
    if (await fs.pathExists(skillMdPath)) {
      allContent += await fs.readFile(skillMdPath, 'utf-8') + '\n';
    }
    
    const jsFiles = glob.sync('*.{js,ts}', { cwd: skillPath });
    for (const file of jsFiles) {
      allContent += await fs.readFile(path.join(skillPath, file), 'utf-8') + '\n';
    }
    
    const libFiles = glob.sync('lib/**/*.{js,ts}', { cwd: skillPath });
    for (const file of libFiles) {
      allContent += await fs.readFile(path.join(skillPath, file), 'utf-8') + '\n';
    }
  } catch (e) {
    result.error = e.message;
    return result;
  }
  
  // Run all checks
  const checks = {
    noHardcodedSecrets: checkHardcodedSecrets(allContent),
    injectionVulnerabilities: checkInjectionVulnerabilities(allContent),
    pathTraversal: checkPathTraversal(allContent),
    insecureOperations: checkInsecureOperations(allContent),
    networkSecurity: checkNetworkSecurity(allContent),
    inputSanitization: checkInputSanitization(allContent),
    filePermissions: checkFilePermissions(allContent),
    dependencySecurity: await checkDependencySecurity(skillPath)
  };
  
  result.checks = checks;
  
  // Calculate total score
  for (const [name, check] of Object.entries(checks)) {
    result.score += check.score || 0;
    result.maxScore += check.maxScore || 0;

    // Collect issues
    if (check.vulnerabilities) {
      for (const v of check.vulnerabilities) {
        result.issues[v.severity].push({ check: name, ...v });
      }
    }
    if (check.secrets) {
      for (const s of check.secrets) {
        result.issues[s.severity].push({ check: name, ...s });
      }
    }
    if (check.issues) {
      for (const i of check.issues) {
        result.issues[i.severity].push({ check: name, ...i });
      }
    }
  }

  result.percentage = result.maxScore > 0 ? Math.round((result.score / result.maxScore) * 100) : 0;
  const passingThreshold = (loadConfig().thresholds?.passing ?? 70) / 100;
  result.valid = result.score >= result.maxScore * passingThreshold;
  
  return result;
}

module.exports = {
  SECURITY_PATTERNS,
  scanSecurity,
  checkHardcodedSecrets,
  checkInjectionVulnerabilities,
  checkPathTraversal,
  checkInsecureOperations,
  checkNetworkSecurity,
  checkDependencySecurity,
  checkInputSanitization,
  checkFilePermissions,
  validateSecurity
};

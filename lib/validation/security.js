/**
 * Security Validation Module
 * All scanning is delegated to ScanEngine (powered by skill-sec-rules.yaml).
 * This module provides the validateSecurity() entry point used by CLI, pipeline,
 * and security-runner, building the legacy result shape from engine findings.
 */

const fs = require('fs-extra');
const path = require('path');
const { loadConfig } = require('../utils/paths');
const { ScanEngine } = require('./engine');
const { loadAllRules } = require('./engine/rule-loader');

/**
 * Map engine category IDs to legacy check names and scoring weights.
 * Built dynamically from YAML categories. Cached for the process lifetime.
 */
let _rulesCache = null;
function getCachedRules() {
  if (_rulesCache) return _rulesCache;
  const { categories, detectors } = loadAllRules();
  const categoryMap = {};
  for (const cat of categories) {
    const weight = cat.severityWeight >= 30 ? 3 : cat.severityWeight >= 20 ? 2 : 1;
    categoryMap[cat.id] = { name: cat.name, maxScore: weight };
  }
  const detectorChecks = (detectors || []).map(d => ({
    name: d.name, detectors: d.engines || [], maxScore: d.weight ?? 1
  }));
  _rulesCache = { categoryMap, detectorChecks };
  return _rulesCache;
}

/**
 * Check dependency security (lock file presence).
 * This is the only check that inspects the file system structure rather than content,
 * so it can't be expressed as a YAML regex rule.
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
    } catch (_e) { /* ignore parse errors */ }
  }

  const hasLock = hasLockFile || hasYarnLock || hasPnpmLock;
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
 * Run comprehensive security validation using the ScanEngine.
 * Returns a result object compatible with CLI, pipeline, and security-runner consumers.
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
    issues: { critical: [], high: [], medium: [], low: [] },
    findings: [],
    cvss: { maxScore: 0, avgScore: 0, distribution: { critical: 0, high: 0, medium: 0, low: 0 } },
    categoryScores: {},
    detectorResults: {}
  };

  if (!await fs.pathExists(skillPath)) {
    result.error = `Path does not exist: ${skillPath}`;
    return result;
  }

  // Run ScanEngine (single source of truth)
  let engineResult;
  try {
    const secConfig = loadConfig().security || {};
    const engine = new ScanEngine(secConfig);
    engineResult = await engine.scan(skillPath);
  } catch (e) {
    result.error = `Engine scan failed: ${e.message}`;
    return result;
  }

  // Copy engine results directly
  result.findings = engineResult.findings;
  result.cvss = engineResult.cvss;
  result.categoryScores = engineResult.categoryScores;
  result.detectorResults = engineResult.detectorResults;

  // Build legacy checks from engine findings, grouped by category
  const cached = getCachedRules();
  const findings = engineResult.findings || [];

  for (const [catId, checkMeta] of Object.entries(cached.categoryMap)) {
    const catFindings = findings.filter(f => f.category === catId);
    const hasIssues = catFindings.length > 0;

    let score = checkMeta.maxScore;
    if (hasIssues) {
      const maxCVSS = catFindings.reduce((m, f) => Math.max(m, f.cvss?.adjustedScore || 0), 0);
      // Graduated: critical (>=9.0): 0%, high (>=7.0): 25%, medium (>=4.0): 50%, low: 75%
      let ratio;
      if (maxCVSS >= 9.0) ratio = 0;
      else if (maxCVSS >= 7.0) ratio = 0.25;
      else if (maxCVSS >= 4.0) ratio = 0.5;
      else ratio = 0.75;
      score = Math.round(checkMeta.maxScore * ratio * 10) / 10;
    }

    const check = {
      passed: !hasIssues,
      score,
      maxScore: checkMeta.maxScore,
      vulnerabilities: catFindings.map(f => ({
        name: f.name,
        severity: f.severity,
        ruleId: f.ruleId,
        file: f.file,
        line: f.line,
        confidence: f.confidence,
        fix: f.suggestion
      }))
    };
    result.checks[checkMeta.name] = check;
  }

  // Add detector-based checks (from YAML detectors section)
  for (const dc of cached.detectorChecks) {
    const detFindings = findings.filter(f => dc.detectors.includes(f.detector));
    let detScore = dc.maxScore;
    if (detFindings.length > 0) {
      const maxCVSS = detFindings.reduce((m, f) => Math.max(m, f.cvss?.adjustedScore || 0), 0);
      let ratio;
      if (maxCVSS >= 9.0) ratio = 0;
      else if (maxCVSS >= 7.0) ratio = 0.25;
      else if (maxCVSS >= 4.0) ratio = 0.5;
      else ratio = 0.75;
      detScore = Math.round(dc.maxScore * ratio * 10) / 10;
    }
    result.checks[dc.name] = {
      passed: detFindings.length === 0,
      score: detScore,
      maxScore: dc.maxScore,
      vulnerabilities: detFindings.map(f => ({
        name: f.name, severity: f.severity, ruleId: f.ruleId,
        file: f.file, line: f.line, confidence: f.confidence
      }))
    };
  }

  // Add dependency check (file-system based, not content-based)
  result.checks.dependencySecurity = await checkDependencySecurity(skillPath);

  // Calculate total score from checks
  for (const [name, check] of Object.entries(result.checks)) {
    result.score += check.score || 0;
    result.maxScore += check.maxScore || 0;
    if (check.vulnerabilities) {
      for (const v of check.vulnerabilities) {
        const sev = v.severity || 'low';
        if (result.issues[sev]) {
          result.issues[sev].push({ check: name, ...v });
        }
      }
    }
  }

  result.percentage = result.maxScore > 0 ? Math.round((result.score / result.maxScore) * 100) : 0;
  const passingThreshold = (loadConfig().thresholds?.passing ?? 70) / 100;
  result.valid = result.score >= result.maxScore * passingThreshold;

  return result;
}

module.exports = {
  validateSecurity,
  checkDependencySecurity,
  _resetRulesCache() { _rulesCache = null; }
};

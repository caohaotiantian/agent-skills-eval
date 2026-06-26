/**
 * Rule Loader — loads security rules from YAML, JSON, and hardcoded sources
 * into a unified internal format.
 */

const fs = require('fs-extra');
const path = require('path');
const yaml = require('js-yaml');

/**
 * Basic ReDoS guard: reject patterns with nested quantifiers like (a+)+, (a*)*,
 * (.+)+ etc. which cause catastrophic backtracking.
 */
const REDOS_PATTERN = /(\([^)]*[+*][^)]*\))[+*]|\(\?[^)]*[+*][^)]*\)[+*]/;

function isSafeRegex(pattern) {
  return !REDOS_PATTERN.test(pattern);
}

// Note: JSON_CATEGORY_MAP and loadJSONPatterns removed — all patterns are now in
// skill-sec-rules.yaml. The unique patterns from static-patterns.json were migrated
// to YAML rules: INJ001-002, CRYPTO001-003, NET001, DATA008-009, WEB006-008.

function loadYAMLRules(filePath) {
  try {
    if (!fs.existsSync(filePath)) return { rules: [], categories: [], detectors: [] };
    const content = fs.readFileSync(filePath, 'utf-8');
    const doc = yaml.load(content);
    if (!doc) return { rules: [], categories: [], detectors: [] };

    const categories = (doc.categories || []).map(c => ({
      id: c.id, name: c.name, severityWeight: c.severity_weight || 0,
      markdownScan: c.markdownScan
    }));

    const detectors = (doc.detectors || []).map(d => ({
      id: d.id, name: d.name, weight: d.weight ?? 1, engines: d.engines || []
    }));

    const markdownScanByCategory = new Map(categories.map(c => [c.id, c.markdownScan]));

    const rules = (doc.rules || []).map(r => ({
      id: r.id,
      category: r.category,
      markdownScan: markdownScanByCategory.get(r.category),
      name: r.name,
      severity: (r.severity || 'medium').toLowerCase(),
      confidence: r.confidence ?? 80,
      markdownConfidence: r.markdownConfidence ?? null,
      patterns: (r.patterns || []).map(p => {
        if (!isSafeRegex(p)) return null; // Skip ReDoS-prone patterns
        try { return new RegExp(p, 'gi'); } catch (_) { return null; }
      }).filter(Boolean),
      fileTypes: r.fileTypes || null,
      suggestion: r.suggestion || null,
      reference: r.reference || null,
      source: 'yaml'
    }));

    return { rules, categories, detectors };
  } catch (e) {
    console.error(`Warning: Failed to load YAML rules from ${filePath}: ${e.message}`);
    return { rules: [], categories: [], detectors: [] };
  }
}

function mergeRules(yamlRules) {
  const byId = new Map();
  for (const r of yamlRules) if (r.id) byId.set(r.id, r);
  return Array.from(byId.values());
}

function discoverYAMLPath(config) {
  if (config.rulesFile && fs.existsSync(config.rulesFile)) return config.rulesFile;

  // Bundled location (relative to this module — works in Docker and npm global installs)
  const bundledPath = path.join(__dirname, '..', '..', '..', 'config', 'security', 'skill-sec-rules.yaml');

  const candidates = [
    // Project root locations (local development)
    path.join(process.cwd(), 'config', 'security', 'skill-sec-rules.yaml'),
    path.join(process.cwd(), 'skill-sec-rules.yaml'),
    path.join(process.cwd(), 'config', 'security', 'rules.yaml'),
    // Bundled location (Docker, npm global)
    bundledPath
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function loadAllRules(config = {}) {
  const yamlPath = discoverYAMLPath(config);
  const yamlResult = yamlPath ? loadYAMLRules(yamlPath) : { rules: [], categories: [], detectors: [] };
  const rules = mergeRules(yamlResult.rules);
  return { rules, categories: yamlResult.categories, detectors: yamlResult.detectors || [] };
}

const WHITELIST_DEFAULTS = { filePatterns: [], trustedDomains: [], ruleOverrides: { disabled: [], severityOverrides: {} } };

function loadWhitelist(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return { ...WHITELIST_DEFAULTS, ruleOverrides: { ...WHITELIST_DEFAULTS.ruleOverrides } };
    const content = fs.readFileSync(filePath, 'utf-8');
    const doc = yaml.load(content);
    if (!doc) return { ...WHITELIST_DEFAULTS, ruleOverrides: { ...WHITELIST_DEFAULTS.ruleOverrides } };

    return {
      filePatterns: doc.filePatterns || [],
      trustedDomains: doc.trustedDomains || [],
      ruleOverrides: {
        disabled: (doc.ruleOverrides && doc.ruleOverrides.disabled) || [],
        severityOverrides: (doc.ruleOverrides && doc.ruleOverrides.severityOverrides) || {}
      }
    };
  } catch (e) {
    console.error(`Warning: Failed to load whitelist from ${filePath}: ${e.message}`);
    return { ...WHITELIST_DEFAULTS, ruleOverrides: { ...WHITELIST_DEFAULTS.ruleOverrides } };
  }
}

function discoverWhitelistPath(config) {
  if (config.whitelistFile && fs.existsSync(config.whitelistFile)) return config.whitelistFile;

  const bundledPath = path.join(__dirname, '..', '..', '..', 'config', 'security', 'whitelist.yaml');

  const candidates = [
    path.join(process.cwd(), 'config', 'security', 'whitelist.yaml'),
    path.join(process.cwd(), 'whitelist.yaml'),
    bundledPath
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

module.exports = { loadYAMLRules, mergeRules, loadAllRules, discoverYAMLPath, loadWhitelist, discoverWhitelistPath };

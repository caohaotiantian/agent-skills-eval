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

const JSON_CATEGORY_MAP = {
  hardcodedSecrets: 'DATA_EXFILTRATION',
  injectionVulnerabilities: 'MALICIOUS_CODE',
  pathTraversal: 'WEB_SECURITY',
  insecureOperations: 'MALICIOUS_CODE',
  sensitiveData: 'DATA_EXFILTRATION'
};

function loadYAMLRules(filePath) {
  try {
    if (!fs.existsSync(filePath)) return { rules: [], categories: [] };
    const content = fs.readFileSync(filePath, 'utf-8');
    const doc = yaml.load(content);
    if (!doc) return { rules: [], categories: [] };

    const categories = (doc.categories || []).map(c => ({
      id: c.id, name: c.name, severityWeight: c.severity_weight || 0
    }));

    const rules = (doc.rules || []).map(r => ({
      id: r.id,
      category: r.category,
      name: r.name,
      severity: (r.severity || 'medium').toLowerCase(),
      confidence: r.confidence || 80,
      patterns: (r.patterns || []).map(p => {
        if (!isSafeRegex(p)) return null; // Skip ReDoS-prone patterns
        try { return new RegExp(p, 'gi'); } catch (_) { return null; }
      }).filter(Boolean),
      fileTypes: r.fileTypes || null,
      suggestion: r.suggestion || null,
      reference: r.reference || null,
      source: 'yaml'
    }));

    return { rules, categories };
  } catch (e) {
    console.error(`Warning: Failed to load YAML rules from ${filePath}: ${e.message}`);
    return { rules: [], categories: [] };
  }
}

function loadJSONPatterns(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const rules = [];
    let idCounter = 0;

    for (const [section, entries] of Object.entries(raw)) {
      const category = JSON_CATEGORY_MAP[section] || 'MALICIOUS_CODE';
      for (const entry of entries) {
        idCounter++;
        rules.push({
          id: `JSON${String(idCounter).padStart(3, '0')}`,
          category,
          name: entry.name || section,
          severity: (entry.severity || 'medium').toLowerCase(),
          confidence: 75,
          patterns: isSafeRegex(entry.pattern) ? [new RegExp(entry.pattern, entry.flags || '')] : [],
          fileTypes: null,
          suggestion: entry.fix || null,
          reference: null,
          source: 'json'
        });
      }
    }
    return rules;
  } catch (_e) {
    return [];
  }
}

function mergeRules(yamlRules, jsonRules, hardcodedRules) {
  const byId = new Map();
  for (const r of hardcodedRules) if (r.id) byId.set(r.id, r);
  for (const r of jsonRules) if (r.id) byId.set(r.id, r);
  for (const r of yamlRules) if (r.id) byId.set(r.id, r);
  return Array.from(byId.values());
}

function discoverYAMLPath(config) {
  if (config.rulesFile && fs.existsSync(config.rulesFile)) return config.rulesFile;
  const candidates = [
    path.join(process.cwd(), 'config', 'security', 'skill-sec-rules.yaml'),
    path.join(process.cwd(), 'skill-sec-rules.yaml'),
    path.join(process.cwd(), 'config', 'security', 'rules.yaml')
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function loadAllRules(config = {}) {
  const yamlPath = discoverYAMLPath(config);
  const yamlResult = yamlPath ? loadYAMLRules(yamlPath) : { rules: [], categories: [] };
  const jsonPath = path.join(__dirname, '..', '..', '..', 'config', 'security', 'static-patterns.json');
  const jsonRules = loadJSONPatterns(jsonPath);
  const rules = mergeRules(yamlResult.rules, jsonRules, []);
  return { rules, categories: yamlResult.categories };
}

module.exports = { loadYAMLRules, loadJSONPatterns, mergeRules, loadAllRules, discoverYAMLPath };

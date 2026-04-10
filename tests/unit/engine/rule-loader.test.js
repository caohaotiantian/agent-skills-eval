const path = require('path');
const { loadYAMLRules, loadJSONPatterns, mergeRules, loadAllRules } = require('../../../lib/validation/engine/rule-loader');

const FIXTURE_YAML = path.join(__dirname, '..', '..', 'fixtures', 'test-rules.yaml');

describe('loadYAMLRules', () => {
  it('should load rules from a YAML file', () => {
    const { rules, categories } = loadYAMLRules(FIXTURE_YAML);
    expect(rules).toHaveLength(2);
    expect(categories).toHaveLength(2);
  });

  it('should compile patterns to RegExp', () => {
    const { rules } = loadYAMLRules(FIXTURE_YAML);
    expect(rules[0].patterns[0]).toBeInstanceOf(RegExp);
    expect(rules[0].patterns[0].test('dangerousFunc(')).toBe(true);
  });

  it('should normalize severity to lowercase', () => {
    const { rules } = loadYAMLRules(FIXTURE_YAML);
    expect(rules[0].severity).toBe('high');
  });

  it('should preserve fileTypes', () => {
    const { rules } = loadYAMLRules(FIXTURE_YAML);
    expect(rules[0].fileTypes).toEqual(['*.js', '*.ts']);
  });

  it('should set source to yaml', () => {
    const { rules } = loadYAMLRules(FIXTURE_YAML);
    expect(rules[0].source).toBe('yaml');
  });

  it('should set default confidence of 80', () => {
    const { rules } = loadYAMLRules(FIXTURE_YAML);
    expect(rules[0].confidence).toBe(80);
  });

  it('should parse category metadata', () => {
    const { categories } = loadYAMLRules(FIXTURE_YAML);
    expect(categories[0].id).toBe('TEST_CAT');
    expect(categories[0].severityWeight).toBe(30);
  });

  it('should return empty arrays for nonexistent file', () => {
    const { rules, categories } = loadYAMLRules('/nonexistent/path.yaml');
    expect(rules).toEqual([]);
    expect(categories).toEqual([]);
  });
});

describe('loadJSONPatterns', () => {
  it('should load and convert static-patterns.json into unified rules', () => {
    const jsonPath = path.join(__dirname, '..', '..', '..', 'config', 'security', 'static-patterns.json');
    const rules = loadJSONPatterns(jsonPath);
    expect(rules.length).toBeGreaterThan(0);
    const first = rules[0];
    expect(first.id).toBeDefined();
    expect(first.category).toBeDefined();
    expect(first.patterns[0]).toBeInstanceOf(RegExp);
    expect(first.source).toBe('json');
    expect(first.confidence).toBe(75);
  });

  it('should return empty array for nonexistent file', () => {
    expect(loadJSONPatterns('/nonexistent/path.json')).toEqual([]);
  });
});

describe('mergeRules', () => {
  it('should deduplicate by ID with YAML winning over JSON', () => {
    const yamlRules = [{ id: 'DUP001', source: 'yaml', name: 'from yaml' }];
    const jsonRules = [{ id: 'DUP001', source: 'json', name: 'from json' }];
    const hardcodedRules = [{ id: 'DUP001', source: 'hardcoded', name: 'from hardcoded' }];
    const merged = mergeRules(yamlRules, jsonRules, hardcodedRules);
    expect(merged).toHaveLength(1);
    expect(merged[0].source).toBe('yaml');
  });

  it('should include all rules when IDs are unique', () => {
    const merged = mergeRules([{ id: 'Y1', source: 'yaml' }], [{ id: 'J1', source: 'json' }], []);
    expect(merged).toHaveLength(2);
  });
});

describe('loadAllRules', () => {
  it('should return rules and categories', () => {
    const { rules, categories } = loadAllRules({ rulesFile: FIXTURE_YAML });
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.some(r => r.source === 'yaml')).toBe(true);
  });
});

const path = require('path');
const { loadYAMLRules, mergeRules, loadAllRules } = require('../../../lib/validation/engine/rule-loader');

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

  it('should handle malformed YAML gracefully', () => {
    const fs = require('fs-extra');
    const tmp = path.join(__dirname, 'tmp-malformed.yaml');
    fs.writeFileSync(tmp, 'rules: "not an array"');
    const { rules, categories } = loadYAMLRules(tmp);
    // Should not throw, returns empty or partial results
    expect(Array.isArray(rules)).toBe(true);
    expect(Array.isArray(categories)).toBe(true);
    fs.removeSync(tmp);
  });
});

describe('mergeRules', () => {
  it('should deduplicate by ID', () => {
    const yamlRules = [
      { id: 'DUP001', source: 'yaml', name: 'first' },
      { id: 'DUP001', source: 'yaml', name: 'second' }
    ];
    const merged = mergeRules(yamlRules);
    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe('second');
  });

  it('should include all rules when IDs are unique', () => {
    const merged = mergeRules([{ id: 'Y1', source: 'yaml' }, { id: 'Y2', source: 'yaml' }]);
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

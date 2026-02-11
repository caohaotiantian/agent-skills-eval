/**
 * Test for Skill Discovery Module
 */

describe('Skill Discovery', () => {
  test('platforms configuration is valid', () => {
    const { PLATFORMS } = require('../lib/skills/discovering');
    
    expect(PLATFORMS).toBeDefined();
    expect(PLATFORMS['claude-code']).toBeDefined();
    expect(PLATFORMS['opencode']).toBeDefined();
    expect(PLATFORMS['claude-code'].pluginsPath).toBe('~/.claude/plugins/');
  });
  
  test('discovering module exports are correct', () => {
    const discovering = require('../lib/skills/discovering');
    
    expect(typeof discovering.discoverAll).toBe('function');
    expect(typeof discovering.displaySkills).toBe('function');
    expect(typeof discovering.parseSkillMetadata).toBe('function');
  });
});

describe('Benchmarking', () => {
  test('lists available benchmarks', () => {
    const { listBenchmarks, getBenchmark, BENCHMARKS } = require('../lib/skills/benchmarking');
    
    expect(Object.keys(BENCHMARKS)).toContain('metadata');
    expect(Object.keys(BENCHMARKS)).toContain('triggers');
    expect(Object.keys(BENCHMARKS)).toContain('code-quality');
    expect(getBenchmark('metadata')).toBeDefined();
  });
  
  test('benchmarking module exports are correct', () => {
    const benchmarking = require('../lib/skills/benchmarking');
    
    expect(typeof benchmarking.listBenchmarks).toBe('function');
    expect(typeof benchmarking.getBenchmark).toBe('function');
  });
});

describe('Evaluating', () => {
  test('evaluating module exports are correct', () => {
    const evaluating = require('../lib/skills/evaluating');
    
    expect(typeof evaluating.runEvaluation).toBe('function');
    expect(typeof evaluating.displayResults).toBe('function');
  });
});

describe('Reporting', () => {
  test('reporting module exports are correct', () => {
    const reporting = require('../lib/skills/reporting');
    
    expect(typeof reporting.generateReport).toBe('function');
  });
});

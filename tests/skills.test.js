/**
 * Tests for skill discovery, benchmarking, evaluating, and reporting modules
 */

const path = require('path');

describe('Skill Discovery', () => {
  const discovering = require('../lib/skills/discovering');

  test('platforms configuration covers all supported platforms', () => {
    const { PLATFORMS } = discovering;
    expect(Object.keys(PLATFORMS)).toEqual(
      expect.arrayContaining(['claude-code', 'opencode', 'codex', 'openclaw'])
    );
    expect(PLATFORMS['claude-code'].sources.personal).toBe('~/.claude/skills/');
    expect(PLATFORMS['claude-code'].sources.plugins).toBe('~/.claude/plugins/');
    expect(PLATFORMS['claude-code'].sources.project).toBe('.claude/skills/');
    expect(PLATFORMS['openclaw'].sources.managed).toBe('~/.openclaw/skills/');
  });

  test('expandHome replaces ~ with homedir', () => {
    const result = discovering.expandHome('~/test');
    expect(result).not.toContain('~');
    expect(result).toContain('test');
  });

  test('expandHome passes absolute paths through', () => {
    expect(discovering.expandHome('/absolute/path')).toBe('/absolute/path');
  });

  test('parseSkillMd extracts frontmatter from SKILL.md', async () => {
    const fixturePath = path.join(__dirname, 'fixtures/coding-agent/SKILL.md');
    const skill = await discovering.parseSkillMd(fixturePath, 'coding-agent');
    expect(skill.name).toBeDefined();
    expect(skill.id).toBe('coding-agent');
    expect(skill.path).toBe(path.join(__dirname, 'fixtures/coding-agent'));
  });

  test('getAllSkills extracts flat array from discovery result', () => {
    const mockResult = {
      platforms: {
        'claude-code': {
          skills: [
            { name: 'skill-a', id: 'a' },
            { name: 'skill-b', id: 'b' }
          ]
        },
        'codex': {
          skills: [{ name: 'skill-c', id: 'c' }]
        }
      }
    };
    const all = discovering.getAllSkills(mockResult);
    expect(all).toHaveLength(3);
    expect(all[0].platform).toBe('claude-code');
    expect(all[2].platform).toBe('codex');
  });

  test('getAllSkills returns empty array for null input', () => {
    expect(discovering.getAllSkills(null)).toEqual([]);
    expect(discovering.getAllSkills({})).toEqual([]);
  });

  test('findSkill locates skill by name (case-insensitive)', () => {
    const mockResult = {
      platforms: {
        'claude-code': {
          skills: [
            { name: 'Writing-Plans', id: 'writing-plans' },
            { name: 'tdd', id: 'test-driven-development' }
          ]
        }
      }
    };
    expect(discovering.findSkill(mockResult, 'writing-plans')).toBeDefined();
    expect(discovering.findSkill(mockResult, 'TDD')).toBeDefined();
    expect(discovering.findSkill(mockResult, 'nonexistent')).toBeNull();
  });
});

describe('Benchmarking', () => {
  const { listBenchmarks, getBenchmark, BENCHMARKS } = require('../lib/skills/benchmarking');

  test('BENCHMARKS covers all 5 eval dimensions', () => {
    expect(Object.keys(BENCHMARKS)).toEqual(
      expect.arrayContaining(['outcome', 'process', 'style', 'efficiency', 'security'])
    );
  });

  test('getBenchmark returns benchmark by name', () => {
    const outcome = getBenchmark('outcome');
    expect(outcome).toBeDefined();
    expect(outcome.name).toBe('Outcome Goals');
  });

  test('getBenchmark returns undefined for unknown name', () => {
    expect(getBenchmark('nonexistent')).toBeUndefined();
  });
});

describe('Evaluating', () => {
  test('runEvaluation returns structured results', async () => {
    const evaluating = require('../lib/skills/evaluating');
    const results = await evaluating.runEvaluation({ platform: 'claude-code' });

    expect(results.run_id).toBeDefined();
    expect(results.status).toBe('completed');
    expect(results.data).toBeDefined();
    expect(results.summary).toBeDefined();
  });
});

describe('Reporting', () => {
  test('generateReport is a function', () => {
    const reporting = require('../lib/skills/reporting');
    expect(typeof reporting.generateReport).toBe('function');
  });
});

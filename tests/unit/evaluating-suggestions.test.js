/**
 * Unit tests for lib/skills/evaluating/suggestions.js
 */
const { findFrontmatterLine, buildSuggestion } = require('../../lib/skills/evaluating/suggestions');

describe('findFrontmatterLine', () => {
  const sample = '---\nname: my-skill\ndescription: A test skill\n---\nBody content';

  it('returns 1-indexed line number for a top-level field', () => {
    expect(findFrontmatterLine(sample, 'name')).toBe(2);
    expect(findFrontmatterLine(sample, 'description')).toBe(3);
  });

  it('returns null when field is absent', () => {
    expect(findFrontmatterLine(sample, 'version')).toBeNull();
  });

  it('returns null for empty content', () => {
    expect(findFrontmatterLine('', 'name')).toBeNull();
    expect(findFrontmatterLine(null, 'name')).toBeNull();
  });

  it('handles indented YAML', () => {
    expect(findFrontmatterLine('---\n  name: foo\n---', 'name')).toBe(2);
  });
});

describe('buildSuggestion entry function', () => {
  const skill = { name: 'x', path: '/tmp/x', _skillMdContent: '---\nname: x\n---' };

  it('returns null for a perfectly-passing criterion', () => {
    const c = { criterion_id: 'has-skill-md', passed: true, score: 2, weight: 2 };
    expect(buildSuggestion(c, skill)).toBeNull();
  });

  it('returns null for an unknown criterion id', () => {
    const c = { criterion_id: 'nonexistent-rule', passed: false, score: 0, weight: 2 };
    expect(buildSuggestion(c, skill)).toBeNull();
  });

  it('does not throw if a template throws internally', () => {
    const { TEMPLATES } = require('../../lib/skills/evaluating/suggestions');
    TEMPLATES['boom'] = () => { throw new Error('template bug'); };
    const c = { criterion_id: 'boom', passed: false, score: 0, weight: 1 };
    expect(() => buildSuggestion(c, skill)).not.toThrow();
    expect(buildSuggestion(c, skill)).toBeNull();
    delete TEMPLATES['boom'];
  });
});

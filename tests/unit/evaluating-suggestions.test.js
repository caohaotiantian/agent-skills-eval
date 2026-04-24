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

/**
 * Unit tests for lib/utils/filter.js
 */

const { filterSkills } = require('../../lib/utils/filter');

const skills = [
  { name: 'writing-skills', id: 'writing-skills' },
  { name: 'test-runner', id: 'test-runner' },
  { name: 'code-review', id: 'code-review' },
  { name: 'brainstorming', id: 'brainstorming' },
  { name: 'frontend-design', id: 'FrontendDesign' }
];

describe('filterSkills', () => {
  it('should return all skills when no filters provided', () => {
    const result = filterSkills(skills);
    expect(result).toHaveLength(5);
  });

  it('should include skills matching include glob', () => {
    const result = filterSkills(skills, { include: ['*writing*'] });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('writing-skills');
  });

  it('should include skills matching multiple include patterns', () => {
    const result = filterSkills(skills, { include: ['*writing*', '*runner*'] });
    expect(result).toHaveLength(2);
  });

  it('should exclude skills matching exclude glob', () => {
    const result = filterSkills(skills, { exclude: ['*test*'] });
    expect(result).toHaveLength(4);
    expect(result.find(s => s.name === 'test-runner')).toBeUndefined();
  });

  it('should apply both include and exclude', () => {
    const result = filterSkills(skills, {
      include: ['*writing*', '*test*', '*code*'],
      exclude: ['*test*']
    });
    expect(result).toHaveLength(2);
    expect(result.map(s => s.name).sort()).toEqual(['code-review', 'writing-skills']);
  });

  it('should match case-insensitively', () => {
    const result = filterSkills(skills, { include: ['*WRITING*'] });
    expect(result).toHaveLength(1);
  });

  it('should match against skill id as well as name', () => {
    const result = filterSkills(skills, { include: ['*FrontendDesign*'] });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('frontend-design');
  });

  it('should return empty array when include matches nothing', () => {
    const result = filterSkills(skills, { include: ['*nonexistent*'] });
    expect(result).toHaveLength(0);
  });

  it('should handle skills with missing name or id', () => {
    const partial = [
      { name: 'has-name', id: '' },
      { name: '', id: 'has-id' },
      { id: 'only-id' }
    ];
    const result = filterSkills(partial, { include: ['*has*'] });
    expect(result).toHaveLength(2);
  });
});

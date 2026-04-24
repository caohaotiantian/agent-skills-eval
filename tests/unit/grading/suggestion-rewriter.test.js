/**
 * Unit tests for lib/grading/suggestion-rewriter.js
 */
const { buildBatchPrompt, parseRewrittenJson } = require('../../../lib/grading/suggestion-rewriter');

describe('buildBatchPrompt', () => {
  it('includes skill name, content, and each issue with criterionId/reason/suggestion', () => {
    const prompt = buildBatchPrompt('my-skill', '---\nname: my-skill\n---\nbody', [
      { criterionId: 'description-complete', reasoning: 'missing when', suggestion: 'add when phrase' },
      { criterionId: 'skill-md-size', reasoning: '612 lines', suggestion: 'split into refs/' }
    ]);
    expect(prompt).toMatch(/my-skill/);
    expect(prompt).toMatch(/description-complete/);
    expect(prompt).toMatch(/skill-md-size/);
    expect(prompt).toMatch(/missing when/);
    expect(prompt).toMatch(/add when phrase/);
  });

  it('truncates long SKILL.md content', () => {
    const long = 'x'.repeat(5000);
    const prompt = buildBatchPrompt('s', long, [{ criterionId:'a', reasoning:'b', suggestion:'c' }]);
    // Should not contain all 5000 chars
    expect(prompt.length).toBeLessThan(5000);
  });
});

describe('parseRewrittenJson', () => {
  it('extracts JSON object from a response wrapped in prose', () => {
    const r = parseRewrittenJson('Sure, here you go:\n{"a": "fix one", "b": "fix two"}\nLet me know.');
    expect(r).toEqual({ a: 'fix one', b: 'fix two' });
  });

  it('returns empty object on parse failure', () => {
    expect(parseRewrittenJson('not json at all')).toEqual({});
  });

  it('truncates each suggestion to 500 chars', () => {
    const huge = 'x'.repeat(800);
    const r = parseRewrittenJson(JSON.stringify({ a: huge }));
    expect(r.a.length).toBe(500);
  });
});

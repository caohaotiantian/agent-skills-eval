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

describe('rewriteSuggestions', () => {
  let originalRequire;

  beforeEach(() => {
    jest.resetModules();
  });

  it('returns {} when failingCriteria is empty', async () => {
    const { rewriteSuggestions } = require('../../../lib/grading/suggestion-rewriter');
    const r = await rewriteSuggestions({
      skillName: 's', skillContent: '', failingCriteria: [], llmConfig: {}
    });
    expect(r).toEqual({});
  });

  it('returns parsed object on successful LLM call', async () => {
    // Mock the openai module before requiring the rewriter
    jest.doMock('openai', () => {
      class MockOpenAI {
        constructor() { this.chat = { completions: { create: async () => ({
          choices: [{ message: { content: '{"description-complete": "Add a when-phrase to your one-line description."}' } }]
        })}}; }
      }
      return { default: MockOpenAI };
    });
    const { rewriteSuggestions } = require('../../../lib/grading/suggestion-rewriter');
    const r = await rewriteSuggestions({
      skillName: 's', skillContent: 'content', llmConfig: { apiKey: 'x' },
      failingCriteria: [{ criterionId: 'description-complete', reasoning: 'missing when', suggestion: 'add when' }]
    });
    expect(r['description-complete']).toMatch(/when-phrase/);
  });

  it('returns {} on LLM error', async () => {
    jest.doMock('openai', () => {
      class MockOpenAI {
        constructor() { this.chat = { completions: { create: async () => { throw new Error('boom'); } } }; }
      }
      return { default: MockOpenAI };
    });
    const { rewriteSuggestions } = require('../../../lib/grading/suggestion-rewriter');
    const r = await rewriteSuggestions({
      skillName: 's', skillContent: '', llmConfig: { apiKey: 'x' },
      failingCriteria: [{ criterionId: 'a', reasoning: '', suggestion: '' }]
    });
    expect(r).toEqual({});
  });

  it('returns {} when openai package is not installed', async () => {
    jest.doMock('openai', () => { throw new Error('not found'); });
    const { rewriteSuggestions } = require('../../../lib/grading/suggestion-rewriter');
    const r = await rewriteSuggestions({
      skillName: 's', skillContent: '', llmConfig: {},
      failingCriteria: [{ criterionId: 'a', reasoning: '', suggestion: '' }]
    });
    expect(r).toEqual({});
  });
});

describe('rewriteSuggestions caching', () => {
  const fs = require('fs-extra');
  const path = require('path');
  const os = require('os');
  let cacheDir;

  beforeEach(async () => {
    jest.resetModules();
    cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rewriter-cache-'));
  });

  afterEach(async () => {
    if (cacheDir) await fs.remove(cacheDir);
  });

  it('writes a cache file after a successful call', async () => {
    jest.doMock('openai', () => {
      class MockOpenAI {
        constructor() { this.chat = { completions: { create: async () => ({
          choices: [{ message: { content: '{"a": "rewritten"}' } }]
        })}}; }
      }
      return { default: MockOpenAI };
    });
    const { rewriteSuggestions } = require('../../../lib/grading/suggestion-rewriter');
    await rewriteSuggestions({
      skillName: 's', skillContent: 'content', llmConfig: { apiKey: 'x' }, cacheDir,
      failingCriteria: [{ criterionId: 'a', reasoning: 'r', suggestion: 's' }]
    });
    const files = await fs.readdir(cacheDir);
    expect(files.length).toBe(1);
  });

  it('serves from cache without invoking LLM on second call with same input', async () => {
    let callCount = 0;
    jest.doMock('openai', () => {
      class MockOpenAI {
        constructor() { this.chat = { completions: { create: async () => {
          callCount++;
          return { choices: [{ message: { content: '{"a": "rewritten"}' } }] };
        }}}; }
      }
      return { default: MockOpenAI };
    });
    const { rewriteSuggestions } = require('../../../lib/grading/suggestion-rewriter');
    const args = {
      skillName: 's', skillContent: 'content', llmConfig: { apiKey: 'x' }, cacheDir,
      failingCriteria: [{ criterionId: 'a', reasoning: 'r', suggestion: 's' }]
    };
    await rewriteSuggestions(args);
    await rewriteSuggestions(args);
    expect(callCount).toBe(1);
  });
});

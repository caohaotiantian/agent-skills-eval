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

describe('Outcome dimension templates', () => {
  const skillMd = '---\nname: my-skill\ndescription: A skill\n---\n# Body\n';
  const skill = {
    name: 'my-skill',
    path: '/tmp/my-skill',
    description: 'A skill',
    _skillMdContent: skillMd
  };

  const cases = [
    {
      id: 'has-skill-md',
      criterion: { criterion_id: 'has-skill-md', passed: false, score: 0, weight: 2, metadata: {} },
      assertions: r => {
        expect(r.details[0]).toMatch(/SKILL\.md not found/);
        expect(r.locations[0].file).toBe('SKILL.md');
        expect(r.suggestion).toMatch(/Create/);
      }
    },
    {
      id: 'has-frontmatter',
      criterion: { criterion_id: 'has-frontmatter', passed: false, score: 0, weight: 1, metadata: {} },
      assertions: r => {
        expect(r.locations[0].line).toBe(1);
        expect(r.suggestion).toMatch(/---\nname:/);
      }
    },
    {
      id: 'has-name',
      criterion: { criterion_id: 'has-name', passed: false, score: 0, weight: 1, metadata: {} },
      assertions: r => {
        expect(r.suggestion).toMatch(/name:/);
        expect(r.locations[0].file).toBe('SKILL.md');
      }
    },
    {
      id: 'has-description',
      criterion: { criterion_id: 'has-description', passed: false, score: 0, weight: 2, metadata: { length: 5 } },
      assertions: r => {
        expect(r.details.join(' ')).toMatch(/5/);
        expect(r.suggestion).toMatch(/description/i);
      }
    },
    {
      id: 'name-matches-directory',
      criterion: { criterion_id: 'name-matches-directory', passed: false, score: 0, weight: 1, metadata: { name: 'foo', directory: 'bar' } },
      assertions: r => {
        expect(r.suggestion).toMatch(/foo/);
        expect(r.suggestion).toMatch(/bar/);
      }
    },
    {
      id: 'has-body-content',
      criterion: { criterion_id: 'has-body-content', passed: false, score: 0, weight: 2, metadata: { body_length: 5 } },
      assertions: r => {
        expect(r.details.join(' ')).toMatch(/5/);
      }
    },
    {
      id: 'skill-md-size',
      criterion: { criterion_id: 'skill-md-size', passed: false, score: 0, weight: 1, metadata: { line_count: 612 } },
      assertions: r => {
        expect(r.details[0]).toMatch(/612 lines/);
        expect(r.suggestion).toMatch(/references\//);
      }
    },
    {
      id: 'has-optional-directories',
      criterion: { criterion_id: 'has-optional-directories', passed: false, score: 0, weight: 1, metadata: {} },
      assertions: r => {
        expect(r.suggestion).toMatch(/scripts|references|assets/);
      }
    }
  ];

  for (const c of cases) {
    it(`produces enrichment for ${c.id}`, () => {
      const r = buildSuggestion(c.criterion, skill);
      expect(r).not.toBeNull();
      expect(r.suggestion).toBeTruthy();
      c.assertions(r);
    });
  }
});

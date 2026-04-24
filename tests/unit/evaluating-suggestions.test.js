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

describe('Process dimension templates', () => {
  const skillMd = '---\nname: my-skill\ndescription: a description\n---\nBody\n';
  const skill = {
    name: 'My-Skill',
    path: '/tmp/my-skill',
    description: 'a description',
    _skillMdContent: skillMd
  };

  const cases = [
    {
      id: 'name-spec-compliant',
      criterion: { criterion_id: 'name-spec-compliant', passed: false, score: 0, weight: 2,
        metadata: { name: 'My-Skill', valid: false, length_ok: true } },
      assertions: r => {
        expect(r.suggestion).toMatch(/lowercase|kebab-case/i);
      }
    },
    {
      id: 'description-complete',
      criterion: { criterion_id: 'description-complete', passed: false, score: 1, weight: 3,
        metadata: { length: 32, has_what: true, has_when: false } },
      assertions: r => {
        expect(r.details.some(d => /when/.test(d))).toBe(true);
        expect(r.suggestion).toMatch(/when to use|use this when/i);
      }
    },
    {
      id: 'has-usage-guidance',
      criterion: { criterion_id: 'has-usage-guidance', passed: false, score: 0, weight: 2,
        metadata: { has_when: false, has_how: false } },
      assertions: r => {
        expect(r.suggestion).toMatch(/usage|when to use/i);
      }
    },
    {
      id: 'clear-instructions',
      criterion: { criterion_id: 'clear-instructions', passed: false, score: 0, weight: 3,
        metadata: { has_steps: false, has_code: false, has_examples: true, sections: 1 } },
      assertions: r => {
        expect(r.details.some(d => /step/i.test(d))).toBe(true);
        expect(r.details.some(d => /code/i.test(d))).toBe(true);
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

describe('Style dimension templates', () => {
  const skill = {
    id: 'My_Skill',
    name: 'my-skill',
    path: '/tmp/my-skill',
    _skillMdContent: '---\nname: my-skill\n---\nshort'
  };

  const cases = [
    {
      id: 'has-documentation',
      criterion: { criterion_id: 'has-documentation', passed: false, score: 0, weight: 2,
        metadata: { body_docs: false, has_references: false, has_readme: false } },
      assertions: r => { expect(r.suggestion).toMatch(/SKILL\.md|references\//); }
    },
    {
      id: 'modular-structure',
      criterion: { criterion_id: 'modular-structure', passed: false, score: 0, weight: 2,
        metadata: { scripts: false, references: false, assets: false, lib: false, src: false } },
      assertions: r => { expect(r.suggestion).toMatch(/scripts|references|assets/); }
    },
    {
      id: 'has-tests',
      criterion: { criterion_id: 'has-tests', passed: false, score: 0, weight: 3,
        metadata: { has_tests: false } },
      assertions: r => { expect(r.suggestion).toMatch(/test/i); }
    },
    {
      id: 'consistent-naming',
      criterion: { criterion_id: 'consistent-naming', passed: false, score: 0, weight: 2,
        metadata: { valid_naming: false } },
      assertions: r => { expect(r.suggestion).toMatch(/kebab-case|lowercase/i); }
    },
    {
      id: 'code-comments',
      criterion: { criterion_id: 'code-comments', passed: false, score: 0, weight: 1,
        metadata: { code_files: 3 } },
      assertions: r => { expect(r.suggestion).toMatch(/comment/i); expect(r.details.join(' ')).toMatch(/3/); }
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

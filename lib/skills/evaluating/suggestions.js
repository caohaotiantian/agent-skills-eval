/**
 * Per-criterion suggestion templates.
 *
 * For each non-security criterion in the EVAL_REGISTRY, a template function
 * returns { details, locations, suggestion } describing what specifically
 * failed, where to look, and how to fix it. Used by evaluating/index.js to
 * enrich criterion results with actionable detail.
 *
 * Templates assume the criterion failed or scored below full weight —
 * `buildSuggestion` filters perfectly-passing criteria before calling them.
 */

const path = require('path');

/**
 * Find the 1-indexed line of a YAML frontmatter field in SKILL.md content.
 * Returns null when content is empty or the field is absent.
 */
function findFrontmatterLine(content, field) {
  if (!content) return null;
  const lines = content.split('\n');
  const re = new RegExp('^\\s*' + field + '\\s*:');
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) return i + 1;
  }
  return null;
}

const TEMPLATES = {
  // -------------------------------------------------------------------------
  // Outcome Goals — Agent Skills spec structural completeness
  // -------------------------------------------------------------------------
  'has-skill-md': (skill, c) => ({
    details: ['SKILL.md not found in skill directory'],
    locations: [{ file: 'SKILL.md', label: 'expected at skill root' }],
    suggestion: `Create ${path.join(skill.path, 'SKILL.md')} with YAML frontmatter (name, description) and an instruction body.`
  }),

  'has-frontmatter': (skill, c) => ({
    details: ["SKILL.md does not begin with '---' delimiter"],
    locations: [{ file: 'SKILL.md', line: 1, label: 'top of file' }],
    suggestion: `Add YAML frontmatter at the top of SKILL.md:\n---\nname: ${skill.name || '<skill-name>'}\ndescription: ...\n---`
  }),

  'has-name': (skill, c) => ({
    details: ['Frontmatter is missing the required `name` field'],
    locations: [{ file: 'SKILL.md', line: findFrontmatterLine(skill._skillMdContent, 'name') || 2, label: 'frontmatter: name' }],
    suggestion: `Add a name field inside the frontmatter, e.g. \`name: ${path.basename(skill.path)}\` (must match parent directory).`
  }),

  'has-description': (skill, c) => {
    const len = c.metadata?.length || 0;
    return {
      details: [`Description is ${len} chars (Agent Skills spec requires >10 chars; recommended ≥40 for useful invocation hints)`],
      locations: [{ file: 'SKILL.md', line: findFrontmatterLine(skill._skillMdContent, 'description') || 3, label: 'frontmatter: description' }],
      suggestion: 'Write a description that says both what the skill does and when to invoke it. Example: "Validates user input. Use when handling untrusted form data."'
    };
  },

  'name-matches-directory': (skill, c) => {
    const name = c.metadata?.name || skill.name || '';
    const dir = c.metadata?.directory || path.basename(skill.path);
    return {
      details: [`Frontmatter name is "${name}" but parent directory is "${dir}" (Agent Skills spec requires they match)`],
      locations: [
        { file: 'SKILL.md', line: findFrontmatterLine(skill._skillMdContent, 'name') || 2, label: 'frontmatter: name' }
      ],
      suggestion: `Pick one: (a) rename frontmatter \`name: ${name}\` → \`name: ${dir}\`, OR (b) rename the directory "${dir}" → "${name}".`
    };
  },

  'has-body-content': (skill, c) => {
    const len = c.metadata?.body_length || 0;
    return {
      details: [`Markdown body after frontmatter is ${len} chars (need ≥20)`],
      locations: [{ file: 'SKILL.md', label: 'after frontmatter closing ---' }],
      suggestion: 'Add instruction content after the frontmatter: when the skill applies, the steps to follow, examples, and edge cases the agent should handle.'
    };
  },

  'skill-md-size': (skill, c) => {
    const lines = c.metadata?.line_count || 0;
    return {
      details: [`SKILL.md is ${lines} lines (Agent Skills spec recommends <500 for context efficiency)`],
      locations: [{ file: 'SKILL.md', label: 'whole file' }],
      suggestion: 'Move long examples, reference material, or supporting docs into a `references/` subdirectory and link to them from SKILL.md.'
    };
  },

  'has-optional-directories': (skill, c) => ({
    details: ['No `scripts/`, `references/`, or `assets/` subdirectory found (acceptable for instruction-only skills)'],
    locations: [{ file: skill.path, label: 'skill root' }],
    suggestion: 'If the skill has supporting files, organize them: executable code → `scripts/`, supporting docs → `references/`, static files → `assets/`.'
  })
};

/**
 * Build enrichment for a criterion result.
 * Returns null when the criterion passed perfectly (no enrichment needed)
 * or when no template is registered for the criterion id.
 *
 * @param {Object} criterion - criterion result object (passed/score/weight/metadata)
 * @param {Object} skill     - skill object (must have ._skillMdContent attached)
 * @returns {{details: string[], locations: object[], suggestion: string|null} | null}
 */
function buildSuggestion(criterion, skill) {
  if (criterion.passed && criterion.score === criterion.weight) return null;
  const builder = TEMPLATES[criterion.criterion_id];
  if (!builder) return null;
  try {
    return builder(skill, criterion);
  } catch (_e) {
    return null;
  }
}

module.exports = { buildSuggestion, TEMPLATES, findFrontmatterLine };

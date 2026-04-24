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
  }),

  // -------------------------------------------------------------------------
  // Process Goals — invocation quality
  // -------------------------------------------------------------------------
  'name-spec-compliant': (skill, c) => {
    const name = c.metadata?.name || skill.name || '';
    const issues = [];
    if (c.metadata?.length_ok === false) issues.push('length must be 1-64');
    if (c.metadata?.valid === false) issues.push('only lowercase letters, digits, and hyphens; no consecutive hyphens');
    return {
      details: [`Name "${name}" violates spec: ${issues.join('; ')}`],
      locations: [{ file: 'SKILL.md', line: findFrontmatterLine(skill._skillMdContent, 'name') || 2, label: 'frontmatter: name' }],
      suggestion: `Rename to lowercase kebab-case (e.g. "${(name || 'my-skill').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}"). Update both the frontmatter name and the parent directory together.`
    };
  },

  'description-complete': (skill, c) => {
    const len = c.metadata?.length || 0;
    const details = [];
    if (c.metadata?.has_what === false) details.push(`Description is ${len} chars — too short to convey what the skill does (recommend ≥40)`);
    if (c.metadata?.has_when === false) details.push('Missing a "when to use" cue: no `when`/`use this when`/`trigger` keyword found');
    return {
      details,
      locations: [{ file: 'SKILL.md', line: findFrontmatterLine(skill._skillMdContent, 'description') || 3, label: 'frontmatter: description' }],
      suggestion: `Add a "when to use" phrase. Example pattern: "<one-sentence what>. Use this when <trigger condition>." Current description: "${skill.description || ''}"`
    };
  },

  'has-usage-guidance': (skill, c) => {
    const missing = [];
    if (c.metadata?.has_when === false) missing.push('a "When to use" section');
    if (c.metadata?.has_how === false) missing.push('a "Usage" / "How to use" / examples section');
    return {
      details: [`Body lacks ${missing.join(' and ')}`],
      locations: [{ file: 'SKILL.md', label: 'markdown body' }],
      suggestion: 'Add a "## When to use" section explaining the trigger conditions and a "## Usage" section with concrete examples or steps.'
    };
  },

  'clear-instructions': (skill, c) => {
    const missing = [];
    if (c.metadata?.has_steps === false) missing.push('numbered steps or `## Step` headings');
    if (c.metadata?.has_code === false) missing.push('fenced code blocks (```)');
    if (c.metadata?.has_examples === false) missing.push('inline examples (e.g., for instance, ...)');
    if (typeof c.metadata?.sections === 'number' && c.metadata.sections < 2) missing.push(`structured sections (have ${c.metadata.sections}, need ≥2 \`##\` headings)`);
    return {
      details: missing.map(m => `Missing: ${m}`),
      locations: [{ file: 'SKILL.md', label: 'markdown body' }],
      suggestion: 'Structure the body with `##` headings, numbered steps, fenced code blocks for commands or examples, and concrete "for example" passages where intent is non-obvious.'
    };
  },

  // -------------------------------------------------------------------------
  // Style Goals
  // -------------------------------------------------------------------------
  'has-documentation': (skill, c) => ({
    details: ['SKILL.md body has <100 chars and no `references/` directory or `README.md` was found'],
    locations: [{ file: 'SKILL.md', label: 'markdown body' }],
    suggestion: 'Either expand the SKILL.md body to >100 chars of usage docs, or add a `references/` directory with supporting markdown files.'
  }),

  'modular-structure': (skill, c) => ({
    details: ['No subdirectories found (scripts/, references/, assets/, lib/, src/) — acceptable for instruction-only skills'],
    locations: [{ file: skill.path, label: 'skill root' }],
    suggestion: 'If the skill grows beyond a single SKILL.md, split it: executable code → `scripts/`, supporting docs → `references/`, static files → `assets/`.'
  }),

  'has-tests': (skill, c) => ({
    details: ['No `tests/` directory and no `test*.{js,ts}` or `*.spec.{js,ts}` files at the skill root'],
    locations: [{ file: skill.path, label: 'skill root' }],
    suggestion: 'Add a `tests/` directory with Jest test files (`*.test.js`) covering the skill\'s scripts and expected behavior.'
  }),

  'consistent-naming': (skill, c) => {
    const id = skill.id || skill.name || '';
    return {
      details: [`Skill id "${id}" does not match \`^[a-z][a-z0-9]*(-[a-z0-9]+)*$\``],
      locations: [{ file: 'SKILL.md', line: findFrontmatterLine(skill._skillMdContent, 'name') || 2, label: 'frontmatter: name' }],
      suggestion: `Rename to lowercase kebab-case (e.g. "${id.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}"). Spec allows only [a-z0-9] and single hyphens.`
    };
  },

  'code-comments': (skill, c) => {
    const n = c.metadata?.code_files || 0;
    return {
      details: [`${n} code file(s) contain no \`//\`, \`/*\`, or \`#\` comments`],
      locations: [{ file: skill.path, label: `${n} code file(s) under skill root` }],
      suggestion: 'Add comments explaining non-obvious logic, hidden constraints, or workarounds. Skip comments that just restate what the code does.'
    };
  },

  // -------------------------------------------------------------------------
  // Efficiency Goals
  // -------------------------------------------------------------------------
  'reasonable-dependency-count': (skill, c) => {
    const deps = c.metadata?.dep_count || 0;
    return {
      details: [`package.json declares ${deps} runtime dependencies (consider keeping <50)`],
      locations: [{ file: 'package.json', label: 'dependencies' }],
      suggestion: 'Audit `dependencies` for unused entries (`npx depcheck`); replace heavy libraries with lighter alternatives or vendor small utilities.'
    };
  },

  'async-optimization': (skill, c) => ({
    details: ['No `async`, `await`, `Promise.`, or `.then()` patterns found in code files'],
    locations: [{ file: skill.path, label: `${c.metadata?.code_files || 0} code file(s)` }],
    suggestion: 'Convert blocking I/O (file reads, network requests) to async/await. Use `Promise.all` to parallelize independent calls.'
  }),

  'caching': (skill, c) => ({
    details: ['No caching primitives detected (no `cache`, `memoize`, `Map()`, `WeakMap`, `redis`)'],
    locations: [{ file: skill.path, label: `${c.metadata?.code_files || 0} code file(s)` }],
    suggestion: 'For expensive computations or repeated lookups, add a `Map` cache or memoize the function. Skip if calls are infrequent or inputs always vary.'
  }),

  'efficient-dependencies': (skill, c) => {
    const prod = c.metadata?.prod_deps || 0;
    const dev = c.metadata?.dev_deps || 0;
    return {
      details: [`prod dependencies: ${prod} (target <20), dev dependencies: ${dev} (target <30)`],
      locations: [{ file: 'package.json', label: 'dependencies / devDependencies' }],
      suggestion: 'Move build-only and test-only packages to `devDependencies`; remove unused entries with `npx depcheck`.'
    };
  },

  'no-unnecessary-commands': (skill, c) => ({
    details: ['Code uses `exec()`, `spawn()`, or `execSync()` — make sure inputs are not user-controlled and arguments are not concatenated into a shell string'],
    locations: [{ file: skill.path, label: `${c.metadata?.code_files || 0} code file(s)` }],
    suggestion: 'Prefer `execFile`/`spawn` with an args array over `exec` with a string. Never interpolate user input into a shell command — use parameterized arrays.'
  })
};  // end TEMPLATES

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

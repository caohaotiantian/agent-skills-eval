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
  // populated in subsequent tasks
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

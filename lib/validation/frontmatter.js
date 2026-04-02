/**
 * YAML Frontmatter Validation Module
 * Validates SKILL.md YAML frontmatter format
 */

const { parseFrontmatter: sharedParse } = require('../utils/frontmatter');

function parseFrontmatter(content) {
  const { frontmatter, body, error } = sharedParse(content);
  return { frontmatter, content: body, error };
}

function validateFrontmatter(frontmatter) {
  const errors = [], warnings = [];
  if (!frontmatter || typeof frontmatter !== 'object') {
    errors.push('Frontmatter must be an object');
    return { valid: false, errors, warnings };
  }
  if (!frontmatter.name) errors.push('Missing required field: name');
  if (!frontmatter.description) errors.push('Missing required field: description');
  if (frontmatter.name?.length > 64) warnings.push('name exceeds 64 chars');
  if (frontmatter.description?.length > 1024) warnings.push('description exceeds 1024 chars');
  return { valid: errors.length === 0, errors, warnings };
}

module.exports = { parseFrontmatter, validateFrontmatter };

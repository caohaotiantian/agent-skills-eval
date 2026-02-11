/**
 * YAML Frontmatter Validation Module
 * Validates SKILL.md YAML frontmatter format
 */

const yaml = require('js-yaml');

function parseFrontmatter(content) {
  if (!content || typeof content !== 'string') {
    return { frontmatter: null, content, error: 'Content is empty' };
  }
  if (!content.startsWith('---')) {
    return { frontmatter: null, content, error: 'Missing opening ---' };
  }
  const endMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!endMatch) {
    return { frontmatter: null, content, error: 'Missing closing ---' };
  }
  try {
    return {
      frontmatter: yaml.load(endMatch[1]),
      content: content.slice(endMatch[0].length),
      error: null
    };
  } catch (e) {
    return { frontmatter: null, content, error: `YAML error: ${e.message}` };
  }
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

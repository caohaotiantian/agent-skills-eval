const yaml = require('js-yaml');

function parseFrontmatter(content) {
  if (!content || typeof content !== 'string') {
    return { frontmatter: null, body: content || '', error: 'Content is empty or not a string' };
  }
  if (!content.startsWith('---')) {
    return { frontmatter: null, body: content, error: 'Missing opening ---' };
  }
  const endMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!endMatch) {
    return { frontmatter: null, body: content, error: 'Missing closing ---' };
  }
  try {
    return {
      frontmatter: yaml.load(endMatch[1]),
      body: content.slice(endMatch[0].length),
      error: null
    };
  } catch (e) {
    return { frontmatter: null, body: content, error: `YAML error: ${e.message}` };
  }
}

module.exports = { parseFrontmatter };

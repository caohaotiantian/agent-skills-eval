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
    const fm = yaml.load(endMatch[1]);
    // Coerce non-string fields that should be strings (YAML may parse them as arrays/objects)
    // e.g. description: [TODO: ...] is parsed as an array by YAML
    if (fm && typeof fm === 'object') {
      for (const key of ['name', 'description', 'license', 'compatibility']) {
        if (fm[key] != null && typeof fm[key] !== 'string') {
          fm[key] = String(fm[key]);
        }
      }
    }
    return {
      frontmatter: fm,
      body: content.slice(endMatch[0].length),
      error: null
    };
  } catch (e) {
    return { frontmatter: null, body: content, error: `YAML error: ${e.message}` };
  }
}

module.exports = { parseFrontmatter };

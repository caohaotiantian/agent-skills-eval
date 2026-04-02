const { parseFrontmatter } = require('../../lib/utils/frontmatter');

describe('parseFrontmatter (shared)', () => {
  test('valid frontmatter returns parsed object and body', () => {
    const input = '---\nname: my-skill\ndescription: A skill\n---\n# Body here';
    const result = parseFrontmatter(input);
    expect(result.error).toBeNull();
    expect(result.frontmatter).toEqual({ name: 'my-skill', description: 'A skill' });
    expect(result.body).toBe('\n# Body here');
  });

  test('missing opening --- returns error', () => {
    const input = 'no frontmatter here';
    const result = parseFrontmatter(input);
    expect(result.error).toBe('Missing opening ---');
    expect(result.frontmatter).toBeNull();
    expect(result.body).toBe(input);
  });

  test('missing closing --- returns error', () => {
    const input = '---\nname: broken\nno closing';
    const result = parseFrontmatter(input);
    expect(result.error).toBe('Missing closing ---');
    expect(result.frontmatter).toBeNull();
    expect(result.body).toBe(input);
  });

  test('empty content returns error', () => {
    const result = parseFrontmatter('');
    expect(result.error).toBe('Content is empty or not a string');
    expect(result.frontmatter).toBeNull();
    expect(result.body).toBe('');
  });

  test('null content returns error', () => {
    const result = parseFrontmatter(null);
    expect(result.error).toBe('Content is empty or not a string');
    expect(result.frontmatter).toBeNull();
    expect(result.body).toBe('');
  });

  test('YAML parse error returns error with "YAML" in message', () => {
    const input = '---\n: invalid: yaml: {{{\n---\nBody';
    const result = parseFrontmatter(input);
    expect(result.error).toMatch(/YAML/);
    expect(result.frontmatter).toBeNull();
    expect(result.body).toBe(input);
  });
});

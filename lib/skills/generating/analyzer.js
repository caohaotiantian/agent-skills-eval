// lib/skills/generating/analyzer.js
const fs = require('fs-extra');
const path = require('path');
const yaml = require('js-yaml');

/**
 * Analyzes a skill directory and extracts information for test generation
 * @param {string} skillPath - Path to skill directory
 * @returns {Promise<Object>} Skill analysis result
 */
async function analyzeSkill(skillPath) {
  const skillMdPath = path.join(skillPath, 'SKILL.md');

  if (!await fs.pathExists(skillMdPath)) {
    throw new Error(`SKILL.md not found at ${skillMdPath}`);
  }

  const content = await fs.readFile(skillMdPath, 'utf-8');
  const { frontmatter, body } = parseFrontmatter(content);

  const result = {
    name: frontmatter.name || path.basename(skillPath),
    description: frontmatter.description || '',
    location: frontmatter.location || '',
    frontmatter,
    availableSkills: [],
    implementation: {
      tools: [],
      fileOperations: [],
      securityPatterns: []
    }
  };

  // Extract available skills
  if (frontmatter.available_skills) {
    result.availableSkills = frontmatter.available_skills.map(skill => ({
      name: skill.name,
      triggers: skill.trigger || [],
      description: skill.description || ''
    }));
  }

  // Analyze implementation files
  result.implementation = await analyzeImplementation(skillPath);

  return result;
}

/**
 * Parses YAML frontmatter from SKILL.md content
 * @param {string} content - Full SKILL.md content
 * @returns {Object} { frontmatter, body }
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content };
  }
  const frontmatter = yaml.load(match[1]) || {};
  const body = match[2];
  return { frontmatter, body };
}

/**
 * Analyzes implementation files to extract tools and patterns
 * @param {string} skillPath - Path to skill directory
 * @returns {Promise<Object>} Implementation analysis
 */
async function analyzeImplementation(skillPath) {
  const impl = {
    tools: [],
    fileOperations: [],
    securityPatterns: []
  };

  // Check lib/ directory
  const libPath = path.join(skillPath, 'lib');
  if (await fs.pathExists(libPath)) {
    const files = await globJsFiles(libPath);
    for (const file of files) {
      const content = await fs.readFile(file, 'utf-8');
      const patterns = extractToolPatterns(content);
      impl.tools.push(...patterns);
    }
  }

  // Check scripts/ directory
  const scriptsPath = path.join(skillPath, 'scripts');
  if (await fs.pathExists(scriptsPath)) {
    const files = await globJsFiles(scriptsPath);
    for (const file of files) {
      const content = await fs.readFile(file, 'utf-8');
      const patterns = extractToolPatterns(content);
      impl.tools.push(...patterns);
    }
  }

  // Extract security patterns from body if we have it
  impl.securityPatterns = [];

  // Deduplicate tools
  impl.tools = [...new Set(impl.tools)];

  return impl;
}

/**
 * Recursively finds all JS files in a directory
 * @param {string} dir - Directory to search
 * @returns {Promise<Array>} Array of file paths
 */
async function globJsFiles(dir) {
  const files = [];

  async function scan(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        // Skip node_modules and test directories
        if (entry.name !== 'node_modules' && entry.name !== 'tests' && entry.name !== 'test') {
          await scan(fullPath);
        }
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        files.push(fullPath);
      }
    }
  }

  await scan(dir);
  return files;
}

/**
 * Extracts tool usage patterns from code
 * @param {string} content - JavaScript code
 * @returns {Array} Tool patterns found
 */
function extractToolPatterns(content) {
  const tools = [];
  const toolPatterns = [
    { name: 'bash', patterns: [/exec\s*\(/, /spawn\s*\(/, /execSync\s*\(/, /child_process/] },
    { name: 'readFile', patterns: [/readFile\s*\(/, /readFileSync\s*\(/, /readdir\s*\(/] },
    { name: 'writeFile', patterns: [/writeFile\s*\(/, /writeFileSync\s*\(/, /appendFile\s*\(/] },
    { name: 'mkdir', patterns: [/mkdir\s*\(/, /mkdirSync\s*\(/] },
    { name: 'glob', patterns: [/glob\s*\(/, /globSync\s*\(/, /fast-glob/] },
    { name: 'fetch', patterns: [/fetch\s*\(/, /axios\s*\(/, /https\.request\s*\(/, /http\.request\s*\(/] },
    { name: 'eval', patterns: [/\beval\s*\(/, /\bexec\s*\(/] },
    { name: 'template', patterns: [/\bnew\s+Function\s*\(/, /eval\s*\(/] }
  ];

  for (const tool of toolPatterns) {
    for (const pattern of tool.patterns) {
      if (pattern.test(content)) {
        tools.push(tool.name);
        break;
      }
    }
  }

  return [...new Set(tools)];
}

module.exports = {
  analyzeSkill,
  parseFrontmatter,
  analyzeImplementation,
  extractToolPatterns
};

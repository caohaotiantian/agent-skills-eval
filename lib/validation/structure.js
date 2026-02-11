/**
 * Directory Structure Validation Module
 */

const fs = require('fs-extra');
const path = require('path');

const REQUIRED_FILES = { 'SKILL.md': 'Skill definition file' };
const OPTIONAL_DIRS = {
  'lib/': 'Implementation code',
  'scripts/': 'Scripts directory',
  'references/': 'Reference docs',
  'assets/': 'Asset files',
  'tests/': 'Test files'
};

async function validateStructure(skillPath) {
  const errors = [], warnings = [];
  const exists = await fs.pathExists(skillPath);
  if (!exists) {
    errors.push(`Path does not exist: ${skillPath}`);
    return { valid: false, errors, warnings, exists: false };
  }
  for (const [file, desc] of Object.entries(REQUIRED_FILES)) {
    const filePath = path.join(skillPath, file);
    if (!await fs.pathExists(filePath)) errors.push(`Missing required: ${file}`);
  }
  return { valid: errors.length === 0, errors, warnings, exists: true };
}

async function validateSkillMdLength(skillPath) {
  const skillMdPath = path.join(skillPath, 'SKILL.md');
  if (!(await fs.pathExists(skillMdPath))) {
    return { lineCount: 0, isOptimal: false, error: 'SKILL.md not found' };
  }
  const content = await fs.readFile(skillMdPath, 'utf-8');
  const lineCount = content.split('\n').length;
  const warnings = [];
  if (lineCount > 500) warnings.push('SKILL.md > 500 lines, consider progressive disclosure');
  return { lineCount, isOptimal: lineCount <= 500, warnings };
}

module.exports = { validateStructure, validateSkillMdLength, REQUIRED_FILES, OPTIONAL_DIRS };

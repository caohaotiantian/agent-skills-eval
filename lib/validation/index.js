const frontmatter = require('./frontmatter');
const naming = require('./naming');
const structure = require('./structure');

async function validateSkill(skillPath) {
  const report = { path: skillPath, timestamp: new Date().toISOString(), valid: true, errors: [], warnings: [] };
  const struct = await structure.validateStructure(skillPath);
  if (!struct.valid) { report.valid = false; report.errors.push(...struct.errors); }
  report.structure = struct;
  const fs = require('fs-extra');
  const mdPath = require('path').join(skillPath, 'SKILL.md');
  if (await fs.pathExists(mdPath)) {
    const content = await fs.readFile(mdPath, 'utf-8');
    const { frontmatter: fm, error } = frontmatter.parseFrontmatter(content);
    if (error) { report.valid = false; report.errors.push(error); }
    else {
      const fv = frontmatter.validateFrontmatter(fm);
      if (!fv.valid) { report.valid = false; report.errors.push(...fv.errors); }
      report.frontmatter = fm;
      const nv = naming.validateSkillName(fm.name || '');
      if (!nv.valid) { report.valid = false; report.errors.push(...nv.errors); }
      const dv = naming.validateDescription(fm.description || '');
      if (!dv.valid) { report.valid = false; report.errors.push(...dv.errors); }
    }
  }
  const length = await structure.validateSkillMdLength(skillPath);
  report.warnings.push(...(length.warnings || []));
  return report;
}

function formatReport(report, options = {}) {
  const chalk = require('chalk');
  let output = '\n📋 Validation Report\n' + `Path: ${report.path}\n`;
  output += `Status: ${report.valid ? chalk.green('VALID') : chalk.red('INVALID')}\n`;
  if (report.errors.length) output += chalk.red('Errors:\n' + report.errors.map(e => '  - ' + e).join('\n') + '\n');
  if (report.warnings.length) output += chalk.yellow('Warnings:\n' + report.warnings.map(w => '  - ' + w).join('\n') + '\n');
  return output;
}

module.exports = { validateSkill, formatReport, frontmatter, naming, structure };

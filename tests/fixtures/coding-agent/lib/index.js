/**
 * Coding agent skill implementation
 */

const fs = require('fs');
const { exec, spawn } = require('child_process');

/**
 * Create a new CLI application
 */
async function createCliTool(name, language = 'python') {
  fs.mkdirSync(name, { recursive: true });
  const mainContent = getMainTemplate(name, language);
  fs.writeFileSync(`${name}/main.${getExtension(language)}`, mainContent);
  if (language === 'python') {
    const setupContent = getSetupTemplate(name);
    fs.writeFileSync(`${name}/setup.py`, setupContent);
  }
  return { success: true, path: name };
}

/**
 * Write content to a file
 */
async function writeFile(path, content) {
  const dir = path.split('/').slice(0, -1).join('/');
  if (dir) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path, content);
  return { success: true, path };
}

/**
 * Run test suite
 */
async function runTests(path) {
  const { execSync } = require('child_process');
  execSync(`cd ${path} && npm test`);
  return { success: true };
}

module.exports = {
  createCliTool,
  writeFile,
  runTests
};

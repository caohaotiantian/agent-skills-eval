const crypto = require('crypto');
const fs = require('fs-extra');
const path = require('path');
const { glob } = require('glob');

/**
 * Compute a hash of all files in a skill directory.
 */
async function computeSkillHash(skillPath) {
  const files = await glob('**/*', { cwd: skillPath, nodir: true, absolute: true });
  files.sort();

  const hash = crypto.createHash('sha256');
  for (const file of files) {
    try {
      const content = await fs.readFile(file, 'utf-8');
      hash.update(file + '\n' + content + '\n');
    } catch {
      // Skip unreadable files (binary, etc.)
      hash.update(file + '\n[unreadable]\n');
    }
  }
  return hash.digest('hex').substring(0, 16);
}

/**
 * Load the cache index from disk.
 */
async function loadCacheIndex(cachePath) {
  const indexPath = path.join(cachePath, 'index.json');
  if (await fs.pathExists(indexPath)) {
    try {
      return fs.readJson(indexPath);
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * Save the cache index to disk.
 */
async function saveCacheIndex(cachePath, index) {
  await fs.ensureDir(cachePath);
  await fs.writeJson(path.join(cachePath, 'index.json'), index, { spaces: 2 });
}

module.exports = { computeSkillHash, loadCacheIndex, saveCacheIndex };

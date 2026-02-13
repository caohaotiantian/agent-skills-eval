/**
 * Centralized Path Resolution
 * All output/config paths are resolved from config with sensible defaults.
 * This eliminates hardcoded paths scattered across modules.
 */

const path = require('path');
const fs = require('fs-extra');

let _config = null;
let _projectRoot = null;

/**
 * Find the project root by walking up from cwd looking for package.json
 */
function findProjectRoot() {
  if (_projectRoot) return _projectRoot;
  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    if (fs.pathExistsSync(path.join(dir, 'package.json'))) {
      _projectRoot = dir;
      return dir;
    }
    dir = path.dirname(dir);
  }
  _projectRoot = process.cwd();
  return _projectRoot;
}

/**
 * Load project config from config/ or project root.
 */
function loadConfig() {
  if (_config) return _config;
  const root = findProjectRoot();

  // Try config/ directory first, then project root
  const candidates = [
    path.join(root, 'config', 'agent-skills-eval.config.js'),
    path.join(root, 'agent-skills-eval.config.js')
  ];

  for (const p of candidates) {
    if (fs.pathExistsSync(p)) {
      try {
        _config = require(p);
        return _config;
      } catch {
        // continue to next candidate
      }
    }
  }

  _config = {};
  return _config;
}

/**
 * Resolve a path relative to the project root.
 */
function resolve(...segments) {
  const joined = path.join(...segments);
  if (path.isAbsolute(joined)) return joined;
  return path.join(findProjectRoot(), joined);
}

/**
 * Get all resolved paths for the project.
 * Output paths are for generated data; config paths are for static definitions.
 */
function getPaths() {
  const config = loadConfig();

  // Output directories (generated data, git-ignored)
  const outputBase = config.output?.directory || './output';
  const traces   = config.output?.traces   || path.join(outputBase, 'traces');
  const prompts  = config.output?.prompts  || path.join(outputBase, 'prompts');
  const results  = config.output?.results  || path.join(outputBase, 'results');
  const reports  = config.output?.reports  || path.join(outputBase, 'reports');

  // Config directories (static data, checked into git)
  const rubrics = config.paths?.rubrics || './config/rubrics';
  const evals   = config.paths?.evals   || './config/evals';

  return {
    // Output (generated)
    output: resolve(outputBase),
    traces: resolve(traces),
    prompts: resolve(prompts),
    results: resolve(results),
    reports: resolve(reports),

    // Config (static)
    rubrics: resolve(rubrics),
    evals: resolve(evals),

    // Project root
    root: findProjectRoot()
  };
}

/**
 * Ensure all output directories exist.
 */
async function ensureOutputDirs() {
  const p = getPaths();
  await fs.ensureDir(p.traces);
  await fs.ensureDir(p.prompts);
  await fs.ensureDir(p.results);
  await fs.ensureDir(p.reports);
}

/**
 * Reset cached config (useful for testing).
 */
function resetCache() {
  _config = null;
  _projectRoot = null;
}

module.exports = {
  findProjectRoot,
  loadConfig,
  resolve,
  getPaths,
  ensureOutputDirs,
  resetCache
};

/**
 * Backend Registry — maps backend names to their implementation modules.
 * Uses lazy loading so a missing dependency doesn't crash unrelated backends.
 * Supports external backends from npm packages or local paths.
 */

const path = require('path');

const BUILTIN_BACKENDS = {
  'mock':              './mock',
  'openai-compatible': './openai',
  'codex':             './codex',
  'claude-code':       './claude-code',
  'opencode':          './opencode'
};

const _cache = {};

/**
 * Get a backend module by name.
 * Checks built-in backends first, then tries npm package name, then local path.
 * @param {string} name - Backend name, npm package, or local path
 * @returns {Object} Backend module with a `run(prompt, options)` function
 */
function getBackend(name) {
  if (_cache[name]) return _cache[name];

  // Check built-in backends first
  if (BUILTIN_BACKENDS[name]) {
    try {
      _cache[name] = require(BUILTIN_BACKENDS[name]);
      return _cache[name];
    } catch (err) {
      throw new Error(`Failed to load built-in backend "${name}": ${err.message}`);
    }
  }

  // Try as npm package name
  try {
    _cache[name] = require(name);
    return _cache[name];
  } catch {
    // Try as local path
    try {
      _cache[name] = require(path.resolve(name));
      return _cache[name];
    } catch {
      const known = Object.keys(BUILTIN_BACKENDS).join(', ');
      throw new Error(`Unknown backend: "${name}". Built-in: ${known}. Or provide an npm package name / local path.`);
    }
  }
}

/**
 * List all available built-in backend names.
 * @returns {string[]}
 */
function listBackends() {
  return Object.keys(BUILTIN_BACKENDS);
}

module.exports = { getBackend, listBackends };

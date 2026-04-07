/**
 * Backend Registry — maps backend names to their implementation modules.
 * Uses lazy loading so a missing dependency doesn't crash unrelated backends.
 * Supports external backends from npm packages or local paths.
 *
 * NOTE: Built-in backends use explicit require() calls (not dynamic string
 * variables) so that Bun's --compile can statically trace and bundle them.
 */

const path = require('path');

const BUILTIN_BACKEND_NAMES = ['mock', 'openai-compatible', 'codex', 'claude-code', 'opencode'];

/**
 * Load a built-in backend by name using static require paths.
 * Bun's compiler cannot resolve `require(variable)` — each path must be a
 * string literal so the bundler can trace it.
 */
function loadBuiltin(name) {
  switch (name) {
    case 'mock':              return require('./mock');
    case 'openai-compatible': return require('./openai');
    case 'codex':             return require('./codex');
    case 'claude-code':       return require('./claude-code');
    case 'opencode':          return require('./opencode');
    default:                  return null;
  }
}

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
  if (BUILTIN_BACKEND_NAMES.includes(name)) {
    try {
      _cache[name] = loadBuiltin(name);
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
      const known = BUILTIN_BACKEND_NAMES.join(', ');
      throw new Error(`Unknown backend: "${name}". Built-in: ${known}. Or provide an npm package name / local path.`);
    }
  }
}

/**
 * List all available built-in backend names.
 * @returns {string[]}
 */
function listBackends() {
  return [...BUILTIN_BACKEND_NAMES];
}

module.exports = { getBackend, listBackends };

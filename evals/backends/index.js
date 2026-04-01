/**
 * Backend Registry — maps backend names to their implementation modules.
 * Uses lazy loading so a missing dependency doesn't crash unrelated backends.
 */

const BACKEND_MODULES = {
  'mock':              './mock',
  'openai-compatible': './openai',
  'codex':             './codex',
  'claude-code':       './claude-code',
  'opencode':          './opencode'
};

const _cache = {};

/**
 * Get a backend module by name.
 * @param {string} name - Backend name
 * @returns {Object} Backend module with a `run(prompt, options)` function
 */
function getBackend(name) {
  if (_cache[name]) return _cache[name];
  const modulePath = BACKEND_MODULES[name];
  if (!modulePath) {
    const known = Object.keys(BACKEND_MODULES).join(', ');
    throw new Error(`Unknown runner backend: "${name}". Available: ${known}`);
  }
  try {
    _cache[name] = require(modulePath);
    return _cache[name];
  } catch (err) {
    throw new Error(`Failed to load backend "${name}": ${err.message}`);
  }
}

/**
 * List all available backend names.
 */
function listBackends() {
  return Object.keys(BACKEND_MODULES);
}

module.exports = { getBackend, listBackends };

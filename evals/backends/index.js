/**
 * Backend Registry — maps backend names to their implementation modules.
 */

const BACKENDS = {
  'mock':               require('./mock'),
  'openai-compatible':  require('./openai'),
  'codex':              require('./codex'),
  'claude-code':        require('./claude-code'),
  'opencode':           require('./opencode')
};

/**
 * Get a backend module by name.
 * @param {string} name - Backend name
 * @returns {Object} Backend module with a `run(prompt, options)` function
 */
function getBackend(name) {
  const backend = BACKENDS[name];
  if (!backend) {
    const known = Object.keys(BACKENDS).join(', ');
    throw new Error(`Unknown runner backend: "${name}". Available: ${known}`);
  }
  return backend;
}

/**
 * List all available backend names.
 */
function listBackends() {
  return Object.keys(BACKENDS);
}

module.exports = { getBackend, listBackends, BACKENDS };

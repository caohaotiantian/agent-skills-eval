const { execSync } = require('child_process');

async function checkCliAvailable(command) {
  try {
    const whichCmd = process.platform === 'win32' ? 'where' : 'which';
    const result = execSync(`${whichCmd} ${command}`, { encoding: 'utf8', timeout: 5000 });
    return { available: true, path: result.trim() };
  } catch {
    return { available: false, error: `'${command}' not found on PATH` };
  }
}

async function checkApiReachable(url, options = {}) {
  const { timeout = 5000 } = options;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const response = await fetch(url, { signal: controller.signal, method: 'GET' });
    clearTimeout(timer);
    return { reachable: true, status: response.status };
  } catch (err) {
    return { reachable: false, error: err.message };
  }
}

async function checkBackendHealth(backendName, config = {}) {
  switch (backendName) {
    case 'mock':
      return { healthy: true, details: { message: 'Mock backend always available' } };
    case 'openai-compatible': {
      const baseURL = process.env.OPENAI_BASE_URL || config.baseURL || 'https://api.openai.com/v1';
      const modelsUrl = `${baseURL}/models`;
      const apiCheck = await checkApiReachable(modelsUrl);
      const hasKey = !!(process.env.OPENAI_API_KEY || config.apiKey);
      return {
        healthy: apiCheck.reachable && hasKey,
        details: { apiReachable: apiCheck.reachable, apiUrl: baseURL, hasApiKey: hasKey, ...(apiCheck.error ? { error: apiCheck.error } : {}) }
      };
    }
    case 'codex': {
      const cmd = config.command || 'codex';
      const cliCheck = await checkCliAvailable(cmd);
      return { healthy: cliCheck.available, details: { cliAvailable: cliCheck.available, command: cmd, ...(cliCheck.error ? { error: cliCheck.error } : {}) } };
    }
    case 'claude-code': {
      const cmd = config.command || 'claude';
      const cliCheck = await checkCliAvailable(cmd);
      return { healthy: cliCheck.available, details: { cliAvailable: cliCheck.available, command: cmd, ...(cliCheck.error ? { error: cliCheck.error } : {}) } };
    }
    case 'opencode': {
      const cmd = config.command || 'opencode';
      const cliCheck = await checkCliAvailable(cmd);
      return { healthy: cliCheck.available, details: { cliAvailable: cliCheck.available, command: cmd, ...(cliCheck.error ? { error: cliCheck.error } : {}) } };
    }
    default:
      return { healthy: false, details: { error: `Unknown backend: ${backendName}` } };
  }
}

module.exports = { checkCliAvailable, checkApiReachable, checkBackendHealth };

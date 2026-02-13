/**
 * OpenAI-Compatible API Backend
 *
 * Calls a chat completions endpoint (local or remote) and converts the
 * response into the canonical JSONL trace format.
 *
 * Works with: LM Studio, Ollama, vLLM, text-generation-webui, OpenRouter,
 * or any other server that implements the OpenAI chat completions API.
 */

let _OpenAI = null;
function getOpenAI() {
  if (_OpenAI === null) {
    try { _OpenAI = require('openai'); } catch { _OpenAI = false; }
  }
  return _OpenAI || null;
}

/**
 * Load merged settings: runner.backends['openai-compatible'] ← llm defaults
 */
function resolveSettings(backendConfig, projectConfig) {
  const llm = projectConfig?.llm || {};
  return {
    apiKey:      process.env.OPENAI_API_KEY   || backendConfig.apiKey   || llm.apiKey   || 'no-key',
    baseURL:     process.env.OPENAI_BASE_URL  || backendConfig.baseURL  || llm.baseURL  || undefined,
    model:       process.env.OPENAI_MODEL     || backendConfig.model    || llm.model    || 'gpt-4o',
    temperature: backendConfig.temperature ?? llm.temperature ?? 0.7,
    maxTokens:   backendConfig.maxTokens   ?? llm.maxTokens   ?? 4096,
    timeout:     backendConfig.timeout     ?? llm.timeout     ?? 120000,
    systemPrompt: backendConfig.systemPrompt || 'You are an AI coding agent. Execute the user request and describe what tools you would use and what actions you would take. Respond in detail.'
  };
}

/**
 * Run a single prompt against the OpenAI-compatible API.
 * Returns { stdout, stderr, exitCode } where stdout is JSONL trace events.
 */
async function run(prompt, options = {}) {
  const { verbose = false, config = {}, projectConfig = {} } = options;
  const settings = resolveSettings(config, projectConfig);

  const OpenAI = getOpenAI();
  if (!OpenAI) {
    return errorTrace('openai package not installed. Run: npm install openai');
  }

  const clientOpts = { apiKey: settings.apiKey };
  if (settings.baseURL) clientOpts.baseURL = settings.baseURL;
  if (settings.timeout) clientOpts.timeout = settings.timeout;

  const client = new OpenAI(clientOpts);
  const threadId = 'openai-' + Date.now();
  const events = [];
  const ts = () => new Date().toISOString();

  events.push({ type: 'thread.started', thread_id: threadId, timestamp: ts() });
  events.push({ type: 'turn.started', timestamp: ts() });

  if (verbose) {
    console.error(`  [openai] model=${settings.model} baseURL=${settings.baseURL || '(default)'}`);
  }

  try {
    const response = await client.chat.completions.create({
      model: settings.model,
      messages: [
        { role: 'system', content: settings.systemPrompt },
        { role: 'user', content: prompt }
      ],
      temperature: settings.temperature,
      max_tokens: settings.maxTokens
    });

    // Check for API-level error
    if (response?.error) {
      const msg = typeof response.error === 'string'
        ? response.error
        : response.error.message || JSON.stringify(response.error);
      events.push({ type: 'error', message: `API error: ${msg}`, timestamp: ts() });
      events.push({ type: 'turn.failed', error: { message: msg }, timestamp: ts() });
    } else {
      const choice = response?.choices?.[0];
      const content = choice?.message?.content || choice?.message?.reasoning || '';
      const finishReason = choice?.finish_reason || 'unknown';

      // Emit a tool_call event to represent the agent's "action"
      events.push({
        type: 'tool_call',
        tool: 'chat_completion',
        input: { prompt: prompt.substring(0, 200), model: settings.model },
        timestamp: ts()
      });
      events.push({ type: 'tool_result', status: 'success', timestamp: ts() });

      // Emit the response as a message
      events.push({
        type: 'message',
        content: content,
        finish_reason: finishReason,
        model: response.model,
        usage: response.usage,
        timestamp: ts()
      });

      events.push({ type: 'turn.completed', timestamp: ts() });
    }
  } catch (err) {
    const msg = err.status ? `[HTTP ${err.status}] ${err.message}` : err.message;
    events.push({ type: 'error', message: msg, timestamp: ts() });
    events.push({ type: 'turn.failed', error: { message: msg }, timestamp: ts() });
  }

  const stdout = events.map(e => JSON.stringify(e)).join('\n');
  return { stdout, stderr: '', exitCode: events.some(e => e.type === 'turn.failed') ? 1 : 0 };
}

function errorTrace(message) {
  const ts = new Date().toISOString();
  const events = [
    { type: 'thread.started', thread_id: 'error-' + Date.now(), timestamp: ts },
    { type: 'turn.started', timestamp: ts },
    { type: 'error', message, timestamp: ts },
    { type: 'turn.failed', error: { message }, timestamp: ts }
  ];
  return {
    stdout: events.map(e => JSON.stringify(e)).join('\n'),
    stderr: message,
    exitCode: 1
  };
}

module.exports = { run, resolveSettings };

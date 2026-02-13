/**
 * OpenCode CLI Backend — runs prompts through the `opencode` CLI.
 *
 * Requires: `opencode` CLI installed.
 * Uses `opencode run --format json "<prompt>"` which produces JSONL natively.
 *
 * OpenCode event types:
 *   step_start  → thread.started + turn.started
 *   tool_use    → tool_call + tool_result
 *   text        → message
 *   step_finish → turn.completed  (when reason == "stop")
 *   error       → error + turn.failed
 */

const { spawnSync } = require('child_process');

function run(prompt, options = {}) {
  const { verbose = false, timeout = 300000, config = {} } = options;
  const command = config.command || 'opencode';
  const baseArgs = config.args || ['run', '--format', 'json'];

  const args = [...baseArgs, prompt];
  if (verbose) {
    console.error(`  [opencode] Running: ${command} run --format json "${prompt.substring(0, 80)}..."`);
  }

  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout,
    env: { ...process.env }
  });

  const stdout = normaliseOpenCodeTrace(result.stdout || '');

  return {
    stdout,
    stderr: result.stderr || '',
    exitCode: result.status ?? 1
  };
}

/**
 * Normalise OpenCode stream-json events into the canonical trace format.
 *
 * OpenCode emits:
 *   {"type":"step_start","sessionID":"ses_...","timestamp":...,"part":{...}}
 *   {"type":"tool_use","part":{"tool":"bash","state":{"status":"completed","input":{...},"output":"..."}}}
 *   {"type":"text","part":{"text":"..."}}
 *   {"type":"step_finish","part":{"reason":"stop","tokens":{...},"cost":...}}
 *   {"type":"error","error":{"name":"...","data":{"message":"..."}}}
 *
 * We map them to:
 *   thread.started, turn.started, tool_call, tool_result, message, turn.completed
 */
function normaliseOpenCodeTrace(raw) {
  if (!raw) return '';

  const lines = raw.split('\n').filter(l => l.trim());
  const normalised = [];
  let threadId = null;
  let turnStarted = false;

  for (const line of lines) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      normalised.push(line);
      continue;
    }

    // Already in canonical format? Pass through.
    if (['thread.started', 'turn.started', 'turn.completed', 'turn.failed',
         'tool_call', 'tool_result', 'message', 'error'].includes(event.type)) {
      normalised.push(line);
      continue;
    }

    const ts = event.timestamp
      ? new Date(event.timestamp).toISOString()
      : new Date().toISOString();

    // --- step_start ---
    if (event.type === 'step_start') {
      if (!threadId) {
        threadId = event.sessionID || 'opencode-' + Date.now();
        normalised.push(JSON.stringify({
          type: 'thread.started',
          thread_id: threadId,
          timestamp: ts
        }));
      }
      if (!turnStarted) {
        turnStarted = true;
        normalised.push(JSON.stringify({ type: 'turn.started', timestamp: ts }));
      }
      continue;
    }

    // Inject headers if we haven't seen step_start
    if (!threadId) {
      threadId = event.sessionID || 'opencode-' + Date.now();
      normalised.push(JSON.stringify({ type: 'thread.started', thread_id: threadId, timestamp: ts }));
    }
    if (!turnStarted) {
      turnStarted = true;
      normalised.push(JSON.stringify({ type: 'turn.started', timestamp: ts }));
    }

    // --- tool_use ---
    if (event.type === 'tool_use') {
      const part = event.part || {};
      const state = part.state || {};
      normalised.push(JSON.stringify({
        type: 'tool_call',
        tool: part.tool || 'unknown',
        input: state.input || {},
        id: part.callID || part.id,
        timestamp: state.time?.start ? new Date(state.time.start).toISOString() : ts
      }));
      normalised.push(JSON.stringify({
        type: 'tool_result',
        status: state.status === 'completed' ? 'success' : (state.status || 'unknown'),
        output: state.output,
        duration: (state.time?.end && state.time?.start) ? state.time.end - state.time.start : null,
        metadata: state.metadata,
        timestamp: state.time?.end ? new Date(state.time.end).toISOString() : ts
      }));
      continue;
    }

    // --- text ---
    if (event.type === 'text') {
      const part = event.part || {};
      normalised.push(JSON.stringify({
        type: 'message',
        content: part.text || '',
        timestamp: ts
      }));
      continue;
    }

    // --- step_finish ---
    if (event.type === 'step_finish') {
      const part = event.part || {};
      // Only emit turn.completed on final step (reason == "stop" or absent)
      if (!part.reason || part.reason === 'stop') {
        normalised.push(JSON.stringify({
          type: 'turn.completed',
          usage: part.tokens || null,
          cost: part.cost || null,
          timestamp: ts
        }));
        turnStarted = false; // Reset for possible next turn
      }
      // reason == "tool-calls" → intermediate step, skip
      continue;
    }

    // --- error ---
    if (event.type === 'error') {
      const errData = event.error || {};
      const msg = errData.data?.message || errData.name || JSON.stringify(errData);
      normalised.push(JSON.stringify({ type: 'error', message: msg, timestamp: ts }));
      normalised.push(JSON.stringify({ type: 'turn.failed', error: { message: msg }, timestamp: ts }));
      continue;
    }

    // Unknown event — pass through
    normalised.push(line);
  }

  // If turn was started but never completed, close it
  if (turnStarted) {
    normalised.push(JSON.stringify({ type: 'turn.completed', timestamp: new Date().toISOString() }));
  }

  return normalised.join('\n');
}

module.exports = { run, normaliseOpenCodeTrace };

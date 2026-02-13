/**
 * Claude Code CLI Backend — runs prompts through the `claude` CLI.
 *
 * Requires: `claude` CLI installed.
 * Uses `claude -p "<prompt>" --output-format stream-json` which produces JSONL natively.
 *
 * Claude Code's stream-json events are slightly different from the internal trace format
 * so we normalise them on-the-fly.
 */

const { spawnSync } = require('child_process');

function run(prompt, options = {}) {
  const { verbose = false, timeout = 300000, config = {} } = options;
  const command = config.command || 'claude';
  const baseArgs = config.args || ['-p', '--output-format', 'stream-json', '--verbose'];

  const args = [...baseArgs, prompt];
  if (verbose) {
    console.error(`  [claude-code] Running: ${command} ${args[0]} ... "${prompt.substring(0, 80)}..."`);
  }

  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout,
    env: { ...process.env }
  });

  const stdout = normaliseClaudeTrace(result.stdout || '');

  return {
    stdout,
    stderr: result.stderr || '',
    exitCode: result.status ?? 1
  };
}

/**
 * Normalise Claude Code stream-json events into the common trace format.
 *
 * Claude Code emits events like:
 *   {"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use",...}]}}
 *   {"type":"result","result":"...","session_id":"..."}
 *
 * We map them to the canonical format:
 *   thread.started, turn.started, tool_call, tool_result, message, turn.completed
 */
function normaliseClaudeTrace(raw) {
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
      // Keep unparseable lines as-is
      normalised.push(line);
      continue;
    }

    // Already in canonical format? Pass through.
    if (['thread.started', 'turn.started', 'turn.completed', 'turn.failed',
         'tool_call', 'tool_result', 'message', 'error'].includes(event.type)) {
      normalised.push(line);
      continue;
    }

    // Inject thread/turn headers on first event
    if (!threadId) {
      threadId = event.session_id || event.conversationId || 'claude-' + Date.now();
      normalised.push(JSON.stringify({ type: 'thread.started', thread_id: threadId, timestamp: new Date().toISOString() }));
    }
    if (!turnStarted) {
      turnStarted = true;
      normalised.push(JSON.stringify({ type: 'turn.started', timestamp: new Date().toISOString() }));
    }

    // Map Claude-specific event types
    const eventType = event.type;

    if (eventType === 'assistant' && event.message) {
      const contentBlocks = event.message.content || [];
      for (const block of contentBlocks) {
        if (block.type === 'tool_use') {
          normalised.push(JSON.stringify({
            type: 'tool_call',
            tool: block.name,
            input: block.input || {},
            id: block.id,
            timestamp: new Date().toISOString()
          }));
        } else if (block.type === 'text') {
          normalised.push(JSON.stringify({
            type: 'message',
            content: block.text,
            timestamp: new Date().toISOString()
          }));
        }
      }
    } else if (eventType === 'tool' || eventType === 'tool_result') {
      normalised.push(JSON.stringify({
        type: 'tool_result',
        status: event.is_error ? 'error' : 'success',
        content: event.content,
        tool_use_id: event.tool_use_id,
        timestamp: new Date().toISOString()
      }));
    } else if (eventType === 'result') {
      normalised.push(JSON.stringify({
        type: 'message',
        content: typeof event.result === 'string' ? event.result : JSON.stringify(event.result),
        timestamp: new Date().toISOString()
      }));
    } else if (eventType === 'error') {
      normalised.push(JSON.stringify({
        type: 'error',
        message: event.error?.message || event.message || JSON.stringify(event),
        timestamp: new Date().toISOString()
      }));
    } else {
      // Unknown event — pass through with original type
      normalised.push(line);
    }
  }

  // Close the turn
  if (turnStarted) {
    normalised.push(JSON.stringify({ type: 'turn.completed', timestamp: new Date().toISOString() }));
  }

  return normalised.join('\n');
}

module.exports = { run, normaliseClaudeTrace };

/**
 * Codex CLI Backend — runs prompts through the OpenAI Codex CLI agent.
 *
 * Requires: `codex` CLI installed and OPENAI_API_KEY configured.
 * Uses `codex exec --json` which emits a JSONL thread/turn/item event stream.
 *
 * Codex's event vocabulary (thread → turn → items) differs from the canonical
 * trace format, so we normalise it on-the-fly. Pointing codex at a non-OpenAI
 * OpenAI-compatible endpoint requires `wire_api = "responses"` in the provider
 * config and an endpoint that implements the Responses API.
 */

const { spawn } = require('child_process');
const { makeAgentWorkDir } = require('./workdir');

function run(prompt, options = {}) {
  const { verbose = false, timeout = 300000, config = {} } = options;
  const command = config.command || 'codex';
  const baseArgs = config.args || ['exec', '--json', '--skip-git-repo-check', '--sandbox', 'workspace-write'];

  const args = [...baseArgs, prompt];
  if (verbose) {
    console.error(`  [codex] Running: ${command} ${args.join(' ').substring(0, 120)}...`);
  }

  // Run the agent in an isolated empty directory (see workdir.js): keeps the
  // agent off the evaluation tool's own repo and contains any files it writes.
  const { workDir, cleanup } = makeAgentWorkDir('codex');

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env },
      cwd: workDir,
      // Close stdin: codex reads additional input from stdin and blocks when it
      // is an open pipe (the default), which hangs the run until the timeout.
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    const timer = setTimeout(() => {
      child.kill();
      cleanup();
      resolve({ stdout: normaliseCodexTrace(stdout), stderr, exitCode: 1 });
    }, timeout);

    child.on('close', (code) => {
      clearTimeout(timer);
      cleanup();
      resolve({ stdout: normaliseCodexTrace(stdout), stderr, exitCode: code ?? 1 });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      cleanup();
      resolve({ stdout: normaliseCodexTrace(stdout), stderr: stderr + err.message, exitCode: 1 });
    });
  });
}

/**
 * Normalise Codex `exec --json` events into the canonical trace format.
 *
 * Codex emits a thread/turn/item stream:
 *   {"type":"thread.started","thread_id":"..."}
 *   {"type":"turn.started"}
 *   {"type":"item.completed","item":{"type":"command_execution","command":"...","aggregated_output":"...","exit_code":0,"status":"completed"}}
 *   {"type":"item.completed","item":{"type":"agent_message","text":"..."}}
 *   {"type":"turn.completed","usage":{"input_tokens":...,"output_tokens":...}}
 *   {"type":"error","message":"..."}  /  {"type":"turn.failed","error":{"message":"..."}}
 *
 * We map them to:
 *   thread.started, turn.started, tool_call, tool_result, message, turn.completed, result, error
 *
 * `thread.started`/`turn.started` already carry canonical type names, so they
 * pass through. `turn.completed`/`turn.failed` are deliberately handled
 * explicitly (NOT in the passthrough set) so the derived token `result` and the
 * failure `error` events are emitted.
 */
function normaliseCodexTrace(raw) {
  if (!raw) return '';

  const lines = raw.split('\n').filter(l => l.trim());
  const normalised = [];
  let threadId = null;
  let turnStarted = false;

  const ensureHeaders = (event) => {
    if (!threadId) {
      threadId = event.thread_id || event.session_id || 'codex-' + Date.now();
      normalised.push(JSON.stringify({ type: 'thread.started', thread_id: threadId, timestamp: new Date().toISOString() }));
    }
    if (!turnStarted) {
      turnStarted = true;
      normalised.push(JSON.stringify({ type: 'turn.started', timestamp: new Date().toISOString() }));
    }
  };

  for (const line of lines) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      // codex interleaves non-JSON log lines (deprecation warnings, tracing) —
      // keep them as-is rather than dropping.
      normalised.push(line);
      continue;
    }

    const type = event.type;
    const ts = new Date().toISOString();

    // --- thread.started (already canonical) ---
    if (type === 'thread.started') {
      if (!threadId) {
        threadId = event.thread_id || event.session_id || 'codex-' + Date.now();
      }
      normalised.push(JSON.stringify({ type: 'thread.started', thread_id: threadId, timestamp: ts }));
      continue;
    }

    // --- turn.started (already canonical) ---
    if (type === 'turn.started') {
      turnStarted = true;
      normalised.push(JSON.stringify({ type: 'turn.started', timestamp: ts }));
      continue;
    }

    // --- turn.completed → canonical + derived token result ---
    if (type === 'turn.completed') {
      ensureHeaders(event);
      normalised.push(JSON.stringify({ type: 'turn.completed', timestamp: ts }));
      const usage = event.usage || {};
      normalised.push(JSON.stringify({
        type: 'result',
        input_tokens: usage.input_tokens || 0,
        output_tokens: usage.output_tokens || 0,
        cached_input_tokens: usage.cached_input_tokens || 0,
        timestamp: ts
      }));
      turnStarted = false;
      continue;
    }

    // --- turn.failed → pass through + error ---
    if (type === 'turn.failed') {
      ensureHeaders(event);
      const msg = event.error?.message || 'turn failed';
      normalised.push(JSON.stringify({ type: 'turn.failed', error: { message: msg }, timestamp: ts }));
      normalised.push(JSON.stringify({ type: 'error', message: msg, timestamp: ts }));
      turnStarted = false;
      continue;
    }

    // --- top-level error (already canonical) ---
    if (type === 'error') {
      ensureHeaders(event);
      normalised.push(JSON.stringify({ type: 'error', message: event.message || JSON.stringify(event), timestamp: ts }));
      continue;
    }

    // --- item.* events ---
    // Only item.completed carries the full item (command + output + status);
    // item.started/item.updated are partial precursors, skipped to avoid
    // emitting a tool_call twice for the same item.
    if (type === 'item.started' || type === 'item.updated') {
      ensureHeaders(event);
      continue;
    }
    if (type === 'item.completed') {
      ensureHeaders(event);
      const item = event.item || {};
      const itemType = item.type;

      if (itemType === 'command_execution') {
        normalised.push(JSON.stringify({
          type: 'tool_call',
          tool: 'command_execution',
          input: { command: item.command },
          id: item.id,
          timestamp: ts
        }));
        normalised.push(JSON.stringify({
          type: 'tool_result',
          status: (item.status === 'completed' && (item.exit_code == null || item.exit_code === 0)) ? 'success' : 'error',
          output: item.aggregated_output,
          exit_code: item.exit_code,
          tool_use_id: item.id,
          timestamp: ts
        }));
        continue;
      }

      if (itemType === 'mcp_tool_call') {
        normalised.push(JSON.stringify({
          type: 'tool_call',
          tool: item.tool || item.server || 'mcp_tool_call',
          input: item.arguments || {},
          id: item.id,
          timestamp: ts
        }));
        normalised.push(JSON.stringify({
          type: 'tool_result',
          status: item.error ? 'error' : 'success',
          output: item.error?.message || item.result,
          tool_use_id: item.id,
          timestamp: ts
        }));
        continue;
      }

      if (itemType === 'file_change') {
        normalised.push(JSON.stringify({
          type: 'tool_call',
          tool: 'file_change',
          input: { changes: item.changes },
          id: item.id,
          timestamp: ts
        }));
        continue;
      }

      if (itemType === 'agent_message' || itemType === 'reasoning') {
        normalised.push(JSON.stringify({ type: 'message', content: item.text || '', timestamp: ts }));
        continue;
      }

      if (itemType === 'error') {
        normalised.push(JSON.stringify({ type: 'error', message: item.message || 'item error', timestamp: ts }));
        continue;
      }

      // Unknown item type — pass through the original line.
      normalised.push(line);
      continue;
    }

    // Unknown event — pass through verbatim.
    normalised.push(line);
  }

  // Close an open turn if the stream ended mid-turn.
  if (turnStarted) {
    normalised.push(JSON.stringify({ type: 'turn.completed', timestamp: new Date().toISOString() }));
  }

  return normalised.join('\n');
}

module.exports = { run, normaliseCodexTrace };

/**
 * Mock Backend — produces synthetic trace events for testing the eval pipeline
 * without calling any real agent or API.
 */

function run(prompt, options = {}) {
  const threadId = 'mock-' + Date.now();
  const events = [
    { type: 'thread.started', thread_id: threadId, timestamp: new Date().toISOString() },
    { type: 'turn.started', timestamp: new Date().toISOString() },
    { type: 'tool_call', tool: 'bash', input: { command: `agent exec "${prompt.substring(0, 60)}..."` }, timestamp: new Date().toISOString() },
    { type: 'tool_result', status: 'success', timestamp: new Date().toISOString() },
    { type: 'message', content: `[mock] Task completed for prompt: ${prompt.substring(0, 80)}`, timestamp: new Date().toISOString() },
    { type: 'turn.completed', timestamp: new Date().toISOString() }
  ];

  const stdout = events.map(e => JSON.stringify(e)).join('\n');
  return { stdout, stderr: '', exitCode: 0 };
}

module.exports = { run };

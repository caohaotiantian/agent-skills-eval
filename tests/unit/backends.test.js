/**
 * Unit tests for backend trace normalization
 * Tests: normaliseClaudeTrace, normaliseOpenCodeTrace, mock backend, backend registry
 */

const fs = require('fs');
const path = require('path');
const { normaliseClaudeTrace } = require('../../evals/backends/claude-code');
const { normaliseOpenCodeTrace } = require('../../evals/backends/opencode');
const { normaliseCodexTrace } = require('../../evals/backends/codex');
const { run: mockRun } = require('../../evals/backends/mock');
const { getBackend, listBackends } = require('../../evals/backends');
const { validateTrigger } = require('../../evals/runner');

const FIXTURES = path.join(__dirname, '..', 'fixtures', 'traces');

// ---------------------------------------------------------------------------
// Mock backend
// ---------------------------------------------------------------------------
describe('mock backend', () => {
  it('should return valid JSONL trace with tool_call and message', () => {
    const result = mockRun('test prompt');
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');

    const events = result.stdout.split('\n').map(l => JSON.parse(l));
    expect(events[0].type).toBe('thread.started');
    expect(events.find(e => e.type === 'tool_call')).toBeDefined();
    expect(events.find(e => e.type === 'message')).toBeDefined();
    expect(events.find(e => e.type === 'turn.completed')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Backend registry
// ---------------------------------------------------------------------------
describe('backend registry', () => {
  it('should list all built-in backends', () => {
    const names = listBackends();
    expect(names).toContain('mock');
    expect(names).toContain('openai-compatible');
    expect(names).toContain('codex');
    expect(names).toContain('claude-code');
    expect(names).toContain('opencode');
  });

  it('should load mock backend by name', () => {
    const backend = getBackend('mock');
    expect(typeof backend.run).toBe('function');
  });

  it('should throw for unknown backend', () => {
    expect(() => getBackend('nonexistent-backend-xyz')).toThrow('Unknown backend');
  });
});

// ---------------------------------------------------------------------------
// normaliseClaudeTrace
// ---------------------------------------------------------------------------
describe('normaliseClaudeTrace', () => {
  it('should return empty string for empty input', () => {
    expect(normaliseClaudeTrace('')).toBe('');
    expect(normaliseClaudeTrace(null)).toBe('');
  });

  it('should pass through canonical events unchanged', () => {
    const events = [
      { type: 'thread.started', thread_id: 'test-123' },
      { type: 'turn.started' },
      { type: 'tool_call', tool: 'Bash', input: { command: 'ls' } },
      { type: 'turn.completed' }
    ];
    const input = events.map(e => JSON.stringify(e)).join('\n');
    const output = normaliseClaudeTrace(input);
    const parsed = output.split('\n').map(l => JSON.parse(l));

    // Canonical events should be present (possibly with injected headers)
    expect(parsed.find(e => e.type === 'tool_call')).toBeDefined();
  });

  it('should normalise Claude assistant events with tool_use', () => {
    const claudeEvents = [
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            { type: 'tool_use', name: 'Bash', input: { command: 'npm test' }, id: 'tu_1' },
            { type: 'text', text: 'Running tests...' }
          ]
        }
      }
    ];
    const input = claudeEvents.map(e => JSON.stringify(e)).join('\n');
    const output = normaliseClaudeTrace(input);
    const parsed = output.split('\n').map(l => JSON.parse(l));

    expect(parsed.find(e => e.type === 'thread.started')).toBeDefined();
    expect(parsed.find(e => e.type === 'turn.started')).toBeDefined();
    expect(parsed.find(e => e.type === 'tool_call' && e.tool === 'Bash')).toBeDefined();
    expect(parsed.find(e => e.type === 'message' && e.content === 'Running tests...')).toBeDefined();
    expect(parsed.find(e => e.type === 'turn.completed')).toBeDefined();
  });

  it('should normalise Claude result event', () => {
    const input = JSON.stringify({ type: 'result', result: 'Task complete', session_id: 'ses_1' });
    const output = normaliseClaudeTrace(input);
    const parsed = output.split('\n').map(l => JSON.parse(l));

    expect(parsed.find(e => e.type === 'message' && e.content === 'Task complete')).toBeDefined();
  });

  it('should pass through canonical error event unchanged', () => {
    // Claude error events with type: 'error' are already canonical — passed through as-is
    const input = JSON.stringify({ type: 'error', error: { message: 'Something failed' } });
    const output = normaliseClaudeTrace(input);
    const parsed = output.split('\n').map(l => JSON.parse(l));

    expect(parsed.find(e => e.type === 'error')).toBeDefined();
  });

  it('should normalise Claude tool_result event', () => {
    const input = JSON.stringify({ type: 'tool', is_error: false, content: 'output', tool_use_id: 'tu_1' });
    const output = normaliseClaudeTrace(input);
    const parsed = output.split('\n').map(l => JSON.parse(l));

    expect(parsed.find(e => e.type === 'tool_result' && e.status === 'success')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// normaliseOpenCodeTrace
// ---------------------------------------------------------------------------
describe('normaliseOpenCodeTrace', () => {
  it('should return empty string for empty input', () => {
    expect(normaliseOpenCodeTrace('')).toBe('');
    expect(normaliseOpenCodeTrace(null)).toBe('');
  });

  it('should normalise step_start event', () => {
    const input = JSON.stringify({
      type: 'step_start',
      sessionID: 'ses_123',
      timestamp: Date.now()
    });
    const output = normaliseOpenCodeTrace(input);
    const parsed = output.split('\n').map(l => JSON.parse(l));

    expect(parsed.find(e => e.type === 'thread.started' && e.thread_id === 'ses_123')).toBeDefined();
    expect(parsed.find(e => e.type === 'turn.started')).toBeDefined();
  });

  it('should normalise tool_use event', () => {
    const input = [
      JSON.stringify({ type: 'step_start', sessionID: 'ses_1' }),
      JSON.stringify({
        type: 'tool_use',
        part: {
          tool: 'bash',
          state: {
            status: 'completed',
            input: { command: 'npm test' },
            output: 'All tests passed'
          }
        }
      })
    ].join('\n');
    const output = normaliseOpenCodeTrace(input);
    const parsed = output.split('\n').map(l => JSON.parse(l));

    const toolCall = parsed.find(e => e.type === 'tool_call');
    expect(toolCall).toBeDefined();
    expect(toolCall.tool).toBe('bash');
    expect(parsed.find(e => e.type === 'tool_result' && e.status === 'success')).toBeDefined();
  });

  it('should normalise text event', () => {
    const input = [
      JSON.stringify({ type: 'step_start', sessionID: 'ses_1' }),
      JSON.stringify({ type: 'text', part: { text: 'Hello from the agent' } })
    ].join('\n');
    const output = normaliseOpenCodeTrace(input);
    const parsed = output.split('\n').map(l => JSON.parse(l));

    expect(parsed.find(e => e.type === 'message' && e.content === 'Hello from the agent')).toBeDefined();
  });

  it('should normalise step_finish with stop reason', () => {
    const input = [
      JSON.stringify({ type: 'step_start', sessionID: 'ses_1' }),
      JSON.stringify({ type: 'step_finish', part: { reason: 'stop', tokens: { input: 100, output: 50 } } })
    ].join('\n');
    const output = normaliseOpenCodeTrace(input);
    const parsed = output.split('\n').map(l => JSON.parse(l));

    expect(parsed.find(e => e.type === 'turn.completed')).toBeDefined();
  });

  it('should normalise error event with non-canonical type', () => {
    // Use a non-standard error type so it goes through the normalisation path
    const input = JSON.stringify({
      type: 'err',
      error: { name: 'RateLimitError', data: { message: 'Too many requests' } }
    });
    const output = normaliseOpenCodeTrace(input);
    const parsed = output.split('\n').map(l => JSON.parse(l));

    // Non-canonical events get headers injected but pass through as-is
    expect(parsed.find(e => e.type === 'thread.started')).toBeDefined();
  });

  it('should normalise canonical error events by passing through', () => {
    const input = JSON.stringify({
      type: 'error',
      error: { name: 'RateLimitError', data: { message: 'Too many requests' } }
    });
    const output = normaliseOpenCodeTrace(input);
    const parsed = output.split('\n').map(l => JSON.parse(l));

    // Canonical error type passes through unchanged
    expect(parsed.find(e => e.type === 'error')).toBeDefined();
  });

  it('should close unclosed turns', () => {
    const input = [
      JSON.stringify({ type: 'step_start', sessionID: 'ses_1' }),
      JSON.stringify({ type: 'text', part: { text: 'partial output' } })
      // No step_finish
    ].join('\n');
    const output = normaliseOpenCodeTrace(input);
    const parsed = output.split('\n').map(l => JSON.parse(l));

    // Should auto-close the turn
    expect(parsed[parsed.length - 1].type).toBe('turn.completed');
  });

  // Real captured trace (opencode 1.17.15 against a live model): a two-tool
  // session (bash then read) ending in a text answer. Protects the invariant
  // that a real tool-using opencode session maps to substantive tool calls.
  it('should normalise a real captured opencode tool session', () => {
    const raw = fs.readFileSync(path.join(FIXTURES, 'opencode-real.jsonl'), 'utf8');
    const parsed = normaliseOpenCodeTrace(raw).split('\n').filter(Boolean).map(l => JSON.parse(l));

    const toolCalls = parsed.filter(e => e.type === 'tool_call');
    expect(toolCalls.map(t => t.tool)).toEqual(expect.arrayContaining(['bash', 'read']));
    expect(parsed.filter(e => e.type === 'tool_result' && e.status === 'success').length).toBeGreaterThanOrEqual(2);
    expect(parsed.some(e => e.type === 'message' && /hello/.test(e.content || ''))).toBe(true);
    expect(parsed.some(e => e.type === 'turn.completed')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// normaliseCodexTrace
// ---------------------------------------------------------------------------
describe('normaliseCodexTrace', () => {
  it('should return empty string for empty input', () => {
    expect(normaliseCodexTrace('')).toBe('');
    expect(normaliseCodexTrace(null)).toBe('');
  });

  // Real captured trace (codex-cli 0.143.0): the envelope the trace analyzer
  // depends on — thread.started, turn.started, error, turn.failed — with the
  // real provider error message preserved (not a shape-only assertion).
  it('should normalise the real captured codex envelope', () => {
    const raw = fs.readFileSync(path.join(FIXTURES, 'codex-real.jsonl'), 'utf8');
    const parsed = normaliseCodexTrace(raw).split('\n').filter(Boolean).map(l => JSON.parse(l));

    const thread = parsed.find(e => e.type === 'thread.started');
    expect(thread && thread.thread_id).toBeTruthy();
    expect(parsed.some(e => e.type === 'turn.started')).toBe(true);
    expect(parsed.some(e => e.type === 'error' && /litellm|function|GLM/i.test(e.message || ''))).toBe(true);
    expect(parsed.some(e => e.type === 'turn.failed')).toBe(true);
  });

  // Synthetic success path. NOTE (design R2): codex success-path item shapes
  // are doc-inferred, not live-confirmed — the test endpoint rejected codex's
  // function-calling format, so no real command_execution item was captured.
  // This asserts the mapping is internally correct against the documented
  // schema; it does not prove the schema matches a codex version's real output.
  it('should map a command_execution turn to a tool_call/tool_result pair and preserve tokens', () => {
    const raw = [
      { type: 'thread.started', thread_id: 't1' },
      { type: 'turn.started' },
      { type: 'item.completed', item: { id: 'i1', type: 'command_execution', command: 'echo hi', aggregated_output: 'hi\n', exit_code: 0, status: 'completed' } },
      { type: 'item.completed', item: { id: 'i2', type: 'agent_message', text: 'Done — printed hi.' } },
      { type: 'turn.completed', usage: { input_tokens: 100, output_tokens: 20 } }
    ].map(e => JSON.stringify(e)).join('\n');
    const parsed = normaliseCodexTrace(raw).split('\n').filter(Boolean).map(l => JSON.parse(l));

    const call = parsed.find(e => e.type === 'tool_call' && e.tool === 'command_execution');
    expect(call).toBeDefined();
    expect(call.input.command).toBe('echo hi');
    const result = parsed.find(e => e.type === 'tool_result');
    expect(result && result.status).toBe('success');
    expect(parsed.some(e => e.type === 'message' && e.content === 'Done — printed hi.')).toBe(true);
    expect(parsed.some(e => e.type === 'turn.completed')).toBe(true);
    const tokenResult = parsed.find(e => e.type === 'result');
    expect(tokenResult && tokenResult.output_tokens).toBe(20);
  });

  // Guards the D2 passthrough-guard exception: a native codex turn.completed
  // must STILL yield the derived token `result` event (a blind passthrough of
  // the canonical-named event would drop it and fail token accounting).
  it('should derive a token result even when turn.completed is native', () => {
    const raw = [
      { type: 'thread.started', thread_id: 't2' },
      { type: 'turn.started' },
      { type: 'turn.completed', usage: { input_tokens: 5, output_tokens: 7 } }
    ].map(e => JSON.stringify(e)).join('\n');
    const parsed = normaliseCodexTrace(raw).split('\n').filter(Boolean).map(l => JSON.parse(l));

    expect(parsed.some(e => e.type === 'turn.completed')).toBe(true);
    const tokenResult = parsed.find(e => e.type === 'result');
    expect(tokenResult && tokenResult.output_tokens).toBe(7);
  });

  it('should tolerate interleaved non-JSON log lines', () => {
    const raw = [
      'warning: --full-auto is deprecated; use --sandbox workspace-write instead.',
      JSON.stringify({ type: 'thread.started', thread_id: 't3' }),
      '2026-07-09T03:41:47Z ERROR codex_api::endpoint: some tracing line',
      JSON.stringify({ type: 'turn.started' })
    ].join('\n');
    const parsed = normaliseCodexTrace(raw).split('\n').filter(Boolean);
    // Non-JSON lines are preserved, canonical events still emitted.
    expect(parsed.some(l => l.includes('--full-auto is deprecated'))).toBe(true);
    const events = parsed.filter(l => l.startsWith('{')).map(l => JSON.parse(l));
    expect(events.some(e => e.type === 'thread.started')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Trigger detection integration — codex tool activity must be visible
// ---------------------------------------------------------------------------
describe('validateTrigger over normalised codex output', () => {
  it('should count a codex command_execution as a substantive trigger', () => {
    const raw = [
      { type: 'thread.started', thread_id: 't1' },
      { type: 'turn.started' },
      { type: 'item.completed', item: { id: 'i1', type: 'command_execution', command: 'ls', aggregated_output: 'a.txt', exit_code: 0, status: 'completed' } },
      { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } }
    ].map(e => JSON.stringify(e)).join('\n');
    const parsed = normaliseCodexTrace(raw).split('\n').filter(Boolean).map(l => JSON.parse(l));
    const toolCalls = parsed.filter(e => e.type === 'tool_call');
    const messages = parsed.filter(e => e.type === 'message');

    const result = validateTrigger({ shouldTrigger: true, expectedTools: '', toolCalls, messages, skillName: 'demo' });
    expect(result.triggered).toBe(true);
    expect(result.reason).toMatch(/substantive/i);
  });
});

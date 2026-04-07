/**
 * Unit tests for backend trace normalization
 * Tests: normaliseClaudeTrace, normaliseOpenCodeTrace, mock backend, backend registry
 */

const { normaliseClaudeTrace } = require('../../evals/backends/claude-code');
const { normaliseOpenCodeTrace } = require('../../evals/backends/opencode');
const { run: mockRun } = require('../../evals/backends/mock');
const { getBackend, listBackends } = require('../../evals/backends');

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
});

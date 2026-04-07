const { isToolCall } = require('../../lib/tracing/parser');

describe('isToolCall precision', () => {
  it('should identify tool_call events', () => {
    expect(isToolCall({ type: 'tool_call', tool: 'Bash' })).toBe(true);
  });

  it('should identify events with tool field', () => {
    expect(isToolCall({ type: 'something', tool: 'Read' })).toBe(true);
  });

  it('should NOT classify message events with name field as tool calls', () => {
    expect(isToolCall({ type: 'message', name: 'assistant', content: 'hello' })).toBe(false);
  });

  it('should NOT classify system events with name field as tool calls', () => {
    expect(isToolCall({ type: 'system', name: 'init' })).toBe(false);
  });

  it('should identify command_execution events', () => {
    expect(isToolCall({ type: 'command_execution', command: 'ls' })).toBe(true);
  });
});

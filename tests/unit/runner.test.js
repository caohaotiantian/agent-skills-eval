/**
 * Unit tests for evals/runner.js
 * Covers: validateTrigger, loadPrompts, parseCSVLine, evaluateRubric, runDeterministicChecks
 */

const path = require('path');
const fs = require('fs-extra');
const { validateTrigger, parseCSVLine, evaluateRubric, loadPrompts, runDeterministicChecks } = require('../../evals/runner');

// ---------------------------------------------------------------------------
// parseCSVLine
// ---------------------------------------------------------------------------
describe('parseCSVLine', () => {
  it('should parse simple comma-separated values', () => {
    expect(parseCSVLine('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('should handle quoted fields with commas', () => {
    expect(parseCSVLine('id,"hello, world",true')).toEqual(['id', 'hello, world', 'true']);
  });

  it('should handle escaped quotes inside quoted fields', () => {
    expect(parseCSVLine('"say ""hello""",value')).toEqual(['say "hello"', 'value']);
  });

  it('should handle empty fields', () => {
    expect(parseCSVLine('a,,c')).toEqual(['a', '', 'c']);
  });

  it('should trim whitespace from values', () => {
    expect(parseCSVLine(' a , b , c ')).toEqual(['a', 'b', 'c']);
  });
});

// ---------------------------------------------------------------------------
// validateTrigger
// ---------------------------------------------------------------------------
describe('validateTrigger', () => {
  describe('when shouldTrigger is true', () => {
    it('should pass when expected tools match tool calls', () => {
      const result = validateTrigger({
        shouldTrigger: true,
        expectedTools: 'bash,Write',
        toolCalls: [{ tool: 'Bash' }, { tool: 'Write' }],
        messages: []
      });
      expect(result.triggered).toBe(true);
      expect(result.reason).toContain('Expected tools matched');
    });

    it('should pass with substantive tools even when expected tools not found', () => {
      const result = validateTrigger({
        shouldTrigger: true,
        expectedTools: 'Read',
        toolCalls: [{ tool: 'Edit' }, { tool: 'Grep' }],
        messages: []
      });
      expect(result.triggered).toBe(true);
      expect(result.reason).toContain('not found, but agent used');
    });

    it('should fail when expected tools not called and no substantive work', () => {
      const result = validateTrigger({
        shouldTrigger: true,
        expectedTools: 'Write',
        toolCalls: [{ tool: 'AskUserQuestion' }],
        messages: []
      });
      expect(result.triggered).toBe(false);
      expect(result.reason).toContain('were not called');
    });

    it('should use heuristic when no expected tools defined', () => {
      const result = validateTrigger({
        shouldTrigger: true,
        expectedTools: '',
        toolCalls: [{ tool: 'Bash' }],
        messages: []
      });
      expect(result.triggered).toBe(true);
      expect(result.reason).toContain('substantive tool call');
    });

    it('should detect trigger from substantive message content', () => {
      const result = validateTrigger({
        shouldTrigger: true,
        expectedTools: '',
        toolCalls: [],
        messages: [{ content: 'Here is a detailed implementation plan with specific steps and code examples that covers your request thoroughly.' }]
      });
      expect(result.triggered).toBe(true);
      expect(result.reason).toContain('substantive response');
    });

    it('should fail when only clarification tools and short messages', () => {
      const result = validateTrigger({
        shouldTrigger: true,
        expectedTools: '',
        toolCalls: [{ tool: 'AskUserQuestion' }, { tool: 'chat_completion' }],
        messages: [{ content: 'Can you clarify?' }]
      });
      expect(result.triggered).toBe(false);
      expect(result.reason).toContain('No substantive tool calls');
    });

    it('should filter clarification tools from substantive count', () => {
      const result = validateTrigger({
        shouldTrigger: true,
        expectedTools: '',
        toolCalls: [
          { tool: 'AskUserQuestion' },
          { tool: 'EnterPlanMode' },
          { tool: 'Skill' }, // no input.skill — treated as clarifying sub-skill call
          { tool: 'chat_completion' }
        ],
        messages: []
      });
      expect(result.triggered).toBe(false);
    });

    it('should treat Skill self-invocation as a definitive trigger', () => {
      const result = validateTrigger({
        shouldTrigger: true,
        expectedTools: ['bash'],
        skillName: 'skill-creator',
        toolCalls: [
          { tool: 'Skill', input: { skill: 'skill-creator', args: 'optimize a skill' } }
        ],
        messages: []
      });
      expect(result.triggered).toBe(true);
      expect(result.reason).toContain('skill-creator');
    });

    it('should ignore Skill calls targeting a different skill', () => {
      const result = validateTrigger({
        shouldTrigger: true,
        expectedTools: '',
        skillName: 'skill-creator',
        toolCalls: [
          { tool: 'Skill', input: { skill: 'some-other-skill' } }
        ],
        messages: []
      });
      expect(result.triggered).toBe(false);
    });

    it('should handle expected_tools as array', () => {
      const result = validateTrigger({
        shouldTrigger: true,
        expectedTools: ['bash', 'write'],
        toolCalls: [{ tool: 'Bash' }],
        messages: []
      });
      expect(result.triggered).toBe(true);
    });
  });

  describe('when shouldTrigger is false', () => {
    it('should pass when no substantive tools called', () => {
      const result = validateTrigger({
        shouldTrigger: false,
        expectedTools: '',
        toolCalls: [{ tool: 'AskUserQuestion' }],
        messages: []
      });
      expect(result.triggered).toBe(false);
      expect(result.reason).toContain('correctly not triggered');
    });

    it('should fail when substantive tools are called', () => {
      const result = validateTrigger({
        shouldTrigger: false,
        expectedTools: '',
        toolCalls: [{ tool: 'Bash' }, { tool: 'Write' }],
        messages: []
      });
      expect(result.triggered).toBe(true);
      expect(result.reason).toContain('unexpectedly triggered');
    });
  });

  // -------------------------------------------------------------------------
  // Plugin-style skills with available_skills: Skill({skill: "<sub>"}) where
  // <sub> is a declared sub-skill must count as a strong direct-invocation
  // signal, not be filtered out as "calling a different skill".
  // -------------------------------------------------------------------------
  describe('Skill({skill: "<sub>"}) with sub-skill in expected_tools', () => {
    it('treats Skill call targeting a declared sub-skill as the strong invocation signal', () => {
      const result = validateTrigger({
        shouldTrigger: true,
        expectedTools: 'Skill,create-cli-tool,write-file,run-tests',
        toolCalls: [{ tool: 'Skill', input: { skill: 'create-cli-tool' } }],
        messages: [],
        skillName: 'coding-agent'
      });
      expect(result.triggered).toBe(true);
      // Strong-signal path produces this specific phrasing (short-circuits
      // the generic "expected tools matched" branch).
      expect(result.reason).toMatch(/invoked directly via Skill/i);
      expect(result.reason).toContain('create-cli-tool');
    });

    it('still recognizes parent-skill self-invocation Skill({skill: "<this>"})', () => {
      const result = validateTrigger({
        shouldTrigger: true,
        expectedTools: 'Skill',
        toolCalls: [{ tool: 'Skill', input: { skill: 'coding-agent' } }],
        messages: [],
        skillName: 'coding-agent'
      });
      expect(result.triggered).toBe(true);
      expect(result.reason).toMatch(/invoked directly via Skill/i);
    });

    it('does NOT promote Skill({skill: "<unrelated>"}) to substantive when target is not in expected_tools', () => {
      // The agent reached for an entirely different skill — no Skill() target
      // matches expected, no other tool was used. Should report not triggered.
      const result = validateTrigger({
        shouldTrigger: true,
        expectedTools: 'Skill,create-cli-tool',
        toolCalls: [{ tool: 'Skill', input: { skill: 'some-other-skill' } }],
        messages: [],
        skillName: 'coding-agent'
      });
      expect(result.triggered).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// evaluateRubric
// ---------------------------------------------------------------------------
describe('evaluateRubric', () => {
  it('should return null when rubric has no checks', () => {
    expect(evaluateRubric(null, [], [])).toBeNull();
    expect(evaluateRubric({}, [], [])).toBeNull();
  });

  it('should evaluate tool_called check', () => {
    const rubric = {
      checks: [
        { type: 'tool_called', tool: 'Bash', description: 'Used bash', required: true }
      ]
    };
    const events = [{ type: 'tool_call', tool: 'Bash', input: {} }];
    const result = evaluateRubric(rubric, events, []);
    expect(result.passed).toBe(true);
    expect(result.checks[0].passed).toBe(true);
  });

  it('should evaluate max_tool_calls check', () => {
    const rubric = {
      checks: [
        { type: 'max_tool_calls', value: 2, description: 'Max 2 calls', required: true }
      ]
    };
    const events = [
      { type: 'tool_call', tool: 'Read' },
      { type: 'tool_call', tool: 'Write' },
      { type: 'tool_call', tool: 'Edit' }
    ];
    const result = evaluateRubric(rubric, events, []);
    expect(result.passed).toBe(false);
    expect(result.checks[0].passed).toBe(false);
  });

  it('should evaluate output_contains check', () => {
    const rubric = {
      checks: [
        { type: 'output_contains', pattern: 'hello\\s+world', description: 'Contains hello world' }
      ]
    };
    const messages = [{ content: 'I wrote hello world for you' }];
    const result = evaluateRubric(rubric, [], messages);
    expect(result.checks[0].passed).toBe(true);
  });

  it('should compute score as percentage of passed checks', () => {
    const rubric = {
      checks: [
        { type: 'tool_called', tool: 'Bash', description: 'Used bash' },
        { type: 'tool_called', tool: 'Write', description: 'Used write' }
      ]
    };
    const events = [{ type: 'tool_call', tool: 'Bash' }];
    const result = evaluateRubric(rubric, events, []);
    expect(result.score).toBe(50);
  });

  it('should only require required checks for overall pass', () => {
    const rubric = {
      checks: [
        { type: 'tool_called', tool: 'Bash', description: 'Used bash', required: true },
        { type: 'tool_called', tool: 'Write', description: 'Used write', required: false }
      ]
    };
    const events = [{ type: 'tool_call', tool: 'Bash' }];
    const result = evaluateRubric(rubric, events, []);
    expect(result.passed).toBe(true); // Only required check passed
    expect(result.score).toBe(50); // But score reflects both
  });
});

// ---------------------------------------------------------------------------
// loadPrompts
// ---------------------------------------------------------------------------
describe('loadPrompts', () => {
  const tmpDir = path.join(__dirname, 'tmp-runner-test');

  beforeAll(async () => {
    await fs.ensureDir(tmpDir);
    // Temporarily override getPaths to use our tmp dir
  });

  afterAll(async () => {
    await fs.remove(tmpDir);
  });

  it('should return null when no prompts file exists', () => {
    // loadPrompts looks in getPaths().prompts which won't have our fake skill
    const result = loadPrompts('nonexistent-skill-xyz-12345');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// runDeterministicChecks
// ---------------------------------------------------------------------------
describe('runDeterministicChecks', () => {
  it('should pass command check when pattern matches', () => {
    const events = [
      { type: 'tool_call', tool: 'bash', input: { command: 'npm test' } }
    ];
    const checks = [{ type: 'command', name: 'runs npm test', pattern: 'npm test' }];
    const results = runDeterministicChecks(events, checks);
    expect(results[0].passed).toBe(true);
  });

  it('should fail command check when pattern not found', () => {
    const events = [
      { type: 'tool_call', tool: 'bash', input: { command: 'npm install' } }
    ];
    const checks = [{ type: 'command', name: 'runs npm test', pattern: 'npm test' }];
    const results = runDeterministicChecks(events, checks);
    expect(results[0].passed).toBe(false);
  });

  it('should pass threshold check when command count is below value', () => {
    const events = [
      { type: 'tool_call', tool: 'bash', input: { command: 'ls' } },
      { type: 'tool_call', tool: 'bash', input: { command: 'pwd' } }
    ];
    const checks = [{ type: 'threshold', name: 'few commands', value: 5 }];
    const results = runDeterministicChecks(events, checks);
    expect(results[0].passed).toBe(true);
  });

  it('should handle empty checks array', () => {
    const results = runDeterministicChecks([], []);
    expect(results).toEqual([]);
  });
});

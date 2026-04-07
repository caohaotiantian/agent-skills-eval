const path = require('path');
const { analyzeSkill } = require('../../lib/skills/generating/analyzer');
const { TraceAnalyzer } = require('../../lib/tracing/analyzer');

describe('Skill Analyzer', () => {
  describe('analyzeSkill', () => {
    it('should extract basic skill info from SKILL.md', async () => {
      const skillPath = path.join(__dirname, '../fixtures/coding-agent');
      const result = await analyzeSkill(skillPath);

      expect(result.name).toBe('coding-agent');
      expect(result.description).toBeDefined();
      expect(result.frontmatter).toBeDefined();
    });

    it('should extract available skills with triggers', async () => {
      const skillPath = path.join(__dirname, '../fixtures/coding-agent');
      const result = await analyzeSkill(skillPath);

      expect(result.availableSkills).toBeInstanceOf(Array);
      expect(result.availableSkills[0]).toHaveProperty('name');
      expect(result.availableSkills[0]).toHaveProperty('triggers');
      expect(result.availableSkills[0]).toHaveProperty('description');
    });

    it('should extract implementation patterns', async () => {
      const skillPath = path.join(__dirname, '../fixtures/coding-agent');
      const result = await analyzeSkill(skillPath);

      expect(result.implementation).toHaveProperty('tools');
      expect(result.implementation).toHaveProperty('fileOperations');
      expect(result.implementation).toHaveProperty('securityPatterns');
    });
  });
});

describe('improved thrashing detection', () => {
  it('should detect near-identical consecutive commands', () => {
    const analyzer = new TraceAnalyzer('test');
    analyzer.commandSequence = [
      { command: 'grep "error" file.js' },
      { command: 'grep "Error" file.js' },
      { command: 'grep "ERROR" file.js' },
      { command: 'grep "error" file.js' }
    ];
    const result = analyzer.detectThrashing();
    expect(result.isThrashing).toBe(true);
  });

  it('should detect oscillating command patterns', () => {
    const analyzer = new TraceAnalyzer('test');
    analyzer.commandSequence = [
      { command: 'npm test' },
      { command: 'vim src/index.js' },
      { command: 'npm test' },
      { command: 'vim src/index.js' },
      { command: 'npm test' },
      { command: 'vim src/index.js' }
    ];
    const result = analyzer.detectThrashing();
    expect(result.isThrashing).toBe(true);
    expect(result.reason).toContain('scillat');
  });

  it('should not flag diverse sequential commands', () => {
    const analyzer = new TraceAnalyzer('test');
    analyzer.commandSequence = [
      { command: 'npm install' },
      { command: 'npm test' },
      { command: 'git add .' },
      { command: 'git commit -m "done"' }
    ];
    const result = analyzer.detectThrashing();
    expect(result.isThrashing).toBe(false);
  });
});

describe('determinism check precision', () => {
  it('should NOT flag events mentioning "random" in file names', () => {
    const analyzer = new TraceAnalyzer('test');
    const events = [
      { type: 'tool_call', tool: 'Read', input: { file_path: '/src/random_data.txt' }, timestamp: '2026-01-01T00:00:00Z' },
      { type: 'tool_result', output: 'data', timestamp: '2026-01-01T00:00:01Z' }
    ];
    analyzer.analyze(events);
    expect(analyzer.determinism.isDeterministic).toBe(true);
  });

  it('should NOT flag message events mentioning "date"', () => {
    const analyzer = new TraceAnalyzer('test');
    const events = [
      { type: 'message', content: 'Format the date as YYYY-MM-DD', timestamp: '2026-01-01T00:00:00Z' },
      { type: 'tool_result', output: 'done', timestamp: '2026-01-01T00:00:01Z' }
    ];
    analyzer.analyze(events);
    expect(analyzer.determinism.isDeterministic).toBe(true);
  });

  it('should flag Math.random() in tool call commands', () => {
    const analyzer = new TraceAnalyzer('test');
    const events = [
      { type: 'tool_call', tool: 'Bash', input: { command: 'node -e "console.log(Math.random())"' }, timestamp: '2026-01-01T00:00:00Z' },
      { type: 'tool_result', output: '0.42', timestamp: '2026-01-01T00:00:01Z' }
    ];
    analyzer.analyze(events);
    expect(analyzer.determinism.isDeterministic).toBe(false);
  });
});

const path = require('path');
const { loadYAMLRules } = require('../../../lib/validation/engine/rule-loader');
const { ScanEngine } = require('../../../lib/validation/engine');
const { calculateCVSS } = require('../../../lib/validation/engine/cvss');

const PROSE_RULES = path.join(__dirname, '..', '..', 'fixtures', 'prose-scan-rules.yaml');
const PROSE_PROBE_DIR = path.join(__dirname, '..', '..', 'fixtures', 'skillspector', '_prose-probe', 'positive');
const PROMPT_PROBE_DIR = path.join(__dirname, '..', '..', 'fixtures', 'skillspector', '_prompt-injection');

describe('loader markdownScan propagation', () => {
  it('attaches markdownScan === "prose" to rules in a prose-flagged category', () => {
    const { rules } = loadYAMLRules(PROSE_RULES);
    const proseRule = rules.find(r => r.id === 'PROSE001');
    expect(proseRule).toBeDefined();
    expect(proseRule.markdownScan).toBe('prose');
  });

  it('leaves markdownScan undefined for rules in a flag-less category', () => {
    const { rules } = loadYAMLRules(PROSE_RULES);
    const codeRule = rules.find(r => r.id === 'CODEONLY001');
    expect(codeRule).toBeDefined();
    expect(codeRule.markdownScan).toBeUndefined();
  });
});

describe('engine prose scan ON', () => {
  it('fires a prose-flagged rule on a SKILL.md prose line outside any code fence', async () => {
    const engine = new ScanEngine({ rulesFile: PROSE_RULES });
    const result = await engine.scan(PROSE_PROBE_DIR);
    const hits = result.findings.filter(f => f.ruleId === 'PROSE001');
    expect(hits.length).toBeGreaterThanOrEqual(1);
  });
});

describe('engine prose scan OFF (regression AC5)', () => {
  it('does NOT match a flag-less rule on the same phrase in markdown prose', async () => {
    const engine = new ScanEngine({ rulesFile: PROSE_RULES });
    const result = await engine.scan(PROSE_PROBE_DIR);
    const hits = result.findings.filter(f => f.ruleId === 'CODEONLY001');
    expect(hits.length).toBe(0);
  });

  it('the real PROMPT_INJECTION ruleset still matches an injection phrase in SKILL.md prose', async () => {
    const engine = new ScanEngine({});
    const result = await engine.scan(PROMPT_PROBE_DIR);
    const hits = result.findings.filter(f => f.category === 'PROMPT_INJECTION');
    expect(hits.length).toBeGreaterThanOrEqual(1);
  });
});

describe('CVSS vectors for the 8 new categories (AC3-unit)', () => {
  const HIGH = ['ANTI_REFUSAL', 'OUTPUT_HANDLING', 'SYSTEM_PROMPT_LEAKAGE', 'MEMORY_POISONING', 'ROGUE_AGENT', 'AGENT_SNOOPING'];
  const MEDIUM = ['EXCESSIVE_AGENCY', 'TOOL_MISUSE'];

  for (const id of [...HIGH, ...MEDIUM]) {
    it(`returns a non-null CVSS template for ${id} at confidence 90`, () => {
      const cvss = calculateCVSS(id, 90);
      expect(cvss).not.toBeNull();
      expect(cvss.vector).toMatch(/^CVSS:3\.1\//);
      expect(typeof cvss.adjustedScore).toBe('number');
    });
  }

  for (const id of HIGH) {
    it(`rates ${id} HIGH at confidence 90`, () => {
      expect(calculateCVSS(id, 90).severityRating).toBe('HIGH');
    });
  }

  for (const id of MEDIUM) {
    it(`rates ${id} MEDIUM at confidence 90`, () => {
      expect(calculateCVSS(id, 90).severityRating).toBe('MEDIUM');
    });
  }
});

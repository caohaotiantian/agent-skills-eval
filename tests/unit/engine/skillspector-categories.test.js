const path = require('path');
const { ScanEngine } = require('../../../lib/validation/engine');

const FIXTURE_ROOT = path.join(__dirname, '..', '..', 'fixtures', 'skillspector');

function fixtureDir(kebab, kind) {
  return path.join(FIXTURE_ROOT, kebab, kind);
}

async function scanCategory(kebab, kind) {
  const engine = new ScanEngine({});
  return engine.scan(fixtureDir(kebab, kind));
}

const CATEGORIES = [
  { id: 'ANTI_REFUSAL', kebab: 'anti-refusal' },
  { id: 'SYSTEM_PROMPT_LEAKAGE', kebab: 'system-prompt-leakage' },
  { id: 'MEMORY_POISONING', kebab: 'memory-poisoning' }
];

for (const { id, kebab } of CATEGORIES) {
  describe(id, () => {
    it(`AC1 ${id}: detects its threat phrasing in SKILL.md prose (positive fixture)`, async () => {
      const result = await scanCategory(kebab, 'positive');
      const hits = result.findings.filter(f => f.category === id);
      expect(hits.length).toBeGreaterThanOrEqual(1);
    });

    it(`AC2 ${id}: does not fire on benign look-alike prose (clean fixture)`, async () => {
      const result = await scanCategory(kebab, 'clean');
      const hits = result.findings.filter(f => f.category === id);
      expect(hits.length).toBe(0);
    });

    it(`AC3 ${id}: every positive finding carries non-null CVSS rated HIGH`, async () => {
      const result = await scanCategory(kebab, 'positive');
      const hits = result.findings.filter(f => f.category === id);
      expect(hits.length).toBeGreaterThanOrEqual(1);
      for (const f of hits) {
        expect(f.cvss).not.toBeNull();
        expect(f.cvss.severityRating).toBe('HIGH');
      }
    });
  });
}

// Phase 3 categories — mixed severity tiers (OUTPUT_HANDLING HIGH; the other two MEDIUM).
const PHASE3_CATEGORIES = [
  { id: 'EXCESSIVE_AGENCY', kebab: 'excessive-agency', tier: 'MEDIUM' },
  { id: 'OUTPUT_HANDLING', kebab: 'output-handling', tier: 'HIGH' },
  { id: 'TOOL_MISUSE', kebab: 'tool-misuse', tier: 'MEDIUM' }
];

for (const { id, kebab, tier } of PHASE3_CATEGORIES) {
  describe(id, () => {
    it(`AC1 ${id}: detects its threat signal in the positive fixture`, async () => {
      const result = await scanCategory(kebab, 'positive');
      const hits = result.findings.filter(f => f.category === id);
      expect(hits.length).toBeGreaterThanOrEqual(1);
    });

    it(`AC2 ${id}: does not fire on benign look-alike fixture (clean fixture)`, async () => {
      const result = await scanCategory(kebab, 'clean');
      const hits = result.findings.filter(f => f.category === id);
      expect(hits.length).toBe(0);
    });

    it(`AC3 ${id}: every positive finding carries non-null CVSS rated ${tier}`, async () => {
      const result = await scanCategory(kebab, 'positive');
      const hits = result.findings.filter(f => f.category === id);
      expect(hits.length).toBeGreaterThanOrEqual(1);
      for (const f of hits) {
        expect(f.cvss).not.toBeNull();
        expect(f.cvss.severityRating).toBe(tier);
      }
    });
  });
}

// Per-rule firing guard — AC1 only asserts >=1 finding per CATEGORY, so it is satisfied
// by TM001/EA001 alone and leaves TM002 (auth-disabled / permissive-CORS) and EA002
// (auto-approve flags) unverified. These guard their detection (not just compilation).
describe('per-rule firing', () => {
  it('EA002: auto-approve flag in positive fixture yields an EA002 finding', async () => {
    const result = await scanCategory('excessive-agency', 'positive');
    const hits = result.findings.filter(f => f.ruleId === 'EA002');
    expect(hits.length).toBeGreaterThanOrEqual(1);
  });

  it('TM002: auth-disabled / permissive-CORS default in positive fixture yields a TM002 finding', async () => {
    const result = await scanCategory('tool-misuse', 'positive');
    const hits = result.findings.filter(f => f.ruleId === 'TM002');
    expect(hits.length).toBeGreaterThanOrEqual(1);
  });
});

// AC7 — cross-category non-overlap: the novel TOOL_MISUSE slice must not duplicate
// MALICIOUS_CODE, and a TOOL_MISUSE unsafe-default must not surface as MALICIOUS_CODE.
describe('TOOL_MISUSE overlap', () => {
  it('AC7 overlap: a MALICIOUS_CODE/PRIVILEGE_ABUSE signal yields 0 TOOL_MISUSE findings', async () => {
    const result = await scanCategory('overlap-malicious', 'positive');
    const toolMisuse = result.findings.filter(f => f.category === 'TOOL_MISUSE');
    expect(toolMisuse.length).toBe(0);
  });

  it('AC7 overlap: a TOOL_MISUSE unsafe-default yields 0 MALICIOUS_CODE findings', async () => {
    const result = await scanCategory('tool-misuse', 'positive');
    const malicious = result.findings.filter(f => f.category === 'MALICIOUS_CODE');
    expect(malicious.length).toBe(0);
  });
});

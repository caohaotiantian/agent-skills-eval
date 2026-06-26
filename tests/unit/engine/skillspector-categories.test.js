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

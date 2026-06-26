const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { execFileSync } = require('child_process');
const { loadYAMLRules } = require('../../../lib/validation/engine/rule-loader');

const REPO_ROOT = path.join(__dirname, '..', '..', '..');
const RULES_PATH = path.join(REPO_ROOT, 'config', 'security', 'skill-sec-rules.yaml');

const NEW_ID_PREFIXES = ['AR', 'SPL', 'MP', 'EA', 'OH', 'TM', 'RA', 'AS'];

function isNewRuleId(id) {
  return NEW_ID_PREFIXES.some(prefix => new RegExp(`^${prefix}\\d`).test(id));
}

describe('AC4 — per-pattern survival vs isSafeRegex', () => {
  const loaded = loadYAMLRules(RULES_PATH);
  const authoredDoc = yaml.load(fs.readFileSync(RULES_PATH, 'utf-8'));
  const authoredById = new Map(
    (authoredDoc.rules || []).map(r => [r.id, (r.patterns || []).length])
  );
  const newLoadedRules = loaded.rules.filter(r => isNewRuleId(r.id));

  it('selects only the 8 new categories (sanity on prefix matcher)', () => {
    expect(newLoadedRules.length).toBeGreaterThanOrEqual(15);
    for (const r of newLoadedRules) {
      expect(isNewRuleId(r.id)).toBe(true);
    }
    expect(newLoadedRules.some(r => r.id.startsWith('MAL'))).toBe(false);
    expect(newLoadedRules.some(r => r.id.startsWith('DATA'))).toBe(false);
  });

  for (const prefix of NEW_ID_PREFIXES) {
    it(`every ${prefix}* rule keeps all authored patterns after loading`, () => {
      const rules = newLoadedRules.filter(r => new RegExp(`^${prefix}\\d`).test(r.id));
      expect(rules.length).toBeGreaterThanOrEqual(1);
      for (const r of rules) {
        const authoredCount = authoredById.get(r.id);
        expect(authoredCount).toBeGreaterThanOrEqual(1);
        expect(r.patterns.length).toBe(authoredCount);
      }
    });
  }
});

describe('AC6 — clean-room tripwire', () => {
  // Upstream SkillSpector rule-ID literals use prefix + single non-zero-padded digit.
  // This project's IDs are zero-padded (AR001, SPL001) and will not match these
  // word-boundary forms. SPL is intentionally absent (it is the project prefix).
  const UPSTREAM_ID_REGEX =
    '\\bAR[1-3]\\b|\\bEA[1-4]\\b|\\bOH[1-3]\\b|\\bP[6-8]\\b|\\bMP[1-3]\\b|\\bTM[1-3]\\b|\\bRA[1-2]\\b|\\bAS[1-3]\\b';

  it('no upstream non-zero-padded rule-ID literals appear in lib/, config/, tests/', () => {
    let output = '';
    try {
      output = execFileSync(
        'grep',
        ['-rEn', '--exclude-dir=node_modules', UPSTREAM_ID_REGEX, 'lib', 'config', 'tests'],
        { cwd: REPO_ROOT, encoding: 'utf-8' }
      );
    } catch (e) {
      // grep exits 1 when there are no matches; treat only that as "clean".
      if (e.status === 1) {
        output = '';
      } else {
        throw e;
      }
    }
    expect(output.trim()).toBe('');
  });

  it('LICENSE first line still declares MIT', () => {
    const firstLine = fs.readFileSync(path.join(REPO_ROOT, 'LICENSE'), 'utf-8').split('\n')[0];
    expect(firstLine).toMatch(/MIT/);
  });

  it('no Apache NOTICE / THIRD_PARTY_NOTICES attribution file at repo root', () => {
    const entries = fs.readdirSync(REPO_ROOT);
    const attribution = entries.filter(name => /^(NOTICE|THIRD_PARTY_NOTICES)/i.test(name));
    expect(attribution).toEqual([]);
  });
});

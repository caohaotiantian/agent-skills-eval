/**
 * Unit tests for lib/skills/evaluating/index.js
 * Covers: evaluateCriterion for N/A code criteria on instruction-only skills
 */

const path = require('path');
const { evaluateCriterion, EVAL_REGISTRY } = require('../../lib/skills/evaluating/index');

const FIXTURE_PATH = path.resolve(__dirname, '../fixtures/security-test-skill');

// Minimal skill object pointing at the instruction-only fixture
const instructionOnlySkill = {
  id: 'security-test-skill',
  name: 'security-test-skill',
  description: 'TEST FIXTURE — intentionally contains security anti-patterns to verify the evaluation scanner detects them. NOT a real skill.',
  platform: 'claude-code',
  path: FIXTURE_PATH
};

// Helper: look up a criterion by id from EVAL_REGISTRY
function getCriterion(dimensionId, criterionId) {
  const dim = EVAL_REGISTRY[dimensionId];
  return dim.criteria.find(c => c.id === criterionId);
}

// ---------------------------------------------------------------------------
// instruction-only skill scoring — N/A criteria should get half weight
// ---------------------------------------------------------------------------
describe('instruction-only skill scoring', () => {
  it('should give half weight for code-comments on instruction-only skill', async () => {
    const criterion = getCriterion('style', 'code-comments');
    const result = await evaluateCriterion(instructionOnlySkill, criterion);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(Math.round(criterion.weight * 0.5));
    expect(result.reasoning).toMatch(/not applicable/i);
  });

  it('should give half weight for async-optimization on instruction-only skill', async () => {
    const criterion = getCriterion('efficiency', 'async-optimization');
    const result = await evaluateCriterion(instructionOnlySkill, criterion);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(Math.round(criterion.weight * 0.5));
    expect(result.reasoning).toMatch(/not applicable/i);
  });

  it('should give half weight for caching on instruction-only skill', async () => {
    const criterion = getCriterion('efficiency', 'caching');
    const result = await evaluateCriterion(instructionOnlySkill, criterion);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(Math.round(criterion.weight * 0.5));
    expect(result.reasoning).toMatch(/not applicable/i);
  });

  it('should give half weight for no-unnecessary-commands on instruction-only skill', async () => {
    const criterion = getCriterion('efficiency', 'no-unnecessary-commands');
    const result = await evaluateCriterion(instructionOnlySkill, criterion);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(Math.round(criterion.weight * 0.5));
    expect(result.reasoning).toMatch(/not applicable/i);
  });

  it('should produce efficiency percentage below 100% for instruction-only skill', async () => {
    const effDim = EVAL_REGISTRY['efficiency'];
    let totalScore = 0;
    let maxScore = 0;
    for (const criterion of effDim.criteria) {
      const result = await evaluateCriterion(instructionOnlySkill, criterion);
      totalScore += result.score;
      maxScore += result.weight;
    }
    const percentage = Math.round((totalScore / maxScore) * 100);
    expect(percentage).toBeLessThan(100);
  });
});

// ---------------------------------------------------------------------------
// Suggestion enrichment integration — failing criterion gains new fields
// ---------------------------------------------------------------------------
describe('suggestion enrichment on criterion result', () => {
  const fs = require('fs-extra');

  const failingDescSkill = {
    id: 'failing-desc',
    name: 'failing-desc',
    description: 'too short',  // 9 chars, fails has-description (>10) and description-complete
    platform: 'claude-code',
    path: FIXTURE_PATH,
    _skillMdContent: '---\nname: failing-desc\ndescription: too short\n---\nbody'
  };

  it('adds details/locations/suggestion to a failing criterion', async () => {
    const criterion = getCriterion('process', 'description-complete');
    const result = await evaluateCriterion(failingDescSkill, criterion);
    expect(result.passed).toBe(false);
    expect(Array.isArray(result.details)).toBe(true);
    expect(result.details.length).toBeGreaterThan(0);
    expect(Array.isArray(result.locations)).toBe(true);
    expect(result.suggestion).toBeTruthy();
    expect(result.llmSuggestion).toBeNull();
  });

  it('does not add enrichment fields when criterion passes perfectly', async () => {
    // has-name passes for any skill object that has a name
    const criterion = getCriterion('outcome', 'has-name');
    const result = await evaluateCriterion(failingDescSkill, criterion);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(criterion.weight);
    expect(result.details).toBeUndefined();
    expect(result.locations).toBeUndefined();
    expect(result.suggestion).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Regression — symlinked skill paths must still surface code-level checks.
// In Docker, eval-skill.sh symlinks ~/.claude/skills/<name> → /workspace/skill.
// glob v10+ does not traverse a symlinked cwd, so without realpath() the
// jsFiles list is empty and every code-level check silently degrades to the
// "instruction-only" fallback, hiding real findings (notably execSync).
// ---------------------------------------------------------------------------
describe('evaluateCriterion — symlinked skill path (Docker layout)', () => {
  const fs = require('fs-extra');
  const os = require('os');
  let tmpDir;
  let realSkill;
  let symlinkedSkill;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'eval-symlink-'));
    realSkill = path.join(tmpDir, 'real-skill');
    symlinkedSkill = path.join(tmpDir, 'skills-link');
    await fs.copy(path.resolve(__dirname, '../fixtures/coding-agent'), realSkill);
    await fs.symlink(realSkill, symlinkedSkill);
  });

  afterEach(async () => {
    if (tmpDir) await fs.remove(tmpDir);
  });

  function makeSkill(p) {
    return {
      id: 'coding-agent',
      name: 'coding-agent',
      description: 'Create CLI tools, scripts, and applications from natural language specifications',
      platform: 'claude-code',
      path: p
    };
  }

  it('finds executable code through a symlinked skill path (no false instruction-only fallback)', async () => {
    const skill = makeSkill(symlinkedSkill);
    const criterion = getCriterion('efficiency', 'async-optimization');
    const result = await evaluateCriterion(skill, criterion);
    // The fixture has `async function` declarations — the criterion must
    // engage the real check rather than the "not applicable" branch.
    expect(result.reasoning).not.toMatch(/not applicable/i);
    expect(result.metadata.code_files).toBeGreaterThan(0);
  });

  it('detects exec/spawn/execSync through a symlinked skill path (security-critical)', async () => {
    const skill = makeSkill(symlinkedSkill);
    const criterion = getCriterion('efficiency', 'no-unnecessary-commands');
    const result = await evaluateCriterion(skill, criterion);
    // The fixture's lib/index.js calls execSync with template-literal input —
    // the criterion must not silently pass with "instruction-only" reasoning.
    expect(result.reasoning).not.toMatch(/not applicable/i);
    expect(result.reasoning).toMatch(/exec|spawn|parameteriz/i);
  });
});

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

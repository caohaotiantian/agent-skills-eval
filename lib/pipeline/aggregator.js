/**
 * Results Aggregator
 * Merges static evaluation, dynamic execution, and trace analysis
 * into a single unified JSON for report generation.
 */

const { v4: uuidv4 } = require('uuid');

/**
 * Look up static score for a skill by name.
 * Searches staticEval.summary.scores for a matching key.
 */
function findStaticScore(staticEval, skillName) {
  if (!staticEval?.summary?.scores) return null;
  const scores = staticEval.summary.scores;
  // Try exact match first
  if (scores[skillName]) return scores[skillName].mean_score;
  // Try case-insensitive partial match
  const key = Object.keys(scores).find(k =>
    k.toLowerCase().includes(skillName.toLowerCase()) ||
    skillName.toLowerCase().includes(k.toLowerCase())
  );
  return key ? scores[key].mean_score : null;
}

/**
 * Aggregate pipeline results into a unified format with comparison data.
 *
 * @param {Object} params
 * @param {Object} params.staticEval   - Output from evaluating/index.js runEvaluation()
 * @param {Array}  params.dynamicResults - Array of outputs from evals/runner.js runEvaluation()
 * @param {Object} [params.meta]        - Extra metadata (backend, platform, etc.)
 * @returns {Object} Combined results
 */
function aggregateResults({ staticEval, dynamicResults = [], meta = {} }) {
  const now = new Date().toISOString();

  // --- Dynamic summary ---
  let totalTests = 0;
  let totalPassed = 0;
  let totalFailed = 0;
  let totalTokens = 0;
  let totalThrashing = 0;

  const dynamicSkills = dynamicResults.map(dr => {
    totalTests += dr.summary?.total || 0;
    totalPassed += dr.summary?.passed || 0;
    totalFailed += dr.summary?.failed || 0;

    const traceMetrics = (dr.results || []).map(r => {
      const tr = r.traceReport || {};
      const tokenTotal = tr.tokenUsage?.total;
      if (tokenTotal != null) totalTokens += tokenTotal;
      if (tr.thrashing?.isThrashing) totalThrashing++;
      return {
        testId: r.testId,
        passed: r.passed,
        shouldTrigger: r.shouldTrigger ?? null,
        triggerResult: r.triggerResult || null,
        securityResult: r.securityResult || null,
        prompt: r.prompt || null,
        category: r.category || null,
        commandCount: tr.commandCount || 0,
        errorCount: tr.errorCount || 0,
        efficiencyScore: tr.efficiencyScore ?? null,
        thrashing: tr.thrashing || {},
        tokenUsage: tr.tokenUsage || {},
        tracePath: r.tracePath || null,
        traceDetails: r.traceDetails || null
      };
    });

    return {
      skillName: dr.skillName,
      backend: dr.backend,
      summary: dr.summary || {},
      traceMetrics
    };
  });

  const dynamicPassRate = totalTests > 0
    ? Math.round((totalPassed / totalTests) * 100)
    : null;

  // --- Per-skill comparison data ---
  const skillComparisons = dynamicSkills.map(ds => {
    const skillName = ds.skillName;
    const staticScore = findStaticScore(staticEval, skillName);

    const skillPassRate = ds.summary?.total > 0
      ? Math.round((ds.summary.passed / ds.summary.total) * 100)
      : 0;

    const efficiencyScores = ds.traceMetrics
      .filter(tm => tm.efficiencyScore != null)
      .map(tm => tm.efficiencyScore);
    const efficiencyAvg = efficiencyScores.length > 0
      ? Math.round(efficiencyScores.reduce((a, b) => a + b, 0) / efficiencyScores.length)
      : null;

    const skillTokens = ds.traceMetrics.reduce((sum, tm) => sum + (tm.tokenUsage?.total || 0), 0);
    const skillThrashing = ds.traceMetrics.filter(tm => tm.thrashing?.isThrashing).length;

    // Security score — average percentage from security tests for this skill
    const securityMetrics = ds.traceMetrics
      .filter(tm => tm.securityResult)
      .map(tm => tm.securityResult.percentage);
    const securityAvg = securityMetrics.length > 0
      ? Math.round(securityMetrics.reduce((a, b) => a + b, 0) / securityMetrics.length)
      : null;

    // Composite score: 35% static + 35% dynamic + 15% efficiency + 15% security
    const staticComponent = (staticScore ?? 0) * 0.35;
    const dynamicComponent = skillPassRate * 0.35;
    const efficiencyComponent = (efficiencyAvg ?? 0) * 0.15;
    const securityComponent = (securityAvg ?? 100) * 0.15; // default 100 if no security tests
    const compositeScore = Math.round(staticComponent + dynamicComponent + efficiencyComponent + securityComponent);

    return {
      skillName,
      staticScore,
      dynamicPassRate: skillPassRate,
      efficiencyAvg,
      securityAvg,
      totalTokens: skillTokens,
      thrashingCount: skillThrashing,
      compositeScore,
      testCount: ds.summary?.total || 0,
      passedCount: ds.summary?.passed || 0,
      failedCount: ds.summary?.failed || 0
    };
  });

  // --- Rankings (descending by composite score) ---
  const ranked = [...skillComparisons].sort((a, b) => b.compositeScore - a.compositeScore);
  ranked.forEach((item, index) => { item.rank = index + 1; });

  // --- Cross-skill comparison ---
  const allEfficiencies = skillComparisons
    .filter(sc => sc.efficiencyAvg != null)
    .map(sc => sc.efficiencyAvg);
  const averageEfficiency = allEfficiencies.length > 0
    ? Math.round(allEfficiencies.reduce((a, b) => a + b, 0) / allEfficiencies.length)
    : null;

  const comparison = {
    rankings: ranked,
    bestPerformer: ranked.length > 0 ? ranked[0].skillName : null,
    worstPerformer: ranked.length > 0 ? ranked[ranked.length - 1].skillName : null,
    averageEfficiency,
    averageCompositeScore: ranked.length > 0
      ? Math.round(ranked.reduce((sum, r) => sum + r.compositeScore, 0) / ranked.length)
      : null,
    totalThrashingIncidents: totalThrashing,
    totalTokensUsed: totalTokens
  };

  return {
    run_id: uuidv4(),
    created_at: now,
    pipeline: true,
    meta: {
      ...meta,
      generated_by: 'agent-skills-eval pipeline'
    },

    // Carry forward static eval verbatim
    static_eval: staticEval,

    // Dynamic execution summary
    dynamic_eval: {
      total_tests: totalTests,
      passed: totalPassed,
      failed: totalFailed,
      pass_rate: dynamicPassRate,
      total_tokens: totalTokens,
      thrashing_count: totalThrashing,
      skills: dynamicSkills
    },

    // Comparison and rankings
    comparison,

    // Combined high-level summary
    summary: {
      static_score: staticEval?.summary?.aggregate_scores?.mean ?? null,
      dynamic_pass_rate: dynamicPassRate,
      total_skills_evaluated: Object.keys(staticEval?.data || {}).length,
      total_dynamic_tests: totalTests,
      average_composite_score: comparison.averageCompositeScore,
      best_performer: comparison.bestPerformer,
      worst_performer: comparison.worstPerformer
    }
  };
}

module.exports = { aggregateResults };

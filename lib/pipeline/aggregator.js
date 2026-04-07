/**
 * Results Aggregator
 * Merges static evaluation, dynamic execution, and trace analysis
 * into a single unified JSON for report generation.
 */

const { v4: uuidv4 } = require('uuid');

/**
 * Look up static score for a skill by name.
 * Searches staticEval.summary.scores by key (skill.id) and also by the
 * stored skill_name field in staticEval.data, because skill.id (directory
 * name, e.g. "CangjieSkills") may differ from skill.name (frontmatter
 * name, e.g. "cangjie-dev-skills").
 */
function findStaticScore(staticEval, skillName) {
  if (!staticEval?.summary?.scores) return null;
  const scores = staticEval.summary.scores;
  // Try exact match on key (skill.id)
  if (scores[skillName]) return scores[skillName].mean_score;

  // Try matching via skill_name stored in staticEval.data
  if (staticEval.data) {
    const dataKey = Object.keys(staticEval.data).find(k => {
      const entry = staticEval.data[k];
      return entry.skill_name === skillName;
    });
    if (dataKey && scores[dataKey]) return scores[dataKey].mean_score;
  }

  // Fallback: case-insensitive partial match on key
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
      : null;

    const efficiencyScores = ds.traceMetrics
      .filter(tm => tm.efficiencyScore != null)
      .map(tm => tm.efficiencyScore);
    const efficiencyAvg = efficiencyScores.length > 0
      ? Math.round(efficiencyScores.reduce((a, b) => a + b, 0) / efficiencyScores.length)
      : null;

    const skillTokens = ds.traceMetrics.reduce((sum, tm) => sum + (tm.tokenUsage?.total || 0), 0);
    const skillThrashing = ds.traceMetrics.filter(tm => tm.thrashing?.isThrashing).length;

    // Dynamic security score — average percentage from dynamic security tests for this skill
    const securityMetrics = ds.traceMetrics
      .filter(tm => tm.securityResult)
      .map(tm => tm.securityResult.percentage);
    const securityAvg = securityMetrics.length > 0
      ? Math.round(securityMetrics.reduce((a, b) => a + b, 0) / securityMetrics.length)
      : null;

    // Static security score — from the static security dimension evaluation
    let staticSecurityScore = null;
    if (staticEval?.data) {
      const matchedKey = Object.keys(staticEval.data).find(k => {
        const entry = staticEval.data[k];
        return k === skillName || entry.skill_name === skillName;
      });
      if (matchedKey) {
        const secDim = staticEval.data[matchedKey]?.scores?.security;
        if (secDim) staticSecurityScore = secDim.percentage;
      }
    }

    // For composite, use whichever security scores are available
    // If both exist, use the lower (more conservative) score
    const compositeSecurity = (securityAvg != null && staticSecurityScore != null)
      ? Math.min(securityAvg, staticSecurityScore)
      : (securityAvg ?? staticSecurityScore);

    // Composite score: 35% static + 35% dynamic + 15% efficiency + 15% security
    // Null components excluded from calculation so missing data doesn't inflate or deflate
    const components = [];
    const weights = [];
    if (staticScore != null)  { components.push(staticScore);   weights.push(0.35); }
    if (skillPassRate != null) { components.push(skillPassRate); weights.push(0.35); }
    if (efficiencyAvg != null) { components.push(efficiencyAvg); weights.push(0.15); }
    if (compositeSecurity != null) { components.push(compositeSecurity); weights.push(0.15); }

    let compositeScore;
    if (weights.length === 0) {
      compositeScore = 0;
    } else {
      // Normalize weights to sum to 1.0 so available components fill the full scale
      const totalWeight = weights.reduce((a, b) => a + b, 0);
      compositeScore = Math.round(
        components.reduce((sum, val, i) => sum + val * (weights[i] / totalWeight), 0)
      );
    }

    return {
      skillName,
      staticScore,
      dynamicPassRate: skillPassRate,
      efficiencyAvg,
      securityAvg,
      staticSecurityScore,
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
    totalTokensUsed: totalTokens,
    backendComparison: compareBackends(dynamicSkills)
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

/**
 * Compare results across backends, producing per-backend summary stats.
 *
 * @param {Array} dynamicSkills - Array of per-skill dynamic results (with .backend)
 * @returns {Object} Keyed by backend name, each with total/passed/failed/passRate/skills
 */
function compareBackends(dynamicSkills) {
  const byBackend = {};
  for (const ds of dynamicSkills) {
    const b = ds.backend || 'unknown';
    if (!byBackend[b]) byBackend[b] = { total: 0, passed: 0, failed: 0, skills: [] };
    byBackend[b].total += ds.summary?.total || 0;
    byBackend[b].passed += ds.summary?.passed || 0;
    byBackend[b].failed += ds.summary?.failed || 0;
    byBackend[b].skills.push(ds.skillName);
  }
  for (const b of Object.keys(byBackend)) {
    byBackend[b].passRate = byBackend[b].total > 0
      ? Math.round((byBackend[b].passed / byBackend[b].total) * 100)
      : 0;
  }
  return byBackend;
}

module.exports = { aggregateResults, compareBackends };

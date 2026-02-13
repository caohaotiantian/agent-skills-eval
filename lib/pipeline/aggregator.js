/**
 * Results Aggregator
 * Merges static evaluation, dynamic execution, and trace analysis
 * into a single unified JSON for report generation.
 */

const { v4: uuidv4 } = require('uuid');

/**
 * Aggregate pipeline results into a unified format.
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
      totalTokens += tr.tokenUsage?.total || 0;
      if (tr.thrashing?.isThrashing) totalThrashing++;
      return {
        testId: r.testId,
        passed: r.passed,
        commandCount: tr.commandCount || 0,
        errorCount: tr.errorCount || 0,
        efficiencyScore: tr.efficiencyScore ?? null,
        thrashing: tr.thrashing || {},
        tokenUsage: tr.tokenUsage || {}
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

    // Combined high-level summary
    summary: {
      static_score: staticEval?.summary?.aggregate_scores?.mean ?? null,
      dynamic_pass_rate: dynamicPassRate,
      total_skills_evaluated: Object.keys(staticEval?.data || {}).length,
      total_dynamic_tests: totalTests
    }
  };
}

module.exports = { aggregateResults };

const { aggregateResults } = require('../../lib/pipeline/aggregator');

describe('Results Aggregator', () => {
  it('should merge static eval and dynamic run results', () => {
    const staticEval = {
      run_id: 'static-123',
      created_at: '2026-02-12T00:00:00Z',
      summary: {
        stats: { total_skills: 1, total_evals: 5, passed: 4, failed: 1 },
        scores: { 'skill-a': { mean_score: 78 } },
        aggregate_scores: { mean: 78, median: 80 }
      },
      data: {
        'skill-a': {
          skill_name: 'writing-skills',
          platform: 'claude-code',
          path: '/tmp/skill-a',
          scores: {
            outcome: { eval_id: 'outcome', eval_name: 'Outcome Goals', percentage: 80, criteria_results: [] }
          }
        }
      }
    };

    const dynamicResults = [
      {
        skillName: 'writing-skills',
        backend: 'mock',
        summary: { total: 5, passed: 4, failed: 1 },
        results: [
          {
            testId: 'writing-skills-001',
            passed: true,
            traceReport: { commandCount: 3, errorCount: 0, efficiencyScore: 100, thrashing: { isThrashing: false }, tokenUsage: { total: 500 } }
          }
        ]
      }
    ];

    const combined = aggregateResults({ staticEval, dynamicResults });

    expect(combined.run_id).toBeDefined();
    expect(combined.pipeline).toBe(true);
    expect(combined.static_eval).toBeDefined();
    expect(combined.dynamic_eval).toBeDefined();
    expect(combined.dynamic_eval.skills).toHaveLength(1);
    expect(combined.dynamic_eval.skills[0].summary.total).toBe(5);
    expect(combined.summary.static_score).toBe(78);
    expect(combined.summary.dynamic_pass_rate).toBeDefined();
  });

  it('should handle missing dynamic results gracefully', () => {
    const staticEval = {
      run_id: 'x', created_at: '2026-01-01T00:00:00Z',
      summary: { stats: {}, scores: {}, aggregate_scores: { mean: 50 } },
      data: {}
    };
    const combined = aggregateResults({ staticEval, dynamicResults: [] });
    expect(combined.dynamic_eval.skills).toHaveLength(0);
    expect(combined.summary.dynamic_pass_rate).toBeNull();
  });

  it('should count thrashing instances', () => {
    const staticEval = {
      run_id: 'x', created_at: '2026-01-01T00:00:00Z',
      summary: { stats: {}, scores: {}, aggregate_scores: { mean: 60 } },
      data: {}
    };
    const dynamicResults = [{
      skillName: 'test',
      backend: 'mock',
      summary: { total: 2, passed: 1, failed: 1 },
      results: [
        { testId: 't-1', passed: true, traceReport: { commandCount: 5, errorCount: 0, efficiencyScore: 80, thrashing: { isThrashing: true }, tokenUsage: { total: 200 } } },
        { testId: 't-2', passed: false, traceReport: { commandCount: 2, errorCount: 1, efficiencyScore: 90, thrashing: { isThrashing: false }, tokenUsage: { total: 100 } } }
      ]
    }];
    const combined = aggregateResults({ staticEval, dynamicResults });
    expect(combined.dynamic_eval.thrashing_count).toBe(1);
    expect(combined.dynamic_eval.total_tokens).toBe(300);
  });

  it('should include meta information', () => {
    const staticEval = {
      run_id: 'x', created_at: '2026-01-01T00:00:00Z',
      summary: { stats: {}, scores: {}, aggregate_scores: {} },
      data: {}
    };
    const combined = aggregateResults({ staticEval, dynamicResults: [], meta: { backend: 'mock', platform: 'claude-code' } });
    expect(combined.meta.backend).toBe('mock');
    expect(combined.meta.platform).toBe('claude-code');
    expect(combined.meta.generated_by).toBe('agent-skills-eval pipeline');
  });

  it('should pass through securityResult in traceMetrics', () => {
    const staticEval = {
      run_id: 'x', created_at: '2026-01-01T00:00:00Z',
      summary: { stats: {}, scores: { 'sec-skill': { mean_score: 80 } }, aggregate_scores: { mean: 80 } },
      data: {}
    };
    const secResult = { checks: [], vulnerabilities: [], score: 14, maxScore: 16, percentage: 88 };
    const dynamicResults = [{
      skillName: 'sec-skill',
      backend: 'mock',
      summary: { total: 1, passed: 1, failed: 0 },
      results: [{
        testId: 'sec-001',
        passed: true,
        category: 'security',
        securityResult: secResult,
        traceReport: { commandCount: 1, errorCount: 0, efficiencyScore: 90, thrashing: { isThrashing: false }, tokenUsage: { total: 100 } }
      }]
    }];
    const combined = aggregateResults({ staticEval, dynamicResults });
    const tm = combined.dynamic_eval.skills[0].traceMetrics[0];
    expect(tm.securityResult).toEqual(secResult);
  });

  it('should compute securityAvg in skill comparisons', () => {
    const staticEval = {
      run_id: 'x', created_at: '2026-01-01T00:00:00Z',
      summary: { stats: {}, scores: { 'sec-skill': { mean_score: 80 } }, aggregate_scores: { mean: 80 } },
      data: {}
    };
    const dynamicResults = [{
      skillName: 'sec-skill',
      backend: 'mock',
      summary: { total: 2, passed: 2, failed: 0 },
      results: [
        { testId: 's-1', passed: true, category: 'security', securityResult: { checks: [], vulnerabilities: [], score: 16, maxScore: 16, percentage: 100 }, traceReport: { commandCount: 1, errorCount: 0, efficiencyScore: 80, thrashing: { isThrashing: false }, tokenUsage: { total: 50 } } },
        { testId: 's-2', passed: true, category: 'security', securityResult: { checks: [], vulnerabilities: [], score: 12, maxScore: 16, percentage: 75 }, traceReport: { commandCount: 2, errorCount: 0, efficiencyScore: 90, thrashing: { isThrashing: false }, tokenUsage: { total: 80 } } }
      ]
    }];
    const combined = aggregateResults({ staticEval, dynamicResults });
    const skill = combined.comparison.rankings[0];
    // avg of 100 and 75 = 87.5, rounded to 88
    expect(skill.securityAvg).toBe(88);
  });

  it('should use 35/35/15/15 composite formula', () => {
    const staticEval = {
      run_id: 'x', created_at: '2026-01-01T00:00:00Z',
      summary: { stats: {}, scores: { 'test': { mean_score: 100 } }, aggregate_scores: { mean: 100 } },
      data: {}
    };
    const dynamicResults = [{
      skillName: 'test',
      backend: 'mock',
      summary: { total: 1, passed: 1, failed: 0 },
      results: [{
        testId: 't-1', passed: true, category: 'security',
        securityResult: { checks: [], vulnerabilities: [], score: 16, maxScore: 16, percentage: 100 },
        traceReport: { commandCount: 1, errorCount: 0, efficiencyScore: 100, thrashing: { isThrashing: false }, tokenUsage: { total: 0 } }
      }]
    }];
    const combined = aggregateResults({ staticEval, dynamicResults });
    const skill = combined.comparison.rankings[0];
    // 35% * 100 + 35% * 100 + 15% * 100 + 15% * 100 = 100
    expect(skill.compositeScore).toBe(100);
  });
});

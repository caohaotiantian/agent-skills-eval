const fs = require('fs-extra');
const path = require('path');
const { generateReport } = require('../../lib/skills/reporting');

describe('Report Generation', () => {
  const tmpDir = path.join(__dirname, 'tmp-report-test');

  beforeAll(async () => {
    await fs.ensureDir(tmpDir);
  });

  afterAll(async () => {
    await fs.remove(tmpDir);
  });

  it('should generate HTML from pipeline results', async () => {
    const inputPath = path.join(tmpDir, 'pipeline-result.json');
    const pipelineData = {
      run_id: 'test-pipeline',
      created_at: '2026-02-12T00:00:00Z',
      pipeline: true,
      static_eval: {
        run_id: 'static-1',
        created_at: '2026-02-12T00:00:00Z',
        summary: {
          stats: { total_skills: 1, total_evals: 5, passed: 4, failed: 1 },
          scores: { 'sk-1': { mean_score: 75 } },
          aggregate_scores: { mean: 75, median: 78 }
        },
        data: {
          'sk-1': {
            skill_name: 'test-skill',
            platform: 'claude-code',
            scores: {
              outcome: {
                eval_id: 'outcome', eval_name: 'Outcome Goals',
                percentage: 80, description: 'Task completion',
                criteria_results: [
                  { name: 'Has SKILL.md', passed: true, score: 2, weight: 2, reasoning: 'Found' }
                ]
              }
            }
          }
        }
      },
      dynamic_eval: {
        total_tests: 5,
        passed: 4,
        failed: 1,
        pass_rate: 80,
        total_tokens: 1500,
        thrashing_count: 0,
        skills: [
          {
            skillName: 'test-skill',
            backend: 'mock',
            summary: { total: 5, passed: 4, failed: 1 },
            traceMetrics: [
              { testId: 't-001', passed: true, commandCount: 3, errorCount: 0, efficiencyScore: 100, thrashing: { isThrashing: false }, tokenUsage: { total: 300 } }
            ]
          }
        ]
      },
      summary: {
        static_score: 75,
        dynamic_pass_rate: 80,
        total_skills_evaluated: 1,
        total_dynamic_tests: 5
      }
    };

    await fs.writeJson(inputPath, pipelineData);

    const outPath = path.join(tmpDir, 'report.html');
    await generateReport({ input: inputPath, format: 'html', output: outPath });

    const html = await fs.readFile(outPath, 'utf-8');
    expect(html).toContain('Pipeline');
    expect(html).toContain('Dynamic');
    expect(html).toContain('80%');
    expect(html).toContain('test-skill');
  });

  it('should generate markdown from pipeline results', async () => {
    const inputPath = path.join(tmpDir, 'pipeline-result-md.json');
    const pipelineData = {
      run_id: 'test-md',
      created_at: '2026-02-12T00:00:00Z',
      pipeline: true,
      static_eval: {
        summary: { stats: {}, scores: {}, aggregate_scores: {} },
        data: {}
      },
      dynamic_eval: {
        total_tests: 2, passed: 2, failed: 0, pass_rate: 100,
        total_tokens: 400, thrashing_count: 0,
        skills: [{
          skillName: 'demo-skill', backend: 'mock',
          summary: { total: 2, passed: 2, failed: 0 },
          traceMetrics: [
            { testId: 'd-001', passed: true, commandCount: 1, errorCount: 0, efficiencyScore: 100, thrashing: { isThrashing: false }, tokenUsage: { total: 200 } }
          ]
        }]
      },
      summary: { static_score: null, dynamic_pass_rate: 100, total_skills_evaluated: 0, total_dynamic_tests: 2 }
    };

    await fs.writeJson(inputPath, pipelineData);

    const outPath = path.join(tmpDir, 'report.md');
    await generateReport({ input: inputPath, format: 'markdown', output: outPath });

    const md = await fs.readFile(outPath, 'utf-8');
    expect(md).toContain('Pipeline');
    expect(md).toContain('Dynamic');
    expect(md).toContain('demo-skill');
  });

  it('should still generate regular HTML report for non-pipeline data', async () => {
    const inputPath = path.join(tmpDir, 'static-result.json');
    const staticData = {
      run_id: 'static-only',
      created_at: '2026-02-12T00:00:00Z',
      summary: {
        stats: { total_skills: 1, total_evals: 1, passed: 1, failed: 0 },
        scores: { 'sk-1': { mean_score: 90 } },
        aggregate_scores: { mean: 90, median: 90 }
      },
      data: {
        'sk-1': {
          skill_name: 'basic-skill',
          platform: 'claude-code',
          scores: {
            outcome: {
              eval_id: 'outcome', eval_name: 'Outcome Goals',
              percentage: 90, description: 'Completion',
              criteria_results: [
                { name: 'Has SKILL.md', passed: true, score: 2, weight: 2, reasoning: 'OK' }
              ]
            }
          }
        }
      }
    };

    await fs.writeJson(inputPath, staticData);

    const outPath = path.join(tmpDir, 'static-report.html');
    await generateReport({ input: inputPath, format: 'html', output: outPath });

    const html = await fs.readFile(outPath, 'utf-8');
    expect(html).toContain('Agent Skills Evaluation Report');
    expect(html).toContain('basic-skill');
  });
});

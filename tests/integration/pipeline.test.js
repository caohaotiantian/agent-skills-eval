const { runPipeline } = require('../../lib/pipeline');
const fs = require('fs-extra');
const path = require('path');

describe('Pipeline Integration', () => {
  const today = new Date().toISOString().slice(0, 10);
  const cleanupPaths = [];

  afterAll(async () => {
    for (const p of cleanupPaths) {
      await fs.remove(p).catch(() => {});
    }
  });

  it('should run full pipeline with mock backend', async () => {
    const reportPath = `test-report-${Date.now()}.html`;
    cleanupPaths.push(reportPath);
    cleanupPaths.push(path.join('results', `pipeline-${today}.json`));

    const result = await runPipeline({
      platform: 'claude-code',
      backend: 'mock',
      useLLM: false,
      format: 'html',
      output: reportPath,
      verbose: false
    });

    expect(result).toBeDefined();
    expect(result.stages).toBeDefined();
    expect(result.stages.discover).toBeDefined();
    expect(result.stages.discover.totalSkills).toBeGreaterThan(0);
    expect(result.stages.eval).toBeDefined();
    expect(result.stages.eval.skillsEvaluated).toBeGreaterThan(0);
    expect(result.duration).toBeGreaterThan(0);

    // Report file should exist
    expect(await fs.pathExists(reportPath)).toBe(true);
    const html = await fs.readFile(reportPath, 'utf-8');
    expect(html).toMatch(/Pipeline|Agent Skills Evaluation/);

    // Combined JSON should exist
    if (result.stages.aggregate?.outputPath) {
      expect(await fs.pathExists(result.stages.aggregate.outputPath)).toBe(true);
    }
  }, 120000);

  it('should support dry-run mode', async () => {
    const result = await runPipeline({
      platform: 'claude-code',
      backend: 'mock',
      dryRun: true
    });

    expect(result.dryRun).toBe(true);
    expect(result.stages.discover).toBeDefined();
    expect(result.stages.discover.totalSkills).toBeGreaterThan(0);
    // No eval/run/report stages in dry run
    expect(result.stages.eval).toBeUndefined();
  }, 30000);

  it('should support skip-dynamic mode', async () => {
    const reportPath = `test-report-skipdyn-${Date.now()}.html`;
    cleanupPaths.push(reportPath);

    const result = await runPipeline({
      platform: 'claude-code',
      backend: 'mock',
      skipDynamic: true,
      format: 'html',
      output: reportPath
    });

    expect(result.stages.run?.skipped).toBe(true);
    expect(result.stages.trace?.skipped).toBe(true);
    expect(result.stages.eval).toBeDefined();
    // Report should still be generated
    expect(await fs.pathExists(reportPath)).toBe(true);
  }, 120000);
});

/**
 * Pipeline Orchestrator
 * Chains: discover → eval → generate → run → trace → aggregate → report
 * in a single invocation.
 */

const path = require('path');
const fs = require('fs-extra');
const chalk = require('chalk');

const discover = require('../skills/discovering');
const evaluate = require('../skills/evaluating');
const { generateTestCases } = require('../skills/generating');
const runner = require('../../evals/runner');
const reporting = require('../skills/reporting');
const { aggregateResults } = require('./aggregator');

/**
 * Run the full evaluation pipeline.
 *
 * @param {Object} options
 * @param {string}  [options.skill]        - Specific skill name to evaluate (default: all)
 * @param {string}  [options.platform]     - Platform filter (default: 'all')
 * @param {string}  [options.backend]      - Agent backend for dynamic execution
 * @param {boolean} [options.useLLM]       - Use LLM for test generation
 * @param {string}  [options.format]       - Report format: html, markdown, json
 * @param {string}  [options.output]       - Report output path
 * @param {boolean} [options.skipGenerate] - Skip test generation (use existing prompts)
 * @param {boolean} [options.skipDynamic]  - Skip dynamic execution + trace
 * @param {boolean} [options.verbose]      - Verbose output
 * @param {boolean} [options.dryRun]       - Show what would happen, don't execute
 * @returns {Promise<Object>}
 */
async function runPipeline(options = {}) {
  const {
    skill: skillFilter,
    platform = 'all',
    backend = 'mock',
    useLLM = false,
    format = 'html',
    output,
    skipGenerate = false,
    skipDynamic = false,
    verbose = false,
    dryRun = false
  } = options;

  const stages = {};
  const startTime = Date.now();

  const log = (msg) => console.log(msg);
  const stageHeader = (name) => log(chalk.blue(`\n━━━ Stage: ${name} ━━━`));

  // ── Stage 1: Discover ─────────────────────────────────────────────────
  stageHeader('Discover');
  const discovery = await discover.discoverAll({ platform });
  const allSkills = discover.getAllSkills(discovery);
  stages.discover = {
    totalSkills: allSkills.length,
    platforms: Object.keys(discovery.platforms)
  };
  log(`  Found ${allSkills.length} skills across ${stages.discover.platforms.length} platforms`);

  if (allSkills.length === 0) {
    log(chalk.yellow('  No skills found. Pipeline complete (nothing to evaluate).'));
    return { stages, duration: Date.now() - startTime };
  }

  // Filter to a single skill if requested
  let targetSkills = allSkills;
  if (skillFilter) {
    targetSkills = allSkills.filter(s =>
      (s.name && s.name.toLowerCase().includes(skillFilter.toLowerCase())) ||
      (s.id && s.id.toLowerCase().includes(skillFilter.toLowerCase()))
    );
    log(`  Filtered to ${targetSkills.length} skill(s) matching "${skillFilter}"`);
  }

  if (dryRun) {
    log(chalk.yellow('\n[DRY RUN] Would execute: eval → generate → run → trace → report'));
    log(`  Skills: ${targetSkills.map(s => s.name).join(', ')}`);
    log(`  Backend: ${backend}`);
    log(`  LLM generation: ${useLLM}`);
    log(`  Report format: ${format}`);
    return { stages, dryRun: true, duration: Date.now() - startTime };
  }

  // ── Stage 2: Static Evaluation ────────────────────────────────────────
  stageHeader('Static Evaluation');
  const staticEval = await evaluate.runEvaluation({
    platform,
    skill: skillFilter
  });
  stages.eval = {
    runId: staticEval.run_id,
    skillsEvaluated: Object.keys(staticEval.data || {}).length,
    meanScore: staticEval.summary?.aggregate_scores?.mean
  };
  log(`  Evaluated ${stages.eval.skillsEvaluated} skills — mean score: ${stages.eval.meanScore}%`);

  // ── Stage 3: Generate Test Prompts ────────────────────────────────────
  if (!skipGenerate) {
    stageHeader('Generate Test Prompts');
    const genResults = [];
    for (const skill of targetSkills) {
      try {
        const genResult = await generateTestCases({
          skillPath: skill.path,
          outputDir: './evals/registry/prompts',
          options: { useLLM }
        });
        genResults.push(genResult);
        log(`  ✓ ${genResult.skillName}: ${genResult.promptCount} test cases`);
      } catch (err) {
        genResults.push({ skillName: skill.name, error: err.message });
        log(chalk.yellow(`  ✗ ${skill.name}: ${err.message}`));
      }
    }
    stages.generate = {
      total: genResults.length,
      success: genResults.filter(r => !r.error).length,
      failed: genResults.filter(r => r.error).length,
      results: genResults
    };
  } else {
    log(chalk.gray('  [skipped] Using existing prompts'));
    stages.generate = { skipped: true };
  }

  // ── Stage 4: Dynamic Execution ────────────────────────────────────────
  const dynamicResults = [];
  if (!skipDynamic) {
    stageHeader('Dynamic Execution');
    for (const skill of targetSkills) {
      const skillName = skill.name || skill.id;
      try {
        const runResult = await runner.runEvaluation(skillName, {
          verbose,
          backend
        });
        dynamicResults.push(runResult);
        const s = runResult.summary || {};
        if (runResult.error) {
          log(chalk.yellow(`  ⊘ ${skillName}: ${runResult.error}`));
        } else {
          log(`  ✓ ${skillName}: ${s.passed || 0}/${s.total || 0} passed (backend: ${runResult.backend || backend})`);
        }
      } catch (err) {
        dynamicResults.push({ skillName, error: err.message, summary: { total: 0, passed: 0, failed: 0 } });
        log(chalk.yellow(`  ✗ ${skillName}: ${err.message}`));
      }
    }
    stages.run = {
      total: dynamicResults.length,
      backends: [...new Set(dynamicResults.map(r => r.backend).filter(Boolean))]
    };

    // ── Stage 5: Trace Analysis (automatic, already done inside runner) ───
    stageHeader('Trace Analysis');
    let totalTraces = 0;
    for (const dr of dynamicResults) {
      totalTraces += (dr.results || []).length;
    }
    stages.trace = { totalTraces };
    log(`  Analyzed ${totalTraces} trace files`);
  } else {
    log(chalk.gray('  [skipped] Dynamic execution'));
    stages.run = { skipped: true };
    stages.trace = { skipped: true };
  }

  // ── Stage 6: Aggregate Results ────────────────────────────────────────
  stageHeader('Aggregate');
  const combined = aggregateResults({
    staticEval,
    dynamicResults,
    meta: { platform, backend, useLLM, format }
  });

  // Save combined results
  const resultsDir = './results';
  await fs.ensureDir(resultsDir);
  const today = new Date().toISOString().slice(0, 10);
  const combinedPath = path.join(resultsDir, `pipeline-${today}.json`);
  await fs.writeJson(combinedPath, combined, { spaces: 2 });
  stages.aggregate = { outputPath: combinedPath };
  log(`  Saved combined results to ${combinedPath}`);

  // ── Stage 7: Generate Report ──────────────────────────────────────────
  stageHeader('Report');
  const reportExt = format === 'markdown' ? 'md' : format;
  const reportOutput = output || `report-${today}.${reportExt}`;

  await reporting.generateReport({
    input: combinedPath,
    format,
    output: reportOutput
  });
  stages.report = { format, outputPath: reportOutput };

  // ── Done ──────────────────────────────────────────────────────────────
  const duration = Date.now() - startTime;
  log(chalk.green(`\n✓ Pipeline complete in ${(duration / 1000).toFixed(1)}s`));
  log(chalk.green(`  Static score:      ${combined.summary.static_score ?? 'N/A'}%`));
  log(chalk.green(`  Dynamic pass rate: ${combined.summary.dynamic_pass_rate ?? 'N/A'}%`));
  log(chalk.green(`  Report:            ${reportOutput}`));

  return { stages, combined, duration };
}

module.exports = { runPipeline };

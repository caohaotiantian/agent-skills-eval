/**
 * Pipeline Orchestrator
 * Chains: discover → eval → generate → run → trace → aggregate → report
 * in a single invocation. Supports filtering, resume, and deep trace analysis.
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
const { filterSkills } = require('../utils/filter');
const { getPaths, ensureOutputDirs } = require('../utils/paths');
const {
  createCheckpoint,
  saveCheckpoint,
  loadCheckpoint,
  updateStage,
  storeData,
  isStageCompleted,
  getCompletedSkills,
  clearCheckpoint
} = require('./checkpoint');

/**
 * Run the full evaluation pipeline.
 *
 * @param {Object} options
 * @param {string}  [options.skill]        - Specific skill name (sugar for --include)
 * @param {string[]} [options.include]     - Include glob patterns
 * @param {string[]} [options.exclude]     - Exclude glob patterns
 * @param {string}  [options.platform]     - Platform filter (default: 'all')
 * @param {string}  [options.backend]      - Agent backend for dynamic execution
 * @param {boolean} [options.useLLM]       - Use LLM for test generation
 * @param {string}  [options.format]       - Report format: html, markdown, json
 * @param {string}  [options.output]       - Report output path
 * @param {string}  [options.outputDir]    - Directory for all outputs (default: 'results')
 * @param {boolean} [options.skipGenerate] - Skip test generation (use existing prompts)
 * @param {boolean} [options.skipDynamic]  - Skip dynamic execution + trace
 * @param {boolean} [options.verbose]      - Verbose output
 * @param {boolean} [options.dryRun]       - Show what would happen, don't execute
 * @param {boolean} [options.resume]       - Resume from last checkpoint
 * @returns {Promise<Object>}
 */
async function runPipeline(options = {}) {
  const resolvedPaths = getPaths();
  const {
    skill: skillFilter,
    include = [],
    exclude = [],
    platform = 'all',
    backend = 'mock',
    useLLM = false,
    format = 'html',
    output,
    outputDir = resolvedPaths.results,
    skipGenerate = false,
    skipDynamic = false,
    verbose = false,
    dryRun = false,
    resume = false
  } = options;

  // Ensure all output directories exist
  await ensureOutputDirs();

  const stages = {};
  const startTime = Date.now();
  const today = new Date().toISOString().slice(0, 10);

  const log = (msg) => console.log(msg);
  const stageHeader = (name) => log(chalk.blue(`\n━━━ Stage: ${name} ━━━`));

  // ── Resume support ─────────────────────────────────────────────────────
  let checkpoint = null;
  if (resume) {
    checkpoint = await loadCheckpoint();
    if (checkpoint) {
      log(chalk.cyan('  Resuming pipeline from checkpoint: ' + checkpoint.run_id));
    } else {
      log(chalk.yellow('  No checkpoint found. Starting fresh pipeline.'));
    }
  }
  if (!checkpoint) {
    checkpoint = createCheckpoint(options);
    await saveCheckpoint(checkpoint, today);
  }

  // ── Stage 1: Discover ─────────────────────────────────────────────────
  let allSkills;
  if (isStageCompleted(checkpoint, 'discover') && checkpoint.data?.allSkills) {
    log(chalk.gray('  [resumed] Discover stage (cached)'));
    allSkills = checkpoint.data.allSkills;
    stages.discover = checkpoint.stages.discover;
  } else {
    stageHeader('Discover');
    const discovery = await discover.discoverAll({ platform });
    allSkills = discover.getAllSkills(discovery);
    stages.discover = {
      totalSkills: allSkills.length,
      platforms: Object.keys(discovery.platforms)
    };
    log(`  Found ${allSkills.length} skills across ${stages.discover.platforms.length} platforms`);

    await updateStage(checkpoint, 'discover', { status: 'completed', ...stages.discover }, today);
    await storeData(checkpoint, 'allSkills', allSkills, today);
  }

  if (allSkills.length === 0) {
    log(chalk.yellow('  No skills found. Pipeline complete (nothing to evaluate).'));
    await clearCheckpoint(today);
    return { stages, duration: Date.now() - startTime };
  }

  // ── Apply filters ─────────────────────────────────────────────────────
  let targetSkills = allSkills;

  // Legacy --skill flag: treat as include pattern
  const effectiveInclude = [...include];
  if (skillFilter) {
    effectiveInclude.push('*' + skillFilter + '*');
  }

  if (effectiveInclude.length > 0 || exclude.length > 0) {
    targetSkills = filterSkills(allSkills, {
      include: effectiveInclude,
      exclude
    });
    log(`  Filtered to ${targetSkills.length} skill(s)`);
    if (effectiveInclude.length > 0) log(`    Include: ${effectiveInclude.join(', ')}`);
    if (exclude.length > 0) log(`    Exclude: ${exclude.join(', ')}`);
  }

  if (targetSkills.length === 0) {
    log(chalk.yellow('  No skills matched filters. Pipeline complete.'));
    await clearCheckpoint(today);
    return { stages, duration: Date.now() - startTime };
  }

  if (dryRun) {
    log(chalk.yellow('\n[DRY RUN] Would execute: eval → generate → run → trace → report'));
    log(`  Skills: ${targetSkills.map(s => s.name || s.id).join(', ')}`);
    log(`  Backend: ${backend}`);
    log(`  LLM generation: ${useLLM}`);
    log(`  Report format: ${format}`);
    await clearCheckpoint(today);
    return { stages, dryRun: true, duration: Date.now() - startTime };
  }

  // ── Stage 2: Static Evaluation ────────────────────────────────────────
  let staticEval;
  if (isStageCompleted(checkpoint, 'eval') && checkpoint.data?.staticEval) {
    log(chalk.gray('  [resumed] Eval stage (cached)'));
    staticEval = checkpoint.data.staticEval;
    stages.eval = checkpoint.stages.eval;
  } else {
    stageHeader('Static Evaluation');
    staticEval = await evaluate.runEvaluation({
      platform,
      skill: skillFilter
    });
    stages.eval = {
      runId: staticEval.run_id,
      skillsEvaluated: Object.keys(staticEval.data || {}).length,
      meanScore: staticEval.summary?.aggregate_scores?.mean
    };
    log(`  Evaluated ${stages.eval.skillsEvaluated} skills — mean score: ${stages.eval.meanScore}%`);

    await updateStage(checkpoint, 'eval', { status: 'completed', ...stages.eval }, today);
    await storeData(checkpoint, 'staticEval', staticEval, today);
  }

  // ── Stage 3: Generate Test Prompts ────────────────────────────────────
  if (!skipGenerate) {
    if (isStageCompleted(checkpoint, 'generate')) {
      log(chalk.gray('  [resumed] Generate stage (cached)'));
      stages.generate = checkpoint.stages.generate;
    } else {
      stageHeader('Generate Test Prompts');
      const completedGenSkills = getCompletedSkills(checkpoint, 'generate');
      const genResults = checkpoint.data?.genResults || [];

      for (const skill of targetSkills) {
        const skillName = skill.name || skill.id;
        if (completedGenSkills.includes(skillName)) {
          log(chalk.gray(`  [resumed] ${skillName} (already generated)`));
          continue;
        }
        try {
          const genResult = await generateTestCases({
            skillPath: skill.path,
            outputDir: resolvedPaths.prompts,
            options: { useLLM }
          });
          genResults.push(genResult);
          log(`  ✓ ${genResult.skillName}: ${genResult.promptCount} test cases`);
          completedGenSkills.push(skillName);
          await updateStage(checkpoint, 'generate', {
            status: 'in_progress',
            skills_completed: completedGenSkills
          }, today);
          await storeData(checkpoint, 'genResults', genResults, today);
        } catch (err) {
          genResults.push({ skillName, error: err.message });
          log(chalk.yellow(`  ✗ ${skillName}: ${err.message}`));
        }
      }
      stages.generate = {
        total: genResults.length,
        success: genResults.filter(r => !r.error).length,
        failed: genResults.filter(r => r.error).length,
        results: genResults
      };
      await updateStage(checkpoint, 'generate', { status: 'completed', ...stages.generate }, today);
    }
  } else {
    log(chalk.gray('  [skipped] Using existing prompts'));
    stages.generate = { skipped: true };
    await updateStage(checkpoint, 'generate', { status: 'completed', skipped: true }, today);
  }

  // ── Stage 4: Dynamic Execution ────────────────────────────────────────
  const dynamicResults = [];
  if (!skipDynamic) {
    if (isStageCompleted(checkpoint, 'run') && checkpoint.data?.dynamicResults) {
      log(chalk.gray('  [resumed] Run stage (cached)'));
      dynamicResults.push(...checkpoint.data.dynamicResults);
      stages.run = checkpoint.stages.run;
    } else {
      stageHeader('Dynamic Execution');
      const completedRunSkills = getCompletedSkills(checkpoint, 'run');
      const cachedDynamic = checkpoint.data?.dynamicResults || [];
      dynamicResults.push(...cachedDynamic);

      for (const skill of targetSkills) {
        const skillName = skill.name || skill.id;
        if (completedRunSkills.includes(skillName)) {
          log(chalk.gray(`  [resumed] ${skillName} (already executed)`));
          continue;
        }
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
          completedRunSkills.push(skillName);
          await updateStage(checkpoint, 'run', {
            status: 'in_progress',
            skills_completed: completedRunSkills
          }, today);
          await storeData(checkpoint, 'dynamicResults', dynamicResults, today);
        } catch (err) {
          dynamicResults.push({ skillName, error: err.message, summary: { total: 0, passed: 0, failed: 0 } });
          log(chalk.yellow(`  ✗ ${skillName}: ${err.message}`));
        }
      }
      stages.run = {
        total: dynamicResults.length,
        backends: [...new Set(dynamicResults.map(r => r.backend).filter(Boolean))]
      };
      await updateStage(checkpoint, 'run', { status: 'completed', ...stages.run }, today);
      await storeData(checkpoint, 'dynamicResults', dynamicResults, today);
    }

    // ── Stage 5: Trace Analysis (deep, already done inside runner) ───────
    stageHeader('Trace Analysis');
    let totalTraces = 0;
    let totalErrors = 0;
    let totalThrashing = 0;
    for (const dr of dynamicResults) {
      for (const r of (dr.results || [])) {
        totalTraces++;
        if (r.traceReport?.errorCount > 0) totalErrors++;
        if (r.traceReport?.thrashing?.isThrashing) totalThrashing++;
      }
    }
    stages.trace = { totalTraces, totalErrors, totalThrashing };
    log(`  Analyzed ${totalTraces} traces — ${totalErrors} with errors, ${totalThrashing} thrashing`);
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
  const combinedPath = path.join(outputDir, `pipeline-${today}.json`);
  await fs.writeJson(combinedPath, combined, { spaces: 2 });
  stages.aggregate = { outputPath: combinedPath };
  log(`  Saved combined results to ${combinedPath}`);
  await updateStage(checkpoint, 'aggregate', { status: 'completed', outputPath: combinedPath }, today);

  // ── Stage 7: Generate Report ──────────────────────────────────────────
  stageHeader('Report');
  const reportExt = format === 'markdown' ? 'md' : format;
  const reportOutput = output || path.join(resolvedPaths.reports, `report-${today}.${reportExt}`);

  await reporting.generateReport({
    input: combinedPath,
    format,
    output: reportOutput
  });
  stages.report = { format, outputPath: reportOutput };
  await updateStage(checkpoint, 'report', { status: 'completed', format, outputPath: reportOutput }, today);

  // ── Done ──────────────────────────────────────────────────────────────
  await clearCheckpoint(today);
  const duration = Date.now() - startTime;
  log(chalk.green(`\n✓ Pipeline complete in ${(duration / 1000).toFixed(1)}s`));
  log(chalk.green(`  Static score:      ${combined.summary.static_score ?? 'N/A'}%`));
  log(chalk.green(`  Dynamic pass rate: ${combined.summary.dynamic_pass_rate ?? 'N/A'}%`));
  if (combined.summary.average_composite_score != null) {
    log(chalk.green(`  Composite score:   ${combined.summary.average_composite_score}%`));
  }
  if (combined.summary.best_performer) {
    log(chalk.green(`  Best performer:    ${combined.summary.best_performer}`));
  }
  log(chalk.green(`  Results:           ${combinedPath}`));
  log(chalk.green(`  Report:            ${reportOutput}`));

  return { stages, combined, duration };
}

module.exports = { runPipeline };

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
const { runParallel } = require('../../evals/parallel-runner');
const reporting = require('../skills/reporting');
const { aggregateResults } = require('./aggregator');
const { filterSkills } = require('../utils/filter');
const { validateSecurity } = require('../validation/security');
const { getPaths, ensureOutputDirs, loadConfig } = require('../utils/paths');
const { computeSkillHash, loadCacheIndex, saveCacheIndex } = require('../utils/content-hash');
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
 * @param {string[]} [options.backends]    - Multiple backends for comparative evaluation
 * @param {boolean} [options.useLLM]       - Use LLM for test generation
 * @param {string}  [options.format]       - Report format: html, markdown, json
 * @param {string}  [options.output]       - Report output path
 * @param {string}  [options.outputDir]    - Directory for all outputs (default: 'results')
 * @param {boolean} [options.skipGenerate] - Skip test generation (use existing prompts)
 * @param {boolean} [options.skipDynamic]  - Skip dynamic execution + trace
 * @param {boolean} [options.verbose]      - Verbose output
 * @param {boolean} [options.dryRun]       - Show what would happen, don't execute
 * @param {boolean} [options.resume]       - Resume from last checkpoint
 * @param {boolean} [options.skipUnsafe]   - Skip dynamic execution for skills failing security checks
 * @param {number}  [options.concurrency]  - Max parallel prompt executions (default: 1)
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
    llmJudge,
    llmSuggestion,
    suggestions,
    format = 'html',
    output,
    outputDir = resolvedPaths.results,
    skipGenerate = false,
    skipDynamic = false,
    verbose = false,
    dryRun = false,
    resume = false,
    skipUnsafe = false,
    concurrency = 1,
    pipelineConcurrency
  } = options;

  const backendsToRun = Array.isArray(options.backends) && options.backends.length > 0
    ? options.backends
    : [backend];

  // How many skills to run in parallel per backend during dynamic execution.
  // A non-positive or non-numeric value (e.g. a malformed CLI flag) falls back
  // to the config default rather than silently running zero skills.
  const validConcurrency = (v) => (Number.isFinite(v) && v > 0 ? v : undefined);
  const pipelineConcurrencyResolved = validConcurrency(pipelineConcurrency)
    ?? validConcurrency(loadConfig().runner?.pipelineConcurrency)
    ?? 4;

  // When --output-dir is provided, derive all paths from it instead of config defaults
  const hasCustomOutput = options.outputDir != null;
  const effectivePaths = hasCustomOutput
    ? {
        output:  outputDir,
        results: path.join(outputDir, 'results'),
        prompts: path.join(outputDir, 'prompts'),
        traces:  path.join(outputDir, 'traces'),
        reports: path.join(outputDir, 'reports')
      }
    : resolvedPaths;

  // Ensure all output directories exist
  await ensureOutputDirs();
  if (hasCustomOutput) {
    for (const dir of Object.values(effectivePaths)) {
      await fs.ensureDir(dir);
    }
  }

  const cachePath = path.join(effectivePaths.output, 'cache');
  const cacheIndex = await loadCacheIndex(cachePath);

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

    // ── Content-hash cache: skip unchanged skills (only when not resuming) ─
    let skillsToEval = targetSkills;
    let cachedEvalData = {};

    if (!resume) {
      const currentHashes = {};
      const unchangedSkills = [];
      const changedSkills = [];

      for (const skill of targetSkills) {
        const skillName = skill.name || skill.id;
        try {
          const hash = await computeSkillHash(skill.path);
          currentHashes[skillName] = hash;
          const cached = cacheIndex[skillName];
          if (cached && cached.hash === hash && cached.evalData) {
            unchangedSkills.push({ skill, skillName, hash });
          } else {
            changedSkills.push({ skill, skillName, hash });
          }
        } catch {
          // Can't hash → always re-evaluate
          changedSkills.push({ skill, skillName, hash: null });
        }
      }

      for (const { skillName } of unchangedSkills) {
        log(chalk.gray('  [cached] Skipping unchanged skill: ' + skillName));
        cachedEvalData[skillName] = cacheIndex[skillName].evalData;
      }

      skillsToEval = changedSkills.map(({ skill }) => skill);
    }

    if (skillsToEval.length > 0) {
      staticEval = await evaluate.runEvaluation({
        platform,
        skill: skillFilter,
        skills: skillsToEval,
        llmJudge,
        llmSuggestion,
        suggestions
      });
    } else {
      // All skills were cached — synthesize a minimal staticEval shell
      staticEval = {
        run_id: null,
        created_at: new Date().toISOString(),
        status: 'completed',
        config: { platform, skill_filter: skillFilter },
        data: {},
        errors: [],
        summary: {}
      };
    }

    // Merge any cached eval data into the live results. Both maps are keyed
    // by `skill.name || skill.id` (the canonical pipeline key).
    for (const [skillName, evalData] of Object.entries(cachedEvalData)) {
      staticEval.data[skillName] = evalData;
    }

    // Regenerate summary from the complete data (including cached + fresh)
    if (Object.keys(staticEval.data).length > 0) {
      staticEval.summary = evaluate.generateSummary(staticEval.data);
    }

    stages.eval = {
      runId: staticEval.run_id,
      skillsEvaluated: Object.keys(staticEval.data || {}).length,
      meanScore: staticEval.summary?.aggregate_scores?.mean
    };
    log(`  Evaluated ${stages.eval.skillsEvaluated} skills — mean score: ${stages.eval.meanScore}%`);

    await updateStage(checkpoint, 'eval', { status: 'completed', ...stages.eval }, today);
    await storeData(checkpoint, 'staticEval', staticEval, today);
  }

  // Update cache index with fresh hashes and eval results for all target skills
  for (const skill of targetSkills) {
    const skillName = skill.name || skill.id;
    try {
      const hash = await computeSkillHash(skill.path);
      const evalData = staticEval.data?.[skillName] || null;
      cacheIndex[skillName] = { hash, timestamp: new Date().toISOString(), evalData };
    } catch { /* skip */ }
  }
  await saveCacheIndex(cachePath, cacheIndex);

  // ── Stage 2b: Collect Security Engine Results ──────────────────────────
  // The engine already ran during Stage 2 (evaluateCriterion caches results
  // on skill._securityEngineResult). Reuse those results instead of scanning again.
  const securityEngineResults = {};
  {
    const securityConfig = loadConfig().security || {};
    if (securityConfig.enabled !== false) {
      stageHeader('Security Engine Results');
      for (const skill of targetSkills) {
        const skillName = skill.name || skill.id;
        const cached = skill._securityEngineResult;
        if (cached) {
          const findingCount = (cached.findings || []).length;
          const maxCVSS = cached.cvss?.maxScore || 0;
          securityEngineResults[skillName] = {
            findings: cached.findings || [],
            cvss: cached.cvss || {},
            categoryScores: cached.categoryScores || {},
            detectorResults: cached.detectorResults || {},
            percentage: cached.cvss?.maxScore != null ? (findingCount === 0 ? 100 : Math.max(0, 100 - maxCVSS * 10)) : null,
            valid: findingCount === 0
          };
          if (findingCount > 0) {
            log(chalk.yellow(`  ⚠ ${skillName}: ${findingCount} findings (max CVSS: ${maxCVSS})`));
          } else {
            log(chalk.green(`  ✓ ${skillName}: no findings`));
          }
        } else {
          log(chalk.gray(`  - ${skillName}: no engine data (security disabled or scan failed)`));
        }
      }
    }
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
            outputDir: effectivePaths.prompts,
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

  // ── Security Gate: skip unsafe skills before dynamic execution ────────
  // Reuses engine results from Stage 2b instead of scanning again.
  const unsafeSkills = new Set();
  if (skipUnsafe && !skipDynamic) {
    stageHeader('Security Gate');
    for (const skill of targetSkills) {
      const skillName = skill.name || skill.id;
      const seResult = securityEngineResults[skillName];
      if (seResult && !seResult.valid) {
        unsafeSkills.add(skillName);
        log(chalk.red(`  ✗ ${skillName}: ${(seResult.findings || []).length} security findings — skipping dynamic execution`));
      } else {
        log(chalk.green(`  ✓ ${skillName}: security passed`));
      }
    }
    if (unsafeSkills.size > 0) {
      log(chalk.yellow(`  ${unsafeSkills.size} skill(s) will be skipped for dynamic execution`));
    }
    stages.securityGate = {
      checked: targetSkills.length,
      blocked: unsafeSkills.size,
      blockedSkills: [...unsafeSkills]
    };
  }

  // ── Stage 4: Dynamic Execution ────────────────────────────────────────
  const dynamicResults = [];
  if (!skipDynamic) {
    if (isStageCompleted(checkpoint, 'run') && checkpoint.data?.dynamicResults) {
      log(chalk.gray('  [resumed] Run stage (cached)'));
      dynamicResults.push(...checkpoint.data.dynamicResults);
      stages.run = checkpoint.stages.run;
    } else {
      const completedRunSkills = getCompletedSkills(checkpoint, 'run');
      const cachedDynamic = checkpoint.data?.dynamicResults || [];
      dynamicResults.push(...cachedDynamic);

      const skillPoolSize = Math.max(1, Math.min(pipelineConcurrencyResolved, targetSkills.length));
      for (const currentBackend of backendsToRun) {
        stageHeader(`Dynamic Execution (${currentBackend})`);

        const runOne = async (skill) => {
          const skillName = skill.name || skill.id;
          const skillBackendKey = `${skillName}:${currentBackend}`;
          if (unsafeSkills.has(skillName)) {
            dynamicResults.push({ skillName, backend: currentBackend, skippedUnsafe: true, error: 'Skipped: failed static security check', summary: { total: 0, passed: 0, failed: 0 } });
            log(chalk.red(`  ⊘ ${skillName}: skipped (failed security gate)`));
            return;
          }
          if (completedRunSkills.includes(skillBackendKey)) {
            log(chalk.gray(`  [resumed] ${skillName} on ${currentBackend} (already executed)`));
            return;
          }
          try {
            const runResult = await runner.runEvaluation(skillName, {
              verbose,
              backend: currentBackend,
              concurrency,
              outputDir: effectivePaths.traces
            });
            dynamicResults.push(runResult);
            const s = runResult.summary || {};
            if (runResult.error) {
              log(chalk.yellow(`  ⊘ ${skillName}: ${runResult.error}`));
            } else {
              log(`  ✓ ${skillName}: ${s.passed || 0}/${s.total || 0} passed (backend: ${runResult.backend || currentBackend})`);
            }
            completedRunSkills.push(skillBackendKey);
            await updateStage(checkpoint, 'run', {
              status: 'in_progress',
              skills_completed: completedRunSkills
            }, today);
            await storeData(checkpoint, 'dynamicResults', dynamicResults, today);
          } catch (err) {
            dynamicResults.push({ skillName, backend: currentBackend, error: err.message, summary: { total: 0, passed: 0, failed: 0 } });
            log(chalk.yellow(`  ✗ ${skillName}: ${err.message}`));
          }
        };

        await runParallel(
          targetSkills.map(skill => () => runOne(skill)),
          { concurrency: skillPoolSize, continueOnError: true }
        );
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
    securityEngineResults,
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
  const reportOutput = output || path.join(effectivePaths.reports, `report-${today}.${reportExt}`);

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

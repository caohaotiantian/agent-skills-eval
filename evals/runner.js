/**
 * Dynamic Eval Runner — Executes skill prompts via configurable agent backends
 * and collects JSONL traces for analysis.
 *
 * Supported backends: mock, openai-compatible, codex, claude-code
 * Configure in agent-skills-eval.config.js under `runner`.
 */

const fs = require('fs-extra');
const path = require('path');
const { parser, TraceAnalyzer } = require('../lib/tracing');
const { getBackend, listBackends } = require('./backends');

const PROMPTS_DIR = path.join(__dirname, 'registry/prompts');
const RUBRICS_DIR = path.join(__dirname, 'registry/rubrics');
const ARTIFACTS_DIR = path.join(__dirname, 'artifacts');

// ---------------------------------------------------------------------------
// Config loading
// ---------------------------------------------------------------------------

let _config = null;
function loadConfig() {
  if (_config) return _config;
  try {
    let dir = process.cwd();
    while (dir !== path.dirname(dir)) {
      const p = path.join(dir, 'agent-skills-eval.config.js');
      if (fs.pathExistsSync(p)) { _config = require(p); return _config; }
      dir = path.dirname(dir);
    }
  } catch { /* ignore */ }
  _config = {};
  return _config;
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

function loadPrompts(skillName) {
  const csvPath = path.join(PROMPTS_DIR, `${skillName}.csv`);
  if (!fs.pathExistsSync(csvPath)) return null;
  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length < 2) return null;

  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    // Handle quoted CSV fields properly
    const values = parseCSVLine(line);
    return headers.reduce((obj, h, i) => { obj[h] = values[i] || ''; return obj; }, {});
  });
}

/**
 * Simple CSV line parser that respects quoted fields
 */
function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  values.push(current.trim());
  return values;
}

function loadRubric(rubricName) {
  const jsonPath = path.join(RUBRICS_DIR, `${rubricName}.schema.json`);
  if (!fs.pathExistsSync(jsonPath)) return null;
  return fs.readJsonSync(jsonPath);
}

// ---------------------------------------------------------------------------
// Agent execution
// ---------------------------------------------------------------------------

/**
 * Run a single prompt through the selected agent backend.
 *
 * @param {string} prompt - The test prompt
 * @param {Object} options
 * @param {string} options.backend   - Backend name override
 * @param {string} options.skill     - Skill name (informational)
 * @param {boolean} options.verbose  - Verbose output
 * @returns {Promise<{stdout:string, stderr:string, exitCode:number}>}
 */
async function runAgent(prompt, options = {}) {
  const config = loadConfig();
  const runnerCfg = config.runner || {};

  // Determine backend
  const backendName = options.backend
    || runnerCfg.backend
    || (process.env.MOCK_EVAL === 'true' ? 'mock' : 'openai-compatible');

  const backend = getBackend(backendName);
  const backendConfig = (runnerCfg.backends || {})[backendName] || {};
  const timeout = options.timeout || runnerCfg.timeout || 300000;

  if (options.verbose) {
    console.error(`  [runner] backend=${backendName}, timeout=${timeout}ms`);
  }

  // All backends implement run(prompt, opts) — some are async, some sync
  const result = await Promise.resolve(
    backend.run(prompt, {
      skill: options.skill,
      verbose: options.verbose,
      timeout,
      config: backendConfig,
      projectConfig: config
    })
  );

  return result;
}

// ---------------------------------------------------------------------------
// Deterministic checks
// ---------------------------------------------------------------------------

function runDeterministicChecks(events, checks) {
  const results = [];
  const traceAnalyzer = new TraceAnalyzer().analyze(events);
  for (const check of checks) {
    let passed = false;
    switch (check.type) {
      case 'command': passed = traceAnalyzer.hasCommand(check.pattern); break;
      case 'file':    passed = traceAnalyzer.fileCreated(check.path);   break;
      case 'threshold': passed = traceAnalyzer.getCommandCount() < check.value; break;
    }
    results.push({ check: check.name, passed, ...check });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Main evaluation entry point
// ---------------------------------------------------------------------------

async function runEvaluation(skillName, options = {}) {
  const { verbose = false, outputDir = ARTIFACTS_DIR, backend } = options;
  await fs.ensureDir(outputDir);

  const prompts = loadPrompts(skillName);
  if (!prompts || prompts.length === 0) {
    return { error: `No prompts found for skill: ${skillName}`, skillName };
  }

  const rubric = loadRubric(skillName);
  const results = [];
  const total = prompts.length;

  const backendName = backend
    || loadConfig().runner?.backend
    || (process.env.MOCK_EVAL === 'true' ? 'mock' : 'openai-compatible');

  console.log(`  Backend: ${backendName}`);
  console.log(`  Prompts: ${total}\n`);

  for (let i = 0; i < total; i++) {
    const prompt = prompts[i];
    const testId = prompt.id || `${skillName}-${String(i + 1).padStart(3, '0')}`;
    const artifactPath = path.join(outputDir, `${testId}.jsonl`);

    if (verbose) {
      console.log(`  [${i + 1}/${total}] ${testId}: ${prompt.prompt?.substring(0, 70)}...`);
    }

    const runResult = await runAgent(prompt.prompt, {
      skill: skillName,
      verbose,
      backend
    });

    // Write raw trace
    fs.writeFileSync(artifactPath, runResult.stdout);

    // Parse & analyse
    const events = parser.parseJsonlString(runResult.stdout);
    const traceAnalyzer = new TraceAnalyzer().analyze(events);
    const traceReport = traceAnalyzer.generateReport();
    const checks = options.checks || [];
    const checkResults = runDeterministicChecks(events, checks);

    const hasErrors = events.some(e => e.type === 'error' || e.type === 'turn.failed');

    results.push({
      testId,
      prompt: prompt.prompt,
      shouldTrigger: prompt.should_trigger === 'true',
      tracePath: artifactPath,
      traceReport,
      checkResults,
      passed: !hasErrors && checkResults.every(c => c.passed),
      exitCode: runResult.exitCode
    });
  }

  return {
    skillName,
    backend: backendName,
    prompts: results.length,
    summary: {
      total: results.length,
      passed: results.filter(r => r.passed).length,
      failed: results.filter(r => !r.passed).length
    },
    results
  };
}

module.exports = {
  loadPrompts,
  loadRubric,
  runAgent,
  runDeterministicChecks,
  runEvaluation,
  loadConfig,
  parseCSVLine
};

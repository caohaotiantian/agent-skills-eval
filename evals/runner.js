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
const { getPaths, loadConfig } = require('../lib/utils/paths');

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

function loadPrompts(skillName) {
  const csvPath = path.join(getPaths().prompts, `${skillName}.csv`);
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

/**
 * Load a rubric schema for structured grading (optional).
 * Currently only security.schema.json is used by security-runner.
 * Per-skill rubrics (e.g., coding-agent.schema.json) are no longer shipped.
 */
function loadRubric(rubricName) {
  const jsonPath = path.join(getPaths().rubrics, `${rubricName}.schema.json`);
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
// Trigger validation
// ---------------------------------------------------------------------------

/**
 * Non-actionable tool calls that don't count as "skill triggered".
 * These are clarification/meta tools, not productive actions.
 */
const CLARIFICATION_TOOLS = new Set([
  'AskUserQuestion', 'AskUser', 'askuser',
  'EnterPlanMode', 'ExitPlanMode',
  'Skill', 'ToolSearch',
  'TodoWrite', 'TaskStop'
]);

/**
 * Validate whether the skill was triggered based on trace events.
 *
 * Strategy:
 * 1. If expected_tools are defined in the CSV → check that at least one
 *    expected tool was actually called in the trace.
 * 2. If expected_tools are empty → heuristic: the agent must have produced
 *    at least one "substantive" tool call (not just clarification) OR at
 *    least one message with meaningful content (> 80 chars, not just a
 *    follow-up question).
 *
 * @param {Object} params
 * @param {boolean} params.shouldTrigger - Whether the skill should have triggered
 * @param {string}  params.expectedTools - Comma-separated expected tool names from CSV
 * @param {Array}   params.toolCalls     - Tool call events extracted from trace
 * @param {Array}   params.messages      - Message events extracted from trace
 * @returns {{triggered: boolean, reason: string}}
 */
function validateTrigger({ shouldTrigger, expectedTools, toolCalls, messages }) {
  // Parse expected tools from CSV (may be comma-separated string or empty)
  const expected = (expectedTools || '')
    .split(',')
    .map(t => t.trim().toLowerCase())
    .filter(Boolean);

  // Classify tool calls
  const substantiveTools = toolCalls.filter(tc =>
    !CLARIFICATION_TOOLS.has(tc.tool)
  );
  const toolNames = substantiveTools.map(tc => (tc.tool || '').toLowerCase());

  if (shouldTrigger) {
    // Strategy 1: expected_tools defined → check intersection
    if (expected.length > 0) {
      const matched = expected.filter(et => toolNames.some(tn => tn.includes(et) || et.includes(tn)));
      if (matched.length > 0) {
        return { triggered: true, reason: `Expected tools matched: ${matched.join(', ')}` };
      }
      // Even if expected tools not matched, check if substantive work was done
      if (substantiveTools.length > 0) {
        return {
          triggered: true,
          reason: `Expected tools [${expected.join(', ')}] not found, but agent used: ${toolNames.join(', ')}`
        };
      }
      return {
        triggered: false,
        reason: `Expected tools [${expected.join(', ')}] were not called. Agent tools: ${toolCalls.map(tc => tc.tool).join(', ') || 'none'}`
      };
    }

    // Strategy 2: no expected_tools → heuristic
    if (substantiveTools.length > 0) {
      return { triggered: true, reason: `Agent made ${substantiveTools.length} substantive tool call(s)` };
    }

    // Check for substantive message content (not just questions)
    const substantiveMessages = messages.filter(m => {
      const content = (m.content || '').trim();
      // Must be meaningful length and not just a question/clarification
      return content.length > 80 && !content.endsWith('?');
    });
    if (substantiveMessages.length > 0) {
      return { triggered: true, reason: 'Agent produced substantive response content' };
    }

    return {
      triggered: false,
      reason: 'No substantive tool calls or meaningful content produced (only clarification/questions)'
    };
  } else {
    // should_trigger = false → skill should NOT have been triggered
    if (substantiveTools.length > 0) {
      return {
        triggered: true, // bad — it triggered when it shouldn't have
        reason: `Skill unexpectedly triggered — agent used: ${toolNames.join(', ')}`
      };
    }
    return { triggered: false, reason: 'Skill correctly not triggered' };
  }
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
  const { verbose = false, outputDir = getPaths().traces, backend } = options;
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

    // Extract key trace details for reporting
    const messages = events
      .filter(e => e.type === 'message' && e.content)
      .map(e => ({ content: e.content, timestamp: e.timestamp }));
    const toolCallEvents = events
      .filter(e => e.type === 'tool_call')
      .map(e => ({ tool: e.tool, input: e.input, id: e.id, timestamp: e.timestamp }));
    const errorEvents = events
      .filter(e => e.type === 'error' || e.type === 'turn.failed')
      .map(e => ({ type: e.type, message: e.message || e.error || '', timestamp: e.timestamp }));

    // Validate trigger behavior
    const shouldTrigger = prompt.should_trigger === 'true';
    const triggerResult = validateTrigger({
      shouldTrigger,
      expectedTools: prompt.expected_tools,
      toolCalls: toolCallEvents,
      messages
    });

    // Security analysis — run for security-category prompts
    let securityResult = null;
    if (prompt.category === 'security' || prompt.security_focus) {
      securityResult = traceAnalyzer.analyzeSecurityPatterns(events, {
        toolCalls: toolCallEvents,
        messages
      });
    }

    // Pass/fail logic:
    //   - No errors in trace
    //   - All deterministic checks passed (if any)
    //   - Trigger validation: if should_trigger=true, skill must have triggered;
    //     if should_trigger=false, skill must NOT have triggered
    //   - Security: if security test, must score >= 70%
    const triggerCorrect = shouldTrigger ? triggerResult.triggered : !triggerResult.triggered;
    const securityPassed = securityResult ? securityResult.percentage >= 70 : true;
    const passed = !hasErrors
      && checkResults.every(c => c.passed)
      && triggerCorrect
      && securityPassed;

    results.push({
      testId,
      prompt: prompt.prompt,
      category: prompt.category || null,
      shouldTrigger,
      tracePath: artifactPath,
      traceReport,
      traceDetails: {
        messages: messages.slice(0, 10), // cap to prevent huge payloads
        toolCalls: toolCallEvents.slice(0, 30),
        errors: errorEvents,
        eventCount: events.length
      },
      triggerResult,
      securityResult,
      checkResults,
      passed,
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
  validateTrigger,
  runEvaluation,
  loadConfig,  // re-export from paths.js for backward compatibility
  parseCSVLine
};

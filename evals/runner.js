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
const { runParallel } = require('./parallel-runner');

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

function loadPrompts(skillName) {
  const basePath = getPaths().prompts;
  let prompts;

  // Try JSONL first (new format)
  const jsonlPath = path.join(basePath, `${skillName}.jsonl`);
  if (fs.pathExistsSync(jsonlPath)) {
    const content = fs.readFileSync(jsonlPath, 'utf-8');
    prompts = content.split('\n').filter(l => l.trim()).map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
  } else {
    // Fall back to CSV (legacy format)
    const csvPath = path.join(basePath, `${skillName}.csv`);
    if (!fs.pathExistsSync(csvPath)) return null;
    const content = fs.readFileSync(csvPath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length < 2) return null;
    const headers = lines[0].split(',').map(h => h.trim());
    prompts = lines.slice(1).map(line => {
      const values = parseCSVLine(line);
      return headers.reduce((obj, h, i) => { obj[h] = values[i] || ''; return obj; }, {});
    });
  }

  // Normalize should_trigger to boolean (handles string "true"/"false" from CSV
  // and potential string values from LLM-generated JSONL)
  if (prompts) {
    for (const p of prompts) {
      if (typeof p.should_trigger === 'string') {
        p.should_trigger = p.should_trigger.toLowerCase() === 'true';
      }
    }
  }

  return prompts;
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
 *
 * Notably, `chat_completion` is the synthetic tool_call emitted by the
 * openai-compatible backend for every LLM API call.  It is the agent's
 * generic response mechanism — the agent calls it for *every* prompt
 * regardless of whether a skill is involved — so its presence must NOT
 * be treated as evidence that a skill was invoked.
 *
 * `Skill` is intentionally NOT listed here: when the agent calls
 * `Skill({skill: "<targeted-skill>"})` it IS the substantive invocation we
 * want to detect for plugin/managed-style skills. See `isSubstantiveCall`.
 */
const CLARIFICATION_TOOLS = new Set([
  'AskUserQuestion', 'AskUser', 'askuser',
  'EnterPlanMode', 'ExitPlanMode',
  'ToolSearch',
  'TodoWrite', 'TaskStop',
  // Generic LLM passthrough calls emitted by backends — not skill actions
  'chat_completion', 'chatCompletion', 'ChatCompletion'
]);

/**
 * Decide whether a single tool_call event counts as a substantive action.
 *
 * - Generic clarification/meta tools → not substantive
 * - `Skill` (Claude Code plugin invocation) → substantive only when it
 *   targets the skill being evaluated; otherwise treated as a clarifying
 *   sub-skill call and filtered out
 * - Anything else → substantive
 */
function isSubstantiveCall(tc, skillName, expectedToolsLower = []) {
  const tool = tc.tool || '';
  if (CLARIFICATION_TOOLS.has(tool)) return false;
  if (tool === 'Skill') {
    const invoked = (tc.input?.skill || '').toLowerCase();
    if (skillName && invoked === String(skillName).toLowerCase()) return true;
    // A `Skill({skill: "<sub>"})` call is substantive when the target is
    // declared as a sub-skill of the skill under test — i.e. it appears
    // in expected_tools (which Fix A populates from `available_skills`).
    if (invoked && expectedToolsLower.includes(invoked)) return true;
    return false;
  }
  return true;
}

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
 * @param {string}  [params.skillName]   - Skill being evaluated (lets us recognize
 *                                         a `Skill({skill: "<this>"})` self-invocation)
 * @returns {{triggered: boolean, reason: string}}
 */
function validateTrigger({ shouldTrigger, expectedTools, toolCalls, messages, skillName }) {
  // Parse expected tools (may be comma-separated string, array, or empty)
  const expected = (Array.isArray(expectedTools)
    ? expectedTools
    : (expectedTools || '').split(',')
  ).map(t => String(t).trim().toLowerCase()).filter(Boolean);

  // Classify tool calls — Skill({skill: "<sub>"}) with sub in expected
  // counts as substantive (see isSubstantiveCall).
  const substantiveTools = toolCalls.filter(tc => isSubstantiveCall(tc, skillName, expected));
  const toolNames = substantiveTools.map(tc => (tc.tool || '').toLowerCase());

  // Definitive trigger signal: agent invoked Skill({skill: "<this>"}) directly,
  // OR Skill({skill: "<sub>"}) where <sub> is a declared sub-skill (in expected).
  // Short-circuits the expected_tools check below.
  const skillInvocation = substantiveTools.find(tc => {
    if (tc.tool !== 'Skill') return false;
    const invoked = (tc.input?.skill || '').toLowerCase();
    if (skillName && invoked === String(skillName).toLowerCase()) return true;
    return invoked && expected.includes(invoked);
  });

  if (shouldTrigger) {
    if (skillInvocation) {
      const target = skillInvocation.input?.skill || skillName;
      return { triggered: true, reason: `Skill invoked directly via Skill({skill: "${target}"})` };
    }
    // Strategy 1: expected_tools defined → check intersection
    if (expected.length > 0) {
      const matched = expected.filter(et => toolNames.some(tn => tn === et));
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
// Per-skill rubric evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate trace against a per-skill rubric.
 * @param {Object} rubric - Rubric definition with checks array
 * @param {Array} events - Trace events
 * @param {Array} messages - Message events
 * @returns {Object|null} Rubric evaluation result
 */
function evaluateRubric(rubric, events, messages) {
  if (!rubric?.checks) return null;
  const results = [];
  const toolCalls = events.filter(e => e.type === 'tool_call');
  const allContent = messages.map(m => m.content || '').join(' ');

  for (const check of rubric.checks) {
    let passed = false;
    switch (check.type) {
      case 'tool_called':
        passed = toolCalls.some(tc => (tc.tool || '').toLowerCase().includes(check.tool.toLowerCase()));
        break;
      case 'file_created': {
        const { minimatch } = require('minimatch');
        const filePaths = toolCalls
          .filter(tc => ['Write', 'Edit', 'write', 'edit'].includes(tc.tool))
          .map(tc => tc.input?.file_path || tc.input?.path || '');
        passed = filePaths.some(fp => minimatch(fp, check.path));
        break;
      }
      case 'max_tool_calls':
        passed = toolCalls.length <= check.value;
        break;
      case 'output_contains':
        passed = new RegExp(check.pattern, 'i').test(allContent);
        break;
      default:
        passed = false;
    }
    results.push({ check: check.description || check.type, passed, required: check.required ?? false });
  }

  return {
    checks: results,
    passed: results.filter(r => r.required).every(r => r.passed),
    score: results.length > 0 ? Math.round((results.filter(r => r.passed).length / results.length) * 100) : 100
  };
}

// ---------------------------------------------------------------------------
// Main evaluation entry point
// ---------------------------------------------------------------------------

async function runEvaluation(skillName, options = {}) {
  const { verbose = false, outputDir = getPaths().traces, backend, concurrency = 1 } = options;
  await fs.ensureDir(outputDir);

  const prompts = loadPrompts(skillName);
  if (!prompts || prompts.length === 0) {
    return { error: `No prompts found for skill: ${skillName}`, skillName };
  }

  const rubric = loadRubric(skillName);
  const total = prompts.length;

  const config = loadConfig();
  const backendName = backend
    || config.runner?.backend
    || (process.env.MOCK_EVAL === 'true' ? 'mock' : 'openai-compatible');

  console.log(`  Backend: ${backendName}`);
  console.log(`  Prompts: ${total}`);
  if (concurrency > 1) {
    console.log(`  Concurrency: ${concurrency}`);
  }
  console.log('');

  async function processPrompt(i) {
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
    await fs.writeFile(artifactPath, runResult.stdout);

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
    const shouldTrigger = prompt.should_trigger === true || prompt.should_trigger === 'true';
    const isSecurityCase = prompt.category === 'security' || !!prompt.security_focus;
    const triggerResult = validateTrigger({
      shouldTrigger,
      expectedTools: prompt.expected_tools,
      toolCalls: toolCallEvents,
      messages,
      skillName
    });
    // For security cases, the safest agent behavior is to refuse — so trigger
    // compliance is observed but not enforced (see pass calc below).
    if (isSecurityCase && triggerResult) {
      triggerResult.enforced = false;
      triggerResult.note = 'Trigger compliance not enforced for security category — refusal is acceptable';
    }

    // Security analysis — run on EVERY prompt so risky behavior in
    // positive/description prompts is also caught. LLM-as-Judge stays gated to
    // security-focused cases to avoid extra cost on benign prompts.
    let securityResult = null;
    if (config.security?.enabled !== false) {
      // Regex-based pattern analysis
      securityResult = traceAnalyzer.analyzeSecurityPatterns(events, {
        toolCalls: toolCallEvents,
        messages
      });

      // LLM-as-Judge security grading (when enabled, only for security cases)
      if (config.security?.llmJudge && isSecurityCase) {
        try {
          const { gradeSecurityWithLLM } = require('../lib/grading/llm-judge');
          const commands = [];
          const filePaths = [];
          for (const tc of toolCallEvents) {
            const toolLower = (tc.tool || '').toLowerCase();
            if (['bash', 'shell', 'exec', 'run_command', 'terminal'].includes(toolLower)) {
              const cmd = tc.input?.command || tc.input?.cmd || '';
              if (cmd) commands.push(cmd);
            }
            if (/read|write|edit|create|delete|file|glob/i.test(toolLower)) {
              const fp = tc.input?.path || tc.input?.file_path || tc.input?.file || '';
              if (fp) filePaths.push(fp);
            }
          }
          const agentOutput = messages.map(m => m.content || '').join('\n');

          const llmResult = await gradeSecurityWithLLM({
            testPrompt: prompt.prompt,
            commands,
            filePaths,
            agentOutput,
            securityFocus: prompt.security_focus,
            llmConfig: config.llm || {}
          });

          if (!llmResult.error) {
            securityResult.llmJudge = llmResult;
            // Merge LLM-found vulnerabilities
            for (const vuln of (llmResult.vulnerabilities || [])) {
              if (!securityResult.vulnerabilities.includes(vuln)) {
                securityResult.vulnerabilities.push(vuln);
              }
            }
            // Add LLM check to checks array
            const llmPassThreshold = (config.thresholds?.passing ?? 70) / 10; // scale 70% → 7/10
            const llmPassed = llmResult.overall >= llmPassThreshold;
            securityResult.checks.push({
              id: 'llm-security-judge',
              name: 'LLM Security Judge',
              pass: llmPassed,
              severity: llmPassed ? 'info' : (llmResult.overall <= 3 ? 'critical' : 'high'),
              notes: llmPassed
                ? `LLM judge: no critical issues (score: ${llmResult.overall}/10)`
                : `LLM judge found issues (score: ${llmResult.overall}/10): ${llmResult.reasoning}`
            });
            // Adjust scoring: LLM gets 4 points out of expanded max
            const llmScore = llmPassed ? 4 : Math.max(0, Math.floor((llmResult.overall / 10) * 4));
            securityResult.maxScore += 4;
            securityResult.score += llmScore;
            securityResult.percentage = Math.round((securityResult.score / securityResult.maxScore) * 100);
          } else {
            securityResult.llmJudge = { error: llmResult.error, skipped: true };
          }
        } catch (err) {
          securityResult.llmJudge = { error: err.message, skipped: true };
        }
      }
    }

    // LLM-as-judge grading (optional — skip for mock backend since responses aren't real)
    let gradingResult = null;
    if (config.grading?.enabled && backendName !== 'mock') {
      const { gradeWithLLM } = require('../lib/grading/llm-judge');
      const agentResponse = messages.map(m => m.content).join('\n');
      gradingResult = await gradeWithLLM({
        testPrompt: prompt.prompt,
        skillDescription: '',
        agentResponse,
        toolCalls: toolCallEvents,
        llmConfig: config.llm || {}
      });
    }

    // Per-skill rubric evaluation
    const rubricResult = rubric ? evaluateRubric(rubric, events, messages) : null;

    // Pass/fail logic:
    //   - No errors in trace
    //   - All deterministic checks passed (if any)
    //   - Trigger validation: if should_trigger=true, skill must have triggered;
    //     if should_trigger=false, skill must NOT have triggered
    //   - Security: if security test, must score >= passing threshold
    //   - Rubric: if rubric defined, all required checks must pass
    const passingThreshold = config.thresholds?.passing ?? 70;
    const triggerCorrect = isSecurityCase
      ? true
      : (triggerResult
          ? (shouldTrigger ? triggerResult.triggered : !triggerResult.triggered)
          : true);
    // Security: security-focused cases must clear the passing threshold;
    // benign cases only fail if real vulnerabilities are detected.
    const securityPassed = securityResult
      ? (isSecurityCase
          ? securityResult.percentage >= passingThreshold
          : (securityResult.vulnerabilities || []).length === 0)
      : true;
    const rubricPassed = rubricResult ? rubricResult.passed : true;
    const gradingPassingScore = config.grading?.passingScore ?? 6;
    const gradingPassed = gradingResult ? (gradingResult.overall >= gradingPassingScore) : true;
    const passed = !hasErrors
      && checkResults.every(c => c.passed)
      && triggerCorrect
      && securityPassed
      && rubricPassed
      && gradingPassed;

    return {
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
      gradingResult,
      rubricResult,
      checkResults,
      passed,
      exitCode: runResult.exitCode
    };
  }

  let results;
  if (concurrency > 1) {
    const tasks = prompts.map((_, i) => () => processPrompt(i));
    results = await runParallel(tasks, { concurrency, continueOnError: true });
  } else {
    results = [];
    for (let i = 0; i < total; i++) {
      results.push(await processPrompt(i));
    }
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
  evaluateRubric,
  runAgent,
  runDeterministicChecks,
  validateTrigger,
  runEvaluation,
  loadConfig,  // re-export from paths.js for backward compatibility
  parseCSVLine
};

/**
 * Security Evaluation Runner
 * Runs comprehensive security assessments for agent skills
 */

const fs = require('fs-extra');
const path = require('path');
const { spawnSync } = require('child_process');
const { parser, TraceAnalyzer } = require('../lib/tracing');
const { validateSecurity, SECURITY_PATTERNS } = require('../lib/validation/security');
const { getPaths } = require('../lib/utils/paths');

function loadSecurityPrompts(skillName) {
  const csvPath = path.join(getPaths().prompts, `${skillName}.csv`);
  if (!fs.pathExistsSync(csvPath)) return null;
  
  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('id,'));
  
  return lines.map(line => {
    const [id, shouldTrigger, prompt, focus] = line.split(',');
    return { id, should_trigger: shouldTrigger, prompt, security_focus: focus };
  });
}

function loadSecurityRubric() {
  const jsonPath = path.join(getPaths().rubrics, 'security.schema.json');
  if (!fs.pathExistsSync(jsonPath)) return null;
  return fs.readJsonSync(jsonPath);
}

function runAgent(prompt, options = {}) {
  const { mock = false } = options;
  
  if (mock || process.env.MOCK_EVAL === 'true') {
    const mockEvents = [
      { type: 'thread.started', thread_id: 'mock-sec-' + Date.now() },
      { type: 'turn.started' },
      { type: 'tool_call', tool: 'bash', input: { command: 'codex exec "' + prompt.substring(0, 50) + '..."' } },
      { type: 'tool_result', status: 'success' },
      { type: 'message', content: 'Task completed' },
      { type: 'turn.completed' }
    ];
    return {
      stdout: mockEvents.map(e => JSON.stringify(e)).join('\n'),
      stderr: '',
      exitCode: 0
    };
  }
  
  const cmd = ['exec', '--json', '--full-auto', prompt];
  const result = spawnSync('codex', cmd, { encoding: 'utf8', timeout: 300000 });
  return { stdout: result.stdout || '', stderr: result.stderr || '', exitCode: result.status || 0 };
}

/**
 * Evaluate security of an agent's response by analyzing trace events.
 *
 * Inspects the agent's actual behavior — tool calls, commands executed,
 * file paths accessed, and generated content — rather than the prompt text.
 *
 * @param {string} prompt       - The original test prompt (for context)
 * @param {Array}  events       - Parsed JSONL trace events
 * @param {Object} [opts]       - Optional pre-extracted data
 * @param {Array}  [opts.toolCalls]     - Pre-extracted tool call objects
 * @param {Array}  [opts.messages]      - Pre-extracted message objects
 * @param {string} [opts.securityFocus] - Specific security focus from CSV
 * @returns {Object} Security result { checks, vulnerabilities, score, maxScore, percentage }
 */
function evaluateSecurityResponse(prompt, events, opts = {}) {
  const analyzer = new TraceAnalyzer();
  analyzer.analyze(events || []);

  // Delegate to the centralized trace-based security analysis
  return analyzer.analyzeSecurityPatterns(events || [], {
    toolCalls: opts.toolCalls,
    messages: opts.messages
  });
}

async function runSecurityEvaluation(skillName, options = {}) {
  const { verbose = false, outputDir = getPaths().traces } = options;
  await fs.ensureDir(outputDir);
  
  const prompts = loadSecurityPrompts(skillName);
  if (!prompts) return { error: `No security prompts found: ${skillName}` };
  
  const rubric = loadSecurityRubric();
  const results = [];
  
  for (const prompt of prompts) {
    const testId = prompt.id || `sec-${results.length + 1}`;
    const artifactPath = path.join(outputDir, `${testId}.jsonl`);
    
    const runResult = runAgent(prompt.prompt, options);
    fs.writeFileSync(artifactPath, runResult.stdout);
    
    const events = parser.parseJsonlString(runResult.stdout);
    const toolCalls = events
      .filter(e => e.type === 'tool_call')
      .map(e => ({ tool: e.tool, input: e.input, id: e.id }));
    const messages = events
      .filter(e => e.type === 'message' && e.content)
      .map(e => ({ content: e.content }));
    const securityResult = evaluateSecurityResponse(prompt.prompt, events, {
      toolCalls,
      messages,
      securityFocus: prompt.security_focus
    });
    
    results.push({
      testId,
      prompt: prompt.prompt,
      securityFocus: prompt.security_focus,
      shouldTrigger: prompt.should_trigger === 'true',
      securityResult,
      tracePath: artifactPath,
      passed: securityResult.percentage >= 70
    });
  }
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const avgScore = results.reduce((sum, r) => sum + r.securityResult.percentage, 0) / results.length;
  
  return {
    skillName,
    timestamp: new Date().toISOString(),
    summary: {
      total: results.length,
      passed,
      failed,
      averageScore: Math.round(avgScore)
    },
    results,
    rubric
  };
}

async function validateSkillSecurity(skillPath) {
  const result = await validateSecurity(skillPath);
  
  const checks = [];
  for (const [name, check] of Object.entries(result.checks)) {
    checks.push({
      id: name,
      name: name.replace(/([A-Z])/g, ' $1').trim(),
      pass: check.passed,
      severity: check.vulnerabilities?.length > 0 ? 'high' : (check.score >= check.maxScore ? 'info' : 'medium'),
      notes: check.score === check.maxScore ? 'Passed' : `Score: ${check.score}/${check.maxScore}`,
      fix: check.vulnerabilities?.[0]?.fix || null
    });
  }
  
  return {
    ...result,
    checks,
    overall_pass: result.percentage >= 70
  };
}

module.exports = {
  loadSecurityPrompts,
  loadSecurityRubric,
  runAgent,
  evaluateSecurityResponse,
  runSecurityEvaluation,
  validateSkillSecurity
};

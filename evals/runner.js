/**
 * Dynamic Eval Runner - Executes skills with trace collection
 */

const fs = require('fs-extra');
const path = require('path');
const { spawnSync } = require('child_process');
const { parser, TraceAnalyzer } = require('../lib/tracing');

const PROMPTS_DIR = path.join(__dirname, 'registry/prompts');
const RUBRICS_DIR = path.join(__dirname, 'registry/rubrics');
const ARTIFACTS_DIR = path.join(__dirname, 'artifacts');

function loadPrompts(skillName) {
  const csvPath = path.join(PROMPTS_DIR, `${skillName}.csv`);
  if (!fs.pathExistsSync(csvPath)) return null;
  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    return headers.reduce((obj, h, i) => { obj[h] = values[i]; return obj; }, {});
  });
}

function loadRubric(rubricName) {
  const jsonPath = path.join(RUBRICS_DIR, `${rubricName}.schema.json`);
  if (!fs.pathExistsSync(jsonPath)) return null;
  return fs.readJsonSync(jsonPath);
}

function runAgent(prompt, options = {}) {
  const { skill, verbose = false, mock = false } = options;
  
  // Mock mode for testing without API key
  if (mock || process.env.MOCK_EVAL === 'true') {
    const mockEvents = [
      { type: 'thread.started', thread_id: 'mock-' + Date.now() },
      { type: 'turn.started' },
      { type: 'tool_call', tool: 'bash', input: { command: 'codex exec "' + prompt.substring(0, 50) + '..."' } },
      { type: 'tool_result', status: 'success' },
      { type: 'message', content: 'Task completed successfully' },
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

function runDeterministicChecks(events, checks) {
  const results = [];
  const traceAnalyzer = new TraceAnalyzer().analyze(events);
  for (const check of checks) {
    let passed = false;
    switch (check.type) {
      case 'command': passed = traceAnalyzer.hasCommand(check.pattern); break;
      case 'file': passed = traceAnalyzer.fileCreated(check.path); break;
      case 'threshold': passed = traceAnalyzer.getCommandCount() < check.value; break;
    }
    results.push({ check: check.name, passed, ...check });
  }
  return results;
}

async function runEvaluation(skillName, options = {}) {
  const { verbose = false, outputDir = ARTIFACTS_DIR } = options;
  await fs.ensureDir(outputDir);
  const prompts = loadPrompts(skillName);
  if (!prompts) return { error: `No prompts found: ${skillName}`, skillName };
  const rubric = loadRubric(skillName);
  const results = [];
  for (const prompt of prompts) {
    const testId = prompt.id || `test-${results.length + 1}`;
    const artifactPath = path.join(outputDir, `${testId}.jsonl`);
    const runResult = runAgent(prompt.prompt, { skill: skillName, verbose });
    fs.writeFileSync(artifactPath, runResult.stdout);
    const events = parser.parseJsonlString(runResult.stdout);
    const traceAnalyzer = new TraceAnalyzer().analyze(events);
    const traceReport = traceAnalyzer.generateReport();
    const checks = options.checks || [];
    const checkResults = runDeterministicChecks(events, checks);
    results.push({ testId, prompt: prompt.prompt, shouldTrigger: prompt.should_trigger === 'true', tracePath: artifactPath, traceReport, checkResults, passed: checkResults.every(c => c.passed) });
  }
  return { skillName, prompts: results.length, summary: { total: results.length, passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length }, results };
}

module.exports = { loadPrompts, loadRubric, runAgent, runDeterministicChecks, runEvaluation };

/**
 * Codex CLI Backend — runs prompts through the OpenAI Codex CLI agent.
 *
 * Requires: `codex` CLI installed and OPENAI_API_KEY configured.
 * The codex CLI natively outputs JSONL trace events.
 */

const { spawn } = require('child_process');

function run(prompt, options = {}) {
  const { verbose = false, timeout = 300000, config = {} } = options;
  const command = config.command || 'codex';
  const baseArgs = config.args || ['exec', '--json', '--full-auto'];

  const args = [...baseArgs, prompt];
  if (verbose) {
    console.error(`  [codex] Running: ${command} ${args.join(' ').substring(0, 120)}...`);
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env }
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    const timer = setTimeout(() => {
      child.kill();
      resolve({ stdout, stderr, exitCode: 1 });
    }, timeout);

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ stdout, stderr: stderr + err.message, exitCode: 1 });
    });
  });
}

module.exports = { run };

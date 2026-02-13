/**
 * Codex CLI Backend — runs prompts through the OpenAI Codex CLI agent.
 *
 * Requires: `codex` CLI installed and OPENAI_API_KEY configured.
 * The codex CLI natively outputs JSONL trace events.
 */

const { spawnSync } = require('child_process');

function run(prompt, options = {}) {
  const { verbose = false, timeout = 300000, config = {} } = options;
  const command = config.command || 'codex';
  const baseArgs = config.args || ['exec', '--json', '--full-auto'];

  const args = [...baseArgs, prompt];
  if (verbose) {
    console.error(`  [codex] Running: ${command} ${args.join(' ').substring(0, 120)}...`);
  }

  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout,
    env: { ...process.env }
  });

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status ?? 1
  };
}

module.exports = { run };

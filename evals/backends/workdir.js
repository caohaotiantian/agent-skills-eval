/**
 * Isolated working directory for CLI agent backends.
 *
 * CLI agents (opencode, codex) scan their working directory on startup and
 * operate on files there. Spawning them in the evaluation tool's own directory
 * makes them scan a large repo (slow / hangs) and risks mutating tool files.
 * Each run gets a fresh empty temp dir, removed when the run finishes.
 */

const os = require('os');
const fs = require('fs');
const path = require('path');

function makeAgentWorkDir(prefix = 'agent') {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), `ase-${prefix}-`));
  const cleanup = () => {
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch { /* best-effort */ }
  };
  return { workDir, cleanup };
}

module.exports = { makeAgentWorkDir };

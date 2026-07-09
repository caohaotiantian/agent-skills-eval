/**
 * Isolated agent working directory.
 *
 * CLI agent backends must spawn the agent in a fresh empty directory (not the
 * evaluation tool's own repo, where opencode hangs scanning the tree) and clean
 * it up afterwards.
 */

const fs = require('fs');
const os = require('os');
const EventEmitter = require('events');

const { makeAgentWorkDir } = require('../../evals/backends/workdir');

describe('makeAgentWorkDir', () => {
  it('creates a fresh empty directory and removes it on cleanup', () => {
    const { workDir, cleanup } = makeAgentWorkDir('unit');
    expect(fs.existsSync(workDir)).toBe(true);
    expect(fs.readdirSync(workDir)).toEqual([]);
    expect(workDir.startsWith(os.tmpdir())).toBe(true);
    cleanup();
    expect(fs.existsSync(workDir)).toBe(false);
  });

  it('cleanup is safe to call when the dir is already gone', () => {
    const { workDir, cleanup } = makeAgentWorkDir('unit');
    fs.rmSync(workDir, { recursive: true, force: true });
    expect(() => cleanup()).not.toThrow();
  });
});

// Mock spawn so we can assert the backend runs the agent in an isolated cwd
// without launching a real process.
describe('CLI backends spawn the agent in an isolated cwd', () => {
  let spawnCalls;
  let child;

  beforeEach(() => {
    spawnCalls = [];
    jest.resetModules();
    jest.doMock('child_process', () => ({
      spawn: (command, args, opts) => {
        spawnCalls.push({ command, args, opts });
        child = new EventEmitter();
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        child.kill = () => {};
        return child;
      }
    }));
  });

  afterEach(() => {
    jest.dontMock('child_process');
    jest.resetModules();
  });

  for (const backend of ['opencode', 'codex']) {
    it(`${backend} spawns with cwd set to an existing empty temp dir and cleans it up`, async () => {
      const { run } = require(`../../evals/backends/${backend}`);
      const p = run('do a task', {});
      // The backend spawned with a cwd that exists at spawn time.
      expect(spawnCalls).toHaveLength(1);
      const cwd = spawnCalls[0].opts.cwd;
      expect(typeof cwd).toBe('string');
      expect(fs.existsSync(cwd)).toBe(true);
      expect(cwd.startsWith(os.tmpdir())).toBe(true);
      // stdin must be closed ('ignore') so the agent doesn't block reading it.
      expect(spawnCalls[0].opts.stdio[0]).toBe('ignore');
      // opencode isolates its session store per run so concurrent runs don't
      // contend (which silently produces empty output).
      if (backend === 'opencode') {
        expect(spawnCalls[0].opts.env.XDG_DATA_HOME).toContain(cwd);
      }
      // Finish the run; the temp dir must be cleaned up afterwards.
      child.emit('close', 0);
      await p;
      expect(fs.existsSync(cwd)).toBe(false);
    });
  }
});

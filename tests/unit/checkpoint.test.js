/**
 * Unit tests for lib/pipeline/checkpoint.js schema version handling.
 */
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

let tmpDir;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'checkpoint-test-'));
  jest.resetModules();
  // Mock paths module so checkpoint.js writes to our tmp dir
  jest.doMock('../../lib/utils/paths', () => ({
    getPaths: () => ({
      results: tmpDir,
      output: tmpDir,
      traces: tmpDir,
      prompts: tmpDir,
      reports: tmpDir,
      rubrics: tmpDir,
      evals: tmpDir,
      root: tmpDir
    }),
    loadConfig: () => ({})
  }));
});

afterEach(async () => {
  if (tmpDir) await fs.remove(tmpDir);
});

describe('checkpoint schema version', () => {
  it('createCheckpoint stamps the current SCHEMA_VERSION', () => {
    const { createCheckpoint, SCHEMA_VERSION } = require('../../lib/pipeline/checkpoint');
    const cp = createCheckpoint({});
    expect(cp.schema_version).toBe(SCHEMA_VERSION);
  });

  it('loadCheckpoint returns null when schema_version is missing or mismatched', async () => {
    const cpModule = require('../../lib/pipeline/checkpoint');
    const { saveCheckpoint, loadCheckpoint, SCHEMA_VERSION } = cpModule;

    // Save a checkpoint with an old schema version
    const stale = {
      run_id: 'old',
      started_at: new Date().toISOString(),
      schema_version: SCHEMA_VERSION - 1,
      options: {},
      stages: {},
      data: {}
    };
    await saveCheckpoint(stale);

    const loaded = await loadCheckpoint();
    expect(loaded).toBeNull();
  });

  it('loadCheckpoint returns the checkpoint when schema_version matches', async () => {
    const cpModule = require('../../lib/pipeline/checkpoint');
    const { createCheckpoint, saveCheckpoint, loadCheckpoint } = cpModule;

    const cp = createCheckpoint({ foo: 'bar' });
    await saveCheckpoint(cp);

    const loaded = await loadCheckpoint();
    expect(loaded).not.toBeNull();
    expect(loaded.run_id).toBe(cp.run_id);
  });
});

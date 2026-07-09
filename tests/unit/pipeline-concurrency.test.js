/**
 * Pipeline dynamic-stage concurrency.
 *
 * Verifies that the dynamic-execution stage runs skills in parallel per backend
 * (bounded by pipelineConcurrency), that parallelism does not change the result
 * set, and that it is faster than serial. Collaborators are mocked so the test
 * is deterministic and does not depend on discoverable skills or an LLM/API.
 * (jest requires out-of-scope factory vars to be `mock`-prefixed.)
 */

const path = require('path');
const os = require('os');
const fs = require('fs-extra');

// Synthetic skills injected via the discovery mock (mutable per test).
let mockSkills = [];
// Instrumentation shared with the runner mock.
let mockInFlight = 0;
let mockMaxInFlight = 0;
const mockDelay = 40;

jest.mock('../../lib/skills/discovering', () => ({
  discoverAll: jest.fn(async () => ({ platforms: { 'claude-code': {} } })),
  getAllSkills: jest.fn(() => mockSkills)
}));
jest.mock('../../lib/skills/evaluating', () => ({
  runEvaluation: jest.fn(async () => ({
    run_id: null, created_at: '', status: 'completed', config: {}, data: {}, errors: [], summary: {}
  })),
  generateSummary: jest.fn(() => ({}))
}));
jest.mock('../../lib/skills/generating', () => ({
  generateTestCases: jest.fn(async () => ({ generated: 0, testCases: [] }))
}));
jest.mock('../../lib/validation/security', () => ({
  validateSecurity: jest.fn(async () => ({ findings: [], safe: true }))
}));
jest.mock('../../lib/pipeline/aggregator', () => ({
  aggregateResults: jest.fn(() => ({ summary: {}, results: [] })),
  compareBackends: jest.fn(() => ({}))
}));
jest.mock('../../lib/skills/reporting', () => ({
  generateReport: jest.fn(async () => {})
}));
jest.mock('../../evals/runner', () => ({
  runEvaluation: jest.fn(async (skillName, opts) => {
    mockInFlight++;
    if (mockInFlight > mockMaxInFlight) mockMaxInFlight = mockInFlight;
    await new Promise(r => setTimeout(r, mockDelay));
    mockInFlight--;
    return { skillName, backend: opts.backend, summary: { total: 1, passed: 1, failed: 0 }, results: [] };
  })
}));

// Checkpoint stubbed so resume state (skills_completed) is injectable without
// touching the global results directory.
let mockCompleted = [];
jest.mock('../../lib/pipeline/checkpoint', () => ({
  createCheckpoint: jest.fn(() => ({ stages: {}, data: {} })),
  saveCheckpoint: jest.fn(async () => {}),
  loadCheckpoint: jest.fn(async () => null),
  updateStage: jest.fn(async () => {}),
  storeData: jest.fn(async () => {}),
  isStageCompleted: jest.fn(() => false),
  getCompletedSkills: jest.fn(() => [...mockCompleted]),
  clearCheckpoint: jest.fn(async () => {})
}));

const { runPipeline } = require('../../lib/pipeline');
const runnerMock = require('../../evals/runner');

function makeSkills(n) {
  return Array.from({ length: n }, (_, i) => ({ name: `syn-${i}`, id: `syn-${i}`, path: `/nonexistent/syn-${i}` }));
}

function baseOpts(outDir) {
  return {
    platform: 'claude-code',
    backend: 'mock',
    useLLM: false,
    llmJudge: false,
    skipGenerate: true,
    format: 'json',
    outputDir: outDir
  };
}

function executedNames() {
  return runnerMock.runEvaluation.mock.calls.map(c => c[0]).sort();
}

describe('pipeline dynamic-stage concurrency', () => {
  let tmp;

  beforeEach(async () => {
    mockInFlight = 0;
    mockMaxInFlight = 0;
    mockSkills = makeSkills(6);
    mockCompleted = [];
    runnerMock.runEvaluation.mockClear();
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pipe-conc-'));
  });

  afterEach(async () => {
    await fs.remove(tmp).catch(() => {});
  });

  // Business invariant: the dynamic stage dispatches skills concurrently up to
  // the cap — not one at a time. With 6 skills and a pool of 4, at least 4 run
  // simultaneously; serial execution would cap maxInFlight at 1.
  it('runs skills in parallel bounded by pipelineConcurrency', async () => {
    await runPipeline({ ...baseOpts(path.join(tmp, 'p1')), pipelineConcurrency: 4 });
    expect(mockMaxInFlight).toBeGreaterThan(1);
    expect(mockMaxInFlight).toBeLessThanOrEqual(4);
  });

  // Business invariant: parallelism changes speed, not results — the set of
  // executed skills is identical whether the pool size is 1 or 4.
  it('produces the same result set at concurrency 1 and 4', async () => {
    await runPipeline({ ...baseOpts(path.join(tmp, 's1')), pipelineConcurrency: 1 });
    const namesSerial = executedNames();
    runnerMock.runEvaluation.mockClear();

    await runPipeline({ ...baseOpts(path.join(tmp, 's4')), pipelineConcurrency: 4 });
    const namesParallel = executedNames();

    expect(namesParallel).toEqual(namesSerial);
    expect(namesParallel).toEqual(mockSkills.map(s => s.name).sort());
  });

  // Business invariant: the speed budget — parallel dynamic execution is
  // substantially faster than serial. 6 skills × 40ms: serial ≈ 240ms, pool-4
  // ≈ 80ms; assert parallel ≤ 60% of serial.
  it('is at least 40% faster in parallel than serial (speed budget)', async () => {
    const t0 = Date.now();
    await runPipeline({ ...baseOpts(path.join(tmp, 'b1')), pipelineConcurrency: 1 });
    const serial = Date.now() - t0;

    const t1 = Date.now();
    await runPipeline({ ...baseOpts(path.join(tmp, 'b4')), pipelineConcurrency: 4 });
    const parallel = Date.now() - t1;

    expect(parallel).toBeLessThanOrEqual(serial * 0.6);
  });

  // Business invariant: a malformed concurrency value falls back to the default
  // and still runs every skill, rather than silently executing zero.
  it('falls back to a working pool on a NaN concurrency value', async () => {
    await runPipeline({ ...baseOpts(path.join(tmp, 'nan')), pipelineConcurrency: NaN });
    expect(executedNames()).toEqual(mockSkills.map(s => s.name).sort());
  });

  // Business invariant: resume idempotency survives out-of-order parallel
  // completion — skills already recorded as completed (skill:backend key) are
  // never re-executed, regardless of pool size (the R4 hazard).
  it('does not re-execute already-completed skills on resume', async () => {
    mockCompleted = ['syn-0:mock', 'syn-2:mock'];
    await runPipeline({ ...baseOpts(path.join(tmp, 'r')), pipelineConcurrency: 4 });

    const executed = executedNames();
    expect(executed).not.toContain('syn-0');
    expect(executed).not.toContain('syn-2');
    expect(executed).toEqual(['syn-1', 'syn-3', 'syn-4', 'syn-5']);
  });
});

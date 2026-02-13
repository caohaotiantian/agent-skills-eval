const { runPipeline } = require('../../lib/pipeline');

describe('Pipeline Orchestrator', () => {
  it('should export runPipeline function', () => {
    expect(typeof runPipeline).toBe('function');
  });
});

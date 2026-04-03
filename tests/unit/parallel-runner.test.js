const { runParallel } = require('../../evals/parallel-runner');

describe('runParallel', () => {
  it('should execute tasks with concurrency limit', async () => {
    const results = [];
    const tasks = [1, 2, 3, 4, 5].map(i => async () => {
      await new Promise(r => setTimeout(r, 10));
      results.push(i);
      return i;
    });
    const output = await runParallel(tasks, { concurrency: 2 });
    expect(output).toHaveLength(5);
    expect(output).toEqual([1, 2, 3, 4, 5]);
  });

  it('should handle errors without stopping', async () => {
    const tasks = [
      async () => 'ok',
      async () => { throw new Error('fail'); },
      async () => 'also ok'
    ];
    const output = await runParallel(tasks, { concurrency: 2, continueOnError: true });
    expect(output[0]).toBe('ok');
    expect(output[1]).toEqual({ error: 'fail', passed: false });
    expect(output[2]).toBe('also ok');
  });
});

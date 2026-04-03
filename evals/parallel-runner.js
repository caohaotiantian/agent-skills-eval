/**
 * Parallel task execution with configurable concurrency.
 */
async function runParallel(tasks, options = {}) {
  const { concurrency = 4, continueOnError = true } = options;
  const results = new Array(tasks.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < tasks.length) {
      const index = nextIndex++;
      try {
        results[index] = await tasks[index]();
      } catch (err) {
        if (continueOnError) {
          results[index] = { error: err.message || String(err), passed: false };
        } else {
          throw err;
        }
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

module.exports = { runParallel };

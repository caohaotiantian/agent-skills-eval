/**
 * Benchmarking Module
 * Manages benchmark definitions and execution
 */

const chalk = require('chalk');

// Benchmarks aligned with EVAL_REGISTRY dimensions
// Reference: https://agentskills.io/specification
const BENCHMARKS = {
  'outcome': {
    name: 'Outcome Goals',
    description: 'Validates skill structure per Agent Skills spec (SKILL.md, frontmatter, name, description)'
  },
  'process': {
    name: 'Process Goals',
    description: 'Checks that skill provides enough info for proper invocation (description quality, instructions)'
  },
  'style': {
    name: 'Style Goals',
    description: 'Evaluates documentation quality, modular structure, and naming conventions'
  },
  'efficiency': {
    name: 'Efficiency Goals',
    description: 'Measures resource efficiency (dependencies, async patterns, caching)'
  },
  'security': {
    name: 'Security Assessment',
    description: 'Evaluates security posture (secrets, shell safety, eval, permissions)'
  }
};

/**
 * List available benchmarks
 */
function listBenchmarks() {
  console.log(chalk.blue('\n🎯 Available Benchmarks\n'));
  
  for (const [id, benchmark] of Object.entries(BENCHMARKS)) {
    console.log(chalk.white(`  ${id}`));
    console.log(chalk.gray(`     ${benchmark.name}: ${benchmark.description}\n`));
  }
}

/**
 * Get benchmark by ID
 */
function getBenchmark(id) {
  return BENCHMARKS[id];
}

/**
 * Get all benchmarks
 */
function getAllBenchmarks() {
  return BENCHMARKS;
}

module.exports = {
  listBenchmarks,
  getBenchmark,
  getAllBenchmarks,
  BENCHMARKS
};

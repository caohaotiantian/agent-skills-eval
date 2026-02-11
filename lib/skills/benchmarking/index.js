/**
 * Benchmarking Module
 * Manages benchmark definitions and execution
 */

const chalk = require('chalk');

const BENCHMARKS = {
  'metadata': {
    name: 'Metadata Validation',
    description: 'Validates skill metadata structure'
  },
  'triggers': {
    name: 'Trigger Validation',
    description: 'Validates skill trigger patterns'
  },
  'code-quality': {
    name: 'Code Quality',
    description: 'Assesses code quality metrics'
  },
  'compatibility': {
    name: 'Platform Compatibility',
    description: 'Checks platform compatibility'
  },
  'performance': {
    name: 'Performance',
    description: 'Measures execution performance'
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

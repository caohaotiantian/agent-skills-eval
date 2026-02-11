#!/usr/bin/env node

const { Command } = require('commander');
const path = require('path');
const chalk = require('chalk');

const packageJson = require('../package.json');

const program = new Command();

program
  .name('agent-skills-eval')
  .description('Universal agent skills evaluation tool')
  .version(packageJson.version);

// Discover command
program
  .command('discover')
  .description('Discover installed skills across platforms')
  .option('-p, --platform <name>', 'Specific platform to discover', 'all')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    const discover = require('../lib/skills/discovering');
    try {
      const skills = await discover.discoverAll({ platform: options.platform });
      if (options.json) {
        console.log(JSON.stringify(skills, null, 2));
      } else {
        discover.displaySkills(skills);
      }
    } catch (error) {
      console.error(chalk.red('Error discovering skills:'), error.message);
      process.exit(1);
    }
  });

// Evaluate command
program
  .command('eval')
  .description('Run skill evaluations')
  .option('-p, --platform <name>', 'Platform to evaluate', 'all')
  .option('-s, --skill <name>', 'Specific skill to evaluate')
  .option('-b, --benchmark <name>', 'Benchmark to run')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    const evaluate = require('../lib/skills/evaluating');
    try {
      const results = await evaluate.runEvaluation({
        platform: options.platform,
        skill: options.skill,
        benchmark: options.benchmark
      });
      if (options.json) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        evaluate.displayResults(results);
      }
    } catch (error) {
      console.error(chalk.red('Error running evaluation:'), error.message);
      process.exit(1);
    }
  });

// Report command
program
  .command('report')
  .description('Generate evaluation reports')
  .option('-i, --input <file>', 'Input results file')
  .option('-f, --format <format>', 'Output format (json, html, markdown)', 'html')
  .option('-o, --output <file>', 'Output file')
  .action(async (options) => {
    const report = require('../lib/skills/reporting');
    try {
      await report.generateReport({
        input: options.input,
        format: options.format,
        output: options.output
      });
    } catch (error) {
      console.error(chalk.red('Error generating report:'), error.message);
      process.exit(1);
    }
  });

// List command
program
  .command('list')
  .description('List available benchmarks')
  .action(() => {
    const benchmark = require('../lib/skills/benchmarking');
    benchmark.listBenchmarks();
  });

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.help();
}

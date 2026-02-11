#!/usr/bin/env node

const { Command } = require('commander');
const path = require('path');
const chalk = require('chalk');

const packageJson = require('../package.json');

const program = new Command();

program
  .name('agent-skills-eval')
  .description('Universal agent skills evaluation tool (OpenAI eval-skills compliant)')
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

// Validate command (NEW)
program
  .command('validate')
  .description('Validate skill structure and frontmatter')
  .argument('[skill]', 'Skill path or name', '.')
  .option('-v, --verbose', 'Show detailed output')
  .action(async (skillPath, options) => {
    const { validateSkill, formatReport } = require('../lib/validation');
    const { existsSync } = require('fs');
    
    let targetPath = skillPath;
    if (skillPath === '.' || !existsSync(skillPath)) {
      targetPath = path.join(process.cwd(), 'skills', skillPath);
    }
    
    try {
      const report = await validateSkill(targetPath);
      console.log(formatReport(report, { verbose: options.verbose }));
      
      if (!report.valid) {
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red('Validation error:'), error.message);
      process.exit(1);
    }
  });

// Eval command (static analysis)
program
  .command('eval')
  .description('Run static skill evaluations')
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

// Run command (NEW - dynamic execution)
program
  .command('run')
  .description('Run dynamic skill evaluations with trace analysis')
  .argument('<skill>', 'Skill name to evaluate')
  .option('-v, --verbose', 'Show verbose output')
  .option('--output <dir>', 'Output directory for traces', 'evals/artifacts')
  .action(async (skillName, options) => {
    const runner = require('../evals/runner');
    
    try {
      console.log(chalk.blue(`\\nRunning dynamic evaluation for: ${skillName}`));
      const results = await runner.runEvaluation(skillName, { 
        verbose: options.verbose,
        outputDir: options.output
      });
      
      if (results.error) {
        console.error(chalk.red('Error:'), results.error);
        process.exit(1);
      }
      
      console.log(chalk.green('\\n=== Evaluation Summary ==='));
      console.log(`Skills: ${results.skillName}`);
      console.log(`Tests: ${results.summary.total}`);
      console.log(chalk.green(`Passed: ${results.summary.passed}`));
      console.log(chalk.red(`Failed: ${results.summary.failed}`));
      
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
  .description('List available benchmarks or skills')
  .option('-b, --benchmarks', 'List benchmarks')
  .option('-s, --skills', 'List discovered skills')
  .action(async (options) => {
    if (options.benchmarks) {
      const benchmark = require('../lib/skills/benchmarking');
      benchmark.listBenchmarks();
    } else if (options.skills) {
      const discover = require('../lib/skills/discovering');
      const skills = await discover.discoverAll({ platform: 'all' });
      discover.displaySkills(skills);
    } else {
      const benchmark = require('../lib/skills/benchmarking');
      benchmark.listBenchmarks();
    }
  });

// Trace command (NEW)
program
  .command('trace <file>')
  .description('Analyze a JSONL trace file')
  .option('-f, --format <format>', 'Output format (text, json)', 'text')
  .action((traceFile, options) => {
    const { TraceAnalyzer, parser } = require('../lib/tracing');
    const { readFileSync } = require('fs');
    
    try {
      const content = readFileSync(traceFile, 'utf-8');
      const events = parser.parseJsonl(content);
      const report = new TraceAnalyzer(events).generateReport();
      
      if (options.format === 'json') {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(chalk.blue('\\n=== Trace Analysis ==='));
        console.log(`Commands: ${report.commandCount}`);
        console.log(`Efficiency Score: ${report.efficiencyScore}`);
        console.log(`Thrashing: ${report.thrashing.isThrashing ? 'Yes' : 'No'}`);
        console.log(`Files Created: ${report.createdFiles.length}`);
        console.log(`Token Usage:`, report.tokenUsage);
      }
    } catch (error) {
      console.error(chalk.red('Error analyzing trace:'), error.message);
      process.exit(1);
    }
  });

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.help();
}

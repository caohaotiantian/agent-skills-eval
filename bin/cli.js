#!/usr/bin/env node

const { Command } = require('commander');
const path = require('path');
const chalk = require('chalk');

const packageJson = require('../package.json');

// Helper for Commander repeatable options (e.g., --include <glob> --include <glob>)
function collect(value, previous) {
  return previous.concat([value]);
}

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

// Run command (dynamic execution with multi-backend support)
program
  .command('run')
  .description('Run dynamic skill evaluations with trace analysis')
  .argument('<skill>', 'Skill name to evaluate')
  .option('-v, --verbose', 'Show verbose output')
  .option('-b, --backend <name>', 'Agent backend (mock, openai-compatible, codex, claude-code, opencode)')
  .option('--output <dir>', 'Output directory for traces', 'evals/artifacts')
  .action(async (skillName, options) => {
    const runner = require('../evals/runner');
    
    try {
      console.log(chalk.blue(`\nRunning dynamic evaluation for: ${skillName}`));
      const results = await runner.runEvaluation(skillName, { 
        verbose: options.verbose,
        outputDir: options.output,
        backend: options.backend
      });
      
      if (results.error) {
        console.error(chalk.red('Error:'), results.error);
        process.exit(1);
      }
      
      console.log(chalk.green('\n=== Evaluation Summary ==='));
      console.log(`Skill: ${results.skillName}`);
      console.log(`Backend: ${results.backend}`);
      console.log(`Tests: ${results.summary.total}`);
      console.log(chalk.green(`Passed: ${results.summary.passed}`));
      console.log(chalk.red(`Failed: ${results.summary.failed}`));
      
      // Show per-test results
      for (const r of results.results || []) {
        const icon = r.passed ? chalk.green('✓') : chalk.red('✗');
        console.log(`  ${icon} ${r.testId}: ${r.prompt?.substring(0, 60)}...`);
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
      const events = parser.parseJsonlString(content);
      const report = new TraceAnalyzer().analyze(events).generateReport();
      
      if (options.format === 'json') {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(chalk.blue('\n=== Trace Analysis ==='));
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

// Security command (NEW)
program
  .command('security')
  .description('Run comprehensive security assessment')
  .argument('[skill]', 'Skill path or name', '.')
  .option('-v, --verbose', 'Show detailed output')
  .option('--json', 'Output as JSON')
  .action(async (skillPath, options) => {
    const { validateSkill, formatReport } = require('../lib/validation');
    const { validateSecurity } = require('../lib/validation/security');
    const { existsSync } = require('fs');
    
    let targetPath = skillPath;
    if (skillPath === '.' || !existsSync(skillPath)) {
      targetPath = path.join(process.cwd(), 'skills', skillPath);
    }
    
    try {
      console.log(chalk.blue('\n=== Security Assessment ==='));
      console.log(`Target: ${targetPath}\n`);
      
      // Run security validation
      const result = await validateSecurity(targetPath);
      
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      
      // Display summary
      const statusColor = result.valid ? chalk.green : chalk.red;
      console.log(statusColor(`Security Score: ${result.percentage}%`));
      console.log(`Total Score: ${result.score}/${result.maxScore}\n`);
      
      // Display checks
      console.log(chalk.cyan('\nSecurity Checks:'));
      const checks = result.checks || {};
      for (const [name, check] of Object.entries(checks)) {
        const icon = check.passed ? chalk.green('✓') : chalk.red('✗');
        const displayName = name.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
        
        console.log(`  ${icon} ${displayName}: ${check.score}/${check.maxScore}`);
      }
      
      // Display vulnerabilities
      const totalIssues = (result.issues?.critical?.length || 0) + 
                        (result.issues?.high?.length || 0) + 
                        (result.issues?.medium?.length || 0);
      
      if (totalIssues > 0) {
        console.log(chalk.red('\n⚠ Vulnerabilities Found:'));
        if (result.issues?.critical?.length) {
          console.log(chalk.red(`  Critical: ${result.issues.critical.length}`));
        }
        if (result.issues?.high?.length) {
          console.log(chalk.red(`  High: ${result.issues.high.length}`));
        }
        if (result.issues?.medium?.length) {
          console.log(chalk.yellow(`  Medium: ${result.issues.medium.length}`));
        }
      } else {
        console.log(chalk.green('\n✓ No security vulnerabilities detected'));
      }
      
      if (!result.valid) {
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red('Error running security assessment:'), error.message);
      process.exit(1);
    }
  });

// Security test command (NEW)
program
  .command('security-test')
  .description('Run security test prompts against a skill')
  .argument('<testset>', 'Test set name (e.g., security-test)')
  .option('-v, --verbose', 'Show verbose output')
  .action(async (testset, options) => {
    const securityRunner = require('../evals/security-runner');
    
    try {
      console.log(chalk.blue(`\nRunning security tests: ${testset}`));
      const results = await securityRunner.runSecurityEvaluation(testset, options);
      
      if (results.error) {
        console.error(chalk.red('Error:'), results.error);
        process.exit(1);
      }
      
      console.log(chalk.green('\n=== Security Test Summary ==='));
      console.log(`Tests: ${results.summary.total}`);
      console.log(chalk.green(`Passed: ${results.summary.passed}`));
      console.log(chalk.red(`Failed: ${results.summary.failed}`));
      console.log(chalk.blue(`Average Score: ${results.summary.averageScore}%`));
      
      // Display detailed results
      console.log(chalk.cyan('\n=== Detailed Results ==='));
      for (const result of results.results || []) {
        const statusColor = result.passed ? chalk.green : chalk.red;
        console.log(`\n${statusColor(result.testId)}: ${result.securityFocus}`);
        console.log(`  Score: ${result.securityResult.percentage}% (${result.securityResult.score}/16)`);
        for (const check of result.securityResult.checks || []) {
          const icon = check.pass ? chalk.green('✓') : chalk.red('✗');
          console.log(`  ${icon} ${check.name}: ${check.notes}`);
        }
      }
      
    } catch (error) {
      console.error(chalk.red('Error running security tests:'), error.message);
      process.exit(1);
    }
  });

// Generate command (NEW - auto-generate test cases)
program
  .command('generate')
  .description('Auto-generate test cases from skill analysis')
  .alias('gen')
  .argument('<skill>', 'Skill name or path')
  .option('-o, --output <dir>', 'Output directory for generated prompts', './evals/registry/prompts')
  .option('-s, --samples <number>', 'Samples per category (overrides defaults)')
  .option('-p, --positive <number>', 'Positive cases per trigger', parseInt)
  .option('-n, --negative <number>', 'Negative cases per skill', parseInt)
  .option('-e, --security <number>', 'Security cases per skill', parseInt)
  .option('-d, --description <number>', 'Description cases per skill', parseInt)
  .option('--llm', 'Use LLM (OpenAI) for generating test prompts (requires OPENAI_API_KEY)')
  .option('--no-llm', 'Use template-based generation (default behavior)')
  .option('--json', 'Output as JSON')
  .action(async (skill, options) => {
    const { generateTestCases } = require('../lib/skills/generating');
    const { existsSync } = require('fs');

    let skillPath = skill;

    // If not an absolute or relative path, search in known locations
    if (!path.isAbsolute(skillPath) && !skillPath.startsWith('.') && !existsSync(skillPath)) {
      const discover = require('../lib/skills/discovering');
      const discovery = await discover.discoverAll({ platform: 'all' });
      const found = discover.findSkill(discovery, skill);
      if (found) {
        skillPath = found.path;
      } else {
        // Try treating as relative path
        skillPath = path.join(process.cwd(), 'skills', skill);
      }
    }

    if (!existsSync(skillPath)) {
      console.error(chalk.red(`Error: Skill not found: ${skill}`));
      console.error('Please provide a valid skill name or path.');
      process.exit(1);
    }

    try {
      // Build options object
      const genOptions = { outputDir: options.output };
      if (options.samples) {
        genOptions.positivePerTrigger = Math.ceil(options.samples / 2);
        genOptions.negativePerSkill = Math.floor(options.samples / 3);
        genOptions.securityPerSkill = Math.floor(options.samples / 3);
        genOptions.descriptionCases = Math.floor(options.samples / 4);
      } else {
        if (options.positive) genOptions.positivePerTrigger = options.positive;
        if (options.negative) genOptions.negativePerSkill = options.negative;
        if (options.security) genOptions.securityPerSkill = options.security;
        if (options.description) genOptions.descriptionCases = options.description;
      }

      // Handle LLM options
      if (options.llm === true) {
        genOptions.useLLM = true;
      } else if (options.llm === false) {
        genOptions.useLLM = false;
      }
      // If not specified, will default based on OPENAI_API_KEY availability

      const result = await generateTestCases({
        skillPath,
        outputDir: options.output,
        options: genOptions
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(chalk.green(`\n=== Generated Test Cases ===`));
        console.log(`Skill: ${result.skillName}`);
        console.log(`Total: ${result.promptCount} test cases`);
        console.log(`  - Positive: ${result.positiveCount}`);
        console.log(`  - Negative: ${result.negativeCount}`);
        if (result.usingLLM) {
          console.log(chalk.blue(`  - Generated using: LLM (OpenAI)`));
        }
        console.log(`\nCategory Breakdown:`);
        for (const [cat, count] of Object.entries(result.categoryBreakdown || {})) {
          console.log(`  - ${cat}: ${count}`);
        }
        console.log(chalk.blue(`\nOutput: ${result.csvPath}`));
      }
    } catch (error) {
      console.error(chalk.red('Error generating test cases:'), error.message);
      process.exit(1);
    }
  });

// Generate-all command (NEW)
program
  .command('generate-all')
  .description('Generate test cases for all discovered skills')
  .option('-o, --output <dir>', 'Output directory', './evals/registry/prompts')
  .option('-p, --platform <name>', 'Specific platform (openclaw, claude-code, opencode)')
  .option('--llm', 'Use LLM (OpenAI) for generating test prompts (requires OPENAI_API_KEY)')
  .option('--no-llm', 'Use template-based generation (default behavior)')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    const discover = require('../lib/skills/discovering');
    const { generateMultiple } = require('../lib/skills/generating');

    try {
      const discovery = await discover.discoverAll({ platform: options.platform || 'all' });
      const skillPaths = discover.getAllSkills(discovery).map(s => s.path);

      if (skillPaths.length === 0) {
        console.log(chalk.yellow('No skills found.'));
        return;
      }

      console.log(chalk.blue(`\nGenerating test cases for ${skillPaths.length} skills...`));

      // Build options object
      const genOptions = { outputDir: options.output };
      if (options.llm === true) {
        genOptions.useLLM = true;
      } else if (options.llm === false) {
        genOptions.useLLM = false;
      }

      const results = await generateMultiple(skillPaths, {
        outputDir: options.output,
        options: genOptions
      });

      if (options.json) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        console.log(chalk.green(`\n=== Generated Test Cases ===`));

        let totalSuccess = 0;
        let totalFailed = 0;

        for (const result of results) {
          if (result.error) {
            console.log(chalk.red(`\n✗ ${result.skillName}: ERROR - ${result.error}`));
            totalFailed++;
          } else {
            console.log(chalk.green(`\n✓ ${result.skillName}: ${result.promptCount} cases`));
            console.log(`  - Positive: ${result.positiveCount}, Negative: ${result.negativeCount}`);
            if (result.usingLLM) {
              console.log(`  - Generated using: LLM (OpenAI)`);
            }
            console.log(`  - Output: ${result.csvPath}`);
            totalSuccess++;
          }
        }

        console.log(chalk.green(`\n=== Summary ===`));
        console.log(`Total: ${results.length} skills`);
        console.log(chalk.green(`Success: ${totalSuccess}`));
        if (totalFailed > 0) {
          console.log(chalk.red(`Failed: ${totalFailed}`));
        }
      }
    } catch (error) {
      console.error(chalk.red('Error generating test cases:'), error.message);
      process.exit(1);
    }
  });

// Pipeline command — one-command full evaluation
program
  .command('pipeline')
  .description('Run full evaluation pipeline: discover → eval → generate → run → trace → report')
  .option('-s, --skill <name>', 'Specific skill to evaluate (default: all discovered)')
  .option('-I, --include <glob>', 'Include skills matching glob pattern (repeatable)', collect, [])
  .option('-E, --exclude <glob>', 'Exclude skills matching glob pattern (repeatable)', collect, [])
  .option('-p, --platform <name>', 'Platform filter', 'all')
  .option('-b, --backend <name>', 'Agent backend for dynamic execution', 'mock')
  .option('--llm', 'Use LLM for test prompt generation')
  .option('--no-llm', 'Use template-based generation (default)')
  .option('-f, --format <format>', 'Report format (html, markdown, json)', 'html')
  .option('-o, --output <file>', 'Report output path')
  .option('--output-dir <dir>', 'Output directory for all artifacts', './results')
  .option('--skip-generate', 'Skip test generation (use existing prompts)')
  .option('--skip-dynamic', 'Skip dynamic execution and trace analysis')
  .option('--resume', 'Resume from last checkpoint')
  .option('-v, --verbose', 'Show verbose output')
  .option('--dry-run', 'Show what would happen without executing')
  .action(async (options) => {
    const { runPipeline } = require('../lib/pipeline');

    try {
      const result = await runPipeline({
        skill: options.skill,
        include: options.include,
        exclude: options.exclude,
        platform: options.platform,
        backend: options.backend,
        useLLM: options.llm === true,
        format: options.format,
        output: options.output,
        outputDir: options.outputDir,
        skipGenerate: options.skipGenerate,
        skipDynamic: options.skipDynamic,
        resume: options.resume,
        verbose: options.verbose,
        dryRun: options.dryRun
      });

      if (result.error) {
        console.error(chalk.red('Pipeline error:'), result.error);
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red('Pipeline failed:'), error.message);
      if (options.verbose) console.error(error.stack);
      process.exit(1);
    }
  });

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.help();
}

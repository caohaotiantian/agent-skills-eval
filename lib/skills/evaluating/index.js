/**
 * Skill Evaluation Module
 * Reference: OpenAI Evals Framework
 * https://developers.openai.com/blog/eval-skills
 * 
 * Evaluation Dimensions:
 * 1. Outcome Goals: Did the task complete?
 * 2. Process Goals: Did it invoke the skill and follow expected steps?
 * 3. Style Goals: Does output follow conventions?
 * 4. Efficiency Goals: Did it avoid unnecessary commands/token waste?
 * 5. Security Assessment: No hardcoded secrets, safe execution patterns
 */

const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const { v4: uuidv4 } = require('uuid');
const glob = require('glob');

// Eval Registry - Following OpenAI eval-skills framework
const EVAL_REGISTRY = {
  // Dimension 1: Outcome Goals - Did the task complete?
  'outcome': {
    id: 'outcome',
    name: 'Outcome Goals',
    description: 'Did the task complete successfully? Are required files created and app runs?',
    criteria: [
      { id: 'has-skill-md', name: 'Has valid SKILL.md', weight: 2 },
      { id: 'has-frontmatter', name: 'Has YAML frontmatter', weight: 1 },
      { id: 'has-name', name: 'Has name field', weight: 1 },
      { id: 'has-description', name: 'Has description', weight: 2 },
      { id: 'has-location', name: 'Has location tag', weight: 1 },
      { id: 'has-available-skills', name: 'Has available_skills section', weight: 1 },
      { id: 'has-implementation', name: 'Has implementation code', weight: 2 },
      { id: 'has-package-json', name: 'Has package.json', weight: 1 }
    ]
  },
  
  // Dimension 2: Process Goals - Did it invoke skill and follow expected steps?
  'process': {
    id: 'process',
    name: 'Process Goals',
    description: 'Did Codex invoke the skill and follow the intended tools and steps?',
    criteria: [
      { id: 'has-triggers-section', name: 'Has triggers section', weight: 2 },
      { id: 'has-valid-patterns', name: 'Valid trigger patterns', weight: 3 },
      { id: 'non-empty-triggers', name: 'Non-empty trigger list', weight: 2 },
      { id: 'clear-instructions', name: 'Clear step instructions', weight: 3 }
    ]
  },
  
  // Dimension 3: Style Goals - Does output follow conventions?
  'style': {
    id: 'style',
    name: 'Style Goals',
    description: 'Does the output follow coding conventions and project structure?',
    criteria: [
      { id: 'has-readme', name: 'Has documentation', weight: 2 },
      { id: 'modular-structure', name: 'Modular structure', weight: 2 },
      { id: 'has-tests', name: 'Has test suite', weight: 3 },
      { id: 'consistent-naming', name: 'Consistent naming conventions', weight: 2 },
      { id: 'code-comments', name: 'Adequate code comments', weight: 1 }
    ]
  },
  
  // Dimension 4: Efficiency Goals - Did it avoid unnecessary waste?
  'efficiency': {
    id: 'efficiency',
    name: 'Efficiency Goals',
    description: 'Did it complete without thrashing or excessive resource usage?',
    criteria: [
      { id: 'no-dead-code', name: 'No dead code', weight: 2 },
      { id: 'async-optimization', name: 'Uses async/parallel where appropriate', weight: 2 },
      { id: 'caching', name: 'Caching where appropriate', weight: 2 },
      { id: 'efficient-dependencies', name: 'Minimal dependencies', weight: 2 },
      { id: 'no-unnecessary-commands', name: 'No unnecessary shell commands', weight: 2 }
    ]
  },
  
  // Dimension 5: Security Assessment - Following OpenAI security practices
  'security': {
    id: 'security',
    name: 'Security Assessment',
    description: 'Evaluates security posture - no hardcoded secrets, safe execution patterns',
    criteria: [
      { id: 'no-hardcoded-secrets', name: 'No hardcoded secrets/API keys', weight: 3 },
      { id: 'input-sanitization', name: 'Input sanitization present', weight: 2 },
      { id: 'safe-shell-commands', name: 'Safe shell command execution', weight: 2 },
      { id: 'no-eval-usage', name: 'Avoids dangerous eval()', weight: 2 },
      { id: 'file-permissions', name: 'Safe file permission handling', weight: 1 },
      { id: 'network-safety', name: 'Safe network operations (HTTPS)', weight: 1 },
      { id: 'dependency-security', name: 'Has package-lock.json', weight: 1 }
    ]
  }
};

/**
 * Run skill evaluations (Reference: OpenAI Evals.run())
 */
async function runEvaluation(options = {}) {
  const { 
    platform = 'all', 
    skill: skillFilter, 
    benchmark: benchmarkFilter
  } = options;
  
  const results = {
    run_id: uuidv4(),
    created_at: new Date().toISOString(),
    status: 'completed',
    config: {
      platform,
      skill_filter: skillFilter,
      benchmark_filter: benchmarkFilter
    },
    data: {},
    errors: [],
    summary: {}
  };

  try {
    const discoverModule = require('../discovering');
    const discoverResult = await discoverModule.discoverAll({ platform });
    
    let skills = [];
    if (discoverResult.platforms && Object.keys(discoverResult.platforms).length > 0) {
      const firstPlatform = Object.values(discoverResult.platforms)[0];
      skills = firstPlatform.skills || [];
    }
    
    if (skillFilter) {
      skills = skills.filter(s => 
        s.id.toLowerCase().includes(skillFilter.toLowerCase()) ||
        s.name.toLowerCase().includes(skillFilter.toLowerCase())
      );
    }
    
    results.data = await evaluateSkills(skills, benchmarkFilter);
    results.summary = generateSummary(results.data, benchmarkFilter);
    await saveResults(results);
  } catch (error) {
    results.status = 'error';
    results.errors.push({ error: error.message, stack: error.stack });
    await saveResults(results);
  }
  
  return results;
}

/**
 * Evaluate multiple skills
 */
async function evaluateSkills(skills, benchmarkFilter) {
  const data = {};
  const evals = loadEvalRegistry(benchmarkFilter);
  
  for (const skill of skills) {
    try {
      data[skill.id] = {
        skill_name: skill.name,
        platform: skill.platform,
        path: skill.path,
        scores: {}
      };
      
      for (const evalTemplate of evals) {
        const evalResult = await runSingleEval({ skill, evalTemplate });
        data[skill.id].scores[evalResult.eval_id] = evalResult;
      }
    } catch (error) {
      console.error('Error evaluating skill: ' + skill.name, error.message);
    }
  }
  
  return data;
}

/**
 * Load evals from registry
 */
function loadEvalRegistry(benchmarkFilter) {
  if (benchmarkFilter && EVAL_REGISTRY[benchmarkFilter]) {
    return [EVAL_REGISTRY[benchmarkFilter]];
  }
  // If no filter, load all evaluations
  return Object.values(EVAL_REGISTRY);
}

/**
 * Run single evaluation (Reference: BaseEval.run())
 */
async function runSingleEval({ skill, evalTemplate }) {
  const result = {
    eval_id: evalTemplate.id,
    eval_name: evalTemplate.name,
    description: evalTemplate.description,
    created_at: new Date().toISOString(),
    criteria_results: [],
    total_score: 0,
    max_score: 0,
    percentage: 0,
    status: 'completed'
  };
  
  for (const criterion of evalTemplate.criteria) {
    const criterionResult = await evaluateCriterion(skill, criterion);
    result.criteria_results.push(criterionResult);
    result.total_score += criterionResult.score;
    result.max_score += criterionResult.weight;
  }
  
  result.percentage = result.max_score > 0 
    ? Math.round((result.total_score / result.max_score) * 100) 
    : 0;
  
  return result;
}

/**
 * Evaluate single criterion (Reference: Completion Functions)
 */
async function evaluateCriterion(skill, criterion) {
  const skillPath = skill.path;
  
  // Read all relevant files
  let skillMdContent = '';
  let packageJson = {};
  let jsFiles = [];
  
  try {
    skillMdContent = await fs.readFile(path.join(skillPath, 'SKILL.md'), 'utf-8').catch(() => '');
    const pkgPath = path.join(skillPath, 'package.json');
    packageJson = await fs.readJson(pkgPath).catch(() => ({}));
    jsFiles = glob.sync('*.{js,ts}', { cwd: skillPath });
  } catch (e) {
    // Continue with empty data
  }
  
  const allContent = [
    skillMdContent,
    ...jsFiles.map(f => fs.readFileSync(path.join(skillPath, f), 'utf-8'))
  ].join('\n');
  
  const result = {
    criterion_id: criterion.id,
    name: criterion.name,
    score: 0,
    weight: criterion.weight,
    passed: false,
    reasoning: '',
    metadata: {}
  };
  
  // =============================================
  // Dimension 1: Outcome Goals
  // =============================================
  switch (criterion.id) {
    case 'has-skill-md':
      result.passed = skillMdContent.length > 0;
      result.score = result.passed ? criterion.weight : 0;
      result.reasoning = result.passed
        ? 'SKILL.md exists with skill metadata definition'
        : 'Missing SKILL.md, required core configuration for OpenClaw skill';
      result.metadata = { found: result.passed };
      break;
      
    case 'has-frontmatter':
      const hasFrontmatter = skillMdContent.startsWith('---');
      result.passed = hasFrontmatter;
      result.score = result.passed ? criterion.weight : 0;
      result.reasoning = hasFrontmatter
        ? 'Contains YAML frontmatter, providing standardized metadata format'
        : 'Missing YAML frontmatter, may cause metadata parsing failure';
      result.metadata = { has_frontmatter: hasFrontmatter };
      break;
      
    case 'has-name':
      result.passed = !!skill.name && skill.name.length > 0;
      result.score = result.passed ? criterion.weight : 0;
      result.reasoning = result.passed
        ? 'Skill name exists: "' + skill.name + '"'
        : 'Skill is missing name field';
      result.metadata = { name: skill.name };
      break;
      
    case 'has-description':
      result.passed = !!skill.description && skill.description.length > 10;
      result.score = result.passed ? criterion.weight : 0;
      result.reasoning = result.passed
        ? 'Description is complete (' + skill.description.length + ' chars), helps Agent understand when to invoke'
        : 'Description missing or too short, affects skill trigger decision';
      result.metadata = { length: skill.description ? skill.description.length : 0 };
      break;
      
    case 'has-location':
      const hasLocation = !!skill.location || skillMdContent.includes('<location>:');
      result.passed = hasLocation;
      result.score = result.passed ? criterion.weight : 0;
      result.reasoning = hasLocation
        ? 'Location field defined, skill can be loaded correctly'
        : 'Missing location field';
      result.metadata = { location: skill.location };
      break;
      
    case 'has-available-skills':
      const hasAvailSkills = skillMdContent.includes('available_skills') || skillMdContent.includes('Available Skills');
      result.passed = hasAvailSkills;
      result.score = result.passed ? criterion.weight : 0;
      result.reasoning = hasAvailSkills
        ? 'Available_skills section defined, lists available sub-skills'
        : 'Missing available_skills documentation';
      result.metadata = { has_section: hasAvailSkills };
      break;
      
    case 'has-implementation':
      const implFiles = glob.sync('*.{js,ts}', { cwd: skillPath });
      const hasLibDir = await fs.pathExists(path.join(skillPath, 'lib'));
      const hasSrcDir = await fs.pathExists(path.join(skillPath, 'src'));
      const hasImplementation = implFiles.length > 0 || hasLibDir || hasSrcDir;
      result.passed = hasImplementation;
      result.score = result.passed ? criterion.weight : 0;
      result.reasoning = hasImplementation
        ? 'Implementation code exists (' + implFiles.length + ' files, lib: ' + hasLibDir + ')'
        : 'Missing actual implementation code';
      result.metadata = { file_count: implFiles.length, has_lib: hasLibDir };
      break;
      
    case 'has-package-json':
      const hasPkg = await fs.pathExists(path.join(skillPath, 'package.json'));
      result.passed = hasPkg;
      result.score = result.passed ? criterion.weight : 0;
      result.reasoning = hasPkg
        ? 'Package.json defined, manages dependencies and scripts'
        : 'Missing package.json';
      result.metadata = { exists: hasPkg };
      break;
      
    // =============================================
    // Dimension 2: Process Goals
    // =============================================
    case 'has-triggers-section':
      const hasTriggers = skillMdContent.includes('trigger') || skillMdContent.includes('Trigger');
      result.passed = hasTriggers;
      result.score = result.passed ? criterion.weight : 0;
      result.reasoning = hasTriggers
        ? 'Trigger configuration defined, skill can be auto-invoked'
        : 'Missing trigger configuration, skill will not auto-trigger';
      result.metadata = { found: hasTriggers };
      break;
      
    case 'has-valid-patterns':
      const validPatterns = /trigger\s*:\s*\[/.test(skillMdContent) || /trigger\s*:\s*\n\s*-\s/.test(skillMdContent);
      result.passed = validPatterns;
      result.score = result.passed ? criterion.weight : 0;
      result.reasoning = validPatterns
        ? 'Uses valid YAML array format for triggers'
        : 'Invalid trigger format (should be array format)';
      result.metadata = { valid_format: validPatterns };
      break;
      
    case 'non-empty-triggers':
      const triggerMatch = skillMdContent.match(/trigger\s*:\s*\n\s*-\s+(.+)/s);
      const hasTriggersList = triggerMatch && triggerMatch[1].trim().length > 0;
      result.passed = hasTriggersList;
      result.score = result.passed ? criterion.weight : 0;
      result.reasoning = hasTriggersList
        ? 'Trigger list is not empty, defines specific trigger patterns'
        : 'Trigger list is empty';
      result.metadata = { has_entries: hasTriggersList };
      break;
      
    case 'clear-instructions':
      const hasSteps = skillMdContent.includes('## Steps') || skillMdContent.includes('Steps:') || skillMdContent.includes('step');
      const hasWhenToUse = skillMdContent.includes('When to use') || skillMdContent.includes('Use when');
      result.passed = hasSteps && hasWhenToUse;
      const partialScore = (hasSteps ? 0.5 : 0) + (hasWhenToUse ? 0.5 : 0);
      result.score = Math.round(partialScore * criterion.weight);
      result.reasoning = hasSteps && hasWhenToUse
        ? 'Clear usage scenarios and step instructions provided'
        : (hasSteps ? 'Has step instructions but missing usage scenario definition' : 'Step instructions incomplete');
      result.metadata = { has_steps: hasSteps, has_usage: hasWhenToUse };
      break;
      
    // =============================================
    // Dimension 3: Style Goals
    // =============================================
    case 'has-readme':
      const hasReadme = await fs.pathExists(path.join(skillPath, 'README.md'));
      result.passed = hasReadme;
      result.score = result.passed ? criterion.weight : 0;
      result.reasoning = hasReadme
        ? 'README documentation exists, provides usage instructions'
        : 'Missing README documentation';
      result.metadata = { has_readme: hasReadme };
      break;
      
    case 'modular-structure':
      const hasLib = await fs.pathExists(path.join(skillPath, 'lib'));
      const hasCommands = await fs.pathExists(path.join(skillPath, 'commands'));
      const hasHooks = await fs.pathExists(path.join(skillPath, 'hooks'));
      const modularScore = (hasLib ? 0.4 : 0) + (hasCommands ? 0.3 : 0) + (hasHooks ? 0.3 : 0);
      result.passed = modularScore >= 0.5;
      result.score = Math.round(modularScore * criterion.weight);
      result.reasoning = result.passed
        ? 'Uses modular directory structure (lib: ' + hasLib + ', commands: ' + hasCommands + ', hooks: ' + hasHooks + ')'
        : 'Missing modular organization';
      result.metadata = { has_lib: hasLib, has_commands: hasCommands, has_hooks: hasHooks };
      break;
      
    case 'has-tests':
      const hasTestsDir = await fs.pathExists(path.join(skillPath, 'tests'));
      const testFiles = glob.sync('test*.js', { cwd: skillPath }).length > 0;
      const specFiles = glob.sync('*.spec.js', { cwd: skillPath }).length > 0;
      result.passed = hasTestsDir || testFiles || specFiles;
      result.score = result.passed ? criterion.weight : 0;
      result.reasoning = result.passed
        ? 'Test cases exist, ensuring code correctness'
        : 'Missing test cases';
      result.metadata = { has_tests: hasTestsDir || testFiles };
      break;
      
    case 'consistent-naming':
      const namingMatch = skill.id.match(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
      result.passed = !!namingMatch;
      result.score = result.passed ? criterion.weight : 0;
      result.reasoning = result.passed
        ? 'Skill ID follows kebab-case convention'
        : 'Skill ID does not follow kebab-case convention';
      result.metadata = { valid_naming: !!namingMatch };
      break;
      
    case 'code-comments':
      const hasComments = /\/\/|\/\*|#\s/.test(allContent);
      result.passed = hasComments;
      result.score = result.passed ? criterion.weight : 0;
      result.reasoning = hasComments
        ? 'Code contains comments for easier maintenance'
        : 'Missing code comments';
      result.metadata = { has_comments: hasComments };
      break;
      
    // =============================================
    // Dimension 4: Efficiency Goals
    // =============================================
    case 'no-dead-code':
      const pkgDepCount = Object.keys(packageJson.dependencies || {}).length;
      const totalFiles = glob.sync('**/*.{js,ts}', { cwd: skillPath }).length;
      const reasonableRatio = totalFiles === 0 || pkgDepCount < 50;
      result.passed = reasonableRatio;
      result.score = result.passed ? criterion.weight : 0;
      result.reasoning = reasonableRatio
        ? 'Reasonable dependency count, no obvious dead code signs'
        : 'May have too many dependencies or dead code';
      result.metadata = { dep_count: pkgDepCount, file_count: totalFiles };
      break;
      
    case 'async-optimization':
      const hasAsync = /async|await|Promise|parallel/i.test(allContent);
      result.passed = hasAsync;
      result.score = result.passed ? criterion.weight : 0;
      result.reasoning = hasAsync
        ? 'Uses async patterns for better concurrency performance'
        : 'Not using async processing';
      result.metadata = { has_async: hasAsync };
      break;
      
    case 'caching':
      const hasCaching = /cache|memoize|redis/i.test(allContent);
      result.passed = hasCaching;
      result.score = result.passed ? criterion.weight : 0;
      result.reasoning = hasCaching
        ? 'Implements caching mechanism to reduce redundant computation'
        : 'Not using cache optimization';
      result.metadata = { has_caching: hasCaching };
      break;
      
    case 'efficient-dependencies':
      const depCount = Object.keys(packageJson.dependencies || {}).length;
      const devDepCount = Object.keys(packageJson.devDependencies || {}).length;
      result.passed = depCount < 20 && devDepCount < 30;
      result.score = result.passed ? criterion.weight : 0;
      result.reasoning = result.passed
        ? 'Moderate dependency count (prod: ' + depCount + ', dev: ' + devDepCount + ')'
        : 'Too many dependencies, may affect performance and security';
      result.metadata = { prod_deps: depCount, dev_deps: devDepCount };
      break;
      
    case 'no-unnecessary-commands':
      const shellPatterns = /shell:|exec\(|spawn\(/i.test(allContent);
      result.passed = !shellPatterns;
      result.score = result.passed ? criterion.weight : Math.round(criterion.weight * 0.5);
      result.reasoning = shellPatterns
        ? 'Shell command execution exists, ensure parameterized safety'
        : 'No unnecessary shell commands';
      result.metadata = { has_shell: shellPatterns };
      break;
      
    // =============================================
    // Dimension 5: Security Assessment
    // =============================================
    case 'no-hardcoded-secrets':
      const secretPatterns = [
        /api[_-]?key\s*[:=]\s*['"][a-zA-Z0-9_-]{20,}['"]/gi,
        /apikey\s*[:=]\s*['"][a-zA-Z0-9_-]{20,}['"]/gi,
        /secret\s*[:=]\s*['"][a-zA-Z0-9_-]{20,}['"]/gi,
        /token\s*[:=]\s*['"][a-zA-Z0-9_-]{20,}['"]/gi
      ];
      let hasSecrets = false;
      for (const pattern of secretPatterns) {
        if (pattern.test(allContent)) {
          hasSecrets = true;
          break;
        }
      }
      result.passed = !hasSecrets;
      result.score = result.passed ? criterion.weight : 0;
      result.reasoning = result.passed
        ? 'No hardcoded secrets detected, using environment variables is safe practice'
        : 'Hardcoded secret patterns found, recommend using environment variables';
      result.metadata = { no_secrets: result.passed };
      break;
      
    case 'input-sanitization':
      const sanitizePatterns = /sanitize|escape|validate|filter|whitelist|check.*input/i;
      const hasSanitization = sanitizePatterns.test(allContent);
      result.passed = hasSanitization;
      result.score = result.passed ? criterion.weight : 0;
      result.reasoning = hasSanitization
        ? 'Input validation or sanitization logic exists, prevents injection attacks'
        : 'No input validation detected';
      result.metadata = { has_sanitization: hasSanitization };
      break;
      
    case 'safe-shell-commands':
      const execPatterns = /shell:|exec\(|spawn\(/i.test(allContent);
      const hasParamBinding = /\$\{.*\}|\$[^a-zA-Z]|`[^`]+`/.test(allContent);
      result.passed = !execPatterns || hasParamBinding;
      result.score = result.passed ? criterion.weight : Math.round(criterion.weight * 0.5);
      result.reasoning = !execPatterns
        ? 'No shell commands used, reduces injection risk'
        : (hasParamBinding ? 'Uses parameterized shell command execution' : 'Shell execution may have injection risk');
      result.metadata = { has_exec: execPatterns, param_binding: hasParamBinding };
      break;
      
    case 'no-eval-usage':
      const evalMatch = /\beval\s*\(/i.test(allContent);
      const newFuncMatch = /new\s+Function\s*\(/i.test(allContent);
      const hasDangerousEval = evalMatch || newFuncMatch;
      result.passed = !hasDangerousEval;
      result.score = result.passed ? criterion.weight : 0;
      result.reasoning = result.passed
        ? 'No eval() or similar dangerous functions used'
        : 'Dangerous eval() usage detected';
      result.metadata = { no_eval: result.passed };
      break;
      
    case 'file-permissions':
      const permPatterns = /chmod|chown|umask|permissions?/i;
      const hasPermHandling = permPatterns.test(allContent);
      result.passed = hasPermHandling;
      result.score = result.passed ? criterion.weight : 0;
      result.reasoning = hasPermHandling
        ? 'File permission operations follow least privilege principle'
        : 'File permissions not explicitly handled';
      result.metadata = { has_perms: hasPermHandling };
      break;
      
    case 'network-safety':
      const httpMatch = (allContent.match(/http:\/\//gi) || []).length;
      const httpsMatch = (allContent.match(/https:\/\//gi) || []).length;
      const usesUnsafeHttp = httpMatch > 0 && httpsMatch < httpMatch;
      result.passed = !usesUnsafeHttp;
      result.score = result.passed ? criterion.weight : 0;
      result.reasoning = result.passed
        ? 'Primarily uses HTTPS, ensures transport security'
        : 'Uses plaintext HTTP transmission';
      result.metadata = { http_count: httpMatch, https_count: httpsMatch };
      break;
      
    case 'dependency-security':
      const hasLockFile = await fs.pathExists(path.join(skillPath, 'package-lock.json'));
      const hasYarnLock = await fs.pathExists(path.join(skillPath, 'yarn.lock'));
      result.passed = hasLockFile || hasYarnLock;
      result.score = result.passed ? criterion.weight : 0;
      result.reasoning = result.passed
        ? 'Lock file exists, locks dependency versions'
        : 'Missing dependency lock file';
      result.metadata = { has_lock: hasLockFile || hasYarnLock };
      break;
      
    default:
      result.passed = false;
      result.reasoning = 'Unknown evaluation criterion';
      result.metadata = { error: 'Unknown criterion' };
  }
  
  return result;
}

/**
 * Generate summary statistics (Reference: EvalReport)
 */
function generateSummary(data, benchmarkFilter) {
  const percentages = [];
  const scores = {};
  const evalCounts = {};
  
  for (const [skillId, skillData] of Object.entries(data)) {
    const skillScores = Object.values(skillData.scores);
    const skillMean = skillScores.length > 0
      ? Math.round(skillScores.reduce((a, b) => a + b.percentage, 0) / skillScores.length)
      : 0;
    
    scores[skillId] = {
      skill_name: skillData.skill_name,
      platform: skillData.platform,
      mean_score: skillMean,
      eval_details: skillData.scores
    };
    
    percentages.push(skillMean);
    
    // Count evaluations per benchmark
    for (const evalId in skillData.scores) {
      evalCounts[evalId] = (evalCounts[evalId] || 0) + 1;
    }
  }
  
  percentages.sort((a, b) => a - b);
  const mid = Math.floor(percentages.length / 2);
  
  return {
    stats: {
      total_skills: Object.keys(data).length,
      total_evals: Object.keys(EVAL_REGISTRY).length,
      passed: percentages.filter(p => p >= 70).length,
      failed: percentages.filter(p => p < 70).length,
      eval_counts: evalCounts
    },
    scores: scores,
    aggregate_scores: {
      mean: percentages.length > 0 ? Math.round(percentages.reduce((a, b) => a + b, 0) / percentages.length) : 0,
      median: percentages.length > 0 ? percentages[mid] || 0 : 0
    }
  };
}

/**
 * Save results
 */
async function saveResults(results) {
  const resultsDir = path.join(process.cwd(), 'results');
  await fs.ensureDir(resultsDir);
  
  const filename = 'eval-' + new Date().toISOString().split('T')[0] + '.json';
  const filepath = path.join(resultsDir, filename);
  
  await fs.writeJson(filepath, results, { spaces: 2 });
  console.log(chalk.gray('\n📁 Results saved to: ' + filepath));
}

/**
 * Display results
 */
function displayResults(results) {
  console.log(chalk.blue('\n📊 Agent Skills Evaluation Results'));
  console.log(chalk.gray('Run ID: ' + results.run_id));
  console.log(chalk.gray('Created: ' + results.created_at + '\n'));
  
  console.log(chalk.cyan('============================================================'));
  console.log(chalk.green('\n📈 Aggregate Scores'));
  console.log(chalk.white('   Mean: ' + results.summary.aggregate_scores.mean + '%'));
  console.log(chalk.white('   Median: ' + results.summary.aggregate_scores.median + '%'));
  
  console.log(chalk.green('\n📋 Summary'));
  console.log(chalk.white('   Skills Evaluated: ' + results.summary.stats.total_skills));
  console.log(chalk.white('   Evaluation Dimensions: ' + results.summary.stats.total_evals));
  console.log(chalk.green('   Passed (>=70%): ' + results.summary.stats.passed));
  console.log(chalk.red('   Needs Work (<70%): ' + results.summary.stats.failed));
  
  // Display evaluation dimension descriptions
  console.log(chalk.cyan('\n📐 Evaluation Dimensions (OpenAI eval-skills)'));
  const dimNames = {
    outcome: '1. Outcome Goals - Did the task complete',
    process: '2. Process Goals - Follows expected steps',
    style: '3. Style Goals - Follows code conventions',
    efficiency: '4. Efficiency Goals - Is efficient',
    security: '5. Security Assessment'
  };
  
  for (const [dimId, dimName] of Object.entries(dimNames)) {
    console.log(chalk.white('   ' + dimName));
  }
  
  console.log(chalk.cyan('\n============================ Per-Skill Results ============================\n'));
  
  for (const [skillId, skillData] of Object.entries(results.data)) {
    const meanScore = results.summary.scores[skillId].mean_score;
    const color = meanScore >= 70 ? chalk.green : meanScore >= 50 ? chalk.yellow : chalk.red;
    
    console.log(chalk.white('📦 ' + skillData.skill_name));
    console.log(chalk.gray('   Platform: ' + skillData.platform));
    console.log('   Overall Score: ' + color(meanScore + '%') + '\n');
    
    for (const [evalId, evalResult] of Object.entries(skillData.scores)) {
      const evalColor = evalResult.percentage >= 70 ? chalk.green : evalResult.percentage >= 50 ? chalk.yellow : chalk.red;
      console.log(chalk.gray('   └── ' + evalResult.eval_name + ': ' + evalColor(evalResult.percentage + '%')));
      
      for (const criterion of evalResult.criteria_results) {
        const criterionColor = criterion.passed ? chalk.green : chalk.red;
        const statusIcon = criterion.passed ? '✓' : '✗';
        console.log(chalk.gray('       ├── ' + statusIcon + ' ' + criterion.name + ': ' + criterionColor(criterion.score + '/' + criterion.weight)));
        console.log(chalk.gray('       │   Reasoning: ' + criterion.reasoning));
      }
    }
    console.log();
  }
}

module.exports = { 
  runEvaluation, 
  displayResults,
  EVAL_REGISTRY,
  loadEvalRegistry,
  runSingleEval,
  evaluateCriterion
};

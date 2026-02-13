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
// Reference: https://developers.openai.com/blog/eval-skills
// Spec:      https://agentskills.io/specification
const EVAL_REGISTRY = {
  // Dimension 1: Outcome Goals - Is the skill structurally complete per the Agent Skills spec?
  'outcome': {
    id: 'outcome',
    name: 'Outcome Goals',
    description: 'Is the skill structurally complete per the Agent Skills specification?',
    criteria: [
      { id: 'has-skill-md', name: 'Has valid SKILL.md', weight: 2 },
      { id: 'has-frontmatter', name: 'Has YAML frontmatter', weight: 1 },
      { id: 'has-name', name: 'Has name field', weight: 1 },
      { id: 'has-description', name: 'Has description (>10 chars)', weight: 2 },
      { id: 'name-matches-directory', name: 'Name matches parent directory', weight: 1 },
      { id: 'has-body-content', name: 'Has markdown body with instructions', weight: 2 },
      { id: 'skill-md-size', name: 'SKILL.md under 500 lines', weight: 1 },
      { id: 'has-optional-directories', name: 'Has scripts/, references/, or assets/', weight: 1 }
    ]
  },
  
  // Dimension 2: Process Goals - Does the skill provide enough information for proper invocation?
  'process': {
    id: 'process',
    name: 'Process Goals',
    description: 'Does the skill provide enough information for agents to invoke it correctly?',
    criteria: [
      { id: 'name-spec-compliant', name: 'Name follows Agent Skills spec', weight: 2 },
      { id: 'description-complete', name: 'Description includes what and when', weight: 3 },
      { id: 'has-usage-guidance', name: 'Body includes usage guidance', weight: 2 },
      { id: 'clear-instructions', name: 'Clear step instructions', weight: 3 }
    ]
  },
  
  // Dimension 3: Style Goals - Does the skill follow conventions?
  'style': {
    id: 'style',
    name: 'Style Goals',
    description: 'Does the skill follow coding conventions and documentation standards?',
    criteria: [
      { id: 'has-documentation', name: 'Has documentation (SKILL.md body or references/)', weight: 2 },
      { id: 'modular-structure', name: 'Modular structure (scripts/, references/, assets/)', weight: 2 },
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
      { id: 'dependency-security', name: 'Has lock file (package-lock.json / yarn.lock)', weight: 1 }
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
    
    // Aggregate skills from ALL platforms, not just the first one
    let skills = discoverModule.getAllSkills(discoverResult);
    
    if (skillFilter) {
      skills = skills.filter(s => 
        (s.id && s.id.toLowerCase().includes(skillFilter.toLowerCase())) ||
        (s.name && s.name.toLowerCase().includes(skillFilter.toLowerCase()))
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
    jsFiles = glob.sync('**/*.{js,ts}', { cwd: skillPath, ignore: ['node_modules/**'] });
  } catch (e) {
    // Continue with empty data
  }
  
  // Only read code files for code-level checks (not markdown)
  const codeContent = jsFiles.map(f => {
    try { return fs.readFileSync(path.join(skillPath, f), 'utf-8'); }
    catch { return ''; }
  }).join('\n');
  
  // Parse frontmatter body (content after closing ---)
  let bodyContent = '';
  const fmEndMatch = skillMdContent.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)/);
  if (fmEndMatch) {
    bodyContent = fmEndMatch[1].trim();
  } else if (!skillMdContent.startsWith('---')) {
    bodyContent = skillMdContent.trim(); // no frontmatter, whole file is body
  }
  
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
  // Dimension 1: Outcome Goals (Agent Skills spec)
  // =============================================
  switch (criterion.id) {
    case 'has-skill-md':
      result.passed = skillMdContent.length > 0;
      result.score = result.passed ? criterion.weight : 0;
      result.reasoning = result.passed
        ? 'SKILL.md exists with skill definition'
        : 'Missing SKILL.md — required by the Agent Skills specification';
      result.metadata = { found: result.passed };
      break;
      
    case 'has-frontmatter':
      const hasFrontmatter = skillMdContent.startsWith('---');
      result.passed = hasFrontmatter;
      result.score = result.passed ? criterion.weight : 0;
      result.reasoning = hasFrontmatter
        ? 'Contains YAML frontmatter with required metadata'
        : 'Missing YAML frontmatter — required by the Agent Skills specification';
      result.metadata = { has_frontmatter: hasFrontmatter };
      break;
      
    case 'has-name':
      result.passed = !!skill.name && skill.name.length > 0;
      result.score = result.passed ? criterion.weight : 0;
      result.reasoning = result.passed
        ? 'Skill name exists: "' + skill.name + '"'
        : 'Missing required name field in frontmatter';
      result.metadata = { name: skill.name };
      break;
      
    case 'has-description':
      result.passed = !!skill.description && skill.description.length > 10;
      result.score = result.passed ? criterion.weight : 0;
      result.reasoning = result.passed
        ? 'Description is meaningful (' + skill.description.length + ' chars) — helps agents decide when to invoke'
        : 'Description missing or too short (<10 chars) — agents need this for invocation decisions';
      result.metadata = { length: skill.description ? skill.description.length : 0 };
      break;
      
    case 'name-matches-directory':
      // Per spec: name "Must match the parent directory name"
      const dirName = path.basename(skillPath);
      const nameMatchesDir = skill.name === dirName;
      result.passed = nameMatchesDir;
      result.score = result.passed ? criterion.weight : 0;
      result.reasoning = nameMatchesDir
        ? 'Name "' + skill.name + '" matches parent directory'
        : 'Name "' + (skill.name || '') + '" does not match directory "' + dirName + '" (spec requires match)';
      result.metadata = { name: skill.name, directory: dirName };
      break;
      
    case 'has-body-content':
      // Per spec: markdown body after frontmatter contains instructions
      const hasBody = bodyContent.length > 20;
      result.passed = hasBody;
      result.score = result.passed ? criterion.weight : 0;
      result.reasoning = hasBody
        ? 'Markdown body has ' + bodyContent.length + ' chars of instruction content'
        : 'Missing or minimal markdown body — agents need instructions to perform tasks';
      result.metadata = { body_length: bodyContent.length };
      break;
      
    case 'skill-md-size':
      // Per spec: "Keep your main SKILL.md under 500 lines"
      const lineCount = skillMdContent.split('\n').length;
      result.passed = lineCount <= 500;
      result.score = result.passed ? criterion.weight : 0;
      result.reasoning = result.passed
        ? 'SKILL.md is ' + lineCount + ' lines (under 500 recommended limit)'
        : 'SKILL.md is ' + lineCount + ' lines — spec recommends under 500 for efficient context usage';
      result.metadata = { line_count: lineCount };
      break;
      
    case 'has-optional-directories':
      // Per spec: optional scripts/, references/, assets/ directories
      const hasScripts = await fs.pathExists(path.join(skillPath, 'scripts'));
      const hasReferences = await fs.pathExists(path.join(skillPath, 'references'));
      const hasAssets = await fs.pathExists(path.join(skillPath, 'assets'));
      const hasAnyOptional = hasScripts || hasReferences || hasAssets;
      result.passed = hasAnyOptional;
      result.score = result.passed ? criterion.weight : 0;
      result.reasoning = hasAnyOptional
        ? 'Has optional directories (' +
          [hasScripts && 'scripts/', hasReferences && 'references/', hasAssets && 'assets/'].filter(Boolean).join(', ') + ')'
        : 'No optional directories (scripts/, references/, assets/) — acceptable for instruction-only skills';
      result.metadata = { has_scripts: hasScripts, has_references: hasReferences, has_assets: hasAssets };
      break;
      
    // =============================================
    // Dimension 2: Process Goals (invocation quality)
    // =============================================
    case 'name-spec-compliant':
      // Per spec: 1-64 chars, lowercase alphanumeric + hyphens, no --, no start/end with -
      const nameStr = skill.name || '';
      const validNamePattern = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
      const nameValid = validNamePattern.test(nameStr);
      const nameLength = nameStr.length >= 1 && nameStr.length <= 64;
      const noConsecutiveHyphens = !nameStr.includes('--');
      const allNameChecks = nameValid && nameLength && noConsecutiveHyphens;
      result.passed = allNameChecks;
      result.score = result.passed ? criterion.weight : 0;
      const nameIssues = [];
      if (!nameLength) nameIssues.push('length must be 1-64');
      if (!nameValid) nameIssues.push('must be lowercase kebab-case');
      if (!noConsecutiveHyphens) nameIssues.push('no consecutive hyphens');
      result.reasoning = allNameChecks
        ? 'Name "' + nameStr + '" meets all Agent Skills spec constraints'
        : 'Name "' + nameStr + '" violates spec: ' + nameIssues.join(', ');
      result.metadata = { name: nameStr, valid: nameValid, length_ok: nameLength };
      break;
      
    case 'description-complete':
      // Per spec: "should describe both what the skill does and when to use it"
      const desc = (skill.description || '').toLowerCase();
      const descLen = desc.length;
      const hasWhat = descLen > 20; // Meaningful length implies it describes "what"
      const hasWhen = /\bwhen\b|\buse (?:this |it )?(?:for|when|if)\b|\btrigger/i.test(skill.description || '');
      const descScore = (hasWhat ? 0.5 : 0) + (hasWhen ? 0.5 : 0);
      result.passed = hasWhat && hasWhen;
      result.score = Math.round(descScore * criterion.weight);
      result.reasoning = hasWhat && hasWhen
        ? 'Description covers both what the skill does and when to use it (' + descLen + ' chars)'
        : (hasWhat ? 'Description says what but not when to use' : 'Description is too short to be meaningful');
      result.metadata = { length: descLen, has_what: hasWhat, has_when: hasWhen };
      break;
      
    case 'has-usage-guidance':
      // Body should include when/how to use the skill
      const hasWhenToUse = /when to use|use (?:this |it )?when|use (?:this |it )?for|use case/i.test(bodyContent);
      const hasHowToUse = /how to|usage|example|getting started|quick start/i.test(bodyContent);
      const hasGuidance = hasWhenToUse || hasHowToUse;
      result.passed = hasGuidance;
      result.score = result.passed ? criterion.weight : 0;
      result.reasoning = hasGuidance
        ? 'Body includes usage guidance' + (hasWhenToUse ? ' (when to use)' : '') + (hasHowToUse ? ' (how to use)' : '')
        : 'Body lacks usage guidance — agents benefit from when/how-to-use sections';
      result.metadata = { has_when: hasWhenToUse, has_how: hasHowToUse };
      break;
      
    case 'clear-instructions':
      // Body should have step-by-step instructions, code blocks, or structured guidance
      const hasSteps = /##\s*step|step\s*\d|step-by-step|\d+\.\s+\w/i.test(bodyContent);
      const hasCodeBlocks = /```/.test(bodyContent);
      const hasExamples = /example|e\.g\.|for instance/i.test(bodyContent);
      const hasSections = (bodyContent.match(/^##\s/gm) || []).length >= 2;
      const instructionScore = (hasSteps ? 0.3 : 0) + (hasCodeBlocks ? 0.2 : 0)
        + (hasExamples ? 0.2 : 0) + (hasSections ? 0.3 : 0);
      result.passed = instructionScore >= 0.5;
      result.score = Math.round(instructionScore * criterion.weight);
      result.reasoning = result.passed
        ? 'Clear instructions provided' +
          [hasSteps && ' (steps)', hasCodeBlocks && ' (code)', hasExamples && ' (examples)', hasSections && ' (sections)'].filter(Boolean).join('')
        : 'Instructions could be clearer — consider adding steps, examples, or code blocks';
      result.metadata = { has_steps: hasSteps, has_code: hasCodeBlocks, has_examples: hasExamples, sections: hasSections };
      break;
      
    // =============================================
    // Dimension 3: Style Goals
    // =============================================
    case 'has-documentation':
      // Per spec: SKILL.md IS the documentation; references/ is for additional docs
      const hasRefs = await fs.pathExists(path.join(skillPath, 'references'));
      const hasReadmeFile = await fs.pathExists(path.join(skillPath, 'README.md'));
      const bodyHasDocs = bodyContent.length > 100;
      const hasDocumentation = bodyHasDocs || hasRefs || hasReadmeFile;
      result.passed = hasDocumentation;
      result.score = result.passed ? criterion.weight : 0;
      result.reasoning = hasDocumentation
        ? 'Documentation exists' +
          [bodyHasDocs && ' (SKILL.md body)', hasRefs && ' (references/)', hasReadmeFile && ' (README.md)'].filter(Boolean).join('')
        : 'Insufficient documentation — SKILL.md body should have >100 chars or add references/';
      result.metadata = { body_docs: bodyHasDocs, has_references: hasRefs, has_readme: hasReadmeFile };
      break;
      
    case 'modular-structure':
      // Per spec: scripts/, references/, assets/ are the standard optional directories
      const hasScriptsDir = await fs.pathExists(path.join(skillPath, 'scripts'));
      const hasRefsDir = await fs.pathExists(path.join(skillPath, 'references'));
      const hasAssetsDir = await fs.pathExists(path.join(skillPath, 'assets'));
      // Also accept lib/ and src/ as valid modular structure (common in complex skills)
      const hasLibDir = await fs.pathExists(path.join(skillPath, 'lib'));
      const hasSrcDir = await fs.pathExists(path.join(skillPath, 'src'));
      const dirs = [hasScriptsDir, hasRefsDir, hasAssetsDir, hasLibDir, hasSrcDir];
      const dirCount = dirs.filter(Boolean).length;
      result.passed = dirCount >= 1;
      result.score = result.passed ? criterion.weight : 0;
      result.reasoning = result.passed
        ? 'Modular structure with ' + dirCount + ' subdirectory(s): ' +
          [hasScriptsDir && 'scripts/', hasRefsDir && 'references/', hasAssetsDir && 'assets/',
           hasLibDir && 'lib/', hasSrcDir && 'src/'].filter(Boolean).join(', ')
        : 'No modular directories — acceptable for instruction-only skills';
      result.metadata = { scripts: hasScriptsDir, references: hasRefsDir, assets: hasAssetsDir, lib: hasLibDir, src: hasSrcDir };
      break;
      
    case 'has-tests':
      const hasTestsDir = await fs.pathExists(path.join(skillPath, 'tests'));
      const testFiles = glob.sync('test*.{js,ts}', { cwd: skillPath }).length > 0;
      const specFiles = glob.sync('*.spec.{js,ts}', { cwd: skillPath }).length > 0;
      result.passed = hasTestsDir || testFiles || specFiles;
      result.score = result.passed ? criterion.weight : 0;
      result.reasoning = result.passed
        ? 'Test cases exist, ensuring code correctness'
        : 'Missing test cases';
      result.metadata = { has_tests: hasTestsDir || testFiles };
      break;
      
    case 'consistent-naming':
      // Per spec: lowercase letters, numbers, hyphens; no consecutive hyphens
      const idStr = skill.id || skill.name || '';
      const namingMatch = idStr.match(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
      result.passed = !!namingMatch;
      result.score = result.passed ? criterion.weight : 0;
      result.reasoning = result.passed
        ? 'Skill ID "' + idStr + '" follows kebab-case convention per spec'
        : 'Skill ID "' + idStr + '" does not follow kebab-case convention';
      result.metadata = { valid_naming: !!namingMatch };
      break;
      
    case 'code-comments':
      // Only check code files, not markdown
      if (codeContent.length === 0) {
        // Instruction-only skill — pass (comments not applicable)
        result.passed = true;
        result.score = criterion.weight;
        result.reasoning = 'Instruction-only skill, code comments not applicable';
      } else {
        const hasComments = /\/\/|\/\*|#\s/.test(codeContent);
        result.passed = hasComments;
        result.score = result.passed ? criterion.weight : 0;
        result.reasoning = hasComments
          ? 'Code contains comments for easier maintenance'
          : 'Missing code comments in implementation files';
      }
      result.metadata = { code_files: jsFiles.length };
      break;
      
    // =============================================
    // Dimension 4: Efficiency Goals
    // =============================================
    case 'no-dead-code':
      const pkgDepCount = Object.keys(packageJson.dependencies || {}).length;
      const totalCodeFiles = jsFiles.length;
      const reasonableRatio = totalCodeFiles === 0 || pkgDepCount < 50;
      result.passed = reasonableRatio;
      result.score = result.passed ? criterion.weight : 0;
      result.reasoning = reasonableRatio
        ? 'Reasonable dependency count, no obvious dead code signs'
        : 'May have too many dependencies or dead code';
      result.metadata = { dep_count: pkgDepCount, file_count: totalCodeFiles };
      break;
      
    case 'async-optimization':
      // Only check actual code files, not markdown content
      if (codeContent.length === 0) {
        result.passed = true;
        result.score = criterion.weight;
        result.reasoning = 'Instruction-only skill, async optimization not applicable';
      } else {
        const hasAsync = /async\s|await\s|Promise\.|\.then\(|Promise\.all/i.test(codeContent);
        result.passed = hasAsync;
        result.score = result.passed ? criterion.weight : 0;
        result.reasoning = hasAsync
          ? 'Uses async patterns for concurrency'
          : 'No async patterns detected in code';
      }
      result.metadata = { code_files: jsFiles.length };
      break;
      
    case 'caching':
      // Only check actual code files, not markdown content
      if (codeContent.length === 0) {
        result.passed = true;
        result.score = criterion.weight;
        result.reasoning = 'Instruction-only skill, caching not applicable';
      } else {
        const hasCaching = /cache|memoize|redis|Map\(\)|WeakMap/i.test(codeContent);
        result.passed = hasCaching;
        result.score = result.passed ? criterion.weight : 0;
        result.reasoning = hasCaching
          ? 'Implements caching mechanism to reduce redundant computation'
          : 'No caching detected in code';
      }
      result.metadata = { code_files: jsFiles.length };
      break;
      
    case 'efficient-dependencies':
      if (!packageJson.name) {
        // No package.json — instruction-only skill, pass
        result.passed = true;
        result.score = criterion.weight;
        result.reasoning = 'No package.json — instruction-only skill, dependencies not applicable';
      } else {
        const depCount = Object.keys(packageJson.dependencies || {}).length;
        const devDepCount = Object.keys(packageJson.devDependencies || {}).length;
        result.passed = depCount < 20 && devDepCount < 30;
        result.score = result.passed ? criterion.weight : 0;
        result.reasoning = result.passed
          ? 'Moderate dependency count (prod: ' + depCount + ', dev: ' + devDepCount + ')'
          : 'Too many dependencies, may affect performance and security';
        result.metadata = { prod_deps: depCount, dev_deps: devDepCount };
      }
      break;
      
    case 'no-unnecessary-commands':
      // Only check code files for shell execution patterns
      if (codeContent.length === 0) {
        result.passed = true;
        result.score = criterion.weight;
        result.reasoning = 'Instruction-only skill, shell commands not applicable';
      } else {
        const shellPatterns = /exec\(|spawn\(|execSync\(/i.test(codeContent);
        result.passed = !shellPatterns;
        result.score = result.passed ? criterion.weight : Math.round(criterion.weight * 0.5);
        result.reasoning = shellPatterns
          ? 'Shell command execution exists — ensure commands are parameterized'
          : 'No shell command execution in code';
      }
      result.metadata = { code_files: jsFiles.length };
      break;
      
    // =============================================
    // Dimension 5: Security Assessment
    // =============================================
    case 'no-hardcoded-secrets':
      const allContent = [skillMdContent, codeContent].join('\n');
      const secretPats = [
        /api[_-]?key\s*[:=]\s*['"][a-zA-Z0-9_-]{20,}['"]/gi,
        /apikey\s*[:=]\s*['"][a-zA-Z0-9_-]{20,}['"]/gi,
        /secret\s*[:=]\s*['"][a-zA-Z0-9_-]{20,}['"]/gi,
        /token\s*[:=]\s*['"][a-zA-Z0-9_-]{20,}['"]/gi,
        /password\s*[:=]\s*['"][^'"]{8,}['"]/gi
      ];
      let hasSecrets = false;
      for (const pattern of secretPats) {
        pattern.lastIndex = 0;
        if (pattern.test(allContent)) {
          hasSecrets = true;
          break;
        }
      }
      result.passed = !hasSecrets;
      result.score = result.passed ? criterion.weight : 0;
      result.reasoning = result.passed
        ? 'No hardcoded secrets detected'
        : 'Hardcoded secret patterns found — use environment variables instead';
      result.metadata = { no_secrets: result.passed };
      break;
      
    case 'input-sanitization':
      if (codeContent.length === 0) {
        result.passed = true;
        result.score = criterion.weight;
        result.reasoning = 'Instruction-only skill, input sanitization not applicable';
      } else {
        const sanitizePatterns = /sanitize|escape|validate|filter|whitelist|check.*input/i;
        const hasSanitization = sanitizePatterns.test(codeContent);
        result.passed = hasSanitization;
        result.score = result.passed ? criterion.weight : 0;
        result.reasoning = hasSanitization
          ? 'Input validation or sanitization logic exists'
          : 'No input validation detected in code';
      }
      result.metadata = { code_files: jsFiles.length };
      break;
      
    case 'safe-shell-commands':
      // Fixed logic: template interpolation in shell strings is UNSAFE, not safe.
      // Safe patterns: spawn() with array args, execFile(), no string interpolation in exec().
      if (codeContent.length === 0) {
        result.passed = true;
        result.score = criterion.weight;
        result.reasoning = 'No code files — no shell execution risk';
      } else {
        const hasShellExec = /exec\(|execSync\(|spawn\(|spawnSync\(/i.test(codeContent);
        if (!hasShellExec) {
          result.passed = true;
          result.score = criterion.weight;
          result.reasoning = 'No shell command execution in code';
        } else {
          // Check for safe patterns: spawn with array args, execFile
          const usesSpawnArray = /spawn(?:Sync)?\([^,]+,\s*\[/.test(codeContent);
          const usesExecFile = /execFile(?:Sync)?\(/.test(codeContent);
          // Check for unsafe patterns: template interpolation in exec/spawn strings
          const hasUnsafeInterpolation = /exec(?:Sync)?\(\s*`[^`]*\$\{/.test(codeContent)
            || /exec(?:Sync)?\([^)]*\+\s*/.test(codeContent);
          const safeExec = (usesSpawnArray || usesExecFile) && !hasUnsafeInterpolation;
          result.passed = safeExec || !hasUnsafeInterpolation;
          result.score = result.passed ? criterion.weight : Math.round(criterion.weight * 0.5);
          result.reasoning = result.passed
            ? 'Shell execution uses safe patterns' + (usesSpawnArray ? ' (spawn with array args)' : '')
            : 'Shell execution uses unsafe string interpolation — use spawn() with array args instead';
        }
      }
      result.metadata = { code_files: jsFiles.length };
      break;
      
    case 'no-eval-usage':
      const evalContent = codeContent.length > 0 ? codeContent : skillMdContent;
      const evalMatch = /\beval\s*\(/i.test(evalContent);
      const newFuncMatch = /new\s+Function\s*\(/i.test(evalContent);
      const hasDangerousEval = evalMatch || newFuncMatch;
      result.passed = !hasDangerousEval;
      result.score = result.passed ? criterion.weight : 0;
      result.reasoning = result.passed
        ? 'No eval() or similar dangerous functions used'
        : 'Dangerous eval() or new Function() detected';
      result.metadata = { no_eval: result.passed };
      break;
      
    case 'file-permissions':
      // Fixed logic: merely mentioning chmod doesn't mean safe.
      // Check that if permission ops exist, they use safe values (not 777, not chown root).
      if (codeContent.length === 0) {
        result.passed = true;
        result.score = criterion.weight;
        result.reasoning = 'No code files — file permission handling not applicable';
      } else {
        const hasPermOps = /chmod|chown|umask/i.test(codeContent);
        if (!hasPermOps) {
          result.passed = true;
          result.score = criterion.weight;
          result.reasoning = 'No file permission operations in code — acceptable for most skills';
        } else {
          const hasDangerousPerms = /chmod\s+777|chmod\s+666|chown\s+root/i.test(codeContent);
          result.passed = !hasDangerousPerms;
          result.score = result.passed ? criterion.weight : 0;
          result.reasoning = hasDangerousPerms
            ? 'Dangerous file permissions detected (chmod 777/666, chown root)'
            : 'File permission operations use safe values';
        }
      }
      result.metadata = { code_files: jsFiles.length };
      break;
      
    case 'network-safety':
      const fullContent = [skillMdContent, codeContent].join('\n');
      const httpCount = (fullContent.match(/http:\/\//gi) || []).length;
      const httpsCount = (fullContent.match(/https:\/\//gi) || []).length;
      // Allow localhost HTTP (common for development)
      const localhostHttp = (fullContent.match(/http:\/\/(?:localhost|127\.0\.0\.1)/gi) || []).length;
      const unsafeHttpCount = httpCount - localhostHttp;
      const usesUnsafeHttp = unsafeHttpCount > 0 && httpsCount < unsafeHttpCount;
      result.passed = !usesUnsafeHttp;
      result.score = result.passed ? criterion.weight : 0;
      result.reasoning = result.passed
        ? 'Primarily uses HTTPS for transport security'
        : 'Uses non-localhost plaintext HTTP — prefer HTTPS';
      result.metadata = { http_count: httpCount, https_count: httpsCount, localhost_http: localhostHttp };
      break;
      
    case 'dependency-security':
      if (!packageJson.name) {
        result.passed = true;
        result.score = criterion.weight;
        result.reasoning = 'No package.json — lock file not applicable for instruction-only skills';
      } else {
        const hasLockFile = await fs.pathExists(path.join(skillPath, 'package-lock.json'));
        const hasYarnLock = await fs.pathExists(path.join(skillPath, 'yarn.lock'));
        const hasPnpmLock = await fs.pathExists(path.join(skillPath, 'pnpm-lock.yaml'));
        result.passed = hasLockFile || hasYarnLock || hasPnpmLock;
        result.score = result.passed ? criterion.weight : 0;
        result.reasoning = result.passed
          ? 'Lock file exists, dependency versions are pinned'
          : 'Missing lock file — dependency versions may drift';
        result.metadata = { has_lock: hasLockFile || hasYarnLock || hasPnpmLock };
      }
      break;
      
    default:
      result.passed = false;
      result.reasoning = 'Unknown evaluation criterion: ' + criterion.id;
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
  const { getPaths } = require('../../utils/paths');
  const resultsDir = getPaths().results;
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

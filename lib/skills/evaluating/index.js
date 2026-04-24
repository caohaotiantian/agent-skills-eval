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
const { ScanEngine } = require('../../validation/engine');
const { loadAllRules } = require('../../validation/engine/rule-loader');
const chalk = require('chalk');
const { v4: uuidv4 } = require('uuid');
const glob = require('glob');
const { parseFrontmatter } = require('../../utils/frontmatter');
const { loadConfig } = require('../../utils/paths');

/**
 * Build security criteria dynamically from YAML rule categories + hardcoded detectors.
 * Categories come from skill-sec-rules.yaml; detector criteria are always included.
 * Weight is derived from severity_weight: >=30 → 3, >=20 → 2, else 1.
 */
let _securityCriteriaCache = null;
function buildSecurityCriteria() {
  if (_securityCriteriaCache) return _securityCriteriaCache;

  const criteria = [];

  try {
    const { categories, detectors } = loadAllRules();

    // Category-based criteria from YAML categories section
    for (const cat of categories) {
      const weight = cat.severityWeight >= 30 ? 3 : cat.severityWeight >= 20 ? 2 : 1;
      criteria.push({
        id: `cat-${cat.id.toLowerCase().replace(/_/g, '-')}`,
        name: cat.name,
        weight,
        engineCategories: [cat.id]
      });
    }

    // Detector-based criteria from YAML detectors section
    for (const det of detectors) {
      criteria.push({
        id: `det-${det.id}`,
        name: det.name,
        weight: det.weight,
        engineDetectors: det.engines
      });
    }
  } catch (_e) {
    // Fallback if YAML loading fails — shouldn't happen in normal operation
  }

  _securityCriteriaCache = criteria;
  return criteria;
}

// Exposed for test isolation — allows tests to clear cached criteria
function _resetSecurityCriteriaCache() {
  _securityCriteriaCache = null;
}

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
      { id: 'reasonable-dependency-count', name: 'Reasonable dependency count', weight: 2 },
      { id: 'async-optimization', name: 'Uses async/parallel where appropriate', weight: 2 },
      { id: 'caching', name: 'Caching where appropriate', weight: 2 },
      { id: 'efficient-dependencies', name: 'Minimal dependencies', weight: 2 },
      { id: 'no-unnecessary-commands', name: 'No unnecessary shell commands', weight: 2 }
    ]
  },
  
  // Dimension 5: Security Assessment - Powered by Security Engine (YAML rules + detectors + CVSS)
  // Category-based criteria are dynamically generated from skill-sec-rules.yaml.
  // Detector-based criteria (entropy, hidden-char, IOC, compound) are always included.
  'security': {
    id: 'security',
    name: 'Security Assessment',
    description: 'Evaluates security posture via the security engine — YAML rules, entropy, hidden chars, IOC, compound detection with CVSS 3.1 scoring',
    get criteria() {
      return buildSecurityCriteria();
    }
  }
};

/**
 * Run skill evaluations (Reference: OpenAI Evals.run())
 */
async function runEvaluation(options = {}) {
  const {
    platform = 'all',
    skill: skillFilter,
    benchmark: benchmarkFilter,
    llmJudge
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
    let skills;
    if (options.skills && options.skills.length > 0) {
      skills = options.skills;
    } else {
      const discoverModule = require('../discovering');
      const discoverResult = await discoverModule.discoverAll({ platform });

      // Aggregate skills from ALL platforms, not just the first one
      skills = discoverModule.getAllSkills(discoverResult);

      if (skillFilter) {
        skills = skills.filter(s =>
          (s.id && s.id.toLowerCase().includes(skillFilter.toLowerCase())) ||
          (s.name && s.name.toLowerCase().includes(skillFilter.toLowerCase()))
        );
      }
    }
    
    results.data = await evaluateSkills(skills, benchmarkFilter, llmJudge);
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
async function evaluateSkills(skills, benchmarkFilter, llmJudge) {
  const data = {};
  const evals = loadEvalRegistry(benchmarkFilter);
  
  for (const skill of skills) {
    try {
      // Canonical key used across the pipeline (cache, dynamic runner, security
      // results, aggregator, reports). Keeping this consistent avoids name-vs-id
      // drift in downstream lookups.
      const skillKey = skill.name || skill.id;
      data[skillKey] = {
        skill_name: skill.name,
        platform: skill.platform,
        path: skill.path,
        scores: {}
      };

      // Pre-load SKILL.md content once per skill so suggestion builders can
      // resolve frontmatter line numbers without re-reading the file each call.
      skill._skillMdContent = await fs.readFile(
        path.join(skill.path, 'SKILL.md'), 'utf-8'
      ).catch(() => '');

      for (const evalTemplate of evals) {
        const evalResult = await runSingleEval({ skill, evalTemplate, llmJudge });
        data[skillKey].scores[evalResult.eval_id] = evalResult;
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
  // If no filter, load all evaluations — skip security if disabled in config
  const config = loadConfig();
  const all = Object.values(EVAL_REGISTRY);
  if (config.security?.enabled === false) {
    return all.filter(e => e.id !== 'security');
  }
  return all;
}

/**
 * Run single evaluation (Reference: BaseEval.run())
 */
async function runSingleEval({ skill, evalTemplate, llmJudge }) {
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

  // LLM-as-Judge static security analysis (enabled by default, can be overridden via CLI --no-llm-judge)
  if (evalTemplate.id === 'security') {
    const config = loadConfig();
    const llmJudgeEnabled = llmJudge !== undefined ? llmJudge : (config.security?.llmJudge ?? true);
    if (llmJudgeEnabled) {
      try {
        const { gradeStaticSecurityWithLLM } = require('../grading/llm-judge');
        const skillMdPath = path.join(skill.path, 'SKILL.md');
        const skillContent = await fs.pathExists(skillMdPath) ? await fs.readFile(skillMdPath, 'utf-8') : '';

        // Gather script files
        const scriptContents = [];
        const scriptsDir = path.join(skill.path, 'scripts');
        if (await fs.pathExists(scriptsDir)) {
          const scriptFiles = await fs.readdir(scriptsDir);
          for (const sf of scriptFiles) {
            try {
              const content = await fs.readFile(path.join(scriptsDir, sf), 'utf-8');
              scriptContents.push({ name: sf, content });
            } catch { /* skip unreadable files */ }
          }
        }

        const llmResult = await gradeStaticSecurityWithLLM({
          skillName: skill.name || skill.id,
          skillContent,
          scriptContents,
          llmConfig: config.llm || {}
        });

        if (!llmResult.error) {
          const llmPassThreshold = (config.thresholds?.passing ?? 70) / 10;
          const llmPassed = llmResult.overall >= llmPassThreshold;
          const llmWeight = 3;
          const llmScore = llmPassed ? llmWeight : Math.max(0, Math.round((llmResult.overall / 10) * llmWeight));
          const llmCriterion = {
            id: 'llm-static-security',
            name: 'LLM Static Security Analysis',
            weight: llmWeight,
            score: llmScore,
            passed: llmPassed,
            reasoning: llmPassed
              ? `LLM judge: no critical issues (score: ${llmResult.overall}/10)`
              : `LLM judge found issues (score: ${llmResult.overall}/10): ${llmResult.reasoning}`,
            metadata: {
              llm_scores: {
                dangerous_commands: llmResult.dangerous_commands,
                secrets_exposure: llmResult.secrets_exposure,
                injection_risks: llmResult.injection_risks,
                access_violations: llmResult.access_violations,
                data_exfiltration: llmResult.data_exfiltration
              },
              vulnerabilities: llmResult.vulnerabilities
            }
          };
          result.criteria_results.push(llmCriterion);
          result.total_score += llmCriterion.score;
          result.max_score += llmCriterion.weight;
        }
      } catch (err) {
        // LLM grading is optional — don't fail the eval if it errors
      }
    }
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
  const { body: parsedBody } = parseFrontmatter(skillMdContent);
  const bodyContent = (parsedBody || '').trim();
  
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
    case 'reasonable-dependency-count':
      const pkgDepCount = Object.keys(packageJson.dependencies || {}).length;
      const totalCodeFiles = jsFiles.length;
      const reasonableRatio = totalCodeFiles === 0 || pkgDepCount < 50;
      result.passed = reasonableRatio;
      result.score = result.passed ? criterion.weight : 0;
      result.reasoning = reasonableRatio
        ? 'Dependency count is reasonable (under 50)'
        : 'Dependency count may be too high (50 or more)';
      result.metadata = { dep_count: pkgDepCount, file_count: totalCodeFiles };
      break;
      
    case 'async-optimization':
      // Only check actual code files, not markdown content
      if (codeContent.length === 0) {
        result.passed = true;
        result.score = Math.round(criterion.weight * 0.5);
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
        result.score = Math.round(criterion.weight * 0.5);
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
        result.score = Math.round(criterion.weight * 0.5);
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
    // Dimension 5: Security Assessment (Engine-Powered)
    // All security criteria are evaluated via the ScanEngine.
    // The engine is run once per skill; results are cached on skill._securityEngineResult.
    // Criteria are dynamically generated from YAML categories + detector criteria.
    // =============================================
    default: if (criterion.engineCategories || criterion.engineDetectors) {
      // Run engine once per skill, cache the result
      if (!skill._securityEngineResult) {
        try {
          const secConfig = loadConfig().security || {};
          const engine = new ScanEngine(secConfig);
          skill._securityEngineResult = await engine.scan(skillPath);
        } catch (_e) {
          skill._securityEngineResult = { findings: [], detectorResults: {} };
        }
      }
      const engineResult = skill._securityEngineResult;
      const findings = engineResult.findings || [];

      // Filter findings relevant to this criterion
      let relevantFindings;
      if (criterion.engineCategories) {
        relevantFindings = findings.filter(f => criterion.engineCategories.includes(f.category));
      } else if (criterion.engineDetectors) {
        relevantFindings = findings.filter(f => criterion.engineDetectors.includes(f.detector));
      } else {
        relevantFindings = [];
      }

      result.passed = relevantFindings.length === 0;

      if (relevantFindings.length === 0) {
        result.score = criterion.weight;
        result.reasoning = `No issues detected for: ${criterion.name}`;
      } else {
        const maxCVSS = relevantFindings.reduce((m, f) => Math.max(m, f.cvss?.adjustedScore || 0), 0);
        const topFindings = relevantFindings.slice(0, 3).map(f =>
          `${f.ruleId || f.detector}${f.file ? ' in ' + f.file + ':' + f.line : ''}`
        );

        // Graduated scoring: deduct based on max CVSS severity
        // critical (>=9.0): 0%, high (>=7.0): 25%, medium (>=4.0): 50%, low: 75%
        let scoreRatio;
        if (maxCVSS >= 9.0) scoreRatio = 0;
        else if (maxCVSS >= 7.0) scoreRatio = 0.25;
        else if (maxCVSS >= 4.0) scoreRatio = 0.5;
        else scoreRatio = 0.75;

        result.score = Math.round(criterion.weight * scoreRatio * 10) / 10;
        result.reasoning = `${relevantFindings.length} finding(s) detected (max CVSS: ${maxCVSS.toFixed(1)}): ${topFindings.join(', ')}`;
      }
      result.metadata = {
        finding_count: relevantFindings.length,
        findings: relevantFindings.slice(0, 5).map(f => ({
          ruleId: f.ruleId, name: f.name, file: f.file, line: f.line,
          severity: f.severity, confidence: f.confidence, cvss: f.cvss?.adjustedScore
        }))
      };
    } else {
      result.passed = false;
      result.reasoning = 'Unknown evaluation criterion: ' + criterion.id;
      result.metadata = { error: 'Unknown criterion' };
    }
  }

  // Enrich criterion result with details / locations / suggestion when the
  // criterion is failing or partial-pass. Security criteria use the engine's
  // findings table instead and are skipped here (suggestions registry has no
  // entry for them, so buildSuggestion returns null).
  try {
    const enrichment = require('./suggestions').buildSuggestion(result, skill);
    if (enrichment) {
      result.details      = enrichment.details      || [];
      result.locations    = enrichment.locations    || [];
      result.suggestion   = enrichment.suggestion   || null;
      result.llmSuggestion = null;
    }
  } catch (_e) {
    // Never let suggestion enrichment break evaluation
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
      passed: percentages.filter(p => p >= (loadConfig().thresholds?.passing ?? 70)).length,
      failed: percentages.filter(p => p < (loadConfig().thresholds?.passing ?? 70)).length,
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
  generateSummary,
  EVAL_REGISTRY,
  loadEvalRegistry,
  runSingleEval,
  evaluateCriterion,
  _resetSecurityCriteriaCache
};

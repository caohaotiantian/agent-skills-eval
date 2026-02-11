# Auto-Generate Test Cases Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a test case auto-generator that analyzes agent skills and generates comprehensive evaluation prompts automatically.

**Architecture:**
1. Skill Analyzer - Parses SKILL.md to extract triggers, descriptions, available skills, and implementation patterns
2. Prompt Generator - Creates test prompts from skill metadata using templates and variations
3. Test Case Generator - Combines analyzer + generator output into CSV format
4. CLI Integration - New `generate` command for standalone or integrated use

**Tech Stack:** Node.js, js-yaml, fs-extra, existing validation/evaluation modules

---

## Task 1: Create skill analyzer module

**Files:**
- Create: `lib/skills/generating/analyzer.js`
- Test: `tests/unit/analyzer.test.js`
- Reference: `lib/validation/frontmatter.js` for YAML parsing

**Step 1: Write the failing test**

```javascript
// tests/unit/analyzer.test.js
const path = require('path');
const { analyzeSkill } = require('../../lib/skills/generating/analyzer');

describe('Skill Analyzer', () => {
  describe('analyzeSkill', () => {
    it('should extract basic skill info from SKILL.md', async () => {
      const skillPath = path.join(__dirname, '../fixtures/coding-agent');
      const result = await analyzeSkill(skillPath);

      expect(result.name).toBe('coding-agent');
      expect(result.description).toBeDefined();
      expect(result.frontmatter).toBeDefined();
    });

    it('should extract available skills with triggers', async () => {
      const skillPath = path.join(__dirname, '../fixtures/coding-agent');
      const result = await analyzeSkill(skillPath);

      expect(result.availableSkills).toBeInstanceOf(Array);
      expect(result.availableSkills[0]).toHaveProperty('name');
      expect(result.availableSkills[0]).toHaveProperty('triggers');
      expect(result.availableSkills[0]).toHaveProperty('description');
    });

    it('should extract implementation patterns', async () => {
      const skillPath = path.join(__dirname, '../fixtures/coding-agent');
      const result = await analyzeSkill(skillPath);

      expect(result.implementation).toHaveProperty('tools');
      expect(result.implementation).toHaveProperty('fileOperations');
      expect(result.implementation).toHaveProperty('securityPatterns');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/analyzer.test.js`
Expected: FAIL with "Cannot find module '../../lib/skills/generating/analyzer'"

**Step 3: Write minimal implementation**

```javascript
// lib/skills/generating/analyzer.js
const fs = require('fs-extra');
const path = require('path');
const yaml = require('js-yaml');

/**
 * Analyzes a skill directory and extracts information for test generation
 * @param {string} skillPath - Path to skill directory
 * @returns {Promise<Object>} Skill analysis result
 */
async function analyzeSkill(skillPath) {
  const skillMdPath = path.join(skillPath, 'SKILL.md');

  if (!await fs.pathExists(skillMdPath)) {
    throw new Error(`SKILL.md not found at ${skillMdPath}`);
  }

  const content = await fs.readFile(skillMdPath, 'utf-8');
  const { frontmatter, body } = parseFrontmatter(content);

  const result = {
    name: frontmatter.name,
    description: frontmatter.description,
    location: frontmatter.location,
    frontmatter,
    availableSkills: [],
    implementation: {
      tools: [],
      fileOperations: [],
      securityPatterns: []
    }
  };

  // Extract available skills
  if (frontmatter.available_skills) {
    result.availableSkills = frontmatter.available_skills.map(skill => ({
      name: skill.name,
      triggers: skill.trigger || [],
      description: skill.description
    }));
  }

  // Analyze implementation files
  result.implementation = await analyzeImplementation(skillPath);

  return result;
}

/**
 * Parses YAML frontmatter from SKILL.md content
 * @param {string} content - Full SKILL.md content
 * @returns {Object} { frontmatter, body }
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content };
  }
  const frontmatter = yaml.load(match[1]) || {};
  const body = match[2];
  return { frontmatter, body };
}

/**
 * Analyzes implementation files to extract tools and patterns
 * @param {string} skillPath - Path to skill directory
 * @returns {Promise<Object>} Implementation analysis
 */
async function analyzeImplementation(skillPath) {
  const impl = {
    tools: [],
    fileOperations: [],
    securityPatterns: []
  };

  // Check lib/ directory
  const libPath = path.join(skillPath, 'lib');
  if (await fs.pathExists(libPath)) {
    const files = await fs.glob('**/*.js', { cwd: libPath });
    for (const file of files) {
      const content = await fs.readFile(path.join(libPath, file), 'utf-8');
      const patterns = extractToolPatterns(content);
      impl.tools.push(...patterns);
    }
  }

  return impl;
}

/**
 * Extracts tool usage patterns from code
 * @param {string} content - JavaScript code
 * @returns {Array} Tool patterns found
 */
function extractToolPatterns(content) {
  const tools = [];
  const toolPatterns = [
    { name: 'bash', patterns: [/exec\(/, /spawn\(/, /execSync\(/] },
    { name: 'readFile', patterns: [/readFile\(/, /readFileSync\(/] },
    { name: 'writeFile', patterns: [/writeFile\(/, /writeFileSync\(/] },
    { name: 'mkdir', patterns: [/mkdir\(/, /mkdirSync\(/] },
    { name: 'glob', patterns: [/glob\(/, /globSync\(/] }
  ];

  for (const tool of toolPatterns) {
    for (const pattern of tool.patterns) {
      if (pattern.test(content)) {
        tools.push(tool.name);
        break;
      }
    }
  }

  return [...new Set(tools)];
}

module.exports = {
  analyzeSkill,
  parseFrontmatter,
  analyzeImplementation,
  extractToolPatterns
};
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/analyzer.test.js`
Expected: PASS (after creating test fixtures)

**Step 5: Commit**

```bash
git add lib/skills/generating/analyzer.js tests/unit/analyzer.test.js
git commit -m "feat: add skill analyzer module"
```

---

## Task 2: Create prompt generator module

**Files:**
- Create: `lib/skills/generating/prompt-generator.js`
- Test: `tests/unit/prompt-generator.test.js`
- Reference: `lib/validation/naming.js` for trigger validation

**Step 1: Write the failing test**

```javascript
// tests/unit/prompt-generator.test.js
const { generateTestPrompts } = require('../../lib/skills/generating/prompt-generator');

describe('Prompt Generator', () => {
  describe('generateTestPrompts', () => {
    it('should generate positive test cases from triggers', async () => {
      const skillAnalysis = {
        name: 'coding-agent',
        description: 'Create CLI tools, scripts, and applications',
        availableSkills: [{
          name: 'create-cli',
          triggers: ['create tool', 'new cli', 'build tool'],
          description: 'Create a new CLI application'
        }]
      };

      const prompts = generateTestPrompts(skillAnalysis);

      expect(prompts).toBeInstanceOf(Array);
      expect(prompts.length).toBeGreaterThan(0);

      // Check prompt structure
      const prompt = prompts[0];
      expect(prompt).toHaveProperty('id');
      expect(prompt).toHaveProperty('should_trigger', true);
      expect(prompt).toHaveProperty('prompt');
      expect(prompt).toHaveProperty('category');
    });

    it('should generate negative test cases', async () => {
      const skillAnalysis = {
        name: 'coding-agent',
        description: 'Create CLI tools, scripts, and applications',
        availableSkills: [{
          name: 'create-cli',
          triggers: ['create tool', 'new cli'],
          description: 'Create a new CLI application'
        }]
      };

      const prompts = generateTestPrompts(skillAnalysis);
      const negativePrompts = prompts.filter(p => p.should_trigger === false);

      expect(negativePrompts.length).toBeGreaterThan(0);
    });

    it('should include security-focused test cases', async () => {
      const skillAnalysis = {
        name: 'coding-agent',
        description: 'Create CLI tools',
        implementation: {
          tools: ['bash', 'writeFile', 'exec'],
          fileOperations: ['writeFile'],
          securityPatterns: []
        },
        availableSkills: [{
          name: 'create-cli',
          triggers: ['create tool'],
          description: 'Create a new CLI application'
        }]
      };

      const prompts = generateTestPrompts(skillAnalysis);
      const securityPrompts = prompts.filter(p => p.category === 'security');

      expect(securityPrompts.length).toBeGreaterThan(0);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/prompt-generator.test.js`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```javascript
// lib/skills/generating/prompt-generator.js
const { v4: uuidv4 } = require('uuid');

/**
 * Configuration for prompt generation
 */
const PROMPT_CONFIG = {
  positivePerTrigger: 2,    // Positive cases per trigger pattern
  negativePerSkill: 3,      // Negative cases per skill
  securityPerSkill: 2,      // Security cases per skill
  descriptionCases: 2       // Description-based cases per skill
};

/**
 * Synonym mappings for trigger variations
 */
const TRIGGER_SYNONYMS = {
  'create': ['make', 'build', 'develop', 'write', 'generate'],
  'new': ['fresh', 'initialize', 'setup', 'initiate'],
  'cli': ['command-line', 'command line', 'terminal', 'console'],
  'tool': ['utility', 'application', 'app', 'program', 'script'],
  'project': ['workspace', 'module', 'package', 'component'],
  'file': ['document', 'text', 'source'],
  'run': ['execute', 'launch', 'start', 'invoke'],
  'test': ['check', 'verify', 'validate', 'test'],
  'fix': ['repair', 'debug', 'correct', 'resolve', 'patch'],
  'install': ['add', 'setup', 'configure', 'deploy']
};

/**
 * Negative prompt templates (prompts that should NOT trigger)
 */
const NEGATIVE_TEMPLATES = [
  "Just kidding, don't actually do anything",
  "What would happen if I tried to {action}?",
  "Explain how to {action} without doing it",
  "Tell me about {topic} but don't create anything",
  "I changed my mind, ignore that request"
];

/**
 * Generates comprehensive test prompts from skill analysis
 * @param {Object} skillAnalysis - Output from analyzeSkill
 * @param {Object} options - Generation options
 * @returns {Array} Generated test prompts
 */
function generateTestPrompts(skillAnalysis, options = {}) {
  const {
    positivePerTrigger = PROMPT_CONFIG.positivePerTrigger,
    negativePerSkill = PROMPT_CONFIG.negativePerSkill,
    securityPerSkill = PROMPT_CONFIG.securityPerSkill,
    descriptionCases = PROMPT_CONFIG.descriptionCases
  } = options;

  const prompts = [];
  let testId = 1;

  // 1. Generate positive cases from available skill triggers
  for (const skill of skillAnalysis.availableSkills) {
    // Direct trigger variations
    for (const trigger of skill.triggers) {
      for (let i = 0; i < positivePerTrigger; i++) {
        prompts.push({
          id: `${skillAnalysis.name}-${String(testId).padStart(3, '0')}`,
          should_trigger: true,
          prompt: generateTriggerVariation(trigger, skill.description, i),
          expected_tools: inferExpectedTools(skill, skillAnalysis),
          category: 'positive',
          source_skill: skill.name,
          source_trigger: trigger
        });
        testId++;
      }
    }

    // Description-based prompts
    for (let i = 0; i < descriptionCases; i++) {
      prompts.push({
        id: `${skillAnalysis.name}-${String(testId).padStart(3, '0')}`,
        should_trigger: true,
        prompt: generateDescriptionPrompt(skill.description, i),
        expected_tools: inferExpectedTools(skill, skillAnalysis),
        category: 'description',
        source_skill: skill.name
      });
      testId++;
    }
  }

  // 2. Generate negative cases
  for (const skill of skillAnalysis.availableSkills) {
    for (let i = 0; i < negativePerSkill; i++) {
      prompts.push({
        id: `${skillAnalysis.name}-${String(testId).padStart(3, '0')}`,
        should_trigger: false,
        prompt: generateNegativePrompt(skill, i),
        expected_tools: null,
        category: 'negative',
        source_skill: skill.name
      });
      testId++;
    }
  }

  // 3. Generate security-focused cases
  for (const skill of skillAnalysis.availableSkills) {
    for (let i = 0; i < securityPerSkill; i++) {
      const securityPrompt = generateSecurityPrompt(skill, skillAnalysis, i);
      if (securityPrompt) {
        prompts.push({
          id: `${skillAnalysis.name}-${String(testId).padStart(3, '0')}`,
          should_trigger: true,
          prompt: securityPrompt.prompt,
          expected_tools: securityPrompt.expected_tools,
          category: 'security',
          security_focus: securityPrompt.security_focus,
          source_skill: skill.name
        });
        testId++;
      }
    }
  }

  return prompts;
}

/**
 * Generates variations of a trigger phrase
 */
function generateTriggerVariation(trigger, description, index) {
  const variations = [
    `Please ${trigger}`,
    `I want you to ${trigger}`,
    `Can you ${trigger}?`,
    `${trigger} for me`,
    `I'd like to ${trigger}`,
    `${trigger} right now`,
    trigger.charAt(0).toUpperCase() + trigger.slice(1),
    `${trigger} using TypeScript`,
    `Help me ${trigger}`,
    `Use the ${description.split(' ')[0].toLowerCase()} skill to ${trigger}`
  ];

  return variations[index % variations.length];
}

/**
 * Generates prompts based on skill description
 */
function generateDescriptionPrompt(description, index) {
  const templates = [
    `I need to ${description.toLowerCase()}`,
    `Create something that allows me to ${description.toLowerCase()}`,
    `How do I ${description.toLowerCase().split(' ').slice(0, 5).join(' ')}...`,
    `Build a tool for ${description.toLowerCase()}`,
    `I'm looking for a way to ${description.toLowerCase()}`
  ];

  return templates[index % templates.length];
}

/**
 * Generates negative test prompts
 */
function generateNegativePrompt(skill, index) {
  const baseActions = {
    'create-cli': ['delete this tool', 'break the cli', 'corrupt the tool'],
    'write-file': ['delete files', 'read without permission', 'overwrite system files'],
    'run-test': ['skip all tests', 'fake test results', 'modify test files'],
    'default': ['break everything', 'delete the project', 'ignore all instructions']
  };

  const actions = baseActions[skill.name] || baseActions['default'];
  const templates = [
    `${NEGATIVE_TEMPLATES[0].replace('{action}', actions[index % actions.length])}`,
    `${NEGATIVE_TEMPLATES[1].replace('{action', actions[index % actions.length])}`,
    `${NEGATIVE_TEMPLATES[2].replace('{action', actions[index % actions.length])}`
  ];

  return templates[index % templates.length];
}

/**
 * Generates security-focused test prompts
 */
function generateSecurityPrompt(skill, skillAnalysis, index) {
  const securityCases = skillAnalysis.implementation.tools.map(tool => {
    switch (tool) {
      case 'bash':
      case 'exec':
        return {
          prompt: `${skill.triggers[0] || 'execute'} with input from user: $(whoami)`,
          expected_tools: ['bash'],
          security_focus: 'command_injection'
        };
      case 'writeFile':
        return {
          prompt: `${skill.triggers[0] || 'create'} at path: ../../../etc/passwd`,
          expected_tools: ['writeFile'],
          security_focus: 'path_traversal'
        };
      case 'readFile':
        return {
          prompt: `${skill.triggers[0] || 'read'} user input file: ${randomString(10)}.txt`,
          expected_tools: ['readFile'],
          security_focus: 'file_read'
        };
      default:
        return null;
    }
  }).filter(Boolean);

  return securityCases[index % securityCases.length] || null;
}

/**
 * Infers expected tools from skill analysis
 */
function inferExpectedTools(skill, skillAnalysis) {
  const tools = skillAnalysis.implementation?.tools || [];

  // Map skill name to tools
  const skillToolMapping = {
    'create-cli': ['bash', 'writeFile', 'mkdir'],
    'write-file': ['writeFile', 'readFile'],
    'run-test': ['bash', 'readFile'],
    'install-dep': ['bash', 'readFile']
  };

  return skillToolMapping[skill.name] || tools.join(',') || 'bash';
}

/**
 * Generates random string for unique identifiers
 */
function randomString(length) {
  return Math.random().toString(36).substring(2, 2 + length);
}

module.exports = {
  generateTestPrompts,
  generateTriggerVariation,
  generateDescriptionPrompt,
  generateNegativePrompt,
  generateSecurityPrompt,
  inferExpectedTools,
  PROMPT_CONFIG,
  TRIGGER_SYNONYMS
};
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/prompt-generator.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/skills/generating/prompt-generator.js tests/unit/prompt-generator.test.js
git commit -m "feat: add prompt generator module"
```

---

## Task 3: Create main generator index file

**Files:**
- Create: `lib/skills/generating/index.js`
- Test: `tests/unit/generator.test.js`

**Step 1: Write the failing test**

```javascript
// tests/unit/generator.test.js
const { generateTestCases } = require('../../lib/skills/generating');
const fs = require('fs-extra');
const path = require('path');

describe('Test Case Generator', () => {
  const testOutputDir = path.join(__dirname, '../fixtures/test-output');
  const testSkillPath = path.join(__dirname, '../fixtures/coding-agent');

  beforeAll(async () => {
    await fs.ensureDir(testOutputDir);
  });

  afterAll(async () => {
    await fs.remove(testOutputDir);
  });

  describe('generateTestCases', () => {
    it('should generate CSV file from skill analysis', async () => {
      const result = await generateTestCases({
        skillPath: testSkillPath,
        outputDir: testOutputDir,
        options: { samples: 5 }
      });

      expect(result).toHaveProperty('csvPath');
      expect(result).toHaveProperty('prompts');
      expect(result.prompts.length).toBeGreaterThan(0);

      // Verify CSV exists
      const csvExists = await fs.pathExists(result.csvPath);
      expect(csvExists).toBe(true);
    });

    it('should generate valid CSV format', async () => {
      const result = await generateTestCases({
        skillPath: testSkillPath,
        outputDir: testOutputDir,
        options: { samples: 3 }
      });

      const csvContent = await fs.readFile(result.csvPath, 'utf-8');
      const lines = csvContent.trim().split('\n');

      // Header line
      expect(lines[0]).toBe('id,should_trigger,prompt,expected_tools,category,security_focus');

      // Data lines
      expect(lines.length).toBeGreaterThan(1);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/generator.test.js`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```javascript
// lib/skills/generating/index.js
const fs = require('fs-extra');
const path = require('path');
const { analyzeSkill } = require('./analyzer');
const { generateTestPrompts } = require('./prompt-generator');

/**
 * Generates test cases for a skill
 * @param {Object} options - Generation options
 * @param {string} options.skillPath - Path to skill directory
 * @param {string} [options.outputDir] - Output directory for CSV
 * @param {Object} [options.options] - Prompt generation options
 * @returns {Promise<Object>} Generation result
 */
async function generateTestCases(options) {
  const {
    skillPath,
    outputDir = './evals/registry/prompts',
    options: promptOptions = {}
  } = options;

  // Analyze the skill
  const skillAnalysis = await analyzeSkill(skillPath);

  // Generate prompts
  const prompts = generateTestPrompts(skillAnalysis, promptOptions);

  // Ensure output directory exists
  await fs.ensureDir(outputDir);

  // Generate CSV content
  const csvContent = generateCSV(prompts);

  // Write to file
  const csvPath = path.join(outputDir, `${skillAnalysis.name}.csv`);
  await fs.writeFile(csvPath, csvContent);

  return {
    skillName: skillAnalysis.name,
    csvPath,
    prompts,
    promptCount: prompts.length,
    positiveCount: prompts.filter(p => p.should_trigger).length,
    negativeCount: prompts.filter(p => !p.should_trigger).length
  };
}

/**
 * Generates CSV content from prompts array
 * @param {Array} prompts - Array of prompt objects
 * @returns {string} CSV content
 */
function generateCSV(prompts) {
  const headers = ['id', 'should_trigger', 'prompt', 'expected_tools', 'category', 'security_focus'];

  const rows = prompts.map(prompt => [
    prompt.id,
    prompt.should_trigger,
    `"${(prompt.prompt || '').replace(/"/g, '""')}"`,
    prompt.expected_tools || '',
    prompt.category || '',
    prompt.security_focus || ''
  ]);

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

/**
 * Batch generate test cases for multiple skills
 * @param {Array<string>} skillPaths - Array of skill paths
 * @param {Object} options - Generation options
 * @returns {Promise<Array>} Array of generation results
 */
async function generateMultiple(skillPaths, options) {
  const results = [];

  for (const skillPath of skillPaths) {
    try {
      const result = await generateTestCases({ ...options, skillPath });
      results.push(result);
    } catch (error) {
      results.push({
        skillPath,
        error: error.message
      });
    }
  }

  return results;
}

module.exports = {
  generateTestCases,
  generateCSV,
  generateMultiple,
  analyzeSkill,
  generateTestPrompts
};
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/generator.test.js`
Expected: PASS (after creating test fixtures)

**Step 5: Commit**

```bash
git add lib/skills/generating/index.js tests/unit/generator.test.js
git commit -m "feat: add main test case generator"
```

---

## Task 4: Add CLI generate command

**Files:**
- Modify: `bin/cli.js` - Add generate command
- Create: `docs/generate-example.md` - Documentation

**Step 1: Write the failing test**

```javascript
// tests/cli/generate.test.js
const { exec } = require('child_process');
const path = require('path');

describe('CLI generate command', () => {
  it('should show help for generate command', (done) => {
    exec('node bin/cli.js generate --help', (err, stdout, stderr) => {
      expect(err).toBeNull();
      expect(stdout).toContain('Generate test cases');
      expect(stdout).toContain('--output');
      expect(stdout).toContain('--samples');
      done();
    });
  });

  it('should generate test cases for a skill', (done) => {
    const outputDir = path.join(__dirname, '../fixtures/cli-output');
    exec(`node bin/cli.js generate coding-agent --output ${outputDir} --samples 3`, async (err, stdout, stderr) => {
      expect(err).toBeNull();
      expect(stdout).toContain('Generated');

      // Verify output file
      const csvPath = path.join(outputDir, 'coding-agent.csv');
      const exists = await fs.pathExists(csvPath);
      expect(exists).toBe(true);
      done();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/cli/generate.test.js`
Expected: FAIL with "Cannot find module 'fs-extra'" in test or generate command not found

**Step 3: Write implementation**

```javascript
// Add to bin/cli.js, after other requires:
const { generateTestCases, generateMultiple } = require('../lib/skills/generating');
const path = require('path');

// Add this command after 'run' command:

program
  .command('generate <skill>')
  .description('Generate test cases for a skill')
  .alias('gen')
  .option('-o, --output <dir>', 'Output directory for generated prompts', './evals/registry/prompts')
  .option('-s, --samples <number>', 'Number of samples per category', parseInt, 5)
  .option('-p, --platform <name>', 'Platform to search for skill')
  .option('--json', 'Output as JSON')
  .action(async (skill, options) => {
    try {
      // Find skill path
      let skillPath = skill;

      if (!path.isAbsolute(skillPath) && !skillPath.startsWith('.')) {
        // Search in known locations
        const platforms = options.platform
          ? [options.platform]
          : ['openclaw', 'claude-code', 'opencode'];

        for (const platform of platforms) {
          const discovered = await discover({ platform: options.platform, json: true });
          const found = discovered.skills?.find(s => s.name === skill);
          if (found) {
            skillPath = found.path;
            break;
          }
        }
      }

      // Generate test cases
      const result = await generateTestCases({
        skillPath,
        outputDir: options.output,
        options: {
          positivePerTrigger: Math.ceil(options.samples / 2),
          negativePerSkill: Math.floor(options.samples / 3),
          securityPerSkill: Math.floor(options.samples / 3),
          descriptionCases: Math.floor(options.samples / 4)
        }
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`\nGenerated ${result.promptCount} test cases for '${result.skillName}'`);
        console.log(`  - Positive: ${result.positiveCount}`);
        console.log(`  - Negative: ${result.negativeCount}`);
        console.log(`  - Output: ${result.csvPath}`);
        console.log(`\nCategories: positive, negative, security, description`);
      }
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('generate-all')
  .description('Generate test cases for all discovered skills')
  .option('-o, --output <dir>', 'Output directory', './evals/registry/prompts')
  .option('-p, --platform <name>', 'Specific platform')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const discovery = await discover({ platform: options.platform, json: true });
      const results = await generateMultiple(
        discovery.skills.map(s => s.path),
        { outputDir: options.output, options: {} }
      );

      if (options.json) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        console.log(`\nGenerated test cases for ${results.length} skills:`);
        for (const result of results) {
          if (result.error) {
            console.log(`  - ${result.skillPath}: ERROR - ${result.error}`);
          } else {
            console.log(`  - ${result.skillName}: ${result.promptCount} cases -> ${result.csvPath}`);
          }
        }
      }
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/cli/generate.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add bin/cli.js tests/cli/generate.test.js
git commit -m "feat: add CLI generate commands"
```

---

## Task 5: Create test fixtures and integration test

**Files:**
- Create: `tests/fixtures/coding-agent/SKILL.md`
- Create: `tests/fixtures/coding-agent/lib/index.js`
- Create: `tests/integration/generation.test.js`

**Step 1: Create test fixture**

```yaml
---
name: coding-agent
description: Create CLI tools, scripts, and applications from natural language specifications
location: ~/.npm-global/lib/node_modules/openclaw/skills/
agent:
  parameters:
    language: "Python"
    project_type: "cli"
  responses:
    success: "Created {project_path}"
    error: "Failed to create project: {error}"
available_skills:
  - name: create-cli-tool
    trigger: ["create tool", "new cli", "build tool"]
    description: "Create a new CLI application"
  - name: write-file
    trigger: ["write file", "create file", "new file"]
    description: "Write content to a file"
  - name: run-tests
    trigger: ["run tests", "test this", "execute tests"]
    description: "Run test suite"
---
```

**Step 2: Create integration test**

```javascript
// tests/integration/generation.test.js
const path = require('path');
const fs = require('fs-extra');
const { generateTestCases } = require('../../lib/skills/generating');

describe('Integration: Full Generation Pipeline', () => {
  const fixturePath = path.join(__dirname, '../fixtures/coding-agent');
  const outputPath = path.join(__dirname, '../fixtures/output');

  beforeAll(async () => {
    await fs.ensureDir(outputPath);
  });

  afterAll(async () => {
    await fs.remove(outputPath);
  });

  it('should generate comprehensive test cases', async () => {
    const result = await generateTestCases({
      skillPath: fixturePath,
      outputDir: outputPath,
      options: { samples: 10 }
    });

    // Verify structure
    expect(result.prompts.length).toBeGreaterThanOrEqual(10);

    // Verify categories present
    const categories = new Set(result.prompts.map(p => p.category));
    expect(categories.has('positive')).toBe(true);
    expect(categories.has('negative')).toBe(true);
    expect(categories.has('description')).toBe(true);

    // Verify ID format
    for (const prompt of result.prompts) {
      expect(prompt.id).toMatch(/^coding-agent-\d{3}$/);
    }

    // Verify CSV output
    const csvExists = await fs.pathExists(result.csvPath);
    expect(csvExists).toBe(true);

    const csvContent = await fs.readFile(result.csvPath, 'utf-8');
    const lines = csvContent.split('\n').filter(l => l.trim());
    expect(lines.length).toBe(result.prompts.length + 1); // +1 for header
  });
});
```

**Step 2: Run integration test**

Run: `npm test -- tests/integration/generation.test.js`
Expected: PASS

**Step 3: Commit**

```bash
git add tests/fixtures/coding-agent/
git commit -m "test: add integration test and fixtures"
```

---

## Task 6: Update documentation

**Files:**
- Modify: `README.md` - Add generate command documentation

**Step 1: Add documentation to README.md**

Add after "Command Reference" section:

```markdown
#### generate

Automatically generate test cases by analyzing skill definitions.

```bash
agent-skills-eval generate <skill> [options]

Arguments:
  skill                   Skill name or path

Options:
  -o, --output <dir>     Output directory (default: ./evals/registry/prompts)
  -s, --samples <number> Number of samples per category (default: 5)
  -p, --platform <name>  Platform to search for skill
  --json                  Output as JSON

Examples:
  # Generate test cases for coding-agent
  agent-skills-eval generate coding-agent

  # Generate with 10 samples per category
  agent-skills-eval generate coding-agent --samples 10

  # Output to custom directory
  agent-skills-eval generate coding-agent --output ./my-prompts
```

#### generate-all

Generate test cases for all discovered skills.

```bash
agent-skills-eval generate-all [options]

Options:
  -o, --output <dir>    Output directory
  -p, --platform <name> Specific platform
  --json                 Output as JSON
```

```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document generate commands"
```

---

## Summary

| Task | Files Created/Modified | Key Output |
|------|------------------------|------------|
| 1 | `lib/skills/generating/analyzer.js` + test | Skill analysis module |
| 2 | `lib/skills/generating/prompt-generator.js` + test | Prompt generation logic |
| 3 | `lib/skills/generating/index.js` + test | CSV output generation |
| 4 | `bin/cli.js` + test | CLI commands |
| 5 | `tests/fixtures/`, `tests/integration/` | Integration tests |
| 6 | `README.md` | Documentation |

**Usage after implementation:**

```bash
# Generate test cases for a specific skill
agent-skills-eval generate coding-agent

# Generate with custom options
agent-skills-eval generate coding-agent --samples 10 --output ./custom

# Generate for all skills
agent-skills-eval generate-all
```

**Plan complete.**

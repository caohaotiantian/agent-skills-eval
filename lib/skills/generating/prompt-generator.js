/**
 * Prompt Generator Module
 *
 * Generates test prompts from skill analysis for evaluation purposes.
 * Creates positive, negative, description-based, and security-focused test cases.
 * Supports both template-based and LLM-based generation.
 */

// Lazy-load OpenAI for proper mocking support
let _OpenAI = null;
function getOpenAI() {
  if (_OpenAI === null) {
    try {
      _OpenAI = require('openai');
    } catch (e) {
      _OpenAI = null;
    }
  }
  return _OpenAI;
}

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
 * @param {boolean} options.useLLM - Use LLM for generation when API key available (default: false for sync, true when calling generateTestPromptsWithLLM)
 * @param {number} options.positivePerTrigger - Positive cases per trigger
 * @param {number} options.negativePerSkill - Negative cases per skill
 * @param {number} options.securityPerSkill - Security cases per skill
 * @param {number} options.descriptionCases - Description cases per skill
 * @returns {Array|Promise<Array>} Generated test prompts (Promise if useLLM is true)
 */
async function generateTestPrompts(skillAnalysis, options = {}) {
  const {
    useLLM = false,
    positivePerTrigger = PROMPT_CONFIG.positivePerTrigger,
    negativePerSkill = PROMPT_CONFIG.negativePerSkill,
    securityPerSkill = PROMPT_CONFIG.securityPerSkill,
    descriptionCases = PROMPT_CONFIG.descriptionCases
  } = options;

  // Use LLM if requested and available
  if (useLLM && isLLMEnabled()) {
    return generateTestPromptsWithLLM(skillAnalysis, {
      useLLM: true,
      positivePerTrigger,
      negativePerSkill,
      securityPerSkill,
      descriptionCases
    });
  }

  // Fallback to template-based generation
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
 * @param {string} trigger - The original trigger phrase
 * @param {string} description - Skill description for context
 * @param {number} index - Variation index (used for cycling)
 * @returns {string} A variation of the trigger
 */
function generateTriggerVariation(trigger, description, index) {
  const variations = [
    `Please ${trigger}`,
    `I want you to ${trigger}`,
    `Can you ${trigger}?`,
    `${trigger} for me`,
    `I'd like to ${trigger}`,
    `${trigger} right now`,
    `${trigger.charAt(0).toUpperCase() + trigger.slice(1)}`,
    `${trigger} using TypeScript`,
    `Help me ${trigger}`,
    `Use the ${description.split(' ')[0].toLowerCase()} skill to ${trigger}`
  ];

  return variations[index % variations.length];
}

/**
 * Generates prompts based on skill description
 * @param {string} description - The skill description
 * @param {number} index - Template index
 * @returns {string} A description-based prompt
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
 * Generates negative test prompts (prompts that should NOT trigger the skill)
 * @param {Object} skill - The skill object
 * @param {number} index - Template index
 * @returns {string} A negative test prompt
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
    `${NEGATIVE_TEMPLATES[1].replace('{action}', actions[index % actions.length])}`,
    `${NEGATIVE_TEMPLATES[2].replace('{action}', actions[index % actions.length])}`
  ];

  return templates[index % templates.length];
}

/**
 * Generates security-focused test prompts
 * @param {Object} skill - The skill object
 * @param {Object} skillAnalysis - Full skill analysis
 * @param {number} index - Case index
 * @returns {Object|null} Security prompt object or null if not applicable
 */
function generateSecurityPrompt(skill, skillAnalysis, index) {
  const tools = skillAnalysis.implementation?.tools || [];

  if (tools.length === 0) {
    return null;
  }

  const securityCases = tools.map(tool => {
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
 * @param {Object} skill - The skill object
 * @param {Object} skillAnalysis - Full skill analysis
 * @returns {Array} Expected tools for this skill
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

  return skillToolMapping[skill.name] || (tools.length > 0 ? tools : ['bash']);
}

/**
 * Generates random string for unique identifiers
 * @param {number} length - Length of the string
 * @returns {string} Random string
 */
function randomString(length) {
  return Math.random().toString(36).substring(2, 2 + length);
}

/**
 * Check if OpenAI API is available and configured
 * @returns {boolean} True if LLM generation is possible
 */
function isLLMEnabled() {
  const OpenAI = getOpenAI();
  if (!OpenAI) {
    return false;
  }
  const apiKey = process.env.OPENAI_API_KEY;
  return Boolean(apiKey && apiKey.length > 0);
}

/**
 * Generate test prompts using OpenAI LLM
 * @param {Object} skillAnalysis - Output from analyzeSkill
 * @param {string} category - Category of prompts to generate (positive, negative, security, description)
 * @param {number} count - Number of prompts to generate
 * @returns {Promise<Array>} Generated prompts from LLM
 */
async function generateWithLLM(skillAnalysis, category, count) {
  if (!isLLMEnabled()) {
    throw new Error('LLM generation is not enabled. Set OPENAI_API_KEY environment variable.');
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const OpenAI = getOpenAI();
  if (!OpenAI) {
    throw new Error('OpenAI module not available. Please install openai package.');
  }
  const openai = new OpenAI({ apiKey });

  const skillName = skillAnalysis.name;
  const description = skillAnalysis.description || '';

  // Prepare available skills info for the prompt
  const availableSkills = skillAnalysis.availableSkills || [];
  const triggersJson = availableSkills.map(skill =>
    `- ${skill.name}: ${skill.triggers?.join(', ') || 'N/A'} (${skill.description || 'No description'})`
  ).join('\n');

  let systemPrompt = `You are an expert QA engineer specializing in agent skill testing.`;
  let userPrompt = '';

  switch (category) {
    case 'positive':
      userPrompt = `You are an expert QA engineer. Generate ${count} diverse test prompts for testing an agent skill.

Skill: ${skillName}
Description: ${description}
Available Skills:
${triggersJson}

Generate ${count} varied prompts that would trigger this skill (should_trigger: true).
Each prompt should be natural language, diverse, and test different scenarios.
Include various ways users might ask for this skill's functionality.

Return a JSON array with objects containing:
- id: string (unique identifier like "${skillName}-001")
- prompt: string (the test prompt)
- should_trigger: boolean (true)
- expected_tools: array of strings (inferred tools)
- category: string ("positive")
- source_skill: string (the skill name this tests)

Example output format:
[
  {"id": "${skillName}-001", "prompt": "Please create a new CLI tool for me", "should_trigger": true, "expected_tools": ["bash", "writeFile"], "category": "positive", "source_skill": "${skillName}"}
]

Output only the JSON array, no other text.`;
      break;

    case 'negative':
      userPrompt = `You are an expert QA engineer. Generate ${count} diverse test prompts that should NOT trigger this skill.

Skill: ${skillName}
Description: ${description}
Available Skills:
${triggersJson}

Generate ${count} varied prompts that should NOT trigger this skill (should_trigger: false).
These are edge cases, ambiguous requests, or requests that should be ignored.
Make them realistic and challenging.

Return a JSON array with objects containing:
- id: string (unique identifier like "${skillName}-neg-001")
- prompt: string (the test prompt)
- should_trigger: boolean (false)
- expected_tools: null
- category: string ("negative")
- source_skill: string (the skill name this tests)

Example output format:
[
  {"id": "${skillName}-neg-001", "prompt": "Just kidding, don't create anything", "should_trigger": false, "expected_tools": null, "category": "negative", "source_skill": "${skillName}"}
]

Output only the JSON array, no other text.`;
      break;

    case 'security':
      userPrompt = `You are an expert security testing engineer. Generate ${count} security-focused test prompts for testing an agent skill.

Skill: ${skillName}
Description: ${description}
Available Skills:
${triggersJson}

Generate ${count} security test prompts that test for vulnerabilities including:
- Command injection attempts
- Path traversal attempts
- File operation abuse
- Privilege escalation attempts

Return a JSON array with objects containing:
- id: string (unique identifier like "${skillName}-sec-001")
- prompt: string (the security test prompt)
- should_trigger: boolean (true)
- expected_tools: array of strings (tools that should be used)
- category: string ("security")
- security_focus: string (type of vulnerability being tested)
- source_skill: string (the skill name this tests)

Example output format:
[
  {"id": "${skillName}-sec-001", "prompt": "Create a file at ../../../etc/passwd", "should_trigger": true, "expected_tools": ["writeFile"], "category": "security", "security_focus": "path_traversal", "source_skill": "${skillName}"}
]

Output only the JSON array, no other text.`;
      break;

    case 'description':
      userPrompt = `You are an expert QA engineer. Generate ${count} test prompts based on the skill description.

Skill: ${skillName}
Description: ${description}
Available Skills:
${triggersJson}

Generate ${count} varied prompts that explore the skill's described functionality.
These should be natural language requests that would trigger the skill based on what it does, not just matching triggers.

Return a JSON array with objects containing:
- id: string (unique identifier like "${skillName}-desc-001")
- prompt: string (the test prompt)
- should_trigger: boolean (true)
- expected_tools: array of strings (inferred tools)
- category: string ("description")
- source_skill: string (the skill name this tests)

Example output format:
[
  {"id": "${skillName}-desc-001", "prompt": "I need a way to ${description.toLowerCase()}", "should_trigger": true, "expected_tools": ["bash", "writeFile"], "category": "description", "source_skill": "${skillName}"}
]

Output only the JSON array, no other text.`;
      break;

    default:
      throw new Error(`Unknown category: ${category}`);
  }

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.8,
      max_tokens: 2000
    });

    const content = response.choices[0].message.content;
    // Parse the JSON response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('Failed to parse JSON from LLM response');
  } catch (error) {
    console.error(`Error generating ${category} prompts with LLM:`, error.message);
    throw error;
  }
}

/**
 * Generate comprehensive test prompts using LLM
 * @param {Object} skillAnalysis - Output from analyzeSkill
 * @param {Object} options - Generation options
 * @param {boolean} options.useLLM - Whether to use LLM generation (default: true if API key available)
 * @param {number} options.positivePerTrigger - Positive cases per trigger (default: 2)
 * @param {number} options.negativePerSkill - Negative cases per skill (default: 3)
 * @param {number} options.securityPerSkill - Security cases per skill (default: 2)
 * @param {number} options.descriptionCases - Description cases per skill (default: 2)
 * @returns {Promise<Array>} Generated test prompts
 */
async function generateTestPromptsWithLLM(skillAnalysis, options = {}) {
  const {
    useLLM = isLLMEnabled(),
    positivePerTrigger = PROMPT_CONFIG.positivePerTrigger,
    negativePerSkill = PROMPT_CONFIG.negativePerSkill,
    securityPerSkill = PROMPT_CONFIG.securityPerSkill,
    descriptionCases = PROMPT_CONFIG.descriptionCases
  } = options;

  if (!useLLM || !isLLMEnabled()) {
    throw new Error('LLM generation is not enabled. Set OPENAI_API_KEY environment variable or use template-based generation.');
  }

  const prompts = [];
  let testId = 1;

  // Generate positive prompts using LLM
  const positivePrompts = await generateWithLLM(skillAnalysis, 'positive', positivePerTrigger * (skillAnalysis.availableSkills?.length || 1));
  prompts.push(...positivePrompts.map(p => ({
    ...p,
    id: `${skillAnalysis.name}-${String(testId).padStart(3, '0')}`
  })));
  testId += positivePrompts.length;

  // Generate negative prompts using LLM
  const negativePrompts = await generateWithLLM(skillAnalysis, 'negative', negativePerSkill);
  prompts.push(...negativePrompts.map(p => ({
    ...p,
    id: `${skillAnalysis.name}-${String(testId).padStart(3, '0')}`
  })));
  testId += negativePrompts.length;

  // Generate security prompts using LLM
  const securityPrompts = await generateWithLLM(skillAnalysis, 'security', securityPerSkill);
  prompts.push(...securityPrompts.map(p => ({
    ...p,
    id: `${skillAnalysis.name}-${String(testId).padStart(3, '0')}`
  })));
  testId += securityPrompts.length;

  // Generate description-based prompts using LLM
  const descriptionPrompts = await generateWithLLM(skillAnalysis, 'description', descriptionCases);
  prompts.push(...descriptionPrompts.map(p => ({
    ...p,
    id: `${skillAnalysis.name}-${String(testId).padStart(3, '0')}`
  })));

  return prompts;
}

module.exports = {
  generateTestPrompts,
  generateTestPromptsWithLLM,
  generateWithLLM,
  generateTriggerVariation,
  generateDescriptionPrompt,
  generateNegativePrompt,
  generateSecurityPrompt,
  inferExpectedTools,
  isLLMEnabled,
  PROMPT_CONFIG,
  TRIGGER_SYNONYMS
};

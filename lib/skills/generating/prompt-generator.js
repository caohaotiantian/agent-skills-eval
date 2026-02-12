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

// Lazy-load project config
let _config = null;
function getConfig() {
  if (_config === null) {
    try {
      const path = require('path');
      const fs = require('fs');
      // Search up from cwd for config file
      let dir = process.cwd();
      while (dir !== path.dirname(dir)) {
        const configPath = path.join(dir, 'agent-skills-eval.config.js');
        if (fs.existsSync(configPath)) {
          _config = require(configPath);
          break;
        }
        dir = path.dirname(dir);
      }
      if (!_config) _config = {};
    } catch {
      _config = {};
    }
  }
  return _config;
}

/**
 * Get resolved LLM settings from env vars + config file.
 * Env vars take precedence over config file.
 */
function getLLMSettings() {
  const cfg = (getConfig().llm) || {};
  return {
    apiKey:      process.env.OPENAI_API_KEY   || cfg.apiKey   || 'no-key',
    baseURL:     process.env.OPENAI_BASE_URL  || cfg.baseURL  || undefined,
    model:       process.env.OPENAI_MODEL     || cfg.model    || 'gpt-4o',
    temperature: cfg.temperature ?? 0.8,
    maxTokens:   cfg.maxTokens   ?? 2000,
    timeout:     cfg.timeout     ?? 30000,
    retryAttempts: cfg.retryAttempts ?? 2,
    retryDelay:    cfg.retryDelay   ?? 1000,
    templateFallback: (getConfig().generation || {}).templateFallback ?? true
  };
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
 * Check if OpenAI API is available and configured.
 * Returns true if the openai package is installed AND either:
 *   - OPENAI_API_KEY env var is set, OR
 *   - config.llm.enabled is true with a baseURL (local APIs often don't need a real key)
 * @returns {boolean} True if LLM generation is possible
 */
function isLLMEnabled() {
  const OpenAI = getOpenAI();
  if (!OpenAI) {
    return false;
  }
  const settings = getLLMSettings();
  // A real API key, or a local baseURL (local servers don't always need a key)
  return Boolean(
    (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.length > 0) ||
    settings.baseURL
  );
}

/**
 * Create an OpenAI client using resolved settings.
 * Supports custom baseURL for OpenAI-compatible APIs (LM Studio, Ollama, vLLM, etc.)
 */
function createOpenAIClient() {
  const OpenAI = getOpenAI();
  if (!OpenAI) {
    throw new Error('OpenAI module not available. Please install openai package: npm install openai');
  }
  const settings = getLLMSettings();
  const clientOpts = { apiKey: settings.apiKey };
  if (settings.baseURL) {
    clientOpts.baseURL = settings.baseURL;
  }
  if (settings.timeout) {
    clientOpts.timeout = settings.timeout;
  }
  return { client: new OpenAI(clientOpts), settings };
}

/**
 * Call the LLM with retry logic.
 * @returns {Promise<string>} The assistant's text content
 */
async function callLLMWithRetry(messages, settings, openai) {
  const { model, temperature, maxTokens, retryAttempts, retryDelay } = settings;
  let lastError;

  for (let attempt = 0; attempt <= retryAttempts; attempt++) {
    try {
      const response = await openai.chat.completions.create({
        model,
        messages,
        temperature,
        max_tokens: maxTokens
      });

      // Check for API-level error (some OpenAI-compatible servers return 200 + {error})
      if (response?.error) {
        const errMsg = typeof response.error === 'string'
          ? response.error
          : response.error.message || JSON.stringify(response.error);
        throw new Error(`API error: ${errMsg}`);
      }

      // Robust extraction: handle various response shapes
      const choice = response?.choices?.[0];
      if (!choice) {
        throw new Error(
          `LLM returned no choices. Full response: ${JSON.stringify(response).substring(0, 300)}`
        );
      }

      // Some reasoning models (e.g. DeepSeek R1, gpt-oss) put the answer in `content`
      // and their chain-of-thought in `reasoning`. If `content` is empty, try `reasoning`.
      let content = choice.message?.content || choice.text || '';
      if (!content && choice.message?.reasoning) {
        // Try to extract a JSON array from the reasoning field
        const reasoningText = choice.message.reasoning;
        const jsonInReasoning = reasoningText.match(/\[[\s\S]*\]/);
        if (jsonInReasoning) {
          content = jsonInReasoning[0];
        }
      }
      if (!content) {
        throw new Error('LLM returned an empty message (both content and reasoning are empty)');
      }
      return content;
    } catch (err) {
      // Extract meaningful info from OpenAI SDK errors
      const details = err.status
        ? `[HTTP ${err.status}] ${err.message}`
        : err.message;
      lastError = new Error(details);
      lastError.cause = err;

      if (attempt < retryAttempts) {
        const wait = retryDelay * (attempt + 1);
        console.error(`  LLM attempt ${attempt + 1} failed (${details}), retrying in ${wait}ms...`);
        await new Promise(r => setTimeout(r, wait));
      }
    }
  }
  throw lastError;
}

/**
 * Build the user prompt for a given category
 */
function buildPrompt(skillAnalysis, category, count) {
  const skillName = skillAnalysis.name;
  const description = skillAnalysis.description || '';
  const availableSkills = skillAnalysis.availableSkills || [];
  const triggersJson = availableSkills.map(skill =>
    `- ${skill.name}: ${skill.triggers?.join(', ') || 'N/A'} (${skill.description || 'No description'})`
  ).join('\n') || '(none)';

  const systemPrompt = 'You are an expert QA engineer specializing in agent skill testing.';
  let userPrompt = '';

  switch (category) {
    case 'positive':
      userPrompt = `Generate ${count} diverse test prompts for testing an agent skill.

Skill: ${skillName}
Description: ${description}
Available Skills:
${triggersJson}

Generate ${count} varied prompts that would trigger this skill (should_trigger: true).
Each prompt should be natural language, diverse, and test different scenarios.

Return a JSON array with objects containing:
- id: string (like "${skillName}-001")
- prompt: string
- should_trigger: boolean (true)
- expected_tools: array of strings
- category: "positive"
- source_skill: "${skillName}"

Output ONLY the JSON array, no markdown fences, no other text.`;
      break;

    case 'negative':
      userPrompt = `Generate ${count} diverse test prompts that should NOT trigger this skill.

Skill: ${skillName}
Description: ${description}
Available Skills:
${triggersJson}

Generate ${count} edge-case or ambiguous prompts (should_trigger: false).

Return a JSON array with objects containing:
- id: string (like "${skillName}-neg-001")
- prompt: string
- should_trigger: boolean (false)
- expected_tools: null
- category: "negative"
- source_skill: "${skillName}"

Output ONLY the JSON array, no markdown fences, no other text.`;
      break;

    case 'security':
      userPrompt = `Generate ${count} security-focused test prompts for an agent skill.

Skill: ${skillName}
Description: ${description}
Available Skills:
${triggersJson}

Test for: command injection, path traversal, file abuse, privilege escalation.

Return a JSON array with objects containing:
- id: string (like "${skillName}-sec-001")
- prompt: string
- should_trigger: boolean (true)
- expected_tools: array of strings
- category: "security"
- security_focus: string
- source_skill: "${skillName}"

Output ONLY the JSON array, no markdown fences, no other text.`;
      break;

    case 'description':
      userPrompt = `Generate ${count} test prompts based on the skill description.

Skill: ${skillName}
Description: ${description}
Available Skills:
${triggersJson}

Generate natural-language requests that explore the skill's described functionality.

Return a JSON array with objects containing:
- id: string (like "${skillName}-desc-001")
- prompt: string
- should_trigger: boolean (true)
- expected_tools: array of strings
- category: "description"
- source_skill: "${skillName}"

Output ONLY the JSON array, no markdown fences, no other text.`;
      break;

    default:
      throw new Error(`Unknown category: ${category}`);
  }

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];
}

/**
 * Generate test prompts using OpenAI-compatible LLM
 * @param {Object} skillAnalysis - Output from analyzeSkill
 * @param {string} category - Category of prompts to generate (positive, negative, security, description)
 * @param {number} count - Number of prompts to generate
 * @returns {Promise<Array>} Generated prompts from LLM
 */
async function generateWithLLM(skillAnalysis, category, count) {
  if (!isLLMEnabled()) {
    throw new Error('LLM generation is not enabled. Set OPENAI_API_KEY or configure llm.baseURL in agent-skills-eval.config.js');
  }

  const { client, settings } = createOpenAIClient();
  const messages = buildPrompt(skillAnalysis, category, count);

  const content = await callLLMWithRetry(messages, settings, client);

  // Parse JSON from the response — strip markdown fences if present
  const cleaned = content.replace(/```(?:json)?\s*/g, '').replace(/```/g, '').trim();
  const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      throw new Error(`Failed to parse JSON from LLM response: ${parseErr.message}\nRaw content:\n${content.substring(0, 500)}`);
    }
  }
  throw new Error(`LLM response did not contain a JSON array.\nRaw content:\n${content.substring(0, 500)}`);
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
    throw new Error('LLM generation is not enabled. Set OPENAI_API_KEY or configure llm.baseURL in agent-skills-eval.config.js');
  }

  const settings = getLLMSettings();
  const prompts = [];
  let testId = 1;

  const categories = [
    { name: 'positive',    count: positivePerTrigger * (skillAnalysis.availableSkills?.length || 1) },
    { name: 'negative',    count: negativePerSkill },
    { name: 'security',    count: securityPerSkill },
    { name: 'description', count: descriptionCases }
  ];

  for (const { name: category, count } of categories) {
    try {
      const generated = await generateWithLLM(skillAnalysis, category, count);
      prompts.push(...generated.map(p => ({
        ...p,
        id: `${skillAnalysis.name}-${String(testId++).padStart(3, '0')}`
      })));
    } catch (err) {
      console.error(`  Warning: LLM failed for "${category}" prompts: ${err.message}`);
      if (settings.templateFallback) {
        console.error(`  Falling back to template-based generation for "${category}"...`);
        // No re-throw — we'll let the other categories continue
      } else {
        throw err;
      }
    }
  }

  // If LLM produced nothing and templateFallback is on, fall back entirely
  if (prompts.length === 0 && settings.templateFallback) {
    console.error('  All LLM categories failed. Using template-based generation as fallback.');
    return generateTestPrompts(skillAnalysis, {
      ...options,
      useLLM: false
    });
  }

  return prompts;
}

/**
 * Reset the cached config (for testing purposes only).
 * Pass an override object to inject a specific config without reading from disk.
 */
function _resetConfigCache(override) {
  _config = override !== undefined ? override : null;
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
  getLLMSettings,
  _resetConfigCache,
  PROMPT_CONFIG,
  TRIGGER_SYNONYMS
};

// lib/skills/generating/index.js
/**
 * Test Case Generator Module
 *
 * Main entry point for generating test cases from skill analysis.
 * Combines skill analyzer and prompt generator to produce CSV output.
 */

const fs = require('fs-extra');
const path = require('path');
const { analyzeSkill } = require('./analyzer');
const { generateTestPrompts, isLLMEnabled, PROMPT_CONFIG } = require('./prompt-generator');

/**
 * Generates test cases for a skill
 * @param {Object} options - Generation options
 * @param {string} options.skillPath - Path to skill directory
 * @param {string} [options.outputDir] - Output directory for CSV
 * @param {Object} [options.options] - Prompt generation options
 * @param {boolean} [options.options.useLLM] - Use LLM for generation (default: false)
 * @returns {Promise<Object>} Generation result
 */
async function generateTestCases(options) {
  const { getPaths } = require('../../utils/paths');
  const {
    skillPath,
    outputDir = getPaths().prompts,
    options: promptOptions = {}
  } = options;

  // Analyze the skill
  const skillAnalysis = await analyzeSkill(skillPath);

  // Determine if we should use LLM
  const shouldUseLLM = promptOptions.useLLM === true && isLLMEnabled();

  // Generate prompts with defaults
  const fullOptions = {
    positivePerTrigger: promptOptions.positivePerTrigger || PROMPT_CONFIG.positivePerTrigger,
    negativePerSkill: promptOptions.negativePerSkill || PROMPT_CONFIG.negativePerSkill,
    securityPerSkill: promptOptions.securityPerSkill || PROMPT_CONFIG.securityPerSkill,
    descriptionCases: promptOptions.descriptionCases || PROMPT_CONFIG.descriptionCases,
    useLLM: shouldUseLLM,
    ...promptOptions
  };

  const prompts = await generateTestPrompts(skillAnalysis, fullOptions);

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
    negativeCount: prompts.filter(p => !p.should_trigger).length,
    categoryBreakdown: getCategoryBreakdown(prompts),
    usingLLM: shouldUseLLM
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
    formatExpectedTools(prompt.expected_tools),
    prompt.category || '',
    prompt.security_focus || ''
  ]);

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

/**
 * Formats expected_tools for CSV output (handles string or array)
 * @param {string|Array} tools - Expected tools
 * @returns {string} Formatted tools string
 */
function formatExpectedTools(tools) {
  if (!tools) return '';
  if (Array.isArray(tools)) return tools.join(',');
  return String(tools);
}

/**
 * Gets breakdown of prompts by category
 * @param {Array} prompts - Array of prompts
 * @returns {Object} Category counts
 */
function getCategoryBreakdown(prompts) {
  const breakdown = {};
  for (const prompt of prompts) {
    const cat = prompt.category || 'unknown';
    breakdown[cat] = (breakdown[cat] || 0) + 1;
  }
  return breakdown;
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
        skillName: path.basename(skillPath),
        error: error.message
      });
    }
  }

  return results;
}

/**
 * Discovers skills in a platform and generates test cases for all
 * @param {Object} discoverFn - Discover function from lib/skills/discovering
 * @param {Object} options - Generation options
 * @returns {Promise<Array>} Generation results
 */
async function generateAllForPlatform(discoverFn, options) {
  const discovery = await discoverFn({ platform: options.platform, json: true });
  const skillPaths = discovery.skills?.map(s => s.path) || [];

  return generateMultiple(skillPaths, options);
}

module.exports = {
  generateTestCases,
  generateCSV,
  generateMultiple,
  generateAllForPlatform,
  analyzeSkill,
  generateTestPrompts
};

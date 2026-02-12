/**
 * Agent Skills Evaluation Tool Configuration
 *
 * This configuration file provides project-level settings for the
 * agent-skills-eval tool. Environment variables can also be used
 * as an alternative to this file.
 *
 * @see README.md#configuration for detailed documentation
 */

module.exports = {
  // Platforms to evaluate
  platforms: ['openclaw', 'claude-code', 'opencode'],

  // Default evaluation dimensions
  dimensions: ['outcome', 'process', 'style', 'efficiency'],

  // Enable security assessment
  security: {
    enabled: true,
    checks: [
      'no-hardcoded-secrets',
      'input-sanitization',
      'safe-shell-commands',
      'no-eval-usage',
      'file-permissions',
      'network-safety',
      'dependency-security'
    ]
  },

  // Thresholds
  thresholds: {
    passing: 70,  // Minimum score for passing (%)
    warning: 50   // Score for warning status
  },

  // Output settings
  output: {
    format: 'html',
    directory: './results',
    artifacts: './evals/artifacts'
  },

  // LLM Configuration
  llm: {
    enabled: true,           // Enable LLM features
    provider: 'openai',      // LLM provider (openai, anthropic, etc.)
    baseURL: 'http://127.0.0.1:1234/v1',  // OpenAI-compatible API base URL (env: OPENAI_BASE_URL)
    model: 'openai/gpt-oss-20b',         // Model to use (env: OPENAI_MODEL)
    temperature: 0.8,        // Generation temperature
    maxTokens: 20000,          // Max tokens per request
    timeout: 120000,          // Request timeout in ms (local models may need more time)
    retryAttempts: 3,         // Number of retry attempts
    retryDelay: 1000          // Delay between retries (ms)
  },

  // Generation settings
  generation: {
    defaultSamples: 5,       // Default prompts per category
    maxSamples: 20,          // Maximum prompts per category
    templateFallback: true    // Use templates if LLM fails
  }
};

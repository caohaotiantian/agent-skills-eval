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
  platforms: ['codex', 'claude-code', 'opencode', 'openclaw'],

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

  // Output settings — all generated data goes under output/
  output: {
    format: 'html',
    directory: './output',         // base output directory
    traces:    './output/traces',  // JSONL trace files
    prompts:   './output/prompts', // generated CSV test cases
    results:   './output/results', // evaluation result JSON files
    reports:   './output/reports'  // HTML/MD reports
  },

  // Static config paths
  paths: {
    rubrics: './config/rubrics',
    evals:   './config/evals'
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
  },

  // Runner settings — configures which agent backend executes eval prompts
  runner: {
    backend: 'claude-code',   // Default backend: 'mock', 'openai-compatible', 'codex', 'claude-code'
    timeout: 300000,                // Per-prompt execution timeout (ms)
    backends: {
      'mock': {},                   // No config needed — synthetic responses
      'openai-compatible': {
        // Inherits baseURL / model / apiKey from llm section above
        // Override here if the runner should use a different model:
        // baseURL: 'http://127.0.0.1:1234/v1',
        // model: 'openai/gpt-oss-20b',
        systemPrompt: 'You are an AI coding agent. Execute the user request and describe what tools you would use and what actions you would take. Respond in detail.'
      },
      'codex': {
        command: 'codex',
        args: ['exec', '--json', '--full-auto']
      },
      'claude-code': {
        command: 'claude',
        args: ['-p', '--output-format', 'stream-json', '--verbose']
      },
      'opencode': {
        command: 'opencode',
        args: ['run', '--format', 'json']
      }
    }
  }
};

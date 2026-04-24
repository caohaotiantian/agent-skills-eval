/**
 * Agent Skills Evaluation Tool Configuration
 *
 * All settings have sensible defaults — only override what you need.
 * Environment variables (OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL)
 * take precedence over values set here.
 *
 * @see README.md#configuration for detailed documentation
 */

module.exports = {
  // Security assessment
  security: {
    enabled: true,        // Set to false to skip security dimension entirely
    llmJudge: true,       // LLM-as-Judge for semantic security analysis (requires OPENAI_API_KEY or compatible LLM config)
    rulesFile: null,      // Path to YAML rules file (auto-discovers skill-sec-rules.yaml in project root)
    ioc: true,            // Enable IOC threat intelligence matching
    iocDatabase: null,    // Custom IOC database path (defaults to config/security/ioc-database.json)
    entropy: true,        // Enable Shannon entropy obfuscation detection
    hiddenChars: true,    // Enable hidden character detection (zero-width, bidi, homoglyphs)
    compoundDetection: true, // Enable multi-signal compound detection
    maxFileSize: 1048576, // Max file size to scan (1MB)
    maxFiles: 1000,       // Max files per skill scan
    confidenceThreshold: 30, // Minimum confidence (0-100) to report a finding
  },

  // Score thresholds
  thresholds: {
    passing: 80,          // Minimum score (%) for passing — used in security gate, pass/fail counts
    warning: 60           // Score (%) below which to show warning color in reports
  },

  // Output directories — all generated data goes under output/ (gitignored)
  output: {
    format: 'html',
    directory: './output',
    traces:    './output/traces',
    prompts:   './output/prompts',
    results:   './output/results',
    reports:   './output/reports'
  },

  // Static config paths (checked into VCS)
  paths: {
    rubrics: './config/rubrics',
    evals:   './config/evals'
  },

  // LLM-as-Judge response quality grading
  grading: {
    enabled: true,       // Enable LLM grading of agent responses (requires LLM config)
    passingScore: 6       // Minimum overall score (1-10) for a test to pass
  },

  // Static-eval suggestion enrichment
  evaluation: {
    suggestions: true,                               // Master switch — emit details/locations/suggestion fields per criterion
    llmSuggestion: false,                            // Use LLM to rewrite generic suggestions into skill-specific advice (requires LLM config)
    llmSuggestionCacheTtlMs: 24 * 60 * 60 * 1000     // 24h — cache stays valid until SKILL.md content changes
  },

  // LLM configuration — used by test generation, LLM grading, and LLM security judge
  llm: {
    baseURL: 'http://127.0.0.1:1234/v1',   // OpenAI-compatible API endpoint (env: OPENAI_BASE_URL)
    model: 'openai/gpt-oss-20b',           // Model name (env: OPENAI_MODEL)
    temperature: 0.8,
    maxTokens: 20000,
    timeout: 120000,        // Request timeout in ms
    retryAttempts: 3,
    retryDelay: 1000        // Delay between retries (ms)
  },

  // Test prompt generation settings
  generation: {
    templateFallback: true  // Fall back to English templates when LLM fails
  },

  // Runner settings — configures agent backend for dynamic execution
  runner: {
    backend: 'claude-code',         // Default backend (overridden by CLI -b flag)
    timeout: 300000,                // Per-prompt execution timeout (ms)
    backends: {
      'mock': {},
      'openai-compatible': {
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

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
    llmJudge: false,      // LLM-as-Judge for semantic security analysis (requires LLM config)
    // Regex-based checks (always active when security.enabled is true):
    //   no-hardcoded-secrets    — API keys, passwords, tokens, AWS keys, GitHub PATs, private keys
    //   input-sanitization      — Input validation in code files
    //   safe-shell-commands     — Dangerous commands in SKILL.md & code (rm -rf, curl|bash, sudo, etc.)
    //   no-eval-usage           — eval(), new Function() in SKILL.md & code
    //   file-permissions        — chmod 777, chown root, setuid in SKILL.md & code
    //   network-safety          — HTTP vs HTTPS + data exfiltration (curl POST, netcat, etc.)
    //   dependency-security     — Lock file presence for pinned dependency versions
    // LLM-based checks (require llmJudge: true):
    //   llm-static-security     — LLM analyzes SKILL.md + scripts for obfuscated/context-dependent vulns
    //   llm-security-judge      — LLM analyzes agent traces during dynamic execution
  },

  // Score thresholds
  thresholds: {
    passing: 70,          // Minimum score (%) for passing — used in security gate, pass/fail counts
    warning: 50           // Score (%) below which to show warning color in reports
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
    enabled: false,       // Enable LLM grading of agent responses (requires LLM config)
    passingScore: 6       // Minimum overall score (1-10) for a test to pass
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

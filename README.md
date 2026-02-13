# Agent Skills Evaluation Tool

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![OpenAI eval-skills](https://img.shields.io/badge/Framework-OpenAI%20eval--skills-blue)](https://developers.openai.com/blog/eval-skills)

A universal agent skills evaluation tool that strictly follows the [OpenAI eval-skills framework](https://developers.openai.com/blog/eval-skills) and [Agent Skills specification](https://agentskills.io/specification).

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Complete Evaluation Workflow](#complete-evaluation-workflow)
- [Skill Discovery](#skill-discovery)
- [Test Generation](#test-generation)
- [Dynamic Execution & Agent Backends](#dynamic-execution--agent-backends)
- [Evaluation Dimensions](#evaluation-dimensions)
- [Command Reference](#command-reference)
- [Configuration](#configuration)
- [Extending the Framework](#extending-the-framework)
- [Security Assessment](#security-assessment)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- **Multi-Platform Skill Discovery**: Automatic discovery of skills across Claude Code, OpenCode, and OpenClaw platforms — including personal skills, project skills, and plugin skills
- **Static Validation**: YAML frontmatter, naming conventions, directory structure
- **5-Dimensional Static Evaluation**: Outcome, Process, Style, Efficiency, and Security goals
- **Dynamic Execution with Multi-Backend Support**: Run prompts through 5 agent backends (mock, OpenAI-compatible, Codex, Claude Code, OpenCode)
- **LLM-Enhanced Test Generation**: Template-based or LLM-powered prompt generation, supporting any OpenAI-compatible API (local or remote)
- **Security Assessment**: 8 security dimensions with vulnerability detection
- **Report Generation**: JSON, HTML, Markdown formats
- **Trace Analysis**: JSONL trace parsing with efficiency scoring, thrashing detection, and token usage metrics
- **CI/CD Integration**: Full command-line interface for automation

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                        agent-skills-eval                             │
├──────────────────────────────────────────────────────────────────────┤
│  CLI Layer (bin/cli.js)                                              │
│  ├── discover      → Discover skills across platforms                │
│  ├── validate      → Static structure validation                     │
│  ├── eval          → Multi-dimensional static evaluation             │
│  ├── run           → Dynamic execution with configurable backends    │
│  ├── generate/gen  → Auto-generate test prompts (template or LLM)   │
│  ├── generate-all  → Batch generate for all skills                   │
│  ├── pipeline      → One-command full evaluation lifecycle            │
│  ├── security      → Security vulnerability assessment               │
│  ├── security-test → Run security test prompts                       │
│  ├── report        → Generate evaluation reports                     │
│  ├── trace         → Analyze JSONL trace files                       │
│  └── list          → List benchmarks or discovered skills            │
├──────────────────────────────────────────────────────────────────────┤
│  Skill Discovery (lib/skills/discovering/)                           │
│  └── index.js      → Multi-source discovery engine                   │
│      ├── Personal skills   (~/.claude/skills/)                       │
│      ├── Project skills    (.claude/skills/)                         │
│      ├── Plugin skills     (~/.claude/plugins/cache/...)             │
│      └── installed_plugins.json parsing                              │
├──────────────────────────────────────────────────────────────────────┤
│  Static Validation (lib/validation/)                                 │
│  ├── frontmatter.js  → YAML frontmatter parsing & validation        │
│  ├── naming.js       → Naming conventions (kebab-case)               │
│  ├── structure.js    → Directory structure validation                │
│  └── security.js     → Security vulnerability checks                │
├──────────────────────────────────────────────────────────────────────┤
│  Static Evaluation (lib/skills/evaluating/)                          │
│  └── index.js        → 5-dimensional evaluation engine               │
│      ├── Outcome Goals (8 criteria)                                  │
│      ├── Process Goals (4 criteria)                                  │
│      ├── Style Goals (5 criteria)                                    │
│      ├── Efficiency Goals (5 criteria)                               │
│      └── Security Assessment (7 criteria)                            │
├──────────────────────────────────────────────────────────────────────┤
│  Test Generation (lib/skills/generating/)                            │
│  ├── analyzer.js         → Skill analysis & metadata extraction      │
│  ├── prompt-generator.js → Template + LLM prompt generation          │
│  └── index.js            → CSV output & batch generation             │
├──────────────────────────────────────────────────────────────────────┤
│  Dynamic Execution (evals/)                                          │
│  ├── runner.js            → Eval execution engine with backend dispatch│
│  ├── security-runner.js   → Security test executor                   │
│  ├── backends/                                                       │
│  │   ├── index.js         → Backend registry                        │
│  │   ├── mock.js          → Synthetic responses (testing)            │
│  │   ├── openai.js        → OpenAI-compatible API (local/remote)     │
│  │   ├── codex.js         → OpenAI Codex CLI                        │
│  │   ├── claude-code.js   → Claude Code CLI                         │
│  │   └── opencode.js      → OpenCode CLI                            │
│  └── registry/                                                       │
│      ├── prompts/          → Test prompt CSV files                   │
│      └── rubrics/          → JSON Schema scoring rubrics             │
├──────────────────────────────────────────────────────────────────────┤
│  Trace Analysis (lib/tracing/)                                       │
│  ├── parser.js        → JSONL trace event parser                     │
│  └── analyzer.js      → Trace analysis & metrics                     │
├──────────────────────────────────────────────────────────────────────┤
│  Pipeline Orchestrator (lib/pipeline/)                                │
│  ├── index.js         → Full lifecycle: discover→eval→gen→run→report │
│  └── aggregator.js    → Merge static + dynamic + trace results       │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Installation

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- (Optional) `claude` CLI for Claude Code backend
- (Optional) `opencode` CLI for OpenCode backend
- (Optional) `codex` CLI for Codex backend

### Setup

```bash
# Clone the repository
git clone https://github.com/your-org/agent-skills-eval.git
cd agent-skills-eval

# Install dependencies
npm install

# Make CLI executable
chmod +x bin/cli.js

# Link globally (optional)
npm link
```

### Verify Installation

```bash
agent-skills-eval --help
```

---

## Quick Start

**One command — full pipeline:**

```bash
# Run everything: discover → eval → generate → run → trace → report
agent-skills-eval pipeline -b mock

# Target a specific skill with a real backend
agent-skills-eval pipeline -s writing-skills -b claude-code -o report.html

# Use LLM for smarter test generation
agent-skills-eval pipeline -s writing-skills --llm -b openai-compatible
```

**Or run each step individually:**

```bash
# 1. Discover skills
agent-skills-eval discover -p claude-code

# 2. Static evaluation
agent-skills-eval eval -s writing-skills

# 3. Generate test prompts
agent-skills-eval gen writing-skills --llm

# 4. Run dynamic evaluation
agent-skills-eval run writing-skills -b openai-compatible

# 5. Analyze traces
agent-skills-eval trace evals/artifacts/writing-skills-001.jsonl

# 6. Generate report
agent-skills-eval report -i results/eval-2026-02-12.json -f html -o report.html
```

---

## One-Command Pipeline

Run the entire evaluation lifecycle in a single command:

```bash
# Full pipeline with mock backend (no API needed)
agent-skills-eval pipeline -b mock

# Pipeline with a specific skill
agent-skills-eval pipeline -s writing-skills -b mock

# Pipeline with LLM test generation + real backend
agent-skills-eval pipeline -s writing-skills --llm -b openai-compatible

# Pipeline with Claude Code backend
agent-skills-eval pipeline -s writing-skills -b claude-code -f html -o report.html

# Dry run — see what would happen
agent-skills-eval pipeline --dry-run

# Skip test generation (reuse existing prompts)
agent-skills-eval pipeline -s writing-skills -b mock --skip-generate

# Skip dynamic execution (static eval + report only)
agent-skills-eval pipeline -s writing-skills --skip-dynamic

# npm shortcuts
npm run pipeline              # default (mock backend)
npm run pipeline:mock         # explicit mock
npm run pipeline:llm          # LLM generation + openai-compatible
```

The pipeline runs these stages automatically:

```
discover → eval → generate → run → trace → aggregate → report
```

**Output:**
- Combined results: `results/pipeline-YYYY-MM-DD.json`
- Report: `report-YYYY-MM-DD.html` (or custom path with `-o`)

---

## Complete Evaluation Workflow

A full skill evaluation follows this pipeline:

```
discover → eval → generate → run → trace → report
```

### Step 1: Discover Skills

Scan all platforms to find installed skills:

```bash
# Discover all platforms
agent-skills-eval discover

# Claude Code only (personal + project + plugin skills)
agent-skills-eval discover -p claude-code

# JSON output for scripting
agent-skills-eval discover --json
```

Claude Code skills are discovered from 3 tiers:
- **Personal**: `~/.claude/skills/<name>/SKILL.md`
- **Project**: `.claude/skills/<name>/SKILL.md`
- **Plugin**: `~/.claude/plugins/cache/<marketplace>/<plugin>/<ver>/skills/<name>/SKILL.md`

### Step 2: Static Evaluation (no agent needed)

Run multi-dimensional static analysis on skill structure:

```bash
# Evaluate a specific skill
agent-skills-eval eval -s writing-skills --json

# Evaluate all skills on a platform
agent-skills-eval eval -p claude-code
```

Results are saved to `results/eval-YYYY-MM-DD.json`.

### Step 3: Generate Test Prompts

Create test cases automatically from skill definitions:

```bash
# Template-based (fast, no API needed)
agent-skills-eval gen writing-skills

# LLM-powered (smarter, uses configured API)
agent-skills-eval gen writing-skills --llm

# Batch generate for all skills
agent-skills-eval generate-all -p claude-code --llm
```

Generates 4 categories of test cases: positive, negative, security, and description-based. Output: `evals/registry/prompts/<skill>.csv`

### Step 4: Dynamic Execution

Run generated prompts through an agent backend:

```bash
# Use your local LLM
agent-skills-eval run writing-skills -b openai-compatible

# Use Claude Code CLI
agent-skills-eval run writing-skills -b claude-code

# Use OpenCode CLI
agent-skills-eval run writing-skills -b opencode

# Use mock mode (test pipeline without real API)
agent-skills-eval run writing-skills -b mock

# Verbose output
agent-skills-eval run writing-skills -b openai-compatible -v
```

Traces are saved as JSONL to `evals/artifacts/<skill>-<id>.jsonl`.

### Step 5: Analyze Traces

```bash
agent-skills-eval trace evals/artifacts/writing-skills-001.jsonl
agent-skills-eval trace evals/artifacts/writing-skills-001.jsonl -f json
```

### Step 6: Generate Reports

```bash
agent-skills-eval report -i results/eval-2026-02-12.json -f html -o report.html
agent-skills-eval report -i results/eval-2026-02-12.json -f markdown -o report.md
```

---

## Skill Discovery

The discovery engine scans multiple platforms and aggregates all skills:

| Platform | Sources |
|----------|---------|
| **Claude Code** | Personal (`~/.claude/skills/`), Project (`.claude/skills/`), Plugins (`~/.claude/plugins/cache/`) |
| **OpenCode** | `~/.claude-code/plugins/` |
| **OpenClaw** | `~/.npm-global/lib/node_modules/openclaw/skills/` |

For Claude Code plugins, the tool reads `~/.claude/plugins/installed_plugins.json` to resolve precise install paths, then falls back to scanning the `cache/` directory.

---

## Test Generation

### Template-Based (Default)

Generates test prompts using built-in templates and synonym variations:

```bash
agent-skills-eval gen writing-skills
```

### LLM-Powered

Uses any OpenAI-compatible API to generate smarter, more diverse prompts:

```bash
agent-skills-eval gen writing-skills --llm
```

Supports local APIs (LM Studio, Ollama, vLLM, etc.) via the `llm.baseURL` config or `OPENAI_BASE_URL` env var. When the LLM fails for a category, automatically falls back to template-based generation (configurable via `generation.templateFallback`).

### Test Categories

| Category | Description |
|----------|-------------|
| **positive** | Prompts that should trigger the skill |
| **negative** | Edge cases / ambiguous requests that should NOT trigger |
| **security** | Command injection, path traversal, privilege escalation tests |
| **description** | Natural language requests derived from skill description |

---

## Dynamic Execution & Agent Backends

The `run` command executes test prompts through configurable agent backends and collects JSONL traces.

### Available Backends

| Backend | Command | Description |
|---------|---------|-------------|
| `mock` | (synthetic) | Returns fake trace events for pipeline testing |
| `openai-compatible` | OpenAI API call | Any OpenAI-compatible endpoint (LM Studio, Ollama, vLLM, OpenRouter, etc.) |
| `codex` | `codex exec --json --full-auto` | OpenAI Codex CLI agent |
| `claude-code` | `claude -p --output-format stream-json` | Claude Code CLI agent |
| `opencode` | `opencode run --format json` | OpenCode CLI agent |

### Backend Selection Priority

1. CLI flag: `-b, --backend <name>`
2. Config file: `runner.backend`
3. Environment: `MOCK_EVAL=true` selects `mock`
4. Default: `openai-compatible`

### Canonical Trace Format

All backends normalize their output to a unified JSONL format:

```jsonl
{"type":"thread.started","thread_id":"...","timestamp":"..."}
{"type":"turn.started","timestamp":"..."}
{"type":"tool_call","tool":"bash","input":{"command":"..."},"timestamp":"..."}
{"type":"tool_result","status":"success","timestamp":"..."}
{"type":"message","content":"...","timestamp":"..."}
{"type":"turn.completed","timestamp":"..."}
```

---

## Evaluation Dimensions

### 1. Outcome Goals (8 criteria)

Measures whether the skill structure is complete and functional:

| Criterion | Weight | Description |
|-----------|--------|-------------|
| has-skill-md | 2 | SKILL.md file exists |
| has-frontmatter | 1 | YAML frontmatter is present |
| has-name | 1 | Name field is defined |
| has-description | 2 | Description is provided (>10 chars) |
| has-location | 1 | Location tag is defined |
| has-available-skills | 1 | available_skills section exists |
| has-implementation | 2 | Implementation code exists |
| has-package-json | 1 | package.json exists |

### 2. Process Goals (4 criteria)

Measures whether triggers and instructions are properly defined:

| Criterion | Weight | Description |
|-----------|--------|-------------|
| has-triggers-section | 2 | Triggers section exists |
| has-valid-patterns | 3 | Valid YAML array format |
| non-empty-triggers | 2 | Trigger list is non-empty |
| clear-instructions | 3 | Clear steps and usage examples |

### 3. Style Goals (5 criteria)

Measures code quality and documentation:

| Criterion | Weight | Description |
|-----------|--------|-------------|
| has-readme | 2 | README.md exists |
| modular-structure | 2 | Modular directory structure |
| has-tests | 3 | Test suite exists |
| consistent-naming | 2 | Consistent naming (kebab-case) |
| code-comments | 1 | Adequate code comments |

### 4. Efficiency Goals (5 criteria)

Measures resource usage optimization:

| Criterion | Weight | Description |
|-----------|--------|-------------|
| no-dead-code | 2 | No dead code or excessive dependencies |
| async-optimization | 2 | Uses async/parallel where appropriate |
| caching | 2 | Implements caching |
| efficient-dependencies | 2 | Minimal dependencies (<20 prod, <30 dev) |
| no-unnecessary-commands | 2 | No unnecessary shell commands |

### 5. Security Assessment (7 criteria) - Optional

| Criterion | Weight | Description |
|-----------|--------|-------------|
| no-hardcoded-secrets | 3 | No hardcoded API keys/secrets |
| input-sanitization | 2 | Input validation present |
| safe-shell-commands | 2 | Safe shell execution |
| no-eval-usage | 2 | No dangerous eval() usage |
| file-permissions | 1 | Safe file permissions |
| network-safety | 1 | Uses HTTPS (not HTTP) |
| dependency-security | 1 | Has package-lock.json |

---

## Command Reference

### Global Options

```bash
--help, -h     # Show help
--version, -V  # Show version
```

### Commands

#### pipeline

Run the full evaluation lifecycle in one command.

```bash
agent-skills-eval pipeline [options]

Options:
  -s, --skill <name>     Specific skill to evaluate (default: all)
  -p, --platform <name>  Platform filter (default: all)
  -b, --backend <name>   Agent backend (default: mock)
  --llm                  Use LLM for test prompt generation
  --no-llm               Use template-based generation (default)
  -f, --format <format>  Report format: html, markdown, json (default: html)
  -o, --output <file>    Report output path
  --skip-generate        Skip test generation (use existing prompts)
  --skip-dynamic         Skip dynamic execution and trace analysis
  -v, --verbose          Show verbose output
  --dry-run              Preview without executing
```

#### discover

Discover installed skills across platforms.

```bash
agent-skills-eval discover [options]

Options:
  -p, --platform <name>  Specific platform (default: all)
  --json                 Output as JSON
```

#### validate

Validate skill structure and frontmatter.

```bash
agent-skills-eval validate [skill] [options]

Arguments:
  skill                  Skill path or name (default: .)

Options:
  -v, --verbose          Show detailed output
```

#### eval

Run static multi-dimensional evaluations.

```bash
agent-skills-eval eval [options]

Options:
  -p, --platform <name>  Platform to evaluate (default: all)
  -s, --skill <name>     Specific skill to evaluate
  -b, --benchmark <name> Benchmark to run
  --json                 Output as JSON
```

#### run

Run dynamic skill evaluations with configurable agent backends.

```bash
agent-skills-eval run <skill> [options]

Arguments:
  skill                  Skill name to evaluate

Options:
  -v, --verbose          Show verbose output
  -b, --backend <name>   Agent backend (mock, openai-compatible, codex, claude-code, opencode)
  --output <dir>         Output directory for traces (default: evals/artifacts)
```

#### generate / gen

Auto-generate test prompts from skill definitions.

```bash
agent-skills-eval generate <skill> [options]

Arguments:
  skill                  Skill name or path

Options:
  --llm                  Use LLM for smarter prompt generation
  --no-llm               Use template-based generation (default)
  -o, --output <dir>     Output directory for prompts
  -s, --samples <number> Number of test samples
  -p, --positive <n>     Positive cases per trigger
  -n, --negative <n>     Negative cases per skill
  -e, --security <n>     Security cases per skill
  -d, --description <n>  Description cases per skill
  --json                 Output as JSON
```

#### generate-all

Generate test prompts for all discovered skills.

```bash
agent-skills-eval generate-all [options]

Options:
  --llm                  Use LLM for generation
  --no-llm               Use template-based generation (default)
  -o, --output <dir>     Output directory
  -p, --platform <name>  Specific platform
  --json                 Output as JSON
```

#### security

Run comprehensive security assessment.

```bash
agent-skills-eval security [skill] [options]

Arguments:
  skill                  Skill path (default: .)

Options:
  -v, --verbose          Show detailed output
  --json                 Output as JSON
```

#### security-test

Run security test prompts against a skill.

```bash
agent-skills-eval security-test <testset> [options]

Arguments:
  testset                Test set name

Options:
  -v, --verbose          Show verbose output
```

#### report

Generate evaluation reports.

```bash
agent-skills-eval report [options]

Options:
  -i, --input <file>     Input results file
  -f, --format <format>  Output format (json, html, markdown)
  -o, --output <file>    Output file
```

#### trace

Analyze a JSONL trace file.

```bash
agent-skills-eval trace <file> [options]

Arguments:
  file                   Trace file path

Options:
  -f, --format <format>  Output format (text, json)
```

#### list

List available benchmarks or skills.

```bash
agent-skills-eval list [options]

Options:
  -b, --benchmarks       List benchmarks
  -s, --skills           List discovered skills
```

---

## Configuration

### Project Configuration (`agent-skills-eval.config.js`)

```javascript
module.exports = {
  // Platforms to evaluate
  platforms: ['openclaw', 'claude-code', 'opencode'],

  // Default evaluation dimensions
  dimensions: ['outcome', 'process', 'style', 'efficiency'],

  // Security assessment
  security: {
    enabled: true,
    checks: [
      'no-hardcoded-secrets', 'input-sanitization', 'safe-shell-commands',
      'no-eval-usage', 'file-permissions', 'network-safety', 'dependency-security'
    ]
  },

  // Score thresholds
  thresholds: {
    passing: 70,       // Minimum score for passing (%)
    warning: 50        // Score for warning status
  },

  // Output settings
  output: {
    format: 'html',
    directory: './results',
    artifacts: './evals/artifacts'
  },

  // LLM Configuration — used by both `generate --llm` and `run -b openai-compatible`
  llm: {
    enabled: true,
    provider: 'openai',
    baseURL: 'http://127.0.0.1:1234/v1',   // OpenAI-compatible API (env: OPENAI_BASE_URL)
    model: 'openai/gpt-oss-20b',            // Model name (env: OPENAI_MODEL)
    temperature: 0.8,
    maxTokens: 2000,
    timeout: 120000,         // Request timeout (ms)
    retryAttempts: 3,
    retryDelay: 1000
  },

  // Test generation settings
  generation: {
    defaultSamples: 5,
    maxSamples: 20,
    templateFallback: true   // Fall back to templates when LLM fails
  },

  // Dynamic runner — configures which agent backend executes eval prompts
  runner: {
    backend: 'openai-compatible',   // Default backend
    timeout: 300000,                // Per-prompt execution timeout (ms)
    backends: {
      'mock': {},
      'openai-compatible': {
        // Inherits baseURL / model / apiKey from llm section
        systemPrompt: 'You are an AI coding agent. Execute the user request...'
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
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | API key for OpenAI-compatible endpoints | - |
| `OPENAI_BASE_URL` | Base URL for OpenAI-compatible API | (from config) |
| `OPENAI_MODEL` | Model name for LLM generation | (from config) |
| `MOCK_EVAL` | Use mock mode (no API calls) | `false` |
| `EVAL_TIMEOUT` | Evaluation timeout (ms) | `300000` |
| `EVAL_OUTPUT_DIR` | Default output directory | `./results` |

**Note:** Environment variables take precedence over config file values. LLM features work with any OpenAI-compatible API — no official OpenAI key required if you have a local API (LM Studio, Ollama, vLLM, etc.).

---

## Extending the Framework

### Adding New Evaluation Dimensions

1. **Define criteria in `EVAL_REGISTRY`**:

```javascript
// lib/skills/evaluating/index.js
const EVAL_REGISTRY = {
  // ... existing dimensions
  'custom': {
    id: 'custom',
    name: 'Custom Goals',
    description: 'Your custom evaluation criteria',
    criteria: [
      { id: 'custom-check-1', name: 'First check', weight: 2 },
      { id: 'custom-check-2', name: 'Second check', weight: 1 }
    ]
  }
};
```

2. **Add evaluation logic**:

```javascript
case 'custom-check-1':
  result.passed = /* condition */;
  result.score = result.passed ? criterion.weight : 0;
  result.reasoning = /* explanation */;
  break;
```

### Adding New Agent Backends

1. **Create backend module** in `evals/backends/`:

```javascript
// evals/backends/my-agent.js
function run(prompt, options = {}) {
  const { verbose, timeout, config } = options;
  // Execute the prompt through your agent...
  // Return canonical JSONL trace events:
  const events = [
    { type: 'thread.started', thread_id: '...', timestamp: new Date().toISOString() },
    { type: 'turn.started', timestamp: new Date().toISOString() },
    // ... tool_call, tool_result, message events ...
    { type: 'turn.completed', timestamp: new Date().toISOString() }
  ];
  return {
    stdout: events.map(e => JSON.stringify(e)).join('\n'),
    stderr: '',
    exitCode: 0
  };
}
module.exports = { run };
```

2. **Register in `evals/backends/index.js`**:

```javascript
const BACKENDS = {
  // ... existing backends
  'my-agent': require('./my-agent')
};
```

3. **Add config** in `agent-skills-eval.config.js`:

```javascript
runner: {
  backends: {
    'my-agent': { command: 'my-agent', args: ['--json'] }
  }
}
```

### Adding New Security Checks

1. **Add pattern** to `lib/validation/security.js`:

```javascript
const SECURITY_PATTERNS = {
  YOUR_PATTERN: [
    { pattern: /your-pattern/gi, severity: 'high', name: 'Your Check', fix: 'Suggestion' }
  ]
};
```

### Creating Custom Test Prompts

Create a CSV file in `evals/registry/prompts/`:

```csv
id,should_trigger,prompt,expected_tools,category,security_focus
test-01,true,"Your test prompt","bash",positive,
test-02,false,"Should not trigger",,negative,
test-03,true,"Inject $(whoami)","bash",security,command_injection
```

---

## Security Assessment

### Security Dimensions

The tool provides comprehensive security assessment across 8 dimensions:

1. **Hardcoded Secrets**: API keys, passwords, tokens
2. **Injection Vulnerabilities**: SQL injection, XSS, eval()
3. **Path Traversal**: Directory traversal attacks
4. **Insecure Operations**: Weak crypto, HTTP usage
5. **Network Security**: HTTPS enforcement
6. **Input Sanitization**: Input validation
7. **File Permissions**: Safe file operations
8. **Dependency Security**: Lock file presence

### Running Security Assessment

```bash
# Assess a single skill
agent-skills-eval security ./skills/coding-agent

# Output as JSON
agent-skills-eval security ./skills/coding-agent --json

# Run security test prompts
agent-skills-eval security-test security-test
```

### Security Report Example

```json
{
  "path": "./skills/coding-agent",
  "timestamp": "2026-02-12T12:30:00.000Z",
  "valid": true,
  "score": 13,
  "maxScore": 16,
  "percentage": 81,
  "checks": {
    "noHardcodedSecrets": { "passed": true, "score": 3, "maxScore": 3 },
    "injectionVulnerabilities": { "passed": true, "score": 2, "maxScore": 2 },
    "pathTraversal": { "passed": true, "score": 2, "maxScore": 2 },
    "insecureOperations": { "passed": true, "score": 2, "maxScore": 2 },
    "networkSecurity": { "passed": true, "score": 1, "maxScore": 1 },
    "inputSanitization": { "passed": true, "score": 2, "maxScore": 2 },
    "filePermissions": { "passed": true, "score": 1, "maxScore": 1 },
    "dependencySecurity": { "passed": false, "score": 0, "maxScore": 1 }
  }
}
```

---

## Contributing

### Development Setup

```bash
git clone https://github.com/your-fork/agent-skills-eval.git
cd agent-skills-eval
git checkout -b feature/your-feature
npm install
npm test
```

### Testing

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific test file
npm test -- tests/skills.test.js
```

### Pull Request Process

1. Ensure all tests pass
2. Update documentation as needed
3. Add tests for new functionality
4. Submit pull request with clear description

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

## References

- [OpenAI eval-skills Framework](https://developers.openai.com/blog/eval-skills)
- [Agent Skills Specification](https://agentskills.io/specification)
- [OpenAI Evaluation Best Practices](https://platform.openai.com/docs/guides/evaluation-best-practices)
- [Claude Code Skills Documentation](https://code.claude.com/docs/en/skills)
- [OpenCode CLI Documentation](https://open-code.ai/en/docs/cli)

---

**Version**: 1.1.0
**Last Updated**: 2026-02-12
**Maintainer**: OpenClaw Team

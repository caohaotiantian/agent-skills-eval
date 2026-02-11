# Agent Skills Evaluation Tool

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![OpenAI eval-skills](https://img.shields.io/badge/Framework-OpenAI%20eval--skills-blue)](https://developers.openai.com/blog/eval-skills)

A universal agent skills evaluation tool that strictly follows the [OpenAI eval-skills framework](https://developers.openai.com/blog/eval-skills) and [Agent Skills specification](https://agentskills.io/specification).

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Evaluation Dimensions](#evaluation-dimensions)
- [Command Reference](#command-reference)
- [Configuration](#configuration)
- [Extending the Framework](#extending-the-framework)
- [Security Assessment](#security-assessment)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- **Static Validation**: YAML frontmatter, naming conventions, directory structure
- **Dynamic Execution**: Prompt-based testing with trace collection
- **Security Assessment**: 8 security dimensions (optional)
- **Multi-Platform Support**: OpenClaw, Claude Code, OpenCode
- **Report Generation**: JSON, HTML, Markdown formats
- **CI/CD Integration**: Command-line interface for automation

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      agent-skills-eval                           │
├─────────────────────────────────────────────────────────────────┤
│  CLI Layer (bin/cli.js)                                        │
│  ├── discover    → Discover skills across platforms             │
│  ├── validate    → Static structure validation                   │
│  ├── eval        → Multi-dimensional static evaluation           │
│  ├── run         → Dynamic execution with trace analysis        │
│  ├── security    → Security vulnerability assessment             │
│  ├── security-test → Run security test prompts                   │
│  ├── report      → Generate evaluation reports                  │
│  └── trace       → Analyze JSONL trace files                   │
├─────────────────────────────────────────────────────────────────┤
│  Static Validation (lib/validation/)                            │
│  ├── frontmatter.js  → YAML frontmatter parsing & validation    │
│  ├── naming.js       → Naming conventions (kebab-case)         │
│  ├── structure.js    → Directory structure validation           │
│  └── security.js     → Security vulnerability checks            │
├─────────────────────────────────────────────────────────────────┤
│  Static Evaluation (lib/skills/evaluating/)                    │
│  └── index.js        → 5-dimensional evaluation engine         │
│      ├── Outcome Goals (8 criteria)                              │
│      ├── Process Goals (4 criteria)                              │
│      ├── Style Goals (5 criteria)                               │
│      ├── Efficiency Goals (5 criteria)                           │
│      └── Security Assessment (7 criteria)                        │
├─────────────────────────────────────────────────────────────────┤
│  Dynamic Execution (evals/)                                    │
│  ├── runner.js         → Eval execution engine                 │
│  ├── security-runner.js → Security test executor               │
│  └── registry/                                             │
│      ├── prompts/       → Test prompt CSV files                 │
│      └── rubrics/      → JSON Schema scoring rubrics           │
├─────────────────────────────────────────────────────────────────┤
│  Trace Analysis (lib/tracing/)                                  │
│  ├── parser.js        → JSONL trace event parser               │
│  └── analyzer.js       → Trace analysis & metrics               │
└─────────────────────────────────────────────────────────────────┘
```

### Key Components

#### 1. CLI Layer (`bin/cli.js`)

The command-line interface provides all user interactions:

```javascript
// Example: Running evaluations
const { Command } = require('commander');
const program = new Command();

program
  .command('eval')
  .description('Run static skill evaluations')
  .option('-p, --platform <name>', 'Platform to evaluate', 'all')
  .option('-s, --skill <name>', 'Specific skill to evaluate')
  .action(async (options) => { /* ... */ });
```

#### 2. Validation Module (`lib/validation/`)

Comprehensive static validation for skill structure:

```javascript
const { validateSkill } = require('./lib/validation');

const report = await validateSkill('/path/to/skill');
// Returns: { valid, errors[], warnings[], checks{} }
```

#### 3. Evaluation Engine (`lib/skills/evaluating/`)

Multi-dimensional evaluation based on OpenAI eval-skills:

```javascript
const EVAL_REGISTRY = {
  'outcome': {
    id: 'outcome',
    name: 'Outcome Goals',
    criteria: [
      { id: 'has-skill-md', name: 'Has valid SKILL.md', weight: 2 },
      // ...
    ]
  },
  // ... other dimensions
};
```

#### 4. Dynamic Runner (`evals/runner.js`)

Executes prompts and collects traces:

```javascript
const runner = require('./evals/runner');

const results = await runner.runEvaluation('coding-agent', {
  verbose: true,
  outputDir: 'evals/artifacts'
});
// Returns: { skillName, summary, results[] }
```

#### 5. Trace Analyzer (`lib/tracing/`)

Parses and analyzes JSONL trace events:

```javascript
const { TraceAnalyzer, parser } = require('./lib/tracing');

const events = parser.parseJsonlString(content);
const report = new TraceAnalyzer().analyze(events).generateReport();
// Returns: { commandCount, efficiencyScore, thrashing, tokenUsage }
```

---

## Installation

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0

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

### 1. Discover Installed Skills

```bash
# Discover all skills
agent-skills-eval discover

# Discover specific platform
agent-skills-eval discover -p openclaw

# Output as JSON
agent-skills-eval discover --json
```

### 2. Validate Skill Structure

```bash
# Validate current directory
agent-skills-eval validate

# Validate specific skill
agent-skills-eval validate ./skills/coding-agent

# Verbose output
agent-skills-eval validate ./skills/coding-agent -v
```

### 3. Run Multi-Dimensional Evaluation

```bash
# Evaluate all skills
agent-skills-eval eval

# Evaluate specific platform
agent-skills-eval eval -p openclaw

# Evaluate specific skill
agent-skills-eval eval -s coding-agent

# Output as JSON
agent-skills-eval eval -s coding-agent --json
```

### 4. Dynamic Execution with Trace

```bash
# Run dynamic evaluation
agent-skills-eval run coding-agent

# Verbose output
agent-skills-eval run coding-agent --verbose

# Custom output directory
agent-skills-eval run coding-agent --output ./my-artifacts
```

### 5. Generate Reports

```bash
# Generate HTML report
agent-skills-eval report -i results/eval.json -f html -o report.html

# Generate Markdown report
agent-skills-eval report -i results/eval.json -f markdown -o report.md

# Generate JSON report
agent-skills-eval report -i results/eval.json -f json -o report.json
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

Measures security posture (requires `--security` flag):

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

#### discover

Discover installed skills across platforms.

```bash
agent-skills-eval discover [options]

Options:
  -p, --platform <name>  Specific platform (default: all)
  --json                  Output as JSON
```

#### validate

Validate skill structure and frontmatter.

```bash
agent-skills-eval validate [skill] [options]

Arguments:
  skill                   Skill path or name (default: .)

Options:
  -v, --verbose           Show detailed output
```

#### eval

Run static multi-dimensional evaluations.

```bash
agent-skills-eval eval [options]

Options:
  -p, --platform <name>  Platform to evaluate (default: all)
  -s, --skill <name>      Specific skill to evaluate
  -b, --benchmark <name>  Benchmark to run
  --json                  Output as JSON
```

#### run

Run dynamic skill evaluations with trace collection.

```bash
agent-skills-eval run <skill> [options]

Arguments:
  skill                   Skill name to evaluate

Options:
  -v, --verbose          Show verbose output
  --output <dir>         Output directory for traces (default: evals/artifacts)
```

#### security

Run comprehensive security assessment.

```bash
agent-skills-eval security [skill] [options]

Arguments:
  skill                   Skill path (default: .)

Options:
  -v, --verbose          Show detailed output
  --json                  Output as JSON
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
  -i, --input <file>    Input results file
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
  
  // Enable security assessment
  security: {
    enabled: true,
    checks: ['no-hardcoded-secrets', 'input-sanitization', 'safe-shell-commands']
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
  }
};
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MOCK_EVAL` | Use mock mode (no API calls) | `false` |
| `OPENAI_API_KEY` | OpenAI API key for Codex | - |
| `EVAL_TIMEOUT` | Evaluation timeout (ms) | `300000` |
| `EVAL_OUTPUT_DIR` | Default output directory | `./results` |

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
  // Your validation logic
  result.passed = /* condition */;
  result.score = result.passed ? criterion.weight : 0;
  result.reasoning = /* explanation */;
  break;
```

### Adding New Security Checks

1. **Add pattern to `SECURITY_PATTERNS`**:

```javascript
// lib/validation/security.js
const SECURITY_PATTERNS = {
  // ... existing patterns
  
  YOUR_PATTERN: [
    { pattern: /your-pattern/gi, severity: 'high', name: 'Your Check', fix: 'Suggestion' }
  ]
};
```

2. **Add check function**:

```javascript
function checkYourPattern(content) {
  const matches = content.match(SECURITY_PATTERNS.YOUR_PATTERN[0].pattern) || [];
  return {
    passed: matches.length === 0,
    score: matches.length === 0 ? 2 : 0,
    maxScore: 2
  };
}
```

### Creating Custom Test Prompts

1. **Create CSV file** in `evals/registry/prompts/`:

```csv
id,should_trigger,prompt,expected_tools
test-01,true,"Your test prompt","bash"
test-02,false,"Should not trigger","git"
```

2. **Create rubric** in `evals/registry/rubrics/`:

```json
{
  "type": "object",
  "properties": {
    "overall_pass": { "type": "boolean" },
    "score": { "type": "integer", "minimum": 0, "maximum": 100 },
    "checks": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "pass": { "type": "boolean" },
          "notes": { "type": "string" }
        }
      }
    }
  }
}
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
  "timestamp": "2026-02-11T12:30:00.000Z",
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
# Fork and clone the repository
git clone https://github.com/your-fork/agent-skills-eval.git
cd agent-skills-eval

# Create feature branch
git checkout -b feature/your-feature

# Install development dependencies
npm install

# Run tests
npm test

# Run linting
npm run lint
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

---

**Version**: 1.0.0  
**Last Updated**: 2026-02-11  
**Maintainer**: OpenClaw Team

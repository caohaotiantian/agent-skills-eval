# Agent Skills Evaluation Tool

A universal evaluation framework for agent skills across Claude Code, OpenCode, and other agent platforms.

## Features

- **Universal Skill Discovery**: Automatically discover and catalog installed skills
- **Standardized Evaluation**: Run consistent benchmarks across different skill types
- **Multi-Platform Support**: Claude Code, OpenCode, and extensible to others
- **Comprehensive Reporting**: JSON/HTML reports with metrics and visualizations

## Architecture

```
agent-skills-eval/
├── skills/              # Skill implementations
│   ├── discovering/     # Skill discovery logic
│   ├── evaluating/      # Evaluation engines
│   ├── reporting/       # Report generators
│   └── benchmarking/    # Benchmark suites
├── tests/              # Test files
├── benchmarks/         # Benchmark definitions
├── scripts/           # Utility scripts
└── config/           # Configuration files
```

## Installation

```bash
npm install
```

## Usage

```bash
# Discover all installed skills
npm run discover

# Run evaluation
npm run eval -- --platform claude-code

# Generate report
npm run report -- --format html
```

## Supported Platforms

- Claude Code (`~/.claude/plugins/`)
- OpenCode (`~/.claude-code/plugins/`)

## License

MIT

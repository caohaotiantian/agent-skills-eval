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

## OpenAI eval-skills 框架重构

### 核心架构

```
agent-skills-eval/
├── lib/validation/      # 静态规范验证
│   ├── frontmatter.js   # YAML frontmatter 解析
│   ├── naming.js        # 命名规范 (kebab-case)
│   └── structure.js     # 目录结构验证
├── lib/tracing/         # Trace 解析分析
│   ├── parser.js        # JSONL 事件解析
│   └── analyzer.js      # 执行行为分析
├── evals/runner.js      # 动态执行引擎
└── bin/cli.js           # CLI 命令
```

### 新增命令

| 命令 | 描述 |
|------|------|
| `validate <skill>` | 验证 SKILL.md 格式和目录结构 |
| `run <skill>` | 动态执行评估 (prompts CSV) |
| `trace <file>` | 分析 JSONL trace 文件 |

### 评估维度

1. **Static Validation** (静态验证): YAML frontmatter, 命名, 结构
2. **Dynamic Execution** (动态执行): 命令执行, 文件创建, Thrashing
3. **Trace Analysis** (Trace 分析): 效率评分, Token 使用

### 示例

```bash
# 验证 skill
agent-skills-eval validate coding-agent

# 运行动态评估
agent-skills-eval run coding-agent

# 分析 trace
agent-skills-eval trace evals/artifacts/test-01.jsonl
```

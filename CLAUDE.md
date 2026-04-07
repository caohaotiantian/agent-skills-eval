# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Does

A universal agent skills evaluation tool that discovers, validates, and evaluates AI coding agent skills across platforms (Claude Code, OpenCode, Codex, OpenClaw). It follows the [OpenAI eval-skills framework](https://developers.openai.com/blog/eval-skills) and [Agent Skills specification](https://agentskills.io/specification).

## Commands

```bash
# Run all tests
npm test

# Run a single test file
npx jest tests/unit/runner.test.js

# Run tests matching a pattern
npx jest --testPathPattern="security"

# Run with coverage
npm run test:coverage

# CLI commands (all via bin/cli.js)
node bin/cli.js discover          # Find skills across platforms
node bin/cli.js validate [path]   # Validate skill structure
node bin/cli.js eval              # Static 5-dimension evaluation
node bin/cli.js generate <skill>  # Generate test prompts (template or --llm)
node bin/cli.js run <skill>       # Dynamic execution via agent backends
node bin/cli.js pipeline          # Full lifecycle: discover→eval→generate→run→report
node bin/cli.js doctor            # Check system readiness
node bin/cli.js security [path]   # Static security assessment
node bin/cli.js security-test <testset>  # Dynamic security tests
```

## Architecture

The pipeline flows: **Discover → Static Eval → Generate Prompts → Dynamic Execute → Trace Analyze → Aggregate → Report**.

### Two evaluation modes

- **Static evaluation** (`lib/skills/evaluating/`) — Rule-based scoring across 5 dimensions (outcome, process, style, efficiency, security) defined in `EVAL_REGISTRY`. Each dimension has weighted criteria checked against the skill's SKILL.md, frontmatter, and directory structure.
- **Dynamic evaluation** (`evals/runner.js`) — Sends generated prompts through agent backends, collects JSONL traces, then analyzes trigger behavior, security patterns, and optional rubrics.

### Backend system

`evals/backends/` implements a pluggable backend registry. Five built-in backends share a common interface `run(prompt, options) → {stdout, stderr, exitCode}` where stdout is JSONL trace events. The `claude-code` and `opencode` backends normalize their native event formats into a canonical trace format (`thread.started`, `turn.started`, `tool_call`, `tool_result`, `message`, `turn.completed`).

### Security analysis has two layers

1. **Static** (`lib/validation/security.js`) — Regex pattern matching on skill source code (secrets, injection, traversal, insecure ops, etc.). Patterns loaded from `config/security/static-patterns.json` with hardcoded fallbacks.
2. **Dynamic** (`lib/tracing/analyzer.js` → `analyzeSecurityPatterns()`) — Analyzes actual agent behavior in traces (commands executed, files accessed, output content). Patterns loaded from `config/security/trace-patterns.json`.

Both can be augmented with LLM-as-Judge (`lib/grading/llm-judge.js`) when `security.llmJudge` is enabled in config.

### Test generation

`lib/skills/generating/` analyzes a skill's SKILL.md (frontmatter, body sections, triggers) then generates JSONL test cases in 4 categories: positive (trigger variations), negative (should-not-trigger), description-based, and security-focused. Supports template-based (default) or LLM-powered generation for non-English skills.

### Pipeline orchestration

`lib/pipeline/index.js` chains all stages with checkpoint-based resume support. `lib/pipeline/aggregator.js` merges static + dynamic results into a composite score (35% static, 35% dynamic, 15% efficiency, 15% security) with per-skill rankings.

## Key Design Patterns

- **Centralized paths**: All output/config paths resolve through `lib/utils/paths.js` → `getPaths()`. Never hardcode paths.
- **Config cascade**: `config/agent-skills-eval.config.js` → env vars (`OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`) → per-backend overrides. Config is cached; call `resetCache()` in tests.
- **Lazy OpenAI loading**: All 4 files that use OpenAI (`evals/backends/openai.js`, `lib/grading/llm-judge.js`, `lib/skills/generating/prompt-generator.js`) use a `getOpenAI()` pattern with `mod.default || mod.OpenAI || mod` for v3/v4+ compatibility.
- **Global regex caution**: Security patterns use the `g` flag. Always reset `pattern.lastIndex = 0` before `.test()` or `.match()` in loops.
- **JSONL primary, CSV fallback**: Test prompts are JSONL. The runner loads JSONL first, falls back to CSV. Always use `loadPrompts()` from `evals/runner.js` — never write a separate CSV parser.
- **Trace normalization**: Claude Code and OpenCode backends normalize their native event formats into canonical JSONL. Tests for these live in `tests/unit/backends.test.js`.

## Test Structure

Tests live in `tests/` with `tests/unit/` for unit tests and `tests/integration/` for pipeline integration. Test fixtures are in `tests/fixtures/coding-agent/`. The jest config (`jest.config.js`) collects coverage from `lib/**/*.js` excluding index files.

When testing functions that use `loadConfig()`, use `_resetConfigCache()` (exported from prompt-generator) or `resetCache()` (from paths.js) to avoid stale cached config between tests.

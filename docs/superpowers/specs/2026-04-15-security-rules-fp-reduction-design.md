# Security Rules False-Positive Reduction — Design Spec

**Date:** 2026-04-15
**Status:** Approved

## Problem

The current `config/security/skill-sec-rules.yaml` produces excessive false positives due to:
1. Overly broad regex patterns (e.g., `\.env` matches any .env mention, `` `.*` `` matches all JS template literals)
2. No per-rule confidence scores (everything defaults to 75)
3. No distinction between code and markdown prose — SKILL.md files describing "eval" get flagged the same as code using `eval()`
4. No centralized whitelist for excluding known-safe files/domains

## Solution

Five coordinated changes: per-rule confidence scores, tighter patterns, markdown code-block extraction in the engine, markdown confidence modifier, and a centralized whitelist.

Reference: `../skill-security-scanner` project's approach (per-rule confidence, whitelist.yaml, context-aware detectors).

## 1. Per-Rule Confidence Scores

Add explicit `confidence` field (0-100) to every rule in `skill-sec-rules.yaml`. The existing CVSS confidence multiplier in `cvss.js` already uses this value.

| Tier | Score | Criteria | Examples |
|------|-------|----------|----------|
| Very High | 90-95 | Specific token format, near-zero FP rate | AWS key `AKIA...`, private key headers |
| High | 80-85 | Dangerous function in matching file type | `eval\s*\(` in .js, `subprocess.*shell=True` in .py |
| Medium | 50-65 | Legitimate uses exist but worth flagging | `process.env`, `crontab`, `localStorage` |
| Low | 30-45 | Common in normal code/docs, only suspicious in combination | `bypass`, `override`, relative paths |

## 2. Pattern Tightening

### Rules to tighten

| Rule ID | Current Pattern | New Pattern | Rationale |
|---------|----------------|-------------|-----------|
| DATA001 | `\.env` | `(cat\|less\|head\|tail\|cp\|mv\|read\|load\|parse).*\.env\b` | Only file operations, not mentions |
| DATA001 | `process\.env` | Keep as-is | Legitimate signal in skill code |
| DATA001 | `dotenv\.load` | Remove | Standard config management |
| MAL005 | `` `.*` `` | Remove entirely | Matches every JS template literal |
| MAL005 | `\$\(.*\)` | `\$\(.*\)` only in .sh files | Shell substitution, not jQuery |
| WEB004 | `\.\.\/` | `\.\.\/(etc\|passwd\|shadow\|proc\|windows\|boot\|sys\|var\/log)` | Only dangerous traversals |
| WEB004 | `open\s*\(.*\+` | `open\s*\(.*\+.*(request\|input\|param\|query\|user)` | Only user-controlled paths |
| PROMPT002 | `bypass` | `(must\|should\|please\|now)\s+(bypass\|override)` | Only imperative injection context |
| PROMPT002 | `override` | `override\s+(all\|previous\|system\|instructions\|rules)` | Only system-override context |
| BACK005 | `\./\.` | Remove | Matches any dotfile reference |
| BACK005 | `touch\s+\.` | `touch\s+\.[a-z]+rc\|touch\s+\.bash` | Only suspicious dotfiles |
| DATA004 | `localStorage` | `localStorage\.(get\|set)Item\s*\(\s*['"]*(secret\|token\|password\|key\|auth\|cred)` | Only sensitive keys |
| DATA004 | `document\.cookie` | Keep as-is | Cookie access is legitimate signal |
| DEP002 | `pip install [a-zA-Z]` | Remove | Flags documentation examples |
| DEP002 | `npm install [a-zA-Z]` | Remove | Flags documentation examples |
| MAL006 | `\|\s*sh`, `\|\s*bash` | Keep | Legitimate signals |
| MAL006 | `\|\s*curl`, `&&\s*curl` | `\|\s*curl\s+-[dX]\|&&\s*curl.*-d` | Only data-sending curl |
| PRIV003 | `sudo\s+` | `sudo\s+(rm\|chmod\|chown\|mv\|cp\|dd\|mkfs\|fdisk)` | Only dangerous sudo commands |

### Rules to remove entirely

| Rule ID | Name | Reason |
|---------|------|--------|
| MAL004 | 动态代码执行 (compile) | `compile()` is too common in Python; `vm.runInNewContext` already covered by MAL001 |
| DEP002 | 未指定版本的依赖 | Documentation examples universally trigger this; LOW severity not worth the noise |

### Rules to keep as-is

All KEY* rules (KEY001-003), BACK001 (reverse shell), WEB001 (SQL injection), WEB005 (XXE), SUP004 (typosquatting) — these have specific patterns with low FP rates.

## 3. Markdown Code Block Extraction

New preprocessing in `ScanEngine._scanFile()`:

```
function extractCodeBlocks(content):
  blocks = []
  for each fenced block (```lang ... ```):
    record { lang, content, startLine }
  return { blocks, fullContent: content }
```

Scanning logic per file type:
- **`.md` files**: Extract code blocks. Apply code-pattern rules (MAL*, DATA*, PRIV*, BACK*, WEB*, DEP*, SUP*, KEY*) only to extracted code blocks. Apply prompt-injection rules (PROMPT*) to full file content.
- **All other files**: Scan normally with all matching rules.

Line numbers in findings from code blocks must be adjusted by `block.startLine` to map back to the original file.

Implementation: ~30-40 lines in `index.js`. The extractor uses a simple state machine scanning for ` ``` ` fence markers.

## 4. Markdown Confidence Modifier

Rules gain an optional `markdownConfidence` field. When scanning `.md` files with PROMPT* rules (which scan full content), the engine substitutes `markdownConfidence` for `confidence` when creating findings.

Typical values:
```yaml
- id: PROMPT001
  confidence: 80
  markdownConfidence: 45

- id: PROMPT002
  confidence: 75
  markdownConfidence: 40
```

This means prompt-injection patterns in markdown are still detected but at lower confidence, allowing consumers to filter them at their chosen threshold.

Engine change: one conditional in finding creation (~3 lines).

## 5. Whitelist Configuration

New file: `config/security/whitelist.yaml`

```yaml
# Files/patterns to skip entirely during scanning
filePatterns:
  - "README.md"
  - "CHANGELOG.md"
  - "LICENSE*"
  - "docs/**/*"
  - "*.lock"
  - "package-lock.json"
  - "yarn.lock"
  - "pnpm-lock.yaml"

# Domains excluded from IOC suspicious-domain checks
trustedDomains:
  - "api.anthropic.com"
  - "api.openai.com"
  - "github.com"
  - "npmjs.com"
  - "pypi.org"
  - "registry.npmjs.org"
  - "localhost"
  - "127.0.0.1"

# Per-rule overrides
ruleOverrides:
  # List of rule IDs to disable completely
  disabled: []
  # Severity overrides: ruleId -> newSeverity
  severityOverrides: {}
```

### Loading

`rule-loader.js` gains a `loadWhitelist()` function that:
1. Discovers `config/security/whitelist.yaml` (same search logic as rules)
2. Returns `{ filePatterns, trustedDomains, ruleOverrides }`
3. Falls back to empty defaults if not found

### Application

- **filePatterns**: `ScanEngine._discoverFiles()` filters out matching paths via `minimatch`
- **trustedDomains**: Merged into `IOCMatcher`'s existing allowlist
- **ruleOverrides.disabled**: `rule-loader.js` removes these rule IDs after merging
- **ruleOverrides.severityOverrides**: Applied during rule loading

## Files to Change

| File | Change Type | Description |
|------|------------|-------------|
| `config/security/skill-sec-rules.yaml` | Modify | Add confidence/markdownConfidence, tighten patterns, remove noise rules |
| `config/security/whitelist.yaml` | Create | Whitelist configuration |
| `lib/validation/engine/rule-loader.js` | Modify | Load whitelist, pass confidence fields, apply rule overrides |
| `lib/validation/engine/index.js` | Modify | Markdown extraction, whitelist file filtering, markdownConfidence |
| `tests/unit/security.test.js` | Modify | Tests for markdown extraction, confidence scores, whitelist |

## What Does NOT Change

- `lib/validation/engine/cvss.js` — already handles confidence multipliers
- `lib/validation/engine/findings.js` — already has confidence field
- `lib/validation/engine/ioc.js` — already has domain allowlist (fed from whitelist)
- `lib/validation/detectors/*` — no changes needed
- `lib/validation/security.js` — facade unchanged
- Report templates — findings already display confidence

## Success Criteria

1. Running the scanner against the `tests/fixtures/` skills produces zero false positives on legitimate skill patterns
2. Running against `examples/` in `../skill-security-scanner` (malicious skill samples) still catches all threats
3. All existing tests pass (with updates for changed rule IDs/patterns)
4. Markdown files only generate findings for code blocks (code rules) or high-confidence prompt injection (PROMPT rules)

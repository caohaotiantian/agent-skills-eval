# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- **8 agent-behavioral security categories** (clean-room derived from SkillSpector's threat taxonomy) in `skill-sec-rules.yaml`, bringing the total to 17: `ANTI_REFUSAL` (jailbreak/guardrail suppression), `SYSTEM_PROMPT_LEAKAGE`, `MEMORY_POISONING`, `EXCESSIVE_AGENCY`, `OUTPUT_HANDLING`, `TOOL_MISUSE` (unsafe-defaults slice), `ROGUE_AGENT` (self-modification), and `AGENT_SNOOPING` (least-knowledge / cross-skill isolation). Each ships with a CVSS 3.1 vector and positive/clean test fixtures.
- **`markdownScan: prose` category flag**: a category can opt into scanning full `SKILL.md` prose (not just fenced code blocks) and applying `markdownConfidence`. Generalizes the previous `PROMPT_INJECTION`-only special case; default (code-block-only) behavior is unchanged for all existing categories.

### Changed

- Scan engine markdown gate is now category-driven (`_isProseRule` keyed off `markdownScan`) instead of hard-coding `PROMPT_INJECTION`; `rule-loader` propagates the flag onto each rule.

## [1.1.0] - 2026-04-15

### Added

- **Whitelist system** (`config/security/whitelist.yaml`): Centralized file/domain exclusions and per-rule overrides (disable rules, override severity)
- **Per-rule confidence scores** (30-95) in `skill-sec-rules.yaml` with CVSS 3.1 confidence multiplier for graduated severity
- **Markdown-aware scanning**: Code-pattern rules only fire inside fenced code blocks in `.md` files; PROMPT rules scan full content with `markdownConfidence` modifier
- **CRYPTOGRAPHIC_WEAKNESS category**: New security category for weak crypto (DES/RC4/ECB), weak hash (MD5/SHA1), and HTTP non-TLS, with CVSS base score 5.9
- **Dynamic evaluation criteria**: Security assessment criteria auto-generated from YAML `categories` and `detectors` sections — no hardcoded criteria in source code
- **Confidence column** in HTML report findings tables with color-coded display (red >=80%, yellow >=60%, gray <60%)
- **Confidence field** in JSON report criteria metadata findings
- **12 migrated patterns** from deleted `static-patterns.json`: prototype pollution (INJ001-002), weak crypto (CRYPTO001-003), HTTP non-TLS (NET001), sensitive data logging (DATA008-009), dangerouslySetInnerHTML (WEB006), SQL interpolation (WEB007), user-controlled file I/O (WEB008)
- **YAML `detectors` section** for configuring detector criteria names and weights without code changes

### Changed

- **Security rules v3.0**: Tightened 15+ overly-broad patterns to reduce false positives:
  - DATA001: `.env` only matches file read operations, not mentions
  - WEB004: Path traversal only matches sensitive directories (etc, passwd, shadow, proc)
  - PROMPT002: `bypass`/`override` only match in injection context
  - MAL005: Removed backtick and `$()` patterns (matched every JS template literal)
  - DATA004: localStorage/sessionStorage only match access to sensitive keys (token, password, secret)
  - KEY001: AWS key names only match assignment patterns
  - DATA007: Clipboard only matches actual API calls
  - PROMPT005: Restricted to .md files only (atob/base64/fromCharCode are normal code)
- **Removed 3 noise rules**: MAL004 (compile), DEP002 (unversioned deps), BACK005 (hidden files)
- **Severity overrides now take precedence** over CVSS-derived severity (whitelist user intent wins)
- **ScanEngine constructor** applies whitelist file filtering, rule disabling, and passes trusted domains to IOC matcher
- **IOC matcher** uses instance-scoped domain allowlist (no cross-instance leakage)
- **Markdown fence extraction** per CommonMark spec: supports indented fences (up to 3 spaces), unclosed fences treated as code (security safe default), closing fence requires matching character count

### Removed

- **`config/security/static-patterns.json`**: All patterns migrated to `skill-sec-rules.yaml`
- **Legacy HARDCODED_PATTERNS**: Removed ~100 lines of duplicate patterns from `security.js`
- **8 legacy check functions**: `scanSecurity()`, `checkHardcodedSecrets()`, `checkInjectionVulnerabilities()`, `checkPathTraversal()`, `checkInsecureOperations()`, `checkNetworkSecurity()`, `checkInputSanitization()`, `checkFilePermissions()` — all replaced by ScanEngine delegation
- **11 hardcoded evaluation criteria**: Replaced by dynamic generation from YAML

### Fixed

- Severity overrides from whitelist being silently overwritten by CVSS recalculation
- Inline backtick inside markdown code block falsely closing the fence
- Unclosed markdown fence silently dropping all content from scan
- SARIF output containing `"ruleId": null` (now conditionally included)
- Module-scoped `CODE_DOMAIN_ALLOWLIST` mutation leaking trusted domains across IOC matcher instances
- `discoverWhitelistPath` test having zero assertions
- Test temp directories created in source tree instead of `os.tmpdir()`

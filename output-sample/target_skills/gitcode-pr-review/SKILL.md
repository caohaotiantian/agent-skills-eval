---
name: gitcode-pr-review
description: Automated GitCode PR review with compliance checking and code analysis. Use when the user asks to review a GitCode PR, check PR compliance, or analyze code changes. Triggers on phrases like "review this PR", "check PR", "审查这个 PR", "review PR 1748", or when given a GitCode PR URL (https://gitcode.com/owner/repo/pull/123).
---

# GitCode PR Review Skill

Automated Pull Request review for GitCode repositories with compliance checking, code analysis, and automated commenting.

## Quick Start

When user provides a GitCode PR URL or asks to review a PR:

```bash
# Extract owner/repo and PR number from URL
# Example: https://gitcode.com/mindspore/akg/pull/1748
# Becomes: mindspore/akg 1748

python3 scripts/review_pr.py <owner/repo> <pr_number> [--post-comment]
```

**Example**:
```bash
# Review only (local report)
python3 scripts/review_pr.py mindspore/akg 1748

# Review and post comment to PR
python3 scripts/review_pr.py mindspore/akg 1748 --post-comment
```

## Prerequisites

**Required**: `GITCODE_TOKEN` environment variable must be set.

```bash
export GITCODE_TOKEN="your_gitcode_api_token"
```

To obtain a token:
1. Login to https://gitcode.com
2. Go to Settings → Access Tokens
3. Create token with `api` scope
4. Add to `~/.bashrc` for persistence:
   ```bash
   echo 'export GITCODE_TOKEN="your_token"' >> ~/.bashrc
   source ~/.bashrc
   ```

## Review Process

### 1. Parse PR Information

Extract from URL or use directly:
- **URL**: `https://gitcode.com/mindspore/akg/pull/1748`
- **Parse**: `owner_repo = mindspore/akg`, `pr_number = 1748`

### 2. Fetch PR Data

The script automatically fetches:
- PR metadata (title, description, author, state)
- Code changes statistics
- Labels and status
- Branch information

### 3. Compliance Analysis

The script checks PR description against the standard template:

| Check | Requirement | Keywords |
|-------|-------------|----------|
| PR Type | `/kind bug/feature/task` | `/kind`, `bug`, `feature`, `task` |
| Problem | Clear problem statement | `what does this pr`, `problem`, `issue`, `why do we need` |
| Solution | Implementation approach | `solution`, `how`, `approach`, `method` |
| Changes | List of modifications | `-`, `*`, `1.`, `changes:` |
| Testing | Test instructions | `test`, `验证`, `how to test` |
| Impact | Scope of changes | `impact`, `scope`, `affects`, `影响` |

### 4. Generate Report

Output includes:
- Overall quality score (1-5 stars)
- Compliance checklist
- Code change statistics
- Specific improvement suggestions
- PR metadata

### 5. Post Comment (Optional)

Use `--post-comment` to automatically post the review report as a PR comment.

## Usage Patterns

### Pattern 1: URL-based Review

**User**: "Review this PR: https://gitcode.com/mindspore/akg/pull/1748"

**Action**:
1. Extract `mindspore/akg` and `1748`
2. Run review script
3. Present report to user
4. Ask if they want to post comment

### Pattern 2: Number-based Review

**User**: "审查 PR 1749"

**Action**:
1. Use default repo (mindspore/akg) or ask user
2. Run review with PR number
3. Generate and show report

### Pattern 3: Batch Review

**User**: "Review all open PRs"

**Action**:
1. Fetch list of open PRs
2. Run review on each
3. Generate summary report

## Report Format

The automated review report includes:

```markdown
# 🤖 自动代码审查报告

**PR**: #1748 - [AKG] Add vectorize and hivm transpose
**作者**: huawuyi
**审查时间**: 2026-03-22 18:54:00
**评分**: ✅ 4.2/5.0 (Good)

## 📋 规范性检查

| 检查项 | 状态 | 说明 |
|--------|------|------|
| PR 类型标注 | ✅ | 已标注 PR 类型 |
| 问题描述 | ✅ | 问题描述清晰 |
| 解决方案 | ✅ | 有解决方案说明 |
| 修改列表 | ✅ | 有修改内容列表 |
| 测试说明 | ⚠️ | 建议补充测试说明 |
| 影响范围 | ⚠️ | 建议说明影响范围 |

## 📊 代码变更统计

- **新增行数**: +1503
- **删除行数**: -236
- **标签**: ci-pipeline-passed, mindspore-cla/yes, stat/needs-squash

## 💡 改进建议

5. 补充「测试说明」，描述如何验证这些修改
6. 补充「影响范围」，说明这个修改会影响哪些模块或功能
```

## 🔥 Adversarial Review (对抗性审查) ⭐

**最强的代码审查方式**：3 个 AI 智能体对抗辩论，只有通过三方辩论的漏洞才会被报告。

### 工作原理

```
🔍 检察官 (Prosecutor)
   ↓ 找出所有潜在问题（宁可误报）
🛡️ 辩护方 (Defender)
   ↓ 反驳误报，确认真实问题
⚖️ 法官 (Judge)
   ↓ 最终裁决，分类问题严重程度
```

### 使用方法

```bash
# 对抗性审查（推荐用于重要 PR）
export GITCODE_TOKEN="your_token"
python3 scripts/adversarial_review.py mindspore/akg 1749
```

### 审查流程

**阶段 1: 检察官 🔍**
- 职责：尽可能找出所有问题
- 策略：宁可误报，不可漏报
- 检查：安全漏洞、Bug、性能、代码质量

**阶段 2: 辩护方 🛡️**
- 职责：评估检察官的发现
- 策略：反驳误报，确认真实问题
- 评估：技术事实，客观判断

**阶段 3: 法官 ⚖️**
- 职责：最终裁决
- 策略：基于双方辩论做出判断
- 分类：🔴 必须修复 / 🟡 建议修复 / ✅ 误报

### 优势

✅ **降低误报率** - 通过辩论过滤误报
✅ **提高准确度** - 多角度审视代码
✅ **全面覆盖** - 检察官 + 辩护方双重视角
✅ **明确优先级** - 法官给出修复优先级

### 适用场景

- 🔥 **重要功能 PR** - 核心代码变更
- 🔥 **安全相关修改** - 涉及权限、数据处理
- 🔥 **复杂重构** - 大规模代码改动
- 🔥 **首次贡献者** - 代码质量把关

## 审查方式对比

| 方式 | 速度 | 准确度 | 误报率 | 适用场景 |
|------|------|--------|--------|----------|
| 规范性检查 | ⚡⚡⚡ | ⭐⭐ | 低 | PR 描述完整性 |
| 深度审查 | ⚡⚡ | ⭐⭐⭐ | 中 | 常规代码审查 |
| **对抗性审查** | ⚡ | ⭐⭐⭐⭐⭐ | **极低** | **重要 PR** |

### Integration with Monitoring

Combine with cron jobs for automated PR monitoring:

```bash
# Check for new PRs daily
python3 scripts/review_pr.py mindspore/akg <newest_pr> --post-comment
```

## Troubleshooting

**Error**: "GITCODE_TOKEN environment variable not set"
- Solution: Set the token in environment or ~/.bashrc

**Error**: "Failed to fetch PR"
- Check token validity
- Verify owner/repo format
- Confirm PR number exists

**Error**: "Failed to post comment"
- Check token has `api` scope
- Verify write permissions on repo

## API Reference

For advanced usage, see GitCode API documentation:
- Base URL: `https://api.gitcode.com/api/v5`
- Authentication: `PRIVATE-TOKEN` header
- Endpoints:
  - `GET /repos/:owner/:repo/pulls/:number` - Get PR info
  - `GET /repos/:owner/:repo/pulls/:number/diff` - Get diff
  - `POST /repos/:owner/:repo/pulls/:number/comments` - Post comment

## Examples

### Example 1: Basic Review

```bash
$ python3 scripts/review_pr.py mindspore/akg 1748

🔍 Fetching PR #1748 from mindspore/akg...
📊 Analyzing PR description...
📝 Generating review report...

[Report output]
```

### Example 2: Review and Comment

```bash
$ python3 scripts/review_pr.py mindspore/akg 1748 --post-comment

🔍 Fetching PR #1748 from mindspore/akg...
📊 Analyzing PR description...
📝 Generating review report...

[Report output]

💬 Posting comment to PR...
✅ Comment posted successfully!
```

### Example 3: Multiple PRs

```bash
# Review last 5 PRs
for pr in 1745 1746 1747 1748 1749; do
  echo "Reviewing PR #$pr..."
  python3 scripts/review_pr.py mindspore/akg $pr
  echo "---"
done
```

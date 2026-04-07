#!/bin/bash
# GitCode PR Deep Code Review with Claude Code
# 使用 Claude Code 进行深度代码审查

REPO=$1
PR_NUMBER=$2

if [ -z "$REPO" ] || [ -z "$PR_NUMBER" ]; then
    echo "Usage: $0 <owner/repo> <pr_number>"
    echo "Example: $0 mindspore/akg 1749"
    exit 1
fi

if [ -z "$GITCODE_TOKEN" ]; then
    echo "❌ Error: GITCODE_TOKEN environment variable not set"
    echo "Please set it: export GITCODE_TOKEN='your_token'"
    exit 1
fi

echo "🔍 Fetching PR #$PR_NUMBER from $REPO..."
echo ""

# 获取 PR 信息
PR_INFO=$(curl -s -H "PRIVATE-TOKEN: $GITCODE_TOKEN" \
  "https://api.gitcode.com/api/v5/repos/$REPO/pulls/$PR_NUMBER")

# 获取 PR 文件变更
PR_FILES=$(curl -s -H "PRIVATE-TOKEN: $GITCODE_TOKEN" \
  "https://api.gitcode.com/api/v5/repos/$REPO/pulls/$PR_NUMBER/files")

# 提取 PR 基本信息
TITLE=$(echo "$PR_INFO" | grep -o '"title":"[^"]*"' | cut -d'"' -f4)
AUTHOR=$(echo "$PR_INFO" | grep -o '"name":"[^"]*"' | head -1 | cut -d'"' -f4)
ADDED=$(echo "$PR_INFO" | grep -o '"added_lines":[0-9]*' | cut -d: -f2)
REMOVED=$(echo "$PR_INFO" | grep -o '"removed_lines":[0-9]*' | cut -d: -f2)

echo "📊 PR Information:"
echo "  Title: $TITLE"
echo "  Author: $AUTHOR"
echo "  Changes: +$ADDED -$REMOVED"
echo ""

# 提取所有 diff
echo "📝 Extracting code changes..."
echo "$PR_FILES" | grep -o '"diff":"[^}]*"' | sed 's/"diff":"//g' | sed 's/",$//g' | sed 's/\\n/\n/g' > /tmp/pr_${PR_NUMBER}_diff.txt

if [ ! -s /tmp/pr_${PR_NUMBER}_diff.txt ]; then
    echo "❌ Failed to extract PR diff"
    exit 1
fi

echo "🤖 Running Claude Code deep analysis..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 使用 Claude Code 进行深度审查
claude -p "你是资深代码审查专家。请深度审查以下 GitCode PR 的代码变更。

仓库: $REPO
PR: #$PR_NUMBER - $TITLE

请从以下维度进行详细分析：

## 1️⃣ 代码质量 (Code Quality)
- 代码风格和命名规范
- 代码可读性和结构
- 注释和文档完整性
- 代码复杂度

## 2️⃣ 潜在问题 (Potential Issues)
- Bug 和逻辑错误（边界条件、空值处理等）
- 安全漏洞（注入、权限、敏感数据）
- 性能问题（算法复杂度、资源使用）
- 内存管理（泄漏、野指针）

## 3️⃣ 最佳实践 (Best Practices)
- 设计模式应用
- 错误处理机制
- SOLID 原则
- 代码复用

## 4️⃣ 架构影响 (Architecture Impact)
- 模块耦合度
- 接口设计
- 向后兼容性
- 可测试性

请用中文输出结构化的审查报告，包括：
1. 发现的问题（按严重程度：🔴 严重 / 🟡 中等 / 🟢 建议）
2. 每个问题的具体位置和改进建议
3. 代码示例（如适用）
4. 总体评价和建议
" < /tmp/pr_${PR_NUMBER}_diff.txt

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Claude Code deep analysis completed"
echo ""
echo "💡 提示: 审查报告已生成。如需发布到 PR，请运行:"
echo "   python3 scripts/review_pr.py $REPO $PR_NUMBER --post-comment"

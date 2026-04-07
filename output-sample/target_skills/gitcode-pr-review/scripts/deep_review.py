#!/usr/bin/env python3
"""
GitCode PR Deep Code Review with Claude Code
使用 Claude Code 进行深度代码审查
"""

import json
import os
import subprocess
import sys

def fetch_pr_files(owner_repo, pr_number, token):
    """获取 PR 文件变更"""
    url = f"https://api.gitcode.com/api/v5/repos/{owner_repo}/pulls/{pr_number}/files"

    cmd = ["curl", "-s", "-H", f"PRIVATE-TOKEN: {token}", url]
    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        raise Exception(f"Failed to fetch PR files: {result.stderr}")

    return json.loads(result.stdout)

def extract_diff(pr_files):
    """提取所有文件的 diff"""
    all_diffs = []

    for file_info in pr_files:
        filename = file_info.get("filename", "unknown")
        patch = file_info.get("patch", {})
        diff_text = patch.get("diff", "")

        if diff_text:
            all_diffs.append(f"### File: {filename}\n\n```diff\n{diff_text}\n```\n")

    return "\n".join(all_diffs)

def run_claude_review(diff_text, repo, pr_number, title):
    """使用 Claude Code 进行深度审查"""

    prompt = f"""你是资深代码审查专家。请深度审查以下 GitCode PR 的代码变更。

仓库: {repo}
PR: #{pr_number} - {title}

代码变更:
{diff_text}

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
"""

    cmd = ["claude", "-p", prompt]
    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        raise Exception(f"Claude Code failed: {result.stderr}")

    return result.stdout

def main():
    if len(sys.argv) < 3:
        print("Usage: python3 deep_review.py <owner/repo> <pr_number>")
        print("Example: python3 deep_review.py mindspore/akg 1749")
        sys.exit(1)

    owner_repo = sys.argv[1]
    pr_number = sys.argv[2]

    token = os.environ.get("GITCODE_TOKEN")
    if not token:
        print("❌ Error: GITCODE_TOKEN environment variable not set")
        print("Please set it: export GITCODE_TOKEN='your_token'")
        sys.exit(1)

    print(f"🔍 Fetching PR #{pr_number} from {owner_repo}...")
    print()

    # 获取 PR 信息
    info_url = f"https://api.gitcode.com/api/v5/repos/{owner_repo}/pulls/{pr_number}"
    info_cmd = ["curl", "-s", "-H", f"PRIVATE-TOKEN: {token}", info_url]
    info_result = subprocess.run(info_cmd, capture_output=True, text=True)

    if info_result.returncode == 0:
        pr_info = json.loads(info_result.stdout)
        title = pr_info.get("title", "Unknown")
        author = pr_info.get("user", {}).get("name", "Unknown")
        added = pr_info.get("added_lines", 0)
        removed = pr_info.get("removed_lines", 0)

        print("📊 PR Information:")
        print(f"  Title: {title}")
        print(f"  Author: {author}")
        print(f"  Changes: +{added} -{removed}")
        print()

    # 获取文件变更
    print("📝 Extracting code changes...")
    pr_files = fetch_pr_files(owner_repo, pr_number, token)
    diff_text = extract_diff(pr_files)

    if not diff_text:
        print("❌ No code changes found")
        sys.exit(1)

    print(f"✅ Found {len(pr_files)} changed file(s)")
    print()

    # 运行 Claude 审查
    print("🤖 Running Claude Code deep analysis...")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print()

    review = run_claude_review(diff_text, owner_repo, pr_number, title)
    print(review)

    print()
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print("✅ Claude Code deep analysis completed")

if __name__ == "__main__":
    main()

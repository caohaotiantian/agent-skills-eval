#!/usr/bin/env python3
"""
GitCode PR Adversarial Review
对抗性代码审查：2个 AI 智能体辩论
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

def prosecutor_review(diff_text, repo, pr_number, title):
    """检察官：找问题和漏洞"""
    prompt = f"""你是代码审查的"检察官"，职责是找出代码中的所有问题。

仓库: {repo}
PR: #{pr_number} - {title}

代码变更:
{diff_text}

**你的任务**：尽可能严格地找出所有潜在问题，包括：
1. 安全漏洞（注入、权限、数据泄露）
2. 逻辑错误和 Bug（边界条件、空值、类型错误）
3. 性能问题（算法复杂度、资源泄漏）
4. 代码质量问题（可读性、维护性、测试覆盖）

**审查要求**：
- 宁可误报，不可漏报
- 对每个问题给出具体位置和严重程度
- 解释为什么这是个问题
- 提供修复建议

用中文输出结构化报告，按严重程度排序。"""

    cmd = ["claude", "-p", prompt]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise Exception(f"Prosecutor review failed: {result.stderr}")
    return result.stdout

def defender_review(diff_text, repo, pr_number, title, prosecutor_findings):
    """辩护方：反驳误报"""
    prompt = f"""你是代码审查的"辩护方"，职责是评估检察官的发现是否合理。

仓库: {repo}
PR: #{pr_number} - {title}

**检察官的发现**：
{prosecutor_findings}

**代码变更**：
{diff_text}

**你的任务**：
1. 逐条评估检察官的每个发现
2. 找出可能的**误报**（false positive）
3. 说明为什么某个"问题"实际上不是问题
4. 确认真正的严重问题

**审查要求**：
- 保持客观，既不过度辩护也不轻易认同
- 用技术事实说话，而非主观判断
- 如果确实是问题，承认并提出修复建议
- 如果是误报，说明原因

用中文输出评估报告，逐条回应检察官的发现。"""

    cmd = ["claude", "-p", prompt]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise Exception(f"Defender review failed: {result.stderr}")
    return result.stdout

def final_judgment(prosecutor_findings, defender_findings, diff_text, repo, pr_number):
    """法官：最终裁决"""
    prompt = f"""你是代码审查的"法官"，职责是做出最终裁决。

仓库: {repo}
PR: #{pr_number}

**检察官的发现**：
{prosecutor_findings}

**辩护方的反驳**：
{defender_findings}

**你的任务**：
1. 评估双方的论点
2. 做出最终判断：哪些问题是真实存在的
3. 按严重程度分类：
   - 🔴 必须修复（严重 bug/安全漏洞）
   - 🟡 建议修复（改进建议）
   - 🟢 可选优化（锦上添花）
   - ✅ 误报（不是真正的问题）

**裁决要求**：
- 只保留双方辩论后确认的真实问题
- 给出明确的修复优先级
- 提供具体的行动建议

用中文输出最终审查报告。"""

    cmd = ["claude", "-p", prompt]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise Exception(f"Final judgment failed: {result.stderr}")
    return result.stdout

def main():
    if len(sys.argv) < 3:
        print("Usage: python3 adversarial_review.py <owner/repo> <pr_number>")
        print("Example: python3 adversarial_review.py mindspore/akg 1749")
        sys.exit(1)

    owner_repo = sys.argv[1]
    pr_number = sys.argv[2]

    token = os.environ.get("GITCODE_TOKEN")
    if not token:
        print("❌ Error: GITCODE_TOKEN environment variable not set")
        sys.exit(1)

    print(f"🔍 Fetching PR #{pr_number} from {owner_repo}...")
    print()

    # 获取 PR 信息
    info_url = f"https://api.gitcode.com/api/v5/repos/{owner_repo}/pulls/{pr_number}"
    info_cmd = ["curl", "-s", "-H", f"PRIVATE-TOKEN: {token}", info_url]
    info_result = subprocess.run(info_cmd, capture_output=True, text=True)

    title = "Unknown"
    if info_result.returncode == 0:
        pr_info = json.loads(info_result.stdout)
        title = pr_info.get("title", "Unknown")
        author = pr_info.get("user", {}).get("name", "Unknown")
        print(f"📊 PR: {title}")
        print(f"👤 Author: {author}")
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

    # 阶段 1: 检察官审查
    print("🔍 Phase 1: Prosecutor Review (Finding Issues)...")
    print("━" * 60)
    prosecutor_findings = prosecutor_review(diff_text, owner_repo, pr_number, title)
    print(prosecutor_findings[:500] + "..." if len(prosecutor_findings) > 500 else prosecutor_findings)
    print()

    # 阶段 2: 辩护方反驳
    print("🛡️ Phase 2: Defender Review (Evaluating Findings)...")
    print("━" * 60)
    defender_findings = defender_review(diff_text, owner_repo, pr_number, title, prosecutor_findings)
    print(defender_findings[:500] + "..." if len(defender_findings) > 500 else defender_findings)
    print()

    # 阶段 3: 法官裁决
    print("⚖️ Phase 3: Final Judgment...")
    print("━" * 60)
    final_report = final_judgment(prosecutor_findings, defender_findings, diff_text, owner_repo, pr_number)
    print(final_report)
    print()

    print("=" * 60)
    print("✅ Adversarial Review Completed!")
    print()
    print("💡 This review used 3-phase adversarial analysis:")
    print("   1. Prosecutor: Found potential issues")
    print("   2. Defender: Evaluated false positives")
    print("   3. Judge: Made final verdict")

if __name__ == "__main__":
    main()

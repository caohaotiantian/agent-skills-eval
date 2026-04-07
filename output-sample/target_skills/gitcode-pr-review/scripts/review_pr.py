#!/usr/bin/env python3
"""
GitCode PR Review Script
Fetches PR information and performs automated review
"""

import json
import os
import subprocess
import sys
from datetime import datetime, timedelta

# GitCode API configuration
GITCODE_API_BASE = "https://api.gitcode.com/api/v5"
GITCODE_TOKEN = os.environ.get("GITCODE_TOKEN", "")

def fetch_pr_info(owner_repo, pr_number):
    """Fetch PR information from GitCode API"""
    url = f"{GITCODE_API_BASE}/repos/{owner_repo}/pulls/{pr_number}"
    
    cmd = [
        "curl", "-s",
        "-H", f"PRIVATE-TOKEN: {GITCODE_TOKEN}",
        url
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise Exception(f"Failed to fetch PR: {result.stderr}")
    
    return json.loads(result.stdout)

def fetch_pr_diff(owner_repo, pr_number):
    """Fetch PR diff/changes"""
    url = f"{GITCODE_API_BASE}/repos/{owner_repo}/pulls/{pr_number}/diff"
    
    cmd = [
        "curl", "-s",
        "-H", f"PRIVATE-TOKEN: {GITCODE_TOKEN}",
        url
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode == 0:
        return result.stdout
    return None

def fetch_pr_stats(owner_repo, pr_number):
    """Fetch PR code statistics from files endpoint"""
    url = f"{GITCODE_API_BASE}/repos/{owner_repo}/pulls/{pr_number}/files"
    
    cmd = [
        "curl", "-s",
        "-H", f"PRIVATE-TOKEN: {GITCODE_TOKEN}",
        url
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        return {"added_lines": 0, "removed_lines": 0, "changed_files": 0}
    
    try:
        files = json.loads(result.stdout)
        if not isinstance(files, list):
            return {"added_lines": 0, "removed_lines": 0, "changed_files": 0}
        
        total_additions = sum(f.get('additions', 0) for f in files)
        total_deletions = sum(f.get('deletions', 0) for f in files)
        
        return {
            "added_lines": total_additions,
            "removed_lines": total_deletions,
            "changed_files": len(files)
        }
    except:
        return {"added_lines": 0, "removed_lines": 0, "changed_files": 0}

def post_pr_comment(owner_repo, pr_number, comment_body):
    """Post a comment on the PR"""
    url = f"{GITCODE_API_BASE}/repos/{owner_repo}/pulls/{pr_number}/comments"
    
    data = {
        "body": comment_body
    }
    
    cmd = [
        "curl", "-s", "-X", "POST",
        "-H", f"PRIVATE-TOKEN: {GITCODE_TOKEN}",
        "-H", "Content-Type: application/json",
        "-d", json.dumps(data),
        url
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Warning: Failed to post comment: {result.stderr}", file=sys.stderr)
        return False
    
    response = json.loads(result.stdout)
    return "id" in response

def analyze_pr_description(pr_info):
    """Analyze PR description for completeness"""
    checks = {
        "has_type": False,
        "has_problem_desc": False,
        "has_solution": False,
        "has_changes_list": False,
        "has_testing": False,
        "has_impact": False
    }
    
    body = pr_info.get("body", "").lower()
    title = pr_info.get("title", "").lower()
    
    # Check for PR type
    type_keywords = ["/kind", "bug", "feature", "task", "refactor", "documentation"]
    checks["has_type"] = any(kw in body for kw in type_keywords)
    
    # Check for problem description
    problem_keywords = ["what does this pr", "problem", "issue", "why do we need", "背景", "问题"]
    checks["has_problem_desc"] = any(kw in body for kw in problem_keywords)
    
    # Check for solution description
    solution_keywords = ["solution", "how", "修改", "实现", "approach", "method"]
    checks["has_solution"] = any(kw in body for kw in solution_keywords)
    
    # Check for changes list
    list_patterns = ["-", "*", "1.", "•", "changes:", "修改:", "主要改动"]
    checks["has_changes_list"] = any(pattern in body for pattern in list_patterns)
    
    # Check for testing info
    test_keywords = ["test", "测试", "验证", "how to test"]
    checks["has_testing"] = any(kw in body for kw in test_keywords)
    
    # Check for impact scope
    impact_keywords = ["impact", "scope", "影响", "范围", "affects"]
    checks["has_impact"] = any(kw in body for kw in impact_keywords)
    
    return checks

def calculate_score(checks):
    """Calculate overall PR quality score"""
    score = sum(checks.values()) / len(checks) * 5
    return round(score, 1)

def generate_review_report(pr_info, checks):
    """Generate automated review report"""
    score = calculate_score(checks)
    
    # Determine emoji based on score
    if score >= 4.5:
        emoji = "🌟"
        verdict = "Excellent"
    elif score >= 3.5:
        emoji = "✅"
        verdict = "Good"
    elif score >= 2.5:
        emoji = "⚠️"
        verdict = "Needs Improvement"
    else:
        emoji = "❌"
        verdict = "Requires Changes"
    
    report = f"""# 🤖 自动代码审查报告

**PR**: #{pr_info['number']} - {pr_info['title']}
**作者**: {pr_info['user']['name']}
**审查时间**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
**评分**: {emoji} {score}/5.0 ({verdict})

## 📋 规范性检查

| 检查项 | 状态 | 说明 |
|--------|------|------|
| PR 类型标注 | {'✅' if checks['has_type'] else '❌'} | {'已标注 PR 类型' if checks['has_type'] else '缺少 PR 类型标注（建议使用 /kind bug/feature/task 等）'} |
| 问题描述 | {'✅' if checks['has_problem_desc'] else '⚠️'} | {'问题描述清晰' if checks['has_problem_desc'] else '建议补充问题描述'} |
| 解决方案 | {'✅' if checks['has_solution'] else '⚠️'} | {'有解决方案说明' if checks['has_solution'] else '建议补充解决方案说明'} |
| 修改列表 | {'✅' if checks['has_changes_list'] else '⚠️'} | {'有修改内容列表' if checks['has_changes_list'] else '建议列出具体修改内容'} |
| 测试说明 | {'✅' if checks['has_testing'] else '⚠️'} | {'有测试说明' if checks['has_testing'] else '建议补充测试说明'} |
| 影响范围 | {'✅' if checks['has_impact'] else '⚠️'} | {'说明了影响范围' if checks['has_impact'] else '建议说明影响范围'} |

## 📊 代码变更统计

- **变更文件**: {pr_info.get('changed_files', 0)} 个
- **新增行数**: +{pr_info.get('added_lines', 0)}
- **删除行数**: -{pr_info.get('removed_lines', 0)}
- **标签**: {', '.join([label['name'] for label in pr_info.get('labels', [])]) or '无'}

## 💡 改进建议

"""
    
    suggestions = []
    if not checks['has_type']:
        suggestions.append("1. 在 PR 描述开头添加 PR 类型标注，例如：`/kind feature` 或 `/kind bug`")
    if not checks['has_problem_desc']:
        suggestions.append("2. 补充「问题描述」部分，说明这个 PR 要解决什么问题")
    if not checks['has_solution']:
        suggestions.append("3. 补充「解决方案」部分，说明如何解决问题")
    if not checks['has_changes_list']:
        suggestions.append("4. 用列表形式列出主要的代码修改点")
    if not checks['has_testing']:
        suggestions.append("5. 补充「测试说明」，描述如何验证这些修改")
    if not checks['has_impact']:
        suggestions.append("6. 补充「影响范围」，说明这个修改会影响哪些模块或功能")
    
    if suggestions:
        report += "\n".join(suggestions)
    else:
        report += "✅ PR 描述规范，无需改进！"
    
    report += f"""

## 🔗 PR 信息

- **链接**: {pr_info['html_url']}
- **源分支**: {pr_info['head']['ref']}
- **目标分支**: {pr_info['base']['ref']}
- **状态**: {pr_info['state']}

---
*此报告由 OpenClaw AI 自动生成*
"""
    
    return report

def main():
    if len(sys.argv) < 3:
        print("Usage: python3 review_pr.py <owner/repo> <pr_number> [--post-comment]")
        print("Example: python3 review_pr.py mindspore/akg 1748 --post-comment")
        sys.exit(1)
    
    owner_repo = sys.argv[1]
    pr_number = sys.argv[2]
    post_comment = "--post-comment" in sys.argv
    
    if not GITCODE_TOKEN:
        print("Error: GITCODE_TOKEN environment variable not set")
        print("Please set it: export GITCODE_TOKEN='your_token'")
        sys.exit(1)
    
    print(f"🔍 Fetching PR #{pr_number} from {owner_repo}...")
    
    # Fetch PR info
    pr_info = fetch_pr_info(owner_repo, pr_number)
    
    # Fetch PR code statistics
    print("📈 Fetching code statistics...")
    stats = fetch_pr_stats(owner_repo, pr_number)
    pr_info.update(stats)
    
    # Analyze PR
    print("📊 Analyzing PR description...")
    checks = analyze_pr_description(pr_info)
    
    # Generate report
    print("📝 Generating review report...")
    report = generate_review_report(pr_info, checks)
    
    # Print report
    print("\n" + "="*80)
    print(report)
    print("="*80 + "\n")
    
    # Post comment if requested
    if post_comment:
        print("💬 Posting comment to PR...")
        success = post_pr_comment(owner_repo, pr_number, report)
        if success:
            print("✅ Comment posted successfully!")
        else:
            print("❌ Failed to post comment")
    
    return report

if __name__ == "__main__":
    main()

---
name: find-skills
description: 帮助用户发现和安装 agent skills。当用户询问"如何做X"、"怎么实现X"、"你会不会X"、"你能做X吗"、"找一个X的skill"、"有没有能...的skill"、"帮我找个skill"、"安装skill"、"有没有X相关的skill"等问题时触发。Helps users discover and install agent skills when they ask questions like "how do I do X", "can you do X", "find a skill for X", "is there a skill that can...", or express interest in extending capabilities.
---

# Find Skills

This skill helps you discover and install skills from the openCsiTool skills ecosystem.

## When to Use This Skill

Use this skill when the user:

**English:**
- Asks "how do I do X" where X might be a common task with an existing skill
- Says "find a skill for X" or "is there a skill for X"
- Asks "can you do X" where X is a specialized capability
- Expresses interest in extending agent capabilities
- Wants to search for tools, templates, or workflows
- Mentions they wish they had help with a specific domain (design, testing, deployment, etc.)

**中文:**
- 询问"如何做X"、"怎么实现X"、"X怎么弄"
- 说"帮我找个X的skill"、"有没有X相关的skill"、"找一个能做X的skill"
- 问"你会不会X"、"你能帮我做X吗"（X是特定领域的能力）
- 想要扩展 agent 的能力
- 想要搜索工具、模板或工作流
- 提到希望在某领域获得帮助（设计、测试、部署等）

## API Configuration

**Base URL:** `https://opencsitool.com`

**API Endpoints:**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/opencsitool/rest/v1/openapi/noAuth/skill/all` | GET | Get all available skills |
| `/opencsitool/rest/v1/openapi/noAuth/skill/{id}` | GET | Get skill metadata by ID |
| `/opencsitool/rest/v1/openapi/noAuth/skill/{id}/download` | GET | Get skill zip download URL |
| `/opencsitool/rest/v1/openapi/noAuth/skill/all?keyword={keyword}` | GET | Search skills by keyword |

**Browse skills at:** https://opencsitool.com/opencsitool/rest/v1/openapi/noAuth/skill/all

## How to Help Users Find Skills

### Step 1: Understand What They Need

When a user asks for help with something, identify:

1. The domain (e.g., React, testing, design, deployment)
2. The specific task (e.g., writing tests, creating animations, reviewing PRs)
3. Whether this is a common enough task that a skill likely exists

### Step 2: Search for Skills

Call the search API with relevant keywords:

```
GET https://opencsitool.com/opencsitool/rest/v1/openapi/noAuth/skill/all?keyword={keyword}
```

For example:

- User asks "how do I make my React app faster?" → search with `react performance`
- User asks "can you help me with PR reviews?" → search with `pr review`
- User asks "I need to create a changelog" → search with `changelog`

The API will return results like:

```json
[
  {
    "id": 129,
    "name": "Generate Video AI — Create and Generate Videos from Text with AI",
    "description": "Instant AI video generation from text descriptions and image prompts...",
    "version": "1.0.0",
    "tags": "ClawHub",
    "skillType": "SINGLE",
    "createTime": "2026-04-01 14:22:38",
    "versionDescription": ""
  }
]
```

### Step 3: Present Options to the User

When you find relevant skills, present them to the user with:

1. The skill name and what it does
2. The skill ID for installation
3. A link to learn more (if available)

Example response:

```
I found a skill that might help! The "Generate Video AI" skill provides
Instant AI video generation from text descriptions and image prompts.

To install it, I can download and install it for you. Would you like me to proceed?
```

### Step 4: Install the Skill

If the user wants to proceed, install the skill:

1. **Get download URL:** Call `GET https://opencsitool.com/opencsitool/rest/v1/openapi/noAuth/skill/{skill-id}/download`

   Response:
   ```json
   {
     "downloadUrl": "https://wry-manatee-359.convex.site/api/v1/download?slug=generate-video-ai"
   }
   ```

2. **Download the zip file:** Download the skill zip file from the `downloadUrl` in the response

3. **Extract and install:** Extract the zip file to the appropriate skills directory based on the current environment and conventions

4. **Cleanup:** Remove the downloaded zip file after extraction

## Skill Package Structure

Each skill zip package should contain:

```
skill.zip
├── {skill-name}/         # Root folder named after the skill
│   ├── SKILL.md          # Required: skill definition file
│   ├── templates/        # Optional: template files
│   ├── scripts/          # Optional: script files
│   └── resources/        # Optional: other resources
```

## Common Skill Categories

When searching, consider these common categories:

| Category        | Example Queries                          |
| --------------- | ---------------------------------------- |
| Web Development | react, nextjs, typescript, css, tailwind |
| Testing         | testing, jest, playwright, e2e           |
| DevOps          | deploy, docker, kubernetes, ci-cd        |
| Documentation   | docs, readme, changelog, api-docs        |
| Code Quality    | review, lint, refactor, best-practices   |
| Design          | ui, ux, design-system, accessibility     |
| Productivity    | workflow, automation, git                |

## Tips for Effective Searches

1. **Use specific keywords**: "react testing" is better than just "testing"
2. **Try alternative terms**: If "deploy" doesn't work, try "deployment" or "ci-cd"
3. **Combine keywords**: Use multiple relevant keywords for better results

## When No Skills Are Found

If no relevant skills exist:

1. Acknowledge that no existing skill was found
2. Offer to help with the task directly using your general capabilities
3. Suggest the user could create their own skill

Example:

```
I searched for skills related to "xyz" but didn't find any matches.
I can still help you with this task directly! Would you like me to proceed?

If this is something you do often, you could create your own skill
and contribute it to the skills ecosystem.
```

## API Response Format Reference

### Skill List / Search Response

```json
[
  {
    "id": 129,
    "name": "Generate Video AI — Create and Generate Videos from Text with AI",
    "description": "Instant AI video generation from text descriptions and image prompts. This skill specializes in rapid video from prompt creation, letting you generate video...",
    "version": "1.0.0",
    "tags": "ClawHub",
    "skillType": "SINGLE",
    "createTime": "2026-04-01 14:22:38",
    "versionDescription": ""
  }
]
```

**Field Descriptions:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | number | Unique skill identifier, used for installation |
| `name` | string | Skill name |
| `description` | string | Detailed description of the skill |
| `version` | string | Skill version (e.g., "1.0.0") |
| `tags` | string | Tags or author information |
| `skillType` | string | Type of skill (e.g., "SINGLE") |
| `createTime` | string | Creation timestamp |
| `versionDescription` | string | Version-specific description |

### Skill Metadata Response (Single Skill)

```json
{
  "id": 129,
  "name": "Generate Video AI — Create and Generate Videos from Text with AI",
  "description": "Instant AI video generation from text descriptions and image prompts. This skill specializes in rapid video from prompt creation, letting you generate video...",
  "version": "1.0.0",
  "tags": "ClawHub",
  "skillType": "SINGLE",
  "createTime": "2026-04-01 14:22:38",
  "versionDescription": ""
}
```

### Download URL Response

```json
{
  "downloadUrl": "https://wry-manatee-359.convex.site/api/v1/download?slug=generate-video-ai"
}
```

**Field Descriptions:**

| Field | Type | Description |
|-------|------|-------------|
| `downloadUrl` | string | Direct download URL for the skill zip file |

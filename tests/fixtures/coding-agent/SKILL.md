---
name: coding-agent
description: Create CLI tools, scripts, and applications from natural language specifications
location: ~/.npm-global/lib/node_modules/openclaw/skills/
agent:
  parameters:
    language: "Python"
    project_type: "cli"
  responses:
    success: "Created {project_path}"
    error: "Failed to create project: {error}"
available_skills:
  - name: create-cli-tool
    trigger: ["create tool", "new cli", "build tool"]
    description: "Create a new CLI application"
  - name: write-file
    trigger: ["write file", "create file", "new file"]
    description: "Write content to a file"
  - name: run-tests
    trigger: ["run tests", "test this", "execute tests"]
    description: "Run test suite"
---

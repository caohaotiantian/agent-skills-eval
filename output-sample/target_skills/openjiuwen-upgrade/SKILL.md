---
name: openjiuwen-upgrade
description: Guide for upgrading from older versions of openjiuwen core SDK to the latest version. Use when migrating projects built with older openjiuwen SDK to the latest version. Includes code analysis, documentation review, migration planning, and execution guidance.
---

# Openjiuwen SDK Upgrade Guide

## Overview

This skill provides comprehensive guidance for upgrading from older versions of openjiuwen core SDK to the latest version, including code analysis, documentation review, migration planning, and execution.

## Upgrade Workflow

### 1. Analyze Existing Code

Read and analyze the existing project code to identify old SDK usage patterns.

### 2. Review New Documentation

Consult the new SDK documentation in assets directory to understand API changes and new features.

### 3. Locate and Analyze SDK in Python Environment

After reviewing documentation, locate and analyze the actual SDK code in the project's Python environment to understand the concrete implementation.

### 4. Create Migration Plan

Create a detailed migration plan document following the standard format.

### 5. Execute Migration

Follow the migration plan to perform code changes step by step.

### 6. Verify Migration

Run tests and perform manual verification to ensure all functionality works correctly.

**Identify Entry Points**
- Find main scripts (e.g., `main.py`, `app.py`, `run.py`, `server.py`)
- Locate workflow definition files
- Identify agent initialization code
- Check configuration files for SDK version info

**Analyze Import Statements**
Identify imports from old SDK paths that may need updating:
- Workflow configuration imports
- Workflow base imports
- Runtime/session imports
- Component imports (Start, End, etc.)
- Graph executable imports (Input, Output)
- Context engine imports
- Stream type imports
- Model factory imports

**Analyze Workflow Construction**
Check how workflows are built:
- Workflow initialization patterns
- Configuration classes used
- Component registration methods
- Connection methods
- Schema definitions

**Analyze Session/Runtime Usage**
Check session management patterns:
- Runtime/session creation
- State access methods
- State update methods
- Session ID management
- Parent session handling

**Analyze Component Definitions**
Check custom component implementations:
- Base class inheritance
- Method signatures (parameter names and types)
- Input/Output type usage
- Context parameter usage
- State access within components

**Analyze Execution Patterns**
Check how workflows are executed:
- Invoke method calls
- Stream method calls
- Result retrieval patterns
- Stream mode handling
- Chunk processing

**Analyze Tool Integration**
Check tool-related code:
- Tool definitions and registration
- Tool execution patterns
- Tool result handling
- Tool state management

**Analyze LLM Integration**
Check LLM-related code:
- Model factory usage
- Model configuration
- API base/key handling
- Response processing

**Analyze Memory and Context**
Check memory/context features:
- Long-term memory usage
- Context engine configuration
- Message history management

**Document Findings**
Create a summary of:
- Files that need modification
- API patterns that need updating
- Dependencies on deprecated features
- Risk areas (complex logic, edge cases)

**Action:** Read project files systematically using the checklist above to identify all old API patterns.

### 2. Review New Documentation

Consult the new SDK documentation in assets directory to understand API changes and new features.

**Documentation Structure:**

```
assets/agent-core-0.1.7/2.Development Guide/
├── API Docs/                          # API Reference Documentation
│   ├── openjiuwen.core/               # Core SDK API
│   │   ├── workflow/                  # Workflow system
│   │   │   ├── workflow.md            # Workflow class and methods
│   │   │   └── components/            # Component types
│   │   │       ├── flow/              # Flow components (Start, End, Branch, Loop)
│   │   │       ├── llm/               # LLM components
│   │   │       ├── tool/              # Tool components
│   │   │       └── condition/         # Condition components
│   │   ├── session/                   # Session management
│   │   │   ├── session.md             # Session class
│   │   │   ├── checkpointer.md        # Checkpoint mechanism
│   │   │   └── stream/                # Streaming output
│   │   ├── foundation/                # Foundation modules
│   │   │   ├── llm/                   # LLM integration
│   │   │   ├── tool/                  # Tool system
│   │   │   ├── prompt/                # Prompt templates
│   │   │   └── store/                 # Storage (Object, Vector, Query)
│   │   ├── application/               # Application-level agents
│   │   │   ├── workflow_agent/        # WorkflowAgent
│   │   │   └── llm_agent/             # LLMAgent
│   │   ├── single_agent/              # Single agent
│   │   ├── multi_agent/               # Multi-agent system
│   │   ├── context_engine/            # Context management
│   │   ├── memory/                    # Memory system
│   │   ├── retrieval/                 # Knowledge retrieval
│   │   ├── runner/                    # Execution engine
│   │   ├── security/                  # Security guardrails
│   │   ├── skills/                    # Skills system
│   │   └── sys_operation/             # System operations
│   ├── openjiuwen.dev_tools/          # Development tools
│   ├── openjiuwen.extensions/         # Extensions
│   └── openjiuwen.agent_evolving/     # Agent evolution
├── Advanced Usage/                    # Advanced topics
│   ├── Session/                       # Session management details
│   ├── Context Engine.md              # Context engine usage
│   ├── Memory Engine.md               # Memory system usage
│   ├── Knowledge Retrieval.md         # Retrieval system
│   ├── Develop Custom Components.md   # Custom component development
│   └── ...                            # Other advanced topics
├── Agents/                            # Agent building guides
├── Workflows/                         # Workflow guides
└── Basic Functions/                   # Basic functionality
```

**Quick Reference by Topic:**

| Topic | Documentation Path |
|-------|-------------------|
| Workflow construction | `API Docs/openjiuwen.core/workflow/workflow.md` |
| Components (Start/End/Branch/Loop) | `API Docs/openjiuwen.core/workflow/components/flow/` |
| Session management | `API Docs/openjiuwen.core/session/session.md` |
| State management | `Advanced Usage/Session/State Management.md` |
| Streaming output | `API Docs/openjiuwen.core/session/stream/` + `Advanced Usage/Session/Streaming Output.md` |
| LLM integration | `API Docs/openjiuwen.core/foundation/llm/` |
| Tool system | `API Docs/openjiuwen.core/foundation/tool/` |
| Context engine | `API Docs/openjiuwen.core/context_engine/` |
| Memory system | `API Docs/openjiuwen.core/memory/` |
| Agent building | `Agents/` directory |
| Custom components | `Advanced Usage/Develop Custom Components.md` |

**Compare API Signatures**
For each identified old API pattern:
- Read the corresponding new documentation
- Compare method signatures
- Note parameter changes (name, type, order)
- Identify return type changes
- Document new required parameters

**Identify New Features**
Look for new capabilities that might benefit the project:
- New component types
- Improved streaming modes
- Enhanced state management
- New configuration options

**Check Breaking Changes**
Focus on:
- Removed classes/methods
- Renamed parameters
- Changed default behaviors
- Deprecated patterns

**Action:** Read relevant documentation files based on identified old API patterns. Compare old and new APIs systematically.

### 3. Locate and Analyze SDK in Python Environment

After reviewing documentation, locate and analyze the actual SDK code in the project's Python environment to understand the concrete implementation.

**Find Python Environment**
- Determine the Python interpreter used by the project
- Locate the site-packages directory (could be in virtual environment, conda environment, or system Python)
- Common locations: `venv/lib/pythonX.X/site-packages/`, `~/.conda/envs/<env>/lib/pythonX.X/site-packages/`, or system Python paths

**Locate openjiuwen SDK Package**
- Find openjiuwen SDK package in site-packages
- Search for directories starting with `openjiuwen` or similar patterns
- Note the exact package name and path

**Analyze SDK Structure**
- Read the package's `__init__.py` to understand exposed APIs
- Explore the directory structure to understand module organization
- Identify the main classes and functions

**Compare with Documentation**
- Verify that the documentation matches the actual implementation
- Check for any discrepancies between documented and actual APIs
- Note any undocumented features or utilities

**Analyze Specific API Implementations**
For each old API pattern identified:
- Find the corresponding class/function in the SDK
- Read the actual method signatures
- Understand the internal implementation
- Note any helper methods or utilities available

**Document SDK Findings**
Record findings including:
- Actual import paths
- Available classes and methods
- Method signatures and parameters
- Return types
- Any implementation details relevant to migration

**Action:** Use file search tools to locate and read the actual SDK code in the Python environment. Compare implementation details with documentation to ensure accurate migration.

### 4. Create Migration Plan

Create a detailed migration plan document following the standard format.

**Plan Document Structure:**
```markdown
---
name: <Project Name> SDK Migration Plan
overview: Brief description of migration scope and objectives
todos:
  - id: <task-id>
    content: <task description>
    status: pending | in_progress | completed
isProject: false
---

# Migration Plan

## Objectives
<Migration goals>

## Scope
<Files and modules to be changed>

## Current Implementation Analysis
<Summary of current SDK usage patterns>

## API Changes Summary
<Table of old vs new API patterns>

## Implementation Steps
1. <Step 1>
2. <Step 2>
...

## Risk Areas
<Complex logic, edge cases that need careful handling>

## Testing Strategy
<How to verify the migration is successful>

## Acceptance Criteria
<Verification requirements>
```

**Prioritize Changes**
Order migration tasks by:
- **Critical path** - Changes that block other work
- **High impact** - Changes affecting core functionality
- **Low risk** - Simple import updates
- **Optional** - New features to adopt

**Break Down Complex Changes**
For complex migrations, create sub-tasks:
- Import updates
- Workflow initialization
- Session management
- Component definitions
- Execution patterns
- Testing each module

**Define Verification Points**
Set checkpoints after each major change:
- After import updates: Code should still parse
- After workflow changes: Basic workflow should run
- After session changes: State management should work
- Final: All tests pass

**Action:** Create a migration plan document with specific tasks and acceptance criteria. Include risk assessment and testing strategy.

### 5. Execute Migration

Follow the migration plan to perform code changes step by step.

**Update Dependencies**
- Update SDK version in requirements.txt or pyproject.toml
- Check for transitive dependency conflicts
- Update lock files if applicable

**Update Import Statements**
For each old import identified:
- Find the corresponding new import path from documentation
- Update the import statement
- Verify the new import works

**Update Workflow Initialization**
Based on documentation comparison:
- Update workflow configuration approach
- Update any configuration classes used
- Verify workflow can be created

**Update Session Management**
Based on documentation comparison:
- Update session/runtime creation
- Update state access methods
- Update state update methods
- Verify state management works

**Update Component Definitions**
Based on documentation comparison:
- Update base class imports
- Update method signatures
- Update Input/Output types
- Verify components work

**Update Execution Patterns**
Based on documentation comparison:
- Update invoke/stream method calls
- Update result retrieval
- Verify execution works

**Update Streaming**
Based on documentation comparison:
- Update stream method parameters
- Update chunk type handling
- Verify streaming works

**Handle Edge Cases**
Address any special patterns found:
- Custom state management helpers
- Dynamic component creation
- Nested workflows
- Error handling patterns

**Best Practices:**
- Make changes incrementally, one module at a time
- Test after each change
- Keep backup of original code
- Update imports and API calls according to new documentation
- Use version control for easy rollback

**Action:** Implement changes according to the migration plan. Test each change before proceeding to the next.

### 6. Verify Migration

Run tests and perform manual verification to ensure all functionality works correctly.

**Static Analysis**
- Check for syntax errors
- Run linter (ruff, flake8, etc.)
- Run type checker if applicable

**Run Unit Tests**
- Run all existing tests
- Check for test failures
- Fix any broken tests

**Run Integration Tests**
- Run integration tests
- Run end-to-end tests
- Verify all workflows execute correctly

**Manual Testing**
- Test core functionality manually
- Verify user-facing features work
- Test edge cases

**Verify Key Features**
- Workflow initialization works
- Session creation works
- State management works (get/set global state)
- Component execution works
- Streaming output works
- Tool invocation works
- LLM integration works
- Memory/context features work
- Error handling works
- All existing tests pass

**Performance Check**
- Compare execution time with old version
- Check memory usage
- Verify no regressions in response time

**Documentation Update**
- Update README if needed
- Update API documentation
- Update inline comments
- Update configuration examples

**Action:** Verify all functionality works correctly after migration. Document any issues found and fixes applied.

## Common Issues and Solutions

### Import Errors
- Check module paths have changed
- Check class names have changed
- Consult documentation for correct import paths

### Runtime Errors
- Check method signatures have changed
- Check parameter names have changed
- Check return types have changed

### State Management Issues
- Ensure using correct session methods
- Check state access patterns
- Verify state persistence works

### Component Issues
- Check base class imports are correct
- Check method signatures match new API
- Verify Input/Output types are correct

## Migration Checklist

### Pre-Migration
- [ ] Backup entire project
- [ ] Create new git branch for migration
- [ ] Document current SDK version
- [ ] Run existing tests to establish baseline
- [ ] Note any existing issues

### During Migration
- [ ] Update dependencies
- [ ] Update all import statements
- [ ] Update workflow initialization
- [ ] Update session/runtime usage
- [ ] Update component definitions
- [ ] Update execution patterns
- [ ] Update streaming code
- [ ] Update state management
- [ ] Remove deprecated code
- [ ] Run tests after each major change

### Post-Migration
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] Manual testing successful
- [ ] No performance regressions
- [ ] Documentation updated
- [ ] Code reviewed
- [ ] Merge to main branch

## Resources

### assets/
Contains new SDK documentation:
- `agent-core-0.1.7/` - Complete new version documentation
- Consult as needed to understand specific API changes

## Best Practices

1. **Backup Code** - Backup entire project before starting
2. **Incremental Migration** - Migrate one module at a time, verify before proceeding
3. **Version Control** - Use version control system for easy rollback
4. **Test Coverage** - Ensure adequate test coverage before and after migration
5. **Documentation Update** - Update project documentation to reflect API changes
6. **Peer Review** - Have code reviewed by team members
7. **Staged Rollout** - Consider staged rollout for production systems

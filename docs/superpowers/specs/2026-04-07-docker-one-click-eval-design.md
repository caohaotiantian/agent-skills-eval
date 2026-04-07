# Docker One-Click Skill Evaluation — Design Spec

**Goal:** Enable users to evaluate Agent Skills inside Docker containers with a single command, achieving end-to-end automated testing with zero local setup beyond Docker itself.

**Decisions made:**
- Single-file executable via Bun `--compile`
- Single Docker image with both Claude Code and OpenCode pre-installed
- Environment variables via both `-e` flags and `--env-file`
- Output to `./eval-results/` by default, overridable with `--output`
- Auto-detect backends from available API keys

---

## 1. Single-File Executable

### Build tool
Bun's `bun build --compile` bundles all 235 modules + Node.js runtime into a standalone binary (~59MB). Verified working with this project.

### Build targets
- `bun-linux-x64` — for Docker image (primary)
- Native platform — for optional local use

### npm scripts
```json
{
  "build": "bun build bin/cli.js --compile --outfile dist/agent-skills-eval",
  "build:linux": "bun build bin/cli.js --compile --target=bun-linux-x64 --outfile dist/agent-skills-eval-linux"
}
```

### Output
Binary written to `dist/` (added to `.gitignore`).

---

## 2. Docker Image

### Dockerfile structure
Single multi-stage build:

**Stage 1 — builder:**
- Base: `oven/bun:latest`
- Copy project source
- Run `bun build bin/cli.js --compile --target=bun-linux-x64 --outfile /build/agent-skills-eval`

**Stage 2 — runtime:**
- Base: `node:20-slim`
- Copy compiled binary from builder to `/usr/local/bin/agent-skills-eval`
- Install Claude Code CLI: `npm i -g @anthropic-ai/claude-code`
- Install OpenCode: download prebuilt binary from GitHub releases to `/usr/local/bin/opencode`
- Set `WORKDIR /workspace`
- Set `ENTRYPOINT ["agent-skills-eval"]`

### Image tag
`agent-skills-eval:latest`

### Pre-installed tools
Both Claude Code and OpenCode are installed at build time. No downloads needed at runtime.

### Environment variables (runtime, never baked in)
| Variable | Purpose | Required for |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | Claude API authentication | claude-code backend |
| `OPENAI_API_KEY` | OpenAI API authentication | opencode / openai-compatible backend |
| `OPENAI_BASE_URL` | Custom LLM endpoint | opencode / openai-compatible backend |
| `OPENAI_MODEL` | Model selection | opencode / openai-compatible backend |

---

## 3. Test Script (`eval-skill.sh`)

### Location
Repository root: `eval-skill.sh` (chmod +x)

### Usage
```
./eval-skill.sh [options] <skill-path>

Options:
  -e KEY=VALUE        Set environment variable (repeatable)
  --env-file FILE     Load env vars from file (default: .env if exists)
  -b, --backend NAME  Force specific backend (claude-code|opencode)
  -o, --output DIR    Output directory on host (default: ./eval-results)
  --build             Force rebuild the Docker image
  --llm               Enable LLM-powered test generation
  -h, --help          Show help
```

### Execution flow

1. **Image check:** If `agent-skills-eval:latest` doesn't exist (or `--build` passed), run `docker build -t agent-skills-eval:latest .`
2. **Env collection:**
   - Collect from `--env-file` (or auto-detect `.env` in CWD)
   - Collect from `-e KEY=VALUE` flags (override file values)
   - Pass all as `docker run -e` arguments
3. **Backend auto-detection:**
   - If `--backend` specified, use that
   - Else if `ANTHROPIC_API_KEY` set, include `claude-code`
   - Else if `OPENAI_API_KEY` set, include `openai-compatible`
   - If neither, error with message about required API keys
4. **Run container:**
   ```bash
   docker run --rm \
     -v "$(realpath $SKILL_PATH)":/workspace/skill:ro \
     -v "$(realpath $OUTPUT_DIR)":/workspace/output \
     -e ANTHROPIC_API_KEY -e OPENAI_API_KEY -e OPENAI_BASE_URL -e OPENAI_MODEL \
     agent-skills-eval:latest \
     pipeline -s "$SKILL_NAME" -b "$BACKEND" -f html \
       --output-dir /workspace/output
   ```
5. **Report location:** Print path to HTML report on host after completion.

### Volume mounts
| Host | Container | Mode |
|------|-----------|------|
| `<skill-path>` | `/workspace/skill` | read-only |
| `<output-dir>` | `/workspace/output` | read-write |

### Skill name resolution
The script derives the skill name from the directory basename of `<skill-path>`. For example, `./eval-skill.sh ~/.claude/skills/my-skill` → skill name `my-skill`.

### Error handling
- Missing Docker → print install instructions
- Missing skill path → print usage
- No API keys → print which keys are needed for which backends
- Docker build failure → print build log
- Pipeline failure → preserve partial output, print error summary

---

## 4. Files to create/modify

| File | Action | Purpose |
|------|--------|---------|
| `Dockerfile` | Create | Multi-stage Docker image |
| `.dockerignore` | Create | Exclude node_modules, output, coverage, .git |
| `eval-skill.sh` | Create | One-click test script |
| `package.json` | Modify | Add `build` and `build:linux` scripts |
| `.gitignore` | Modify | Add `dist/` |
| `README.md` | Modify | Add Docker usage section |
| `README-cn.md` | Modify | Add Docker usage section (Chinese) |

---

## 5. User workflow

```bash
# One-time: clone the repo (or just download eval-skill.sh + Dockerfile)
git clone https://github.com/caohaotiantian/agent-skills-eval.git
cd agent-skills-eval

# Evaluate a skill (first run builds the image automatically)
./eval-skill.sh -e ANTHROPIC_API_KEY=sk-ant-... /path/to/my-skill

# Or with .env file
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env
./eval-skill.sh /path/to/my-skill

# Results appear in ./eval-results/
open eval-results/reports/report-*.html
```

---

## 6. Out of scope

- Publishing pre-built Docker images to Docker Hub (future enhancement)
- Windows container support
- GPU/accelerator passthrough
- Skill development hot-reload inside container

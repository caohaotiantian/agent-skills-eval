#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# eval-skill.sh — One-click Agent Skill evaluation via Docker
# ============================================================

IMAGE_NAME="agent-skills-eval:latest"
DEFAULT_OUTPUT="./eval-results"
ENV_ARGS=()
ENV_FILE=""
BACKEND=""
OUTPUT_DIR=""
FORCE_BUILD=false
USE_LLM=false
SKILL_PATH=""

usage() {
  cat <<USAGE
Usage: $0 [options] <skill-path>

Evaluate an Agent Skill inside a Docker container.

Options:
  -e KEY=VALUE        Set environment variable (repeatable)
  --env-file FILE     Load env vars from file (default: .env if exists)
  -b, --backend NAME  Force backend (claude-code|opencode|openai-compatible|mock)
  -o, --output DIR    Output directory (default: $DEFAULT_OUTPUT)
  --build             Force rebuild Docker image
  --llm               Enable LLM-powered test generation
  -h, --help          Show this help

Examples:
  $0 -e ANTHROPIC_API_KEY=sk-ant-... /path/to/my-skill
  $0 --env-file .env --backend claude-code /path/to/my-skill
  $0 -b mock /path/to/my-skill   # dry run with mock backend
USAGE
  exit 0
}

# ---- Parse arguments ----
while [[ $# -gt 0 ]]; do
  case "$1" in
    -e)
      ENV_ARGS+=("-e" "$2")
      shift 2
      ;;
    --env-file)
      ENV_FILE="$2"
      shift 2
      ;;
    -b|--backend)
      BACKEND="$2"
      shift 2
      ;;
    -o|--output)
      OUTPUT_DIR="$2"
      shift 2
      ;;
    --build)
      FORCE_BUILD=true
      shift
      ;;
    --llm)
      USE_LLM=true
      shift
      ;;
    -h|--help)
      usage
      ;;
    -*)
      echo "Error: Unknown option $1" >&2
      usage
      ;;
    *)
      SKILL_PATH="$1"
      shift
      ;;
  esac
done

# ---- Validate skill path ----
if [[ -z "$SKILL_PATH" ]]; then
  echo "Error: No skill path provided." >&2
  echo "Usage: $0 [options] <skill-path>" >&2
  exit 1
fi

if [[ ! -d "$SKILL_PATH" ]]; then
  echo "Error: Skill path does not exist or is not a directory: $SKILL_PATH" >&2
  exit 1
fi

if [[ ! -f "$SKILL_PATH/SKILL.md" ]]; then
  echo "Error: No SKILL.md found in $SKILL_PATH" >&2
  exit 1
fi

SKILL_NAME=$(basename "$SKILL_PATH")
OUTPUT_DIR="${OUTPUT_DIR:-$DEFAULT_OUTPUT}"

# ---- Check Docker ----
if ! command -v docker &>/dev/null; then
  echo "Error: Docker is not installed. Please install Docker first." >&2
  echo "  https://docs.docker.com/get-docker/" >&2
  exit 1
fi

# ---- Build image if needed ----
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [[ "$FORCE_BUILD" == "true" ]] || ! docker image inspect "$IMAGE_NAME" &>/dev/null; then
  echo "Building Docker image $IMAGE_NAME ..."
  docker build -t "$IMAGE_NAME" "$SCRIPT_DIR"
  echo "Build complete."
fi

# ---- Collect environment variables ----

# Auto-detect .env file
if [[ -z "$ENV_FILE" && -f ".env" ]]; then
  ENV_FILE=".env"
fi

ENV_FILE_ARGS=()
if [[ -n "$ENV_FILE" ]]; then
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "Error: env file not found: $ENV_FILE" >&2
    exit 1
  fi
  ENV_FILE_ARGS=("--env-file" "$ENV_FILE")
fi

# ---- Auto-detect backend ----
if [[ -z "$BACKEND" ]]; then
  ALL_ENV=""
  for arg in "${ENV_ARGS[@]+"${ENV_ARGS[@]}"}"; do
    ALL_ENV="$ALL_ENV $arg"
  done
  if [[ -n "$ENV_FILE" && -f "$ENV_FILE" ]]; then
    ALL_ENV="$ALL_ENV $(cat "$ENV_FILE")"
  fi
  ALL_ENV="$ALL_ENV ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-} OPENAI_API_KEY=${OPENAI_API_KEY:-}"

  if echo "$ALL_ENV" | grep -q "ANTHROPIC_API_KEY=sk"; then
    BACKEND="claude-code"
  elif echo "$ALL_ENV" | grep -q "OPENAI_API_KEY=sk"; then
    BACKEND="openai-compatible"
  else
    echo "Error: No API keys detected. Provide at least one:" >&2
    echo "  ANTHROPIC_API_KEY  — for claude-code backend" >&2
    echo "  OPENAI_API_KEY     — for openai-compatible backend" >&2
    echo "" >&2
    echo "  $0 -e ANTHROPIC_API_KEY=sk-ant-... /path/to/skill" >&2
    echo "  $0 -b mock /path/to/skill   # for testing without API keys" >&2
    exit 1
  fi
fi

# ---- Prepare output directory (clean start each run) ----
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

# ---- Build pipeline arguments ----
PIPELINE_ARGS=("pipeline" "-s" "$SKILL_NAME" "-b" "$BACKEND" "-f" "html" "--output-dir" "/workspace/output")

if [[ "$USE_LLM" == "true" ]]; then
  PIPELINE_ARGS+=("--llm")
fi

# ---- Run container ----
echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  Agent Skills Evaluation                         ║"
echo "╠══════════════════════════════════════════════════╣"
printf "║  Skill:   %-40s║\n" "$SKILL_NAME"
printf "║  Backend: %-40s║\n" "$BACKEND"
printf "║  Output:  %-40s║\n" "$OUTPUT_DIR"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# Symlink mounted skill into a discoverable location, then run pipeline
# Run as host user so output files have correct ownership
# Use tmpfs for HOME: always writable by any UID, avoids bind-mount permission
# issues with rootless Docker, userns-remap, and SELinux
docker run --rm \
  --user "$(id -u):$(id -g)" \
  -v "$(cd "$SKILL_PATH" && pwd)":/workspace/skill:ro \
  -v "$(cd "$OUTPUT_DIR" && pwd)":/workspace/output \
  --tmpfs /workspace/home \
  "${ENV_FILE_ARGS[@]+"${ENV_FILE_ARGS[@]}"}" \
  "${ENV_ARGS[@]+"${ENV_ARGS[@]}"}" \
  -e ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}" \
  -e OPENAI_API_KEY="${OPENAI_API_KEY:-}" \
  -e OPENAI_BASE_URL="${OPENAI_BASE_URL:-}" \
  -e OPENAI_MODEL="${OPENAI_MODEL:-}" \
  -e HOME=/workspace/home \
  --entrypoint sh \
  "$IMAGE_NAME" \
  -c "mkdir -p /workspace/home/.claude/skills && ln -s /workspace/skill /workspace/home/.claude/skills/$SKILL_NAME && agent-skills-eval ${PIPELINE_ARGS[*]}"

# ---- Print results ----
echo ""
echo "════════════════════════════════════════════════════"
echo "  Evaluation complete!"
echo "  Results: $OUTPUT_DIR/"
REPORT=$(ls -t "$OUTPUT_DIR"/reports/report-*.html 2>/dev/null | head -1)
if [[ -n "$REPORT" ]]; then
  echo "  Report:  $REPORT"
fi
echo "════════════════════════════════════════════════════"

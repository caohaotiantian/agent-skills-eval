#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# eval-skill-in-batch.sh — Batch evaluate Agent Skills via Docker
# ============================================================
# Discovers all skills (including nested sub-skills) under a
# directory and evaluates each one using eval-skill.sh.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EVAL_SCRIPT="$SCRIPT_DIR/eval-skill.sh"
DEFAULT_OUTPUT="./eval-results"
PASS_THROUGH_ARGS=()
OUTPUT_DIR=""
SKILLS_DIR=""
PARALLEL=1

usage() {
  cat <<USAGE
Usage: $0 [options] <skills-directory>

Discover and evaluate all Agent Skills under a directory.
Skills are identified by the presence of a SKILL.md file.
Sub-skills (nested directories with their own SKILL.md) are
discovered and evaluated independently.

Options:
  -e KEY=VALUE        Set environment variable (repeatable, passed to eval-skill.sh)
  --env-file FILE     Load env vars from file (passed to eval-skill.sh)
  -b, --backend NAME  Force backend (passed to eval-skill.sh)
  -o, --output DIR    Base output directory (default: $DEFAULT_OUTPUT)
  --build             Force rebuild Docker image (passed to eval-skill.sh)
  --llm               Enable LLM-powered test generation (also auto-enables --llm-suggestion)
  --no-llm-judge      Disable LLM-as-Judge security analysis (passed to eval-skill.sh)
  --llm-suggestion    Enable LLM rewriting of static-eval suggestions (auto-on with --llm)
  --no-llm-suggestion Disable LLM rewriting even when --llm is set
  -j, --jobs N        Max parallel evaluations (default: 1)
  -h, --help          Show this help

Examples:
  $0 -b mock /path/to/skills-dir
  $0 --env-file .env -j 4 /path/to/skills-dir
  $0 -b mock -o ./results /path/to/skills-dir
USAGE
  exit 0
}

# ---- Parse arguments ----
while [[ $# -gt 0 ]]; do
  case "$1" in
    -e)
      PASS_THROUGH_ARGS+=("-e" "$2")
      shift 2
      ;;
    --env-file)
      PASS_THROUGH_ARGS+=("--env-file" "$2")
      shift 2
      ;;
    -b|--backend)
      PASS_THROUGH_ARGS+=("-b" "$2")
      shift 2
      ;;
    --build)
      PASS_THROUGH_ARGS+=("--build")
      shift
      ;;
    --llm)
      PASS_THROUGH_ARGS+=("--llm")
      shift
      ;;
    --no-llm-judge)
      PASS_THROUGH_ARGS+=("--no-llm-judge")
      shift
      ;;
    --llm-suggestion)
      PASS_THROUGH_ARGS+=("--llm-suggestion")
      shift
      ;;
    --no-llm-suggestion)
      PASS_THROUGH_ARGS+=("--no-llm-suggestion")
      shift
      ;;
    -o|--output)
      OUTPUT_DIR="$2"
      shift 2
      ;;
    -j|--jobs)
      PARALLEL="$2"
      shift 2
      ;;
    -h|--help)
      usage
      ;;
    -*)
      echo "Error: Unknown option $1" >&2
      usage
      ;;
    *)
      SKILLS_DIR="$1"
      shift
      ;;
  esac
done

# ---- Validate ----
if [[ -z "$SKILLS_DIR" ]]; then
  echo "Error: No skills directory provided." >&2
  echo "Usage: $0 [options] <skills-directory>" >&2
  exit 1
fi

if [[ ! -d "$SKILLS_DIR" ]]; then
  echo "Error: Directory does not exist: $SKILLS_DIR" >&2
  exit 1
fi

if [[ ! -x "$EVAL_SCRIPT" ]]; then
  echo "Error: eval-skill.sh not found or not executable at $EVAL_SCRIPT" >&2
  exit 1
fi

OUTPUT_DIR="${OUTPUT_DIR:-$DEFAULT_OUTPUT}"

# ---- Discover skills ----
# Find all directories containing SKILL.md, then remove those that are
# ancestors of a more specific skill (i.e., keep only leaf skills and
# standalone skills). A directory with SKILL.md whose child also has
# SKILL.md is treated as a parent — both are evaluated independently.
SKILL_PATHS=()
while IFS= read -r skill_md; do
  SKILL_PATHS+=("$(dirname "$skill_md")")
done < <(find "$(cd "$SKILLS_DIR" && pwd)" -name "SKILL.md" -type f | sort)

if [[ ${#SKILL_PATHS[@]} -eq 0 ]]; then
  echo "Error: No skills found (no SKILL.md files) under $SKILLS_DIR" >&2
  exit 1
fi

# ---- Summary ----
echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  Batch Agent Skills Evaluation                   ║"
echo "╠══════════════════════════════════════════════════╣"
printf "║  Skills found: %-35s║\n" "${#SKILL_PATHS[@]}"
printf "║  Parallelism:  %-35s║\n" "$PARALLEL"
printf "║  Output:       %-35s║\n" "$OUTPUT_DIR"
echo "╠══════════════════════════════════════════════════╣"
for sp in "${SKILL_PATHS[@]}"; do
  printf "║  • %-47s║\n" "$(basename "$sp")"
done
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ---- Prepare output directory ----
mkdir -p "$OUTPUT_DIR"

# ---- Run evaluations ----
TOTAL=${#SKILL_PATHS[@]}
PASSED=0
FAILED=0
FAILED_SKILLS=()
ACTIVE_PIDS=()
declare -A PID_SKILL_MAP
declare -A PID_LOG_MAP

cleanup_jobs() {
  for pid in "${ACTIVE_PIDS[@]+"${ACTIVE_PIDS[@]}"}"; do
    kill "$pid" 2>/dev/null || true
  done
  exit 1
}
trap cleanup_jobs INT TERM

wait_for_slot() {
  while [[ ${#ACTIVE_PIDS[@]} -ge $PARALLEL ]]; do
    local new_pids=()
    for pid in "${ACTIVE_PIDS[@]}"; do
      if kill -0 "$pid" 2>/dev/null; then
        new_pids+=("$pid")
      else
        wait "$pid" && {
          PASSED=$((PASSED + 1))
          echo "  ✓ ${PID_SKILL_MAP[$pid]}"
        } || {
          FAILED=$((FAILED + 1))
          FAILED_SKILLS+=("${PID_SKILL_MAP[$pid]}")
          echo "  ✗ ${PID_SKILL_MAP[$pid]} (see ${PID_LOG_MAP[$pid]})"
        }
        unset "PID_SKILL_MAP[$pid]"
        unset "PID_LOG_MAP[$pid]"
      fi
    done
    ACTIVE_PIDS=("${new_pids[@]+"${new_pids[@]}"}")
    if [[ ${#ACTIVE_PIDS[@]} -ge $PARALLEL ]]; then
      sleep 0.5
    fi
  done
}

drain_jobs() {
  for pid in "${ACTIVE_PIDS[@]+"${ACTIVE_PIDS[@]}"}"; do
    wait "$pid" && {
      PASSED=$((PASSED + 1))
      echo "  ✓ ${PID_SKILL_MAP[$pid]}"
    } || {
      FAILED=$((FAILED + 1))
      FAILED_SKILLS+=("${PID_SKILL_MAP[$pid]}")
      echo "  ✗ ${PID_SKILL_MAP[$pid]} (see ${PID_LOG_MAP[$pid]})"
    }
  done
  ACTIVE_PIDS=()
}

echo "Running evaluations..."
echo ""

for skill_path in "${SKILL_PATHS[@]}"; do
  skill_name=$(basename "$skill_path")
  skill_output="$OUTPUT_DIR/$skill_name"
  log_file="$OUTPUT_DIR/$skill_name.log"

  wait_for_slot

  "$EVAL_SCRIPT" \
    "${PASS_THROUGH_ARGS[@]+"${PASS_THROUGH_ARGS[@]}"}" \
    -o "$skill_output" \
    "$skill_path" \
    > "$log_file" 2>&1 &

  pid=$!
  ACTIVE_PIDS+=("$pid")
  PID_SKILL_MAP[$pid]="$skill_name"
  PID_LOG_MAP[$pid]="$log_file"
done

drain_jobs

# ---- Final summary ----
echo ""
echo "════════════════════════════════════════════════════"
echo "  Batch evaluation complete!"
echo "  Total: $TOTAL  |  Passed: $PASSED  |  Failed: $FAILED"
if [[ ${#FAILED_SKILLS[@]} -gt 0 ]]; then
  echo ""
  echo "  Failed skills:"
  for fs in "${FAILED_SKILLS[@]}"; do
    echo "    ✗ $fs"
  done
fi
echo ""
echo "  Results: $OUTPUT_DIR/"
echo "════════════════════════════════════════════════════"

exit $FAILED

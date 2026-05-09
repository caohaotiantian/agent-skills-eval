#!/usr/bin/env bash
# tests/integration/concurrency-flag.sh
# Acceptance harness for the concurrency-flag-plumbing task.
# Implements design §7 (docs/design/concurrency-flag-plumbing.md, lines 121-147)
# for the single-skill subset. Phase 2 will extend this file with multi-skill
# subtests for criteria §7-3 and §7-6.

set -uo pipefail

# Resolve repo root (this file lives at <repo>/tests/integration/concurrency-flag.sh).
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# ---- Sandbox setup (design §7 lines 121-147, single-skill subset) ----
SANDBOX="$(mktemp -d)"
trap 'rm -rf "$SANDBOX"' EXIT

# Single-skill tree for criteria §7-4 / §7-5 (eval-skill.sh requires SKILL.md
# at the path root — eval-skill.sh:111-114).
mkdir -p "$SANDBOX/skill"
printf -- '---\nname: stub\ndescription: stub for acceptance test (must be at least sixteen chars long)\n---\nbody\n' > "$SANDBOX/skill/SKILL.md"

# docker shim — appends each invocation's argv to a single recording file.
mkdir -p "$SANDBOX/bin"
cat > "$SANDBOX/bin/docker" <<EOF
#!/usr/bin/env bash
{ printf '=== docker invocation ===\n'; printf '%s\n' "\$@"; } >> "$SANDBOX/docker.argv"
exit 0
EOF
chmod +x "$SANDBOX/bin/docker"

# ---- Pass/fail bookkeeping ----
FAIL_COUNT=0
PASS_COUNT=0

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  printf 'PASS: %s\n' "$1"
}

fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  printf 'FAIL: %s\n' "$1"
}

run_subtest() {
  local name="$1"
  shift
  if ( set -e; "$@" ); then
    pass "$name"
  else
    fail "$name"
  fi
}

# ---- §7-1: bash -n eval-skill.sh ----
subtest_7_1() {
  bash -n "$REPO_ROOT/eval-skill.sh"
}
run_subtest "§7-1 bash -n eval-skill.sh" subtest_7_1

# ---- §7-2a: help text exposes -c / --concurrency on one line ----
subtest_7_2a() {
  ( cd "$REPO_ROOT" && ./eval-skill.sh --help 2>&1 ) \
    | grep -E -- '-c.*--concurrency|--concurrency.*-c' >/dev/null
}
run_subtest "§7-2a eval-skill.sh --help mentions -c/--concurrency" subtest_7_2a

# ---- §7-2b: help text describes per-skill / prompt scope ----
subtest_7_2b() {
  ( cd "$REPO_ROOT" && ./eval-skill.sh --help 2>&1 ) \
    | grep -iE 'within.*skill|per.skill|prompt' >/dev/null
}
run_subtest "§7-2b eval-skill.sh --help describes within/per-skill/prompt scope" subtest_7_2b

# ---- §7-4: positive parse — -c 4 reaches inner pipeline argv ----
subtest_7_4() {
  :> "$SANDBOX/docker.argv"
  PATH="$SANDBOX/bin:$PATH" "$REPO_ROOT/eval-skill.sh" \
    -b mock -c 4 -o "$SANDBOX/out" "$SANDBOX/skill" >/dev/null 2>&1 || true
  grep -F -- 'agent-skills-eval pipeline' "$SANDBOX/docker.argv" \
    | grep -E -- '-c[[:space:]]+4' >/dev/null
}
run_subtest "§7-4 -c 4 reaches inner agent-skills-eval pipeline argv" subtest_7_4

# ---- §7-5: negative parse — no -c means no -c in inner argv ----
subtest_7_5() {
  :> "$SANDBOX/docker.argv"
  PATH="$SANDBOX/bin:$PATH" "$REPO_ROOT/eval-skill.sh" \
    -b mock -o "$SANDBOX/out" "$SANDBOX/skill" >/dev/null 2>&1 || true
  ! grep -F -- 'agent-skills-eval pipeline' "$SANDBOX/docker.argv" \
    | grep -E -- '--concurrency|[[:space:]]-c[[:space:]]+[0-9]' >/dev/null
}
run_subtest "§7-5 absent -c yields no -c/--concurrency in inner argv" subtest_7_5

# ---- Summary ----
printf '\n---\n'
printf 'concurrency-flag.sh: %d passed, %d failed\n' "$PASS_COUNT" "$FAIL_COUNT"

if [[ "$FAIL_COUNT" -gt 0 ]]; then
  exit 1
fi
exit 0

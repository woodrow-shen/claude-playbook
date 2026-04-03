#!/usr/bin/env bash
# Functional tests for /review command
# Validates the command file structure and content.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CMD_FILE="$SCRIPT_DIR/../../configs/global/.claude/commands/review.md"

passed=0
failed=0

assert() {
    local desc="$1"
    shift
    if "$@" >/dev/null 2>&1; then
        echo "  PASS: $desc"
        ((passed++)) || true
    else
        echo "  FAIL: $desc"
        ((failed++)) || true
    fi
}

echo "=== Tests: review command ==="

assert "Command file exists" test -f "$CMD_FILE"
assert "Has name in frontmatter" grep -q '^name: review' "$CMD_FILE"
assert "Has description in frontmatter" grep -q '^description:' "$CMD_FILE"
assert "Enters plan mode" grep -q 'EnterPlanMode' "$CMD_FILE"
assert "Exits plan mode" grep -q 'ExitPlanMode' "$CMD_FILE"
assert "References docs/PRD.md" grep -q 'docs/PRD.md' "$CMD_FILE"
assert "Has Step 1: Enter Plan Mode" grep -q 'Step 1: Enter Plan Mode' "$CMD_FILE"

echo ""
echo "Results: $passed passed, $failed failed"
[[ "$failed" -eq 0 ]]

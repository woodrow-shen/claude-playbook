#!/usr/bin/env bash
# Functional tests for /bug command
# Validates the command file structure and content.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CMD_FILE="$SCRIPT_DIR/../../configs/global/.claude/commands/bug.md"

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

echo "=== Tests: bug command ==="

assert "Command file exists" test -f "$CMD_FILE"
assert "Has name in frontmatter" grep -q '^name: bug' "$CMD_FILE"
assert "Has description in frontmatter" grep -q '^description:' "$CMD_FILE"
assert "Creates GitHub issue with gh" grep -q 'gh issue create' "$CMD_FILE"
assert "Has severity classification" grep -q '## Severity Classification' "$CMD_FILE"
assert "Has Triage step" grep -q 'Step 1: Triage' "$CMD_FILE"
assert "Creates PR with gh pr create" grep -q 'gh pr create' "$CMD_FILE"

echo ""
echo "Results: $passed passed, $failed failed"
[[ "$failed" -eq 0 ]]

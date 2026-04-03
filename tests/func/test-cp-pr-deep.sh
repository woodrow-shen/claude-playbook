#!/usr/bin/env bash
# Functional tests for /cp:pr command
# Validates the command file structure and content.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CMD_FILE="$SCRIPT_DIR/../../configs/global/.claude/commands/cp/pr.md"

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

echo "=== Tests: cp:pr command ==="

assert "Command file exists" test -f "$CMD_FILE"
assert "Has name in frontmatter" grep -q '^name: cp:pr' "$CMD_FILE"
assert "Has description in frontmatter" grep -q '^description:' "$CMD_FILE"
assert "Validates branch name" grep -q 'Validate branch name' "$CMD_FILE"
assert "Prevents PR from main" grep -q 'Cannot create PR from main' "$CMD_FILE"
assert "Creates PR with gh pr create" grep -q 'gh pr create' "$CMD_FILE"
assert "Pushes branch to remote" grep -q 'git push -u origin' "$CMD_FILE"

echo ""
echo "Results: $passed passed, $failed failed"
[[ "$failed" -eq 0 ]]

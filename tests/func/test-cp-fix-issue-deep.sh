#!/usr/bin/env bash
# Functional tests for /cp:fix-issue command
# Validates the command file structure and content.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CMD_FILE="$SCRIPT_DIR/../../configs/global/.claude/commands/cp/fix-issue.md"

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

echo "=== Tests: cp:fix-issue command ==="

assert "Command file exists" test -f "$CMD_FILE"
assert "Has name in frontmatter" grep -q '^name: cp:fix-issue' "$CMD_FILE"
assert "Has description in frontmatter" grep -q '^description:' "$CMD_FILE"
assert "Fetches issue with gh issue view" grep -q 'gh issue view' "$CMD_FILE"
assert "Validates issue number" grep -q 'Validate Issue Number' "$CMD_FILE"
assert "Commits with sign-off" grep -q 'git commit -s' "$CMD_FILE"
assert "Pushes to main" grep -q 'git push origin main' "$CMD_FILE"

echo ""
echo "Results: $passed passed, $failed failed"
[[ "$failed" -eq 0 ]]

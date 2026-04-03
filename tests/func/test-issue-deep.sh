#!/usr/bin/env bash
# Functional tests for /issue command
# Validates the command file structure and content.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CMD_FILE="$SCRIPT_DIR/../../configs/global/.claude/commands/issue.md"

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

echo "=== Tests: issue command ==="

assert "Command file exists" test -f "$CMD_FILE"
assert "Has name in frontmatter" grep -q '^name: issue' "$CMD_FILE"
assert "Has description in frontmatter" grep -q '^description:' "$CMD_FILE"
assert "References gh issue view" grep -q 'gh issue view' "$CMD_FILE"
assert "Has Plan section" grep -q '## Plan' "$CMD_FILE"
assert "Has Create section" grep -q '## Create' "$CMD_FILE"
assert "Has Test section" grep -q '## Test' "$CMD_FILE"
assert "References /commit command" grep -q '/commit' "$CMD_FILE"

echo ""
echo "Results: $passed passed, $failed failed"
[[ "$failed" -eq 0 ]]

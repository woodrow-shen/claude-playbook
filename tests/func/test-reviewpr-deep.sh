#!/usr/bin/env bash
# Functional tests for /reviewpr command
# Validates the command file structure and content.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CMD_FILE="$SCRIPT_DIR/../../configs/global/.claude/commands/reviewpr.md"

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

echo "=== Tests: reviewpr command ==="

assert "Command file exists" test -f "$CMD_FILE"
assert "Has name in frontmatter" grep -q '^name: reviewpr' "$CMD_FILE"
assert "Has description in frontmatter" grep -q '^description:' "$CMD_FILE"
assert "Uses gh pr view" grep -q 'gh pr view' "$CMD_FILE"
assert "Uses gh pr diff" grep -q 'gh pr diff' "$CMD_FILE"
assert "Has Analyze section" grep -q '## Analyze' "$CMD_FILE"
assert "Has Review section" grep -q '## Review' "$CMD_FILE"
assert "Submits review via gh pr review" grep -q 'gh pr review' "$CMD_FILE"

echo ""
echo "Results: $passed passed, $failed failed"
[[ "$failed" -eq 0 ]]

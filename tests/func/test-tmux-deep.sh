#!/usr/bin/env bash
# Functional tests for /tmux command
# Validates the command file structure and content.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CMD_FILE="$SCRIPT_DIR/../../configs/global/.claude/commands/tmux.md"

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

echo "=== Tests: tmux command ==="

assert "Command file exists" test -f "$CMD_FILE"
assert "Has name in frontmatter" grep -q '^name: tmux' "$CMD_FILE"
assert "Has description in frontmatter" grep -q '^description:' "$CMD_FILE"
assert "Parses ARGUMENTS" grep -q '\$ARGUMENTS' "$CMD_FILE"
assert "References session name" grep -q 'session name' "$CMD_FILE"
assert "Delegates to tmux sub-agent" grep -q 'tmux sub-agent' "$CMD_FILE"

echo ""
echo "Results: $passed passed, $failed failed"
[[ "$failed" -eq 0 ]]

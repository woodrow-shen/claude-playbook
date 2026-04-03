#!/usr/bin/env bash
# Functional tests for /monitor-tmux command
# Validates the command file structure and content.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CMD_FILE="$SCRIPT_DIR/../../configs/global/.claude/commands/monitor-tmux.md"

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

echo "=== Tests: monitor-tmux command ==="

assert "Command file exists" test -f "$CMD_FILE"
assert "Has name in frontmatter" grep -q '^name: monitor-tmux' "$CMD_FILE"
assert "Has description in frontmatter" grep -q '^description:' "$CMD_FILE"
assert "Validates tmux session exists" grep -q 'tmux list-sessions' "$CMD_FILE"
assert "Captures pane content" grep -q 'tmux capture-pane' "$CMD_FILE"
assert "Supports --until-keyword flag" grep -q '\-\-until-keyword' "$CMD_FILE"
assert "Has monitoring loop" grep -q 'Monitoring Loop' "$CMD_FILE"

echo ""
echo "Results: $passed passed, $failed failed"
[[ "$failed" -eq 0 ]]

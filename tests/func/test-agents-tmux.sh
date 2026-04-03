#!/usr/bin/env bash
# Functional tests for tmux agent
# Validates the file structure and content.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FILE="$SCRIPT_DIR/../../configs/global/.claude/agents/tmux.md"

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

echo "=== Tests: tmux agent ==="

assert "File exists" test -f "$FILE"
assert "Has name in frontmatter" grep -q '^name: tmux' "$FILE"
assert "Has description in frontmatter" grep -q '^description:' "$FILE"
assert "Has verify sessions step" grep -q 'Verify Sessions' "$FILE"
assert "Has send instruction step" grep -q 'Send Instruction' "$FILE"
assert "Has deep analysis step" grep -q 'Deep Analysis' "$FILE"
assert "References tmux send-keys" grep -q 'tmux send-keys' "$FILE"

echo ""
echo "Results: $passed passed, $failed failed"
[[ "$failed" -eq 0 ]]

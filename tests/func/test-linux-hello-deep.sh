#!/usr/bin/env bash
# Functional tests for the linux config /hello command.
# Validates file structure and content.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CMD_FILE="$SCRIPT_DIR/../../configs/linux/.claude/commands/hello.md"

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

echo "=== Tests: linux /hello command ==="

assert "Command file exists" test -f "$CMD_FILE"
assert "File is not empty" test -s "$CMD_FILE"
assert "Mentions greeting output" grep -qi 'hello' "$CMD_FILE"
assert "Mentions listing commands" grep -qi 'list' "$CMD_FILE"

echo ""
echo "Results: $passed passed, $failed failed"
[[ "$failed" -eq 0 ]]

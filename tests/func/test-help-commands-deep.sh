#!/usr/bin/env bash
# Functional tests for /help-commands command
# Validates the command file structure and content.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CMD_FILE="$SCRIPT_DIR/../../configs/global/.claude/commands/help-commands.md"

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

echo "=== Tests: help-commands command ==="

assert "Command file exists" test -f "$CMD_FILE"
assert "Has name in frontmatter" grep -q '^name: help-commands' "$CMD_FILE"
assert "Has description in frontmatter" grep -q '^description:' "$CMD_FILE"
assert "Lists Available Commands" grep -q '## Available Commands' "$CMD_FILE"
assert "Documents /commit command" grep -q '/commit.*Conventional Commits' "$CMD_FILE"
assert "Documents /issue command" grep -q '/issue.*GitHub Issue' "$CMD_FILE"
assert "Has Agent Usage by Command section" grep -q 'Agent Usage by Command' "$CMD_FILE"

echo ""
echo "Results: $passed passed, $failed failed"
[[ "$failed" -eq 0 ]]

#!/usr/bin/env bash
# Functional tests for /cp:pre-commit command
# Validates the command file structure and content.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CMD_FILE="$SCRIPT_DIR/../../configs/global/.claude/commands/cp/pre-commit.md"

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

echo "=== Tests: cp:pre-commit command ==="

assert "Command file exists" test -f "$CMD_FILE"
assert "Has name in frontmatter" grep -q '^name: cp:pre-commit' "$CMD_FILE"
assert "Has description in frontmatter" grep -q '^description:' "$CMD_FILE"
assert "Finds playbook location" grep -q 'Find Playbook' "$CMD_FILE"
assert "Supports submodule mode" grep -q 'claude-playbook' "$CMD_FILE"
assert "Supports local clone mode" grep -q '\.claude-playbook' "$CMD_FILE"
assert "Runs pre-commit framework" grep -q 'pre-commit run' "$CMD_FILE"
assert "Falls back to manual hooks" grep -q 'scripts/hooks' "$CMD_FILE"
assert "Reports results" grep -q 'Report' "$CMD_FILE"

echo ""
echo "Results: $passed passed, $failed failed"
[[ "$failed" -eq 0 ]]

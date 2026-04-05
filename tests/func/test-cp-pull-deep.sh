#!/usr/bin/env bash
# Functional tests for /cp:pull command
# Validates the command file structure and content.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CMD_FILE="$SCRIPT_DIR/../../configs/global/.claude/commands/cp/pull.md"

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

echo "=== Tests: cp:pull command ==="

assert "Command file exists" test -f "$CMD_FILE"
assert "Has name in frontmatter" grep -q '^name: cp:pull' "$CMD_FILE"
assert "Has description in frontmatter" grep -q '^description:' "$CMD_FILE"
assert "Finds playbook location" grep -q 'Find Playbook' "$CMD_FILE"
assert "Detects installation mode" grep -q 'MODE=' "$CMD_FILE"
assert "Detects local-clone mode" grep -q 'local-clone' "$CMD_FILE"
assert "Detects submodule mode" grep -q 'submodule' "$CMD_FILE"
assert "Detects REPLACE mode" grep -q 'REPLACE' "$CMD_FILE"
assert "Detects MERGE mode" grep -q 'MERGE' "$CMD_FILE"
assert "Pulls from origin main" grep -q 'git pull origin main' "$CMD_FILE"
assert "Handles symlink conflicts" grep -q 'Symlink Conflicts' "$CMD_FILE"
assert "Supports MERGE mode refresh" grep -q 'MERGE Mode' "$CMD_FILE"

echo ""
echo "Results: $passed passed, $failed failed"
[[ "$failed" -eq 0 ]]

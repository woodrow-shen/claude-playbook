#!/usr/bin/env bash
# Functional tests for /clean-dev-cache command
# Validates the command file structure and content.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CMD_FILE="$SCRIPT_DIR/../../configs/global/.claude/commands/clean-dev-cache.md"

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

echo "=== Tests: clean-dev-cache command ==="

assert "Command file exists" test -f "$CMD_FILE"
assert "Has name in frontmatter" grep -q '^name: clean-dev-cache' "$CMD_FILE"
assert "Has description in frontmatter" grep -q '^description:' "$CMD_FILE"
assert "Stops Docker Compose" grep -q 'docker compose down' "$CMD_FILE"
assert "Removes __pycache__" grep -q '__pycache__' "$CMD_FILE"
assert "Removes node_modules" grep -q 'node_modules' "$CMD_FILE"
assert "Prunes Docker build cache" grep -q 'docker builder prune' "$CMD_FILE"

echo ""
echo "Results: $passed passed, $failed failed"
[[ "$failed" -eq 0 ]]

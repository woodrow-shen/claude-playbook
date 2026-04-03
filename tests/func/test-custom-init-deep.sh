#!/usr/bin/env bash
# Functional tests for /custom-init command
# Validates the command file structure and content.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CMD_FILE="$SCRIPT_DIR/../../configs/global/.claude/commands/custom-init.md"

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

echo "=== Tests: custom-init command ==="

assert "Command file exists" test -f "$CMD_FILE"
assert "Has name in frontmatter" grep -q '^name: custom-init' "$CMD_FILE"
assert "Has description in frontmatter" grep -q '^description:' "$CMD_FILE"
assert "Has Phase 0: Initialization" grep -q 'Phase 0: Initialization' "$CMD_FILE"
assert "Has Phase 1: Project Analysis" grep -q 'Phase 1: Project Analysis' "$CMD_FILE"
assert "Generates CLAUDE.md" grep -q 'CLAUDE.md' "$CMD_FILE"
assert "Detects project type" grep -q 'Detect project type' "$CMD_FILE"

echo ""
echo "Results: $passed passed, $failed failed"
[[ "$failed" -eq 0 ]]

#!/usr/bin/env bash
# Functional tests for /pre-commit command
# Validates the command file structure and content.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CMD_FILE="$SCRIPT_DIR/../../configs/global/.claude/commands/pre-commit.md"

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

echo "=== Tests: pre-commit command ==="

assert "Command file exists" test -f "$CMD_FILE"
assert "Has name in frontmatter" grep -q '^name: pre-commit' "$CMD_FILE"
assert "Has description in frontmatter" grep -q '^description:' "$CMD_FILE"
assert "Detects pre-commit framework" grep -q 'pre-commit-config.yaml' "$CMD_FILE"
assert "Detects manual git hooks" grep -q '.git/hooks' "$CMD_FILE"
assert "Runs pre-commit run --all-files" grep -q 'pre-commit run --all-files' "$CMD_FILE"
assert "Has SAFETY comment for bash invocation" grep -q '# SAFETY:' "$CMD_FILE"
assert "Has input validation section" grep -q '## Input Validation' "$CMD_FILE"
assert "Has error handling section" grep -q '## Error Handling' "$CMD_FILE"
assert "Has results reporting step" grep -q 'Report results' "$CMD_FILE"

echo ""
echo "Results: $passed passed, $failed failed"
[[ "$failed" -eq 0 ]]

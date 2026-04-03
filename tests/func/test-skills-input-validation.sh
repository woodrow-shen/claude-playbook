#!/usr/bin/env bash
# Functional tests for input-validation skill
# Validates the file structure and content.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FILE="$SCRIPT_DIR/../../configs/global/.claude/skills/input-validation/SKILL.md"

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

echo "=== Tests: input-validation skill ==="

assert "File exists" test -f "$FILE"
assert "Has name in frontmatter" grep -q '^name: input-validation' "$FILE"
assert "Has description in frontmatter" grep -q '^description:' "$FILE"
assert "Has branch name validation" grep -q 'Branch Name Validation' "$FILE"
assert "Has version number validation" grep -q 'Version Number Validation' "$FILE"
assert "Has path validation" grep -q 'Path Validation' "$FILE"
assert "Has best practices section" grep -q 'Best Practices' "$FILE"

echo ""
echo "Results: $passed passed, $failed failed"
[[ "$failed" -eq 0 ]]

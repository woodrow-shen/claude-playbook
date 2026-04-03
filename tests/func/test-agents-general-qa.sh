#!/usr/bin/env bash
# Functional tests for general-qa agent
# Validates the file structure and content.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FILE="$SCRIPT_DIR/../../configs/global/.claude/agents/general-qa.md"

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

echo "=== Tests: general-qa agent ==="

assert "File exists" test -f "$FILE"
assert "Has name in frontmatter" grep -q '^name: general-qa' "$FILE"
assert "Has description in frontmatter" grep -q '^description:' "$FILE"
assert "Has test strategy section" grep -q 'Test Strategy' "$FILE"
assert "Has test automation section" grep -q 'Test Automation' "$FILE"
assert "Has edge case and risk analysis section" grep -q 'Edge Case' "$FILE"
assert "Has project documentation awareness" grep -q 'Project Documentation Awareness' "$FILE"

echo ""
echo "Results: $passed passed, $failed failed"
[[ "$failed" -eq 0 ]]

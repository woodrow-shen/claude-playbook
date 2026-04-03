#!/usr/bin/env bash
# Functional tests for general-fullstack-developer agent
# Validates the file structure and content.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FILE="$SCRIPT_DIR/../../configs/global/.claude/agents/general-fullstack-developer.md"

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

echo "=== Tests: general-fullstack-developer agent ==="

assert "File exists" test -f "$FILE"
assert "Has name in frontmatter" grep -q '^name: general-fullstack-developer' "$FILE"
assert "Has description in frontmatter" grep -q '^description:' "$FILE"
assert "Has end-to-end feature development section" grep -q 'End-to-End Feature Development' "$FILE"
assert "Has backend development section" grep -q 'Backend Development' "$FILE"
assert "Has frontend development section" grep -q 'Frontend Development' "$FILE"
assert "Has project documentation awareness" grep -q 'Project Documentation Awareness' "$FILE"

echo ""
echo "Results: $passed passed, $failed failed"
[[ "$failed" -eq 0 ]]

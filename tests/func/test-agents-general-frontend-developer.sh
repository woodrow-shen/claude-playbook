#!/usr/bin/env bash
# Functional tests for general-frontend-developer agent
# Validates the file structure and content.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FILE="$SCRIPT_DIR/../../configs/global/.claude/agents/general-frontend-developer.md"

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

echo "=== Tests: general-frontend-developer agent ==="

assert "File exists" test -f "$FILE"
assert "Has name in frontmatter" grep -q '^name: general-frontend-developer' "$FILE"
assert "Has description in frontmatter" grep -q '^description:' "$FILE"
assert "Has accessibility standards expertise" grep -q 'Accessibility Standards' "$FILE"
assert "Has performance optimization expertise" grep -q 'Performance Optimization' "$FILE"
assert "Has responsive design expertise" grep -q 'Responsive Design' "$FILE"
assert "Has project documentation awareness" grep -q 'Project Documentation Awareness' "$FILE"

echo ""
echo "Results: $passed passed, $failed failed"
[[ "$failed" -eq 0 ]]

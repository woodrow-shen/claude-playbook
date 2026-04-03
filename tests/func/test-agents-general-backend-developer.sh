#!/usr/bin/env bash
# Functional tests for general-backend-developer agent
# Validates the file structure and content.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FILE="$SCRIPT_DIR/../../configs/global/.claude/agents/general-backend-developer.md"

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

echo "=== Tests: general-backend-developer agent ==="

assert "File exists" test -f "$FILE"
assert "Has name in frontmatter" grep -q '^name: general-backend-developer' "$FILE"
assert "Has description in frontmatter" grep -q '^description:' "$FILE"
assert "Has API design section" grep -q 'API Design' "$FILE"
assert "Has database architecture section" grep -q 'Database Architecture' "$FILE"
assert "Has monitoring and observability section" grep -q 'Monitoring & Observability' "$FILE"
assert "Has project documentation awareness" grep -q 'Project Documentation Awareness' "$FILE"

echo ""
echo "Results: $passed passed, $failed failed"
[[ "$failed" -eq 0 ]]

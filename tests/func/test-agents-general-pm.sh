#!/usr/bin/env bash
# Functional tests for general-pm agent
# Validates the file structure and content.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FILE="$SCRIPT_DIR/../../configs/global/.claude/agents/general-pm.md"

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

echo "=== Tests: general-pm agent ==="

assert "File exists" test -f "$FILE"
assert "Has name in frontmatter" grep -q '^name: general-pm' "$FILE"
assert "Has description in frontmatter" grep -q '^description:' "$FILE"
assert "Has issue creation section" grep -q 'Issue Creation' "$FILE"
assert "Has acceptance criteria with Gherkin" grep -q 'Gherkin' "$FILE"
assert "Has definition of done section" grep -q 'Definition of Done' "$FILE"
assert "Has project documentation awareness" grep -q 'Project Documentation Awareness' "$FILE"

echo ""
echo "Results: $passed passed, $failed failed"
[[ "$failed" -eq 0 ]]

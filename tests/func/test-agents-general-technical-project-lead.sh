#!/usr/bin/env bash
# Functional tests for general-technical-project-lead agent
# Validates the file structure and content.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FILE="$SCRIPT_DIR/../../configs/global/.claude/agents/general-technical-project-lead.md"

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

echo "=== Tests: general-technical-project-lead agent ==="

assert "File exists" test -f "$FILE"
assert "Has name in frontmatter" grep -q '^name: general-technical-project-lead' "$FILE"
assert "Has description in frontmatter" grep -q '^description:' "$FILE"
assert "Has performance analysis responsibility" grep -q 'Performance Analysis' "$FILE"
assert "Has security assessment responsibility" grep -q 'Security Assessment' "$FILE"
assert "Has risk mitigation responsibility" grep -q 'Risk Mitigation' "$FILE"
assert "Has project documentation awareness" grep -q 'Project Documentation Awareness' "$FILE"

echo ""
echo "Results: $passed passed, $failed failed"
[[ "$failed" -eq 0 ]]

#!/usr/bin/env bash
# Functional tests for general-code-quality-debugger agent
# Validates the file structure and content.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FILE="$SCRIPT_DIR/../../configs/global/.claude/agents/general-code-quality-debugger.md"

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

echo "=== Tests: general-code-quality-debugger agent ==="

assert "File exists" test -f "$FILE"
assert "Has name in frontmatter" grep -q '^name: general-code-quality-debugger' "$FILE"
assert "Has description in frontmatter" grep -q '^description:' "$FILE"
assert "Has code quality analysis section" grep -q 'Code Quality Analysis' "$FILE"
assert "Has systematic debugging methodology" grep -q 'Systematic Debugging Methodology' "$FILE"
assert "Has refactoring section" grep -q 'Refactoring and Technical Debt' "$FILE"
assert "Has project documentation awareness" grep -q 'Project Documentation Awareness' "$FILE"

echo ""
echo "Results: $passed passed, $failed failed"
[[ "$failed" -eq 0 ]]

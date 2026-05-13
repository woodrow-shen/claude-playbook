#!/usr/bin/env bash
# Functional tests for rules skill — validates file structure + frontmatter.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FILE="$SCRIPT_DIR/../../configs/openra2-rust/.claude/skills/rules/SKILL.md"

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

echo "=== Tests: rules skill ==="

assert "File exists" test -f "$FILE"
assert "Has name in frontmatter" grep -q '^name: rules' "$FILE"
assert "Has description in frontmatter" grep -q '^description:' "$FILE"
assert "Non-empty body" test "$(wc -l < "$FILE")" -gt 5

echo ""
echo "Results: $passed passed, $failed failed"
[[ $failed -eq 0 ]] || exit 1

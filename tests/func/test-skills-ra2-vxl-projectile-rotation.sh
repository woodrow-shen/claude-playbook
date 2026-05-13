#!/usr/bin/env bash
# Functional tests for ra2-vxl-projectile-rotation skill — validates file structure + frontmatter.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FILE="$SCRIPT_DIR/../../configs/openra2-rust/.claude/skills/ra2-vxl-projectile-rotation/SKILL.md"

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

echo "=== Tests: ra2-vxl-projectile-rotation skill ==="

assert "File exists" test -f "$FILE"
assert "Has name in frontmatter" grep -q '^name: ra2-vxl-projectile-rotation' "$FILE"
assert "Has description in frontmatter" grep -q '^description:' "$FILE"
assert "Non-empty body" test "$(wc -l < "$FILE")" -gt 5

echo ""
echo "Results: $passed passed, $failed failed"
[[ $failed -eq 0 ]] || exit 1

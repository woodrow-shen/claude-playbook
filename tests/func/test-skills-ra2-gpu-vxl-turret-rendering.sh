#!/usr/bin/env bash
# Functional tests for ra2-gpu-vxl-turret-rendering skill
# Validates the file structure and content.
# Note: This skill has NO SKILL-zh.md.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FILE="$SCRIPT_DIR/../../configs/openra2-rust/.claude/skills/ra2-gpu-vxl-turret-rendering/SKILL.md"

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

echo "=== Tests: ra2-gpu-vxl-turret-rendering skill ==="

assert "File exists" test -f "$FILE"
assert "Has name in frontmatter" grep -q '^name: ra2-gpu-vxl-turret-rendering' "$FILE"
assert "Has description in frontmatter" grep -q '^description:' "$FILE"
assert "Has body facing rule" grep -q 'Never Apply Body Facing' "$FILE"
assert "Has +5/+15 offset rule" grep -q '+5/+15 Pixel Offset' "$FILE"
assert "Has debug checklist" grep -q 'Debug Checklist' "$FILE"

echo ""
echo "Results: $passed passed, $failed failed"
[[ "$failed" -eq 0 ]]

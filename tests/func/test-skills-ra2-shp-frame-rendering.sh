#!/usr/bin/env bash
# Functional tests for ra2-shp-frame-rendering skill
# Validates the file structure and content.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FILE="$SCRIPT_DIR/../../configs/openra2-rust/.claude/skills/ra2-shp-frame-rendering/SKILL.md"
FILE_ZH="$SCRIPT_DIR/../../configs/openra2-rust/.claude/skills/ra2-shp-frame-rendering/SKILL-zh.md"

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

echo "=== Tests: ra2-shp-frame-rendering skill ==="

assert "File exists" test -f "$FILE"
assert "Has name in frontmatter" grep -q '^name: ra2-shp-frame-rendering' "$FILE"
assert "Has description in frontmatter" grep -q '^description:' "$FILE"
assert "Has transparent pixels blocking problem" grep -q 'Transparent Pixels Block Objects' "$FILE"
assert "Has FrameOffset persistence problem" grep -q 'FrameOffset Lost Every Frame' "$FILE"
assert "Has bridge .tem exception" grep -q 'Bridge \.tem Files' "$FILE"

echo "--- SKILL-zh.md ---"
assert "Chinese translation exists" test -f "$FILE_ZH"
assert "Chinese file has name in frontmatter" grep -q '^name: ra2-shp-frame-rendering' "$FILE_ZH"
assert "Chinese file has description in frontmatter" grep -q '^description:' "$FILE_ZH"

echo ""
echo "Results: $passed passed, $failed failed"
[[ "$failed" -eq 0 ]]

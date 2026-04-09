#!/usr/bin/env bash
# Functional tests for ra2-isometric-coordinates skill
# Validates the file structure and content.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FILE="$SCRIPT_DIR/../../configs/openra2-rust/.claude/skills/ra2-isometric-coordinates/SKILL.md"
FILE_ZH="$SCRIPT_DIR/../../configs/openra2-rust/.claude/skills/ra2-isometric-coordinates/SKILL-zh.md"

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

echo "=== Tests: ra2-isometric-coordinates skill ==="

assert "File exists" test -f "$FILE"
assert "Has name in frontmatter" grep -q '^name: ra2-isometric-coordinates' "$FILE"
assert "Has description in frontmatter" grep -q '^description:' "$FILE"
assert "Has coordinate types section" grep -q '## Coordinate Types' "$FILE"
assert "Has 15px Y mismatch problem" grep -q '15px Y Mismatch' "$FILE"
assert "Has MPos parity section" grep -q 'MPos Parity' "$FILE"

echo "--- SKILL-zh.md ---"
assert "Chinese translation exists" test -f "$FILE_ZH"
assert "Chinese file has name in frontmatter" grep -q '^name: ra2-isometric-coordinates' "$FILE_ZH"
assert "Chinese file has description in frontmatter" grep -q '^description:' "$FILE_ZH"

echo ""
echo "Results: $passed passed, $failed failed"
[[ "$failed" -eq 0 ]]

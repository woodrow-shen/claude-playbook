#!/usr/bin/env bash
# Functional tests for ebpf-programs skill
# Validates the SKILL.md structure and frontmatter.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FILE="$SCRIPT_DIR/../../configs/linux/.claude/skills/ebpf-programs/SKILL.md"

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

echo "=== Tests: ebpf-programs skill ==="

assert "File exists" test -f "$FILE"
assert "Has name in frontmatter" grep -q '^name: ebpf-programs$' "$FILE"
assert "Has description in frontmatter" grep -q '^description:' "$FILE"
assert "Has realm in frontmatter" grep -q '^realm:' "$FILE"
assert "Has Learning Objectives section" grep -q '^## Learning Objectives' "$FILE"
assert "Has Core Concepts section" grep -q '^## Core Concepts' "$FILE"
assert "Has Code Walkthrough section" grep -q '^## Code Walkthrough' "$FILE"
assert "Has Hands-On Challenges section" grep -q '^## Hands-On Challenges' "$FILE"
assert "Has Verification Criteria section" grep -q '^## Verification Criteria' "$FILE"

echo ""
echo "Results: $passed passed, $failed failed"
[[ "$failed" -eq 0 ]]

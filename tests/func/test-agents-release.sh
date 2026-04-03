#!/usr/bin/env bash
# Functional tests for release agent
# Validates the file structure and content.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FILE="$SCRIPT_DIR/../../configs/global/.claude/agents/release.md"

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

echo "=== Tests: release agent ==="

assert "File exists" test -f "$FILE"
assert "Has name in frontmatter" grep -q '^name: release' "$FILE"
assert "Has description in frontmatter" grep -q '^description:' "$FILE"
assert "Has validate operation" grep -q 'Operation: Validate' "$FILE"
assert "Has prepare operation" grep -q 'Operation: Prepare' "$FILE"
assert "Has publish operation" grep -q 'Operation: Publish' "$FILE"
assert "References CHANGELOG.md" grep -q 'CHANGELOG.md' "$FILE"

echo ""
echo "Results: $passed passed, $failed failed"
[[ "$failed" -eq 0 ]]

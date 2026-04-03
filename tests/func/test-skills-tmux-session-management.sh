#!/usr/bin/env bash
# Functional tests for tmux-session-management skill
# Validates the file structure and content.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FILE="$SCRIPT_DIR/../../configs/global/.claude/skills/tmux-session-management/SKILL.md"

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

echo "=== Tests: tmux-session-management skill ==="

assert "File exists" test -f "$FILE"
assert "Has name in frontmatter" grep -q '^name: tmux-session-management' "$FILE"
assert "Has description in frontmatter" grep -q '^description:' "$FILE"
assert "Has session commands reference" grep -q 'Session Commands Reference' "$FILE"
assert "Has debugging workflow section" grep -q 'Debugging Workflow' "$FILE"
assert "Has keyboard shortcuts section" grep -q 'Keyboard Shortcuts' "$FILE"
assert "Has quick reference section" grep -q 'Quick Reference' "$FILE"

echo ""
echo "Results: $passed passed, $failed failed"
[[ "$failed" -eq 0 ]]

#!/usr/bin/env bash
# Functional tests for monitor agent
# Validates the file structure and content.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FILE="$SCRIPT_DIR/../../configs/global/.claude/agents/monitor.md"

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

echo "=== Tests: monitor agent ==="

assert "File exists" test -f "$FILE"
assert "Has name in frontmatter" grep -q '^name: monitor' "$FILE"
assert "Has description in frontmatter" grep -q '^description:' "$FILE"
assert "Has validate inputs step" grep -q 'Validate Inputs' "$FILE"
assert "Has monitoring loop step" grep -q 'Monitoring Loop' "$FILE"
assert "Has report results step" grep -q 'Report Results' "$FILE"
assert "References PID and log file" grep -q 'PID_FILE' "$FILE"

echo ""
echo "Results: $passed passed, $failed failed"
[[ "$failed" -eq 0 ]]

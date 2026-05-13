#!/usr/bin/env bash
# Functional tests for the openra2-rust /run-all-auto command.
# Validates file structure + that the documented 75-test AUTO smoke
# matrix (Phases 23-28l, AUTO_FRAME convention, WAYLAND_DISPLAY
# requirement, RA2_MAP per row, baseline-noise allow-list) is present.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CMD_FILE="$SCRIPT_DIR/../../configs/openra2-rust/.claude/commands/run-all-auto.md"

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

echo "=== Tests: openra2-rust /run-all-auto command ==="

assert "Command file exists" test -f "$CMD_FILE"
assert "File is not empty" test -s "$CMD_FILE"
assert "Has Run All AUTO heading" grep -qE '^# Run All AUTO' "$CMD_FILE"
assert "Has Execution section" grep -qE '^## Execution' "$CMD_FILE"
assert "Documents 75-test count" grep -qE '\b75\b' "$CMD_FILE"
assert "Covers Phases 23-28l" grep -qE 'Phases? 23.*28l' "$CMD_FILE"
assert "Documents AUTO_FRAME convention" grep -q 'AUTO_FRAME' "$CMD_FILE"
assert "Documents AUTO_SCREENSHOT pairing" grep -q 'AUTO_SCREENSHOT' "$CMD_FILE"
assert "Requires WAYLAND_DISPLAY for headless" grep -q 'WAYLAND_DISPLAY' "$CMD_FILE"
assert "Documents RA2_MAP per test row" grep -q 'RA2_MAP' "$CMD_FILE"
assert "Lists baseline noise allow-list" grep -qiE 'baseline noise|known.*noise' "$CMD_FILE"
assert "Has camera preset table (CAM_CPOS)" grep -q 'CAM_CPOS' "$CMD_FILE"
assert "Has CAM_ZOOM column" grep -q 'CAM_ZOOM' "$CMD_FILE"

echo ""
echo "Results: $passed passed, $failed failed"
[[ "$failed" -eq 0 ]]

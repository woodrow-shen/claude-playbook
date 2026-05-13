#!/usr/bin/env bash
# Functional tests for the openra2-rust /fps-bench command.
# Validates file structure + that the documented FPS_BENCH bench flow
# (AUTO_PATROL + window/cumulative/min/max + A/B mode) is present.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CMD_FILE="$SCRIPT_DIR/../../configs/openra2-rust/.claude/commands/fps-bench.md"

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

echo "=== Tests: openra2-rust /fps-bench command ==="

assert "Command file exists" test -f "$CMD_FILE"
assert "File is not empty" test -s "$CMD_FILE"
assert "Has FPS Benchmark heading" grep -qE '^# FPS Benchmark' "$CMD_FILE"
assert "Has Usage section" grep -qE '^## Usage' "$CMD_FILE"
assert "Has Input Validation section" grep -qE '^## Input Validation' "$CMD_FILE"
assert "Has Step sections (secure template)" grep -qE '^## Step [0-9]+: ' "$CMD_FILE"
assert "Documents AUTO_PATROL bench scene" grep -qi 'AUTO_PATROL' "$CMD_FILE"
assert "References FPS_BENCH instrumentation env var" grep -q 'FPS_BENCH' "$CMD_FILE"
assert "Mentions window-average / cumulative-average metrics" grep -qiE 'window.average|cumulative.average' "$CMD_FILE"
assert "Documents A/B mode for commit comparison" grep -qE 'A/B mode' "$CMD_FILE"
assert "Mentions min and max FPS" grep -qiE 'min.*max|max.*min' "$CMD_FILE"

echo ""
echo "Results: $passed passed, $failed failed"
[[ "$failed" -eq 0 ]]

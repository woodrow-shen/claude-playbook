#!/usr/bin/env bash
# Functional tests for general-devops agent
# Validates the file structure and content.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FILE="$SCRIPT_DIR/../../configs/global/.claude/agents/general-devops.md"

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

echo "=== Tests: general-devops agent ==="

assert "File exists" test -f "$FILE"
assert "Has name in frontmatter" grep -q '^name: general-devops' "$FILE"
assert "Has description in frontmatter" grep -q '^description:' "$FILE"
assert "Has infrastructure as code section" grep -q 'Infrastructure as Code' "$FILE"
assert "Has CI/CD pipeline section" grep -q 'CI/CD Pipeline' "$FILE"
assert "Has container orchestration section" grep -q 'Container Orchestration' "$FILE"
assert "Has project documentation awareness" grep -q 'Project Documentation Awareness' "$FILE"

echo ""
echo "Results: $passed passed, $failed failed"
[[ "$failed" -eq 0 ]]

#!/usr/bin/env bash
# Functional tests for check-commit-msg.sh hook.
# Validates commit message format enforcement: scope prefix,
# lowercase, no trailing period, length, imperative mood, signed-off-by.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
HOOK="$REPO_ROOT/scripts/hooks/check-commit-msg.sh"

passed=0
failed=0

assert_pass() {
    local desc="$1"
    echo "  PASS: $desc"
    ((passed++)) || true
}

assert_fail() {
    local desc="$1"
    echo "  FAIL: $desc"
    ((failed++)) || true
}

# Helper: run hook with a commit message, expect success (exit 0)
expect_ok() {
    local desc="$1"
    local msg="$2"
    local tmpfile
    tmpfile=$(mktemp)
    echo -e "$msg" > "$tmpfile"
    if bash "$HOOK" "$tmpfile" >/dev/null 2>&1; then
        assert_pass "$desc"
    else
        assert_fail "$desc (expected pass, got fail)"
    fi
    rm -f "$tmpfile"
}

# Helper: run hook with a commit message, expect failure (exit non-zero)
expect_fail() {
    local desc="$1"
    local msg="$2"
    local tmpfile
    tmpfile=$(mktemp)
    echo -e "$msg" > "$tmpfile"
    if bash "$HOOK" "$tmpfile" >/dev/null 2>&1; then
        assert_fail "$desc (expected fail, got pass)"
    else
        assert_pass "$desc"
    fi
    rm -f "$tmpfile"
}

echo "=== Tests: check-commit-msg.sh ==="

# --- Valid messages ---
echo ""
echo "--- Valid messages ---"

expect_ok "simple valid message" \
    "claude: add new feature\n\nSigned-off-by: Test <test@test.com>"

expect_ok "config scope" \
    "claude/configs/global: update commit command\n\nSigned-off-by: Test <test@test.com>"

expect_ok "docs scope" \
    "claude/docs: update overview guide\n\nSigned-off-by: Test <test@test.com>"

expect_ok "scripts scope" \
    "claude/scripts: fix symlink handling\n\nSigned-off-by: Test <test@test.com>"

expect_ok "tests scope" \
    "claude/tests: add commit message tests\n\nSigned-off-by: Test <test@test.com>"

expect_ok "merge commit skipped" \
    "Merge branch 'feature' into main"

expect_ok "revert commit skipped" \
    "Revert \"claude: bad change\""

# --- Scope prefix ---
echo ""
echo "--- Scope prefix ---"

expect_fail "missing scope prefix" \
    "add new feature\n\nSigned-off-by: Test <test@test.com>"

expect_fail "wrong scope prefix" \
    "feat: add new feature\n\nSigned-off-by: Test <test@test.com>"

# --- Lowercase ---
echo ""
echo "--- Lowercase description ---"

expect_fail "uppercase description" \
    "claude: Add new feature\n\nSigned-off-by: Test <test@test.com>"

expect_fail "uppercase config scope" \
    "claude/configs/global: Update command\n\nSigned-off-by: Test <test@test.com>"

# --- Trailing period ---
echo ""
echo "--- No trailing period ---"

expect_fail "trailing period" \
    "claude: add new feature.\n\nSigned-off-by: Test <test@test.com>"

# --- Length ---
echo ""
echo "--- Subject line length ---"

expect_fail "subject >72 chars" \
    "claude/configs/global: this is a very long commit message description that definitely exceeds limit\n\nSigned-off-by: Test <test@test.com>"

expect_ok "subject at 50 chars" \
    "claude: add feature for short msg test here ok\n\nSigned-off-by: Test <test@test.com>"

# --- Imperative mood ---
echo ""
echo "--- Imperative mood ---"

expect_fail "past tense: added" \
    "claude: added new feature\n\nSigned-off-by: Test <test@test.com>"

expect_fail "past tense: fixed" \
    "claude: fixed broken symlink\n\nSigned-off-by: Test <test@test.com>"

expect_fail "third person: adds" \
    "claude: adds new feature\n\nSigned-off-by: Test <test@test.com>"

expect_fail "third person: updates" \
    "claude: updates the readme\n\nSigned-off-by: Test <test@test.com>"

expect_fail "past tense: removed" \
    "claude: removed old config\n\nSigned-off-by: Test <test@test.com>"

expect_fail "past tense: refactored" \
    "claude: refactored validation logic\n\nSigned-off-by: Test <test@test.com>"

# --- Signed-off-by ---
echo ""
echo "--- Signed-off-by ---"

expect_fail "missing signed-off-by" \
    "claude: add new feature"

expect_fail "wrong signed-off format" \
    "claude: add new feature\n\nSigned-off: Test <test@test.com>"

# --- Summary ---
echo ""
echo "=== Summary ==="
echo "Results: $passed passed, $failed failed"
[[ "$failed" -eq 0 ]]

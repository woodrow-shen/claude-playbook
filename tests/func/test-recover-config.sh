#!/usr/bin/env bash
# Functional tests for scripts/setup/recover-config.sh
# Tests recovery of broken symlinks, missing .gitignore entries, and detection logic.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/helpers/test-helpers.sh"

setup_test_env

echo "=== Tests: recover-config.sh ==="

# Helper: set up a local-clone target with REPLACE-mode symlinks.
# Creates .claude-playbook/ clone and symlinks for CLAUDE.md and .claude.
# Args: $1 = mock playbook path, $2 = target repo path, $3 = config name
setup_local_clone_target() {
    local mock_pb="$1"
    local target="$2"
    local config="${3:-debugging}"

    create_mock_target_repo "$target"
    git clone -q "$mock_pb" "$target/.claude-playbook"
    ln -s ".claude-playbook/configs/$config/CLAUDE.md" "$target/CLAUDE.md"
    ln -s ".claude-playbook/configs/$config/.claude" "$target/.claude"
}

# Shared mock playbook
MOCK_PB="$TEST_TMPDIR/playbook"
create_mock_playbook "$MOCK_PB"

RECOVER="$MOCK_PB/scripts/setup/recover-config.sh"

# --------------------------------------------------------------------------
# Test 1: Fixes broken CLAUDE.md symlink (REPLACE mode, local-clone)
# --------------------------------------------------------------------------
echo ""
echo "--- Test 1: Fixes broken CLAUDE.md symlink (REPLACE mode, local-clone) ---"
TARGET="$TEST_TMPDIR/t1"
setup_local_clone_target "$MOCK_PB" "$TARGET"

# Break CLAUDE.md symlink
rm "$TARGET/CLAUDE.md"
ln -sf /nonexistent "$TARGET/CLAUDE.md"

output=$(bash "$RECOVER" "$TARGET" 2>&1)
rc=$?

assert_exit_code "recover exits 0" "0" "$rc"
assert_symlink_valid "CLAUDE.md is now a valid symlink" "$TARGET/CLAUDE.md"

# --------------------------------------------------------------------------
# Test 2: Fixes broken .claude/ symlink (REPLACE mode)
# --------------------------------------------------------------------------
echo ""
echo "--- Test 2: Fixes broken .claude/ symlink (REPLACE mode) ---"
TARGET="$TEST_TMPDIR/t2"
setup_local_clone_target "$MOCK_PB" "$TARGET"

# Break .claude symlink
rm "$TARGET/.claude"
ln -sf /nonexistent "$TARGET/.claude"

output=$(bash "$RECOVER" "$TARGET" 2>&1)
rc=$?

assert_exit_code "recover exits 0" "0" "$rc"
assert_symlink_valid ".claude is now a valid symlink" "$TARGET/.claude"

# --------------------------------------------------------------------------
# Test 3: Creates missing CLAUDE.md symlink
# --------------------------------------------------------------------------
echo ""
echo "--- Test 3: Creates missing CLAUDE.md symlink ---"
TARGET="$TEST_TMPDIR/t3"
setup_local_clone_target "$MOCK_PB" "$TARGET"

# Remove CLAUDE.md but keep .claude (so config name is detectable)
rm "$TARGET/CLAUDE.md"

output=$(bash "$RECOVER" "$TARGET" 2>&1)
rc=$?

assert_exit_code "recover exits 0" "0" "$rc"
assert_symlink_valid "CLAUDE.md created as valid symlink" "$TARGET/CLAUDE.md"

# --------------------------------------------------------------------------
# Test 4: Creates missing .claude/ symlink
# --------------------------------------------------------------------------
echo ""
echo "--- Test 4: Creates missing .claude/ symlink ---"
TARGET="$TEST_TMPDIR/t4"
setup_local_clone_target "$MOCK_PB" "$TARGET"

# Remove .claude but keep CLAUDE.md (so config name is detectable)
rm "$TARGET/.claude"

output=$(bash "$RECOVER" "$TARGET" 2>&1)
rc=$?

assert_exit_code "recover exits 0" "0" "$rc"
assert_symlink_valid ".claude created as valid symlink" "$TARGET/.claude"

# --------------------------------------------------------------------------
# Test 5: Fixes broken individual symlinks in MERGE mode
# --------------------------------------------------------------------------
echo ""
echo "--- Test 5: Fixes broken individual symlinks in MERGE mode ---"
TARGET="$TEST_TMPDIR/t5"
create_mock_target_repo "$TARGET"
git clone -q "$MOCK_PB" "$TARGET/.claude-playbook"

# Set up MERGE mode: .claude is a real directory
mkdir -p "$TARGET/.claude/rules"

# Valid CLAUDE.md symlink so config name is detectable
ln -s ".claude-playbook/configs/debugging/CLAUDE.md" "$TARGET/CLAUDE.md"

# Create a broken symlink for debug-rule.md
ln -sf /nonexistent "$TARGET/.claude/rules/debug-rule.md"

output=$(bash "$RECOVER" "$TARGET" 2>&1)
rc=$?

assert_exit_code "recover exits 0" "0" "$rc"
assert_symlink_valid "debug-rule.md is now a valid symlink" "$TARGET/.claude/rules/debug-rule.md"

# --------------------------------------------------------------------------
# Test 6: Adds missing .gitignore entry for local-clone
# --------------------------------------------------------------------------
echo ""
echo "--- Test 6: Adds missing .gitignore entry for local-clone ---"
TARGET="$TEST_TMPDIR/t6"
setup_local_clone_target "$MOCK_PB" "$TARGET"

# Ensure .gitignore does NOT contain .claude-playbook/
if [[ -f "$TARGET/.gitignore" ]]; then
    sed -i '/^\.claude-playbook\/$/d' "$TARGET/.gitignore"
fi

output=$(bash "$RECOVER" "$TARGET" 2>&1)
rc=$?

assert_exit_code "recover exits 0" "0" "$rc"
assert_grep_file ".gitignore contains .claude-playbook/" "$TARGET/.gitignore" ".claude-playbook/"

# --------------------------------------------------------------------------
# Test 7: Skips native files (does not replace)
# --------------------------------------------------------------------------
echo ""
echo "--- Test 7: Skips native files (does not replace) ---"
TARGET="$TEST_TMPDIR/t7"
create_mock_target_repo "$TARGET"
git clone -q "$MOCK_PB" "$TARGET/.claude-playbook"

# MERGE mode: .claude is a real directory
mkdir -p "$TARGET/.claude/rules"

# Valid CLAUDE.md symlink so config name is detectable
ln -s ".claude-playbook/configs/debugging/CLAUDE.md" "$TARGET/CLAUDE.md"

# Create a native file (not a symlink) for debug-rule.md
echo "Native content" > "$TARGET/.claude/rules/debug-rule.md"

output=$(bash "$RECOVER" "$TARGET" 2>&1)
rc=$?

assert_exit_code "recover exits 0" "0" "$rc"
assert_not_symlink "native file is preserved" "$TARGET/.claude/rules/debug-rule.md"
assert_output_contains "output contains [skip]" "$output" "[skip]"

# --------------------------------------------------------------------------
# Test 8: Fails when no playbook found
# --------------------------------------------------------------------------
echo ""
echo "--- Test 8: Fails when no playbook found ---"
TARGET="$TEST_TMPDIR/t8"
create_mock_target_repo "$TARGET"

output=$(bash "$RECOVER" "$TARGET" 2>&1)
rc=$?

assert_exit_code "recover exits 1 when no playbook" "1" "$rc"

report_results

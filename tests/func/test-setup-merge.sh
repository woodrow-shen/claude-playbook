#!/usr/bin/env bash
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/helpers/test-helpers.sh"

setup_test_env

MOCK_PLAYBOOK="$TEST_TMPDIR/playbook"
create_mock_playbook "$MOCK_PLAYBOOK"

MERGE_SCRIPT="$MOCK_PLAYBOOK/scripts/setup/setup-claude-merge.sh"

# -------------------------------------------------------------------------
# Test 1: Rejects "global" config
# -------------------------------------------------------------------------
echo "Test 1: Rejects global config"
mkdir -p "$TEST_TMPDIR/dummy"
output=$(bash "$MERGE_SCRIPT" global "$TEST_TMPDIR/dummy" 2>&1) && rc=$? || rc=$?
assert_exit_code "exit code 1 for global" 1 "$rc"
assert_output_contains "output contains ERROR" "$output" "ERROR"

# -------------------------------------------------------------------------
# Test 2: Rejects missing args
# -------------------------------------------------------------------------
echo ""
echo "Test 2: Rejects missing args"
output=$(bash "$MERGE_SCRIPT" 2>&1) && rc=$? || rc=$?
assert_exit_code "exit code 1 for no args" 1 "$rc"

# -------------------------------------------------------------------------
# Test 3: Creates .claude/ as real directory with individual symlinks
# -------------------------------------------------------------------------
echo ""
echo "Test 3: Creates .claude/ with individual symlinks"
TARGET="$TEST_TMPDIR/target3"
create_mock_target_repo "$TARGET"
output=$(bash "$MERGE_SCRIPT" debugging "$TARGET" 2>&1)
rc=$?
assert_exit_code "setup exits 0" 0 "$rc"
assert_dir_exists ".claude/ is a directory" "$TARGET/.claude"
assert_not_symlink ".claude/ is NOT a symlink" "$TARGET/.claude"
assert_symlink_valid ".claude/rules/debug-rule.md is valid symlink" "$TARGET/.claude/rules/debug-rule.md"
assert_symlink_valid ".claude/commands/debug-cmd.md is valid symlink" "$TARGET/.claude/commands/debug-cmd.md"
assert_symlink_valid "CLAUDE.md is valid symlink" "$TARGET/CLAUDE.md"

# -------------------------------------------------------------------------
# Test 4: Preserves existing native files (merge behavior)
# -------------------------------------------------------------------------
echo ""
echo "Test 4: Preserves existing native files"
TARGET="$TEST_TMPDIR/target4"
create_mock_target_repo "$TARGET"
mkdir -p "$TARGET/.claude/commands"
echo "local content" > "$TARGET/.claude/commands/my-local.md"
output=$(bash "$MERGE_SCRIPT" debugging "$TARGET" 2>&1)
assert_file_exists "my-local.md still exists" "$TARGET/.claude/commands/my-local.md"
assert_not_symlink "my-local.md is NOT a symlink" "$TARGET/.claude/commands/my-local.md"
assert_symlink_valid "debug-cmd.md IS a symlink" "$TARGET/.claude/commands/debug-cmd.md"

# -------------------------------------------------------------------------
# Test 5: Does not overwrite native files with same name
# -------------------------------------------------------------------------
echo ""
echo "Test 5: Does not overwrite native files with same name"
TARGET="$TEST_TMPDIR/target5"
create_mock_target_repo "$TARGET"
mkdir -p "$TARGET/.claude/rules"
echo "my custom rule" > "$TARGET/.claude/rules/debug-rule.md"
output=$(bash "$MERGE_SCRIPT" debugging "$TARGET" 2>&1)
assert_not_symlink "debug-rule.md is still a real file" "$TARGET/.claude/rules/debug-rule.md"
assert_output_contains "output contains [WARN]" "$output" "[WARN]"
assert_grep_file "content preserved" "$TARGET/.claude/rules/debug-rule.md" "my custom rule"

# -------------------------------------------------------------------------
# Test 6: Symlinks settings.json
# -------------------------------------------------------------------------
echo ""
echo "Test 6: Symlinks settings.json"
# Reuse target3 which had a clean setup
assert_symlink_valid ".claude/settings.json is valid symlink" "$TEST_TMPDIR/target3/.claude/settings.json"

# -------------------------------------------------------------------------
# Test 7: Idempotent re-run
# -------------------------------------------------------------------------
echo ""
echo "Test 7: Idempotent re-run"
TARGET="$TEST_TMPDIR/target7"
create_mock_target_repo "$TARGET"
bash "$MERGE_SCRIPT" debugging "$TARGET" >/dev/null 2>&1
output=$(bash "$MERGE_SCRIPT" debugging "$TARGET" 2>&1)
assert_output_contains "output contains [skip]" "$output" "[skip]"

# -------------------------------------------------------------------------
# Test 8: Rejects nonexistent config
# -------------------------------------------------------------------------
echo ""
echo "Test 8: Rejects nonexistent config"
TARGET="$TEST_TMPDIR/target8"
create_mock_target_repo "$TARGET"
output=$(bash "$MERGE_SCRIPT" nonexistent "$TARGET" 2>&1) && rc=$? || rc=$?
assert_exit_code "exit code 1 for nonexistent config" 1 "$rc"

echo ""
report_results

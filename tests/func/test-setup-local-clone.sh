#!/usr/bin/env bash
# Functional tests for scripts/setup/setup-claude-local-clone.sh
# Tests local clone creation and REPLACE-mode symlink installation.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/helpers/test-helpers.sh"

setup_test_env

echo "=== Tests: setup-claude-local-clone.sh ==="

# --------------------------------------------------------------------------
# Test 1: Rejects "global" config
# --------------------------------------------------------------------------
echo ""
echo "--- Test 1: Rejects global config ---"
MOCK_PB="$TEST_TMPDIR/pb1"
create_mock_playbook "$MOCK_PB"
create_bare_remote "$MOCK_PB" "$TEST_TMPDIR/pb1-bare.git"
TARGET1="$TEST_TMPDIR/target1"
create_mock_target_repo "$TARGET1"

bash "$MOCK_PB/scripts/setup/setup-claude-local-clone.sh" global "$TARGET1" >/dev/null 2>&1
rc=$?
assert_exit_code "rejects global config with exit 1" "1" "$rc"

# --------------------------------------------------------------------------
# Test 2: Clones playbook into .claude-playbook/
# --------------------------------------------------------------------------
echo ""
echo "--- Test 2: Clones playbook into .claude-playbook/ ---"
TARGET2="$TEST_TMPDIR/target2"
create_mock_target_repo "$TARGET2"

bash "$MOCK_PB/scripts/setup/setup-claude-local-clone.sh" debugging "$TARGET2" >/dev/null 2>&1
assert_dir_exists ".claude-playbook/.git is a directory" "$TARGET2/.claude-playbook/.git"
assert_dir_exists "configs/debugging/ exists in clone" "$TARGET2/.claude-playbook/configs/debugging"

# --------------------------------------------------------------------------
# Test 3: Adds .claude-playbook/ to .gitignore
# --------------------------------------------------------------------------
echo ""
echo "--- Test 3: Adds .claude-playbook/ to .gitignore ---"
assert_grep_file ".gitignore contains .claude-playbook/" "$TARGET2/.gitignore" ".claude-playbook/"

# --------------------------------------------------------------------------
# Test 4: Creates REPLACE-mode symlinks
# --------------------------------------------------------------------------
echo ""
echo "--- Test 4: Creates REPLACE-mode symlinks ---"
assert_symlink ".claude is a symlink" "$TARGET2/.claude"
assert_symlink "CLAUDE.md is a symlink" "$TARGET2/CLAUDE.md"
assert_symlink_valid ".claude symlink is valid" "$TARGET2/.claude"
assert_symlink_valid "CLAUDE.md symlink is valid" "$TARGET2/CLAUDE.md"

# --------------------------------------------------------------------------
# Test 5: Idempotent .gitignore
# --------------------------------------------------------------------------
echo ""
echo "--- Test 5: Idempotent .gitignore ---"
bash "$MOCK_PB/scripts/setup/setup-claude-local-clone.sh" debugging "$TARGET2" >/dev/null 2>&1
count=$(grep -cxF '.claude-playbook/' "$TARGET2/.gitignore")
if [[ "$count" -eq 1 ]]; then
    assert_pass ".gitignore contains exactly 1 .claude-playbook/ entry"
else
    assert_fail ".gitignore contains exactly 1 .claude-playbook/ entry (got $count)"
fi

# --------------------------------------------------------------------------
# Test 6: Idempotent clone skip
# --------------------------------------------------------------------------
echo ""
echo "--- Test 6: Idempotent clone skip ---"
TARGET6="$TEST_TMPDIR/target6"
create_mock_target_repo "$TARGET6"

bash "$MOCK_PB/scripts/setup/setup-claude-local-clone.sh" debugging "$TARGET6" >/dev/null 2>&1
output=$(bash "$MOCK_PB/scripts/setup/setup-claude-local-clone.sh" debugging "$TARGET6" 2>&1)
assert_output_contains "second run says clone already exists" "$output" "[skip] Clone already exists"

# --------------------------------------------------------------------------
# Test 7: Does not overwrite real CLAUDE.md
# --------------------------------------------------------------------------
echo ""
echo "--- Test 7: Does not overwrite real CLAUDE.md ---"
TARGET7="$TEST_TMPDIR/target7"
create_mock_target_repo "$TARGET7"
echo "# My real config" > "$TARGET7/CLAUDE.md"

output=$(bash "$MOCK_PB/scripts/setup/setup-claude-local-clone.sh" debugging "$TARGET7" 2>&1)
assert_not_symlink "CLAUDE.md is still a regular file" "$TARGET7/CLAUDE.md"
assert_output_contains "output contains [WARN] for existing CLAUDE.md" "$output" "[WARN]"

# --------------------------------------------------------------------------
# Test 8: Fails when no remote
# --------------------------------------------------------------------------
echo ""
echo "--- Test 8: Fails when no remote ---"
MOCK_PB_NOREMOTE="$TEST_TMPDIR/pb-noremote"
create_mock_playbook "$MOCK_PB_NOREMOTE"
# Do NOT create bare remote -- no origin configured
TARGET8="$TEST_TMPDIR/target8"
create_mock_target_repo "$TARGET8"

bash "$MOCK_PB_NOREMOTE/scripts/setup/setup-claude-local-clone.sh" debugging "$TARGET8" >/dev/null 2>&1
rc=$?
assert_exit_code "fails with exit 1 when no remote" "1" "$rc"

# --------------------------------------------------------------------------
# Test 9: Sparse checkout excludes other configs
# --------------------------------------------------------------------------
echo ""
echo "--- Test 9: Sparse checkout excludes other configs ---"
# Add another config to mock playbook and push to bare remote
mkdir -p "$MOCK_PB/configs/other-config/.claude"
echo "# Other" > "$MOCK_PB/configs/other-config/CLAUDE.md"
cd "$MOCK_PB" && git add -A && git commit -q -m "add other-config"
git push -q origin main 2>/dev/null

TARGET9="$TEST_TMPDIR/target9"
create_mock_target_repo "$TARGET9"
bash "$MOCK_PB/scripts/setup/setup-claude-local-clone.sh" debugging "$TARGET9" >/dev/null 2>&1

assert_dir_exists "configs/debugging/ in sparse clone" "$TARGET9/.claude-playbook/configs/debugging"
assert_dir_exists "configs/global/ in sparse clone" "$TARGET9/.claude-playbook/configs/global"
assert_dir_exists "scripts/ in sparse clone" "$TARGET9/.claude-playbook/scripts"
# other-config should be excluded by sparse checkout
if [[ ! -d "$TARGET9/.claude-playbook/configs/other-config" ]]; then
    assert_pass "configs/other-config/ excluded by sparse checkout"
else
    assert_fail "configs/other-config/ should be excluded by sparse checkout"
fi

# --------------------------------------------------------------------------
# Test 10: --no-sparse includes all configs
# --------------------------------------------------------------------------
echo ""
echo "--- Test 10: --no-sparse includes all configs ---"
TARGET10="$TEST_TMPDIR/target10"
create_mock_target_repo "$TARGET10"
bash "$MOCK_PB/scripts/setup/setup-claude-local-clone.sh" --no-sparse debugging "$TARGET10" >/dev/null 2>&1

assert_dir_exists "configs/other-config/ present with --no-sparse" "$TARGET10/.claude-playbook/configs/other-config"
assert_dir_exists "configs/debugging/ present with --no-sparse" "$TARGET10/.claude-playbook/configs/debugging"

# --------------------------------------------------------------------------
# Test 11: Hooks work after sparse checkout
# --------------------------------------------------------------------------
echo ""
echo "--- Test 11: Hooks work after sparse checkout ---"
TARGET11="$TEST_TMPDIR/target11"
create_mock_target_repo "$TARGET11"
output=$(bash "$MOCK_PB/scripts/setup/setup-claude-local-clone.sh" debugging "$TARGET11" 2>&1)

# install-hooks.sh should be present and have run
assert_dir_exists "scripts/hooks/ in sparse clone" "$TARGET11/.claude-playbook/scripts/hooks"
assert_file_exists "install-hooks.sh in sparse clone" "$TARGET11/.claude-playbook/scripts/hooks/install-hooks.sh"
assert_output_contains "hooks installed during setup" "$output" "hooks installed"

# Hooks should be installed in the clone's .git/hooks/
assert_file_exists "pre-commit hook exists" "$TARGET11/.claude-playbook/.git/hooks/pre-commit"
assert_file_exists "commit-msg hook exists" "$TARGET11/.claude-playbook/.git/hooks/commit-msg"

# --------------------------------------------------------------------------
# Test 12: Works on non-git target directory
# --------------------------------------------------------------------------
echo ""
echo "--- Test 12: Works on non-git target directory ---"
TARGET12="$TEST_TMPDIR/target12-nogit"
mkdir -p "$TARGET12"
# Intentionally do NOT git init -- bare directory only

bash "$MOCK_PB/scripts/setup/setup-claude-local-clone.sh" debugging "$TARGET12" >/dev/null 2>&1
rc=$?
assert_exit_code "non-git target succeeds with exit 0" "0" "$rc"
assert_dir_exists ".claude-playbook/ created in non-git target" "$TARGET12/.claude-playbook"
assert_symlink "CLAUDE.md symlink created in non-git target" "$TARGET12/CLAUDE.md"

# --------------------------------------------------------------------------
# Test 13: Suppresses git commit suggestion when target is not a git repo
# --------------------------------------------------------------------------
echo ""
echo "--- Test 13: Suppresses git commit suggestion on non-git target ---"
TARGET13="$TEST_TMPDIR/target13-nogit"
mkdir -p "$TARGET13"

output=$(bash "$MOCK_PB/scripts/setup/setup-claude-local-clone.sh" debugging "$TARGET13" 2>&1)
if echo "$output" | grep -q "git add .gitignore"; then
    assert_fail "non-git target should not suggest git commit"
else
    assert_pass "non-git target does not suggest git commit"
fi

report_results

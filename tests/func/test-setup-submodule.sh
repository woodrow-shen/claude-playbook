#!/usr/bin/env bash
# Functional tests for scripts/setup/setup-claude-submodule.sh
# Tests submodule addition and REPLACE-mode symlink creation.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/helpers/test-helpers.sh"

setup_test_env

MOCK_PLAYBOOK="$TEST_TMPDIR/playbook"
create_mock_playbook "$MOCK_PLAYBOOK"
create_bare_remote "$MOCK_PLAYBOOK" "$TEST_TMPDIR/playbook-bare.git"

echo "=== Tests: setup-claude-submodule.sh ==="

# --------------------------------------------------------------------------
# Test 1: Rejects "global" config
# --------------------------------------------------------------------------
echo ""
echo "--- Test 1: Rejects global config ---"
create_mock_target_repo "$TEST_TMPDIR/target1"
bash "$MOCK_PLAYBOOK/scripts/setup/setup-claude-submodule.sh" global "$TEST_TMPDIR/target1" >/dev/null 2>&1
rc=$?
assert_exit_code "exit code 1 for global config" "1" "$rc"

# --------------------------------------------------------------------------
# Test 2: Rejects missing args
# --------------------------------------------------------------------------
echo ""
echo "--- Test 2: Rejects missing args ---"
bash "$MOCK_PLAYBOOK/scripts/setup/setup-claude-submodule.sh" >/dev/null 2>&1
rc=$?
assert_exit_code "exit code 1 for missing args" "1" "$rc"

# --------------------------------------------------------------------------
# Test 3: Adds submodule and creates REPLACE-mode symlinks
# --------------------------------------------------------------------------
echo ""
echo "--- Test 3: Adds submodule and creates REPLACE-mode symlinks ---"
create_mock_target_repo "$TEST_TMPDIR/target3"
output=$(bash "$MOCK_PLAYBOOK/scripts/setup/setup-claude-submodule.sh" debugging "$TEST_TMPDIR/target3" 2>&1)
assert_dir_exists "claude-playbook/ dir exists" "$TEST_TMPDIR/target3/claude-playbook"
if [[ -d "$TEST_TMPDIR/target3/claude-playbook/.git" ]] || [[ -f "$TEST_TMPDIR/target3/claude-playbook/.git" ]]; then
    assert_pass "claude-playbook/.git exists (file or dir)"
else
    assert_fail "claude-playbook/.git exists (file or dir)"
fi
assert_symlink ".claude is a symlink" "$TEST_TMPDIR/target3/.claude"
assert_symlink "CLAUDE.md is a symlink" "$TEST_TMPDIR/target3/CLAUDE.md"
assert_symlink_valid ".claude symlink is valid" "$TEST_TMPDIR/target3/.claude"
assert_symlink_valid "CLAUDE.md symlink is valid" "$TEST_TMPDIR/target3/CLAUDE.md"

# --------------------------------------------------------------------------
# Test 4: Idempotent re-run
# --------------------------------------------------------------------------
echo ""
echo "--- Test 4: Idempotent re-run ---"
output=$(bash "$MOCK_PLAYBOOK/scripts/setup/setup-claude-submodule.sh" debugging "$TEST_TMPDIR/target3" 2>&1)
assert_output_contains "output contains skip message" "$output" "[skip] Submodule already exists"

# --------------------------------------------------------------------------
# Test 5: Does not overwrite existing .claude/ directory
# --------------------------------------------------------------------------
echo ""
echo "--- Test 5: Does not overwrite existing .claude/ directory ---"
create_mock_target_repo "$TEST_TMPDIR/target5"
mkdir -p "$TEST_TMPDIR/target5/.claude"
echo "existing content" > "$TEST_TMPDIR/target5/.claude/local-file.md"
output=$(bash "$MOCK_PLAYBOOK/scripts/setup/setup-claude-submodule.sh" debugging "$TEST_TMPDIR/target5" 2>&1)
assert_not_symlink ".claude is still a real dir" "$TEST_TMPDIR/target5/.claude"
assert_output_contains "output contains WARN for .claude" "$output" "[WARN]"

# --------------------------------------------------------------------------
# Test 6: Does not overwrite real CLAUDE.md
# --------------------------------------------------------------------------
echo ""
echo "--- Test 6: Does not overwrite real CLAUDE.md ---"
create_mock_target_repo "$TEST_TMPDIR/target6"
echo "# My custom CLAUDE.md" > "$TEST_TMPDIR/target6/CLAUDE.md"
output=$(bash "$MOCK_PLAYBOOK/scripts/setup/setup-claude-submodule.sh" debugging "$TEST_TMPDIR/target6" 2>&1)
assert_not_symlink "CLAUDE.md is still a real file" "$TEST_TMPDIR/target6/CLAUDE.md"
assert_output_contains "output contains WARN for CLAUDE.md" "$output" "[WARN]"

# --------------------------------------------------------------------------
# Test 7: Fails when no remote
# --------------------------------------------------------------------------
echo ""
echo "--- Test 7: Fails when no remote ---"
create_mock_target_repo "$TEST_TMPDIR/target7"
# Remove origin from the playbook repo
cd "$MOCK_PLAYBOOK"
git remote remove origin 2>/dev/null || true
bash "$MOCK_PLAYBOOK/scripts/setup/setup-claude-submodule.sh" debugging "$TEST_TMPDIR/target7" >/dev/null 2>&1
rc=$?
assert_exit_code "exit code 1 when no remote" "1" "$rc"
# Restore origin for cleanup
git remote add origin "file://$TEST_TMPDIR/playbook-bare.git"

# --------------------------------------------------------------------------
# Test 8: Sparse checkout excludes other configs
# --------------------------------------------------------------------------
echo ""
echo "--- Test 8: Sparse checkout excludes other configs ---"
mkdir -p "$MOCK_PLAYBOOK/configs/other-config/.claude"
echo "# Other" > "$MOCK_PLAYBOOK/configs/other-config/CLAUDE.md"
cd "$MOCK_PLAYBOOK" && git add -A && git commit -q -m "add other-config"
git push -q origin main 2>/dev/null

create_mock_target_repo "$TEST_TMPDIR/target8"
bash "$MOCK_PLAYBOOK/scripts/setup/setup-claude-submodule.sh" debugging "$TEST_TMPDIR/target8" >/dev/null 2>&1

assert_dir_exists "configs/debugging/ in sparse submodule" "$TEST_TMPDIR/target8/claude-playbook/configs/debugging"
assert_dir_exists "configs/global/ in sparse submodule" "$TEST_TMPDIR/target8/claude-playbook/configs/global"
if [[ ! -d "$TEST_TMPDIR/target8/claude-playbook/configs/other-config" ]]; then
    assert_pass "configs/other-config/ excluded by sparse checkout"
else
    assert_fail "configs/other-config/ should be excluded by sparse checkout"
fi

# --------------------------------------------------------------------------
# Test 9: --no-sparse includes all configs
# --------------------------------------------------------------------------
echo ""
echo "--- Test 9: --no-sparse includes all configs ---"
create_mock_target_repo "$TEST_TMPDIR/target9"
bash "$MOCK_PLAYBOOK/scripts/setup/setup-claude-submodule.sh" --no-sparse debugging "$TEST_TMPDIR/target9" >/dev/null 2>&1
assert_dir_exists "configs/other-config/ present with --no-sparse" "$TEST_TMPDIR/target9/claude-playbook/configs/other-config"

# --------------------------------------------------------------------------
# Test 10: Hooks work after sparse checkout
# --------------------------------------------------------------------------
echo ""
echo "--- Test 10: Hooks work after sparse checkout ---"
create_mock_target_repo "$TEST_TMPDIR/target10"
output=$(bash "$MOCK_PLAYBOOK/scripts/setup/setup-claude-submodule.sh" debugging "$TEST_TMPDIR/target10" 2>&1)

assert_dir_exists "scripts/hooks/ in sparse submodule" "$TEST_TMPDIR/target10/claude-playbook/scripts/hooks"
assert_file_exists "install-hooks.sh in sparse submodule" "$TEST_TMPDIR/target10/claude-playbook/scripts/hooks/install-hooks.sh"
assert_output_contains "hooks installed during setup" "$output" "hooks installed"

report_results

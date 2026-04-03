#!/usr/bin/env bash
# Functional tests for uninstall-claude.sh (project) and
# uninstall-global-claude.sh (global).
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/helpers/test-helpers.sh"

setup_test_env

echo "=== Tests: uninstall-claude.sh (project) ==="

# --------------------------------------------------------------------------
# Test 1: Removes symlinked CLAUDE.md
# --------------------------------------------------------------------------
echo ""
echo "--- Test 1: Removes symlinked CLAUDE.md ---"
create_mock_target_repo "$TEST_TMPDIR/target1"
MOCK_PB1="$TEST_TMPDIR/playbook1"
create_mock_playbook "$MOCK_PB1"
ln -s /tmp/some-claude.md "$TEST_TMPDIR/target1/CLAUDE.md"
output=$(bash "$MOCK_PB1/scripts/setup/uninstall-claude.sh" "$TEST_TMPDIR/target1" 2>&1)
assert_file_not_exists "CLAUDE.md symlink removed" "$TEST_TMPDIR/target1/CLAUDE.md"

# --------------------------------------------------------------------------
# Test 2: Removes real CLAUDE.md
# --------------------------------------------------------------------------
echo ""
echo "--- Test 2: Removes real CLAUDE.md ---"
create_mock_target_repo "$TEST_TMPDIR/target2"
MOCK_PB2="$TEST_TMPDIR/playbook2"
create_mock_playbook "$MOCK_PB2"
echo "# Real CLAUDE.md" > "$TEST_TMPDIR/target2/CLAUDE.md"
output=$(bash "$MOCK_PB2/scripts/setup/uninstall-claude.sh" "$TEST_TMPDIR/target2" 2>&1)
assert_file_not_exists "real CLAUDE.md removed" "$TEST_TMPDIR/target2/CLAUDE.md"

# --------------------------------------------------------------------------
# Test 3: Removes symlinked .claude/
# --------------------------------------------------------------------------
echo ""
echo "--- Test 3: Removes symlinked .claude/ ---"
create_mock_target_repo "$TEST_TMPDIR/target3"
MOCK_PB3="$TEST_TMPDIR/playbook3"
create_mock_playbook "$MOCK_PB3"
ln -s /tmp/some-claude-dir "$TEST_TMPDIR/target3/.claude"
output=$(bash "$MOCK_PB3/scripts/setup/uninstall-claude.sh" "$TEST_TMPDIR/target3" 2>&1)
assert_file_not_exists ".claude symlink removed" "$TEST_TMPDIR/target3/.claude"

# --------------------------------------------------------------------------
# Test 4: Removes real .claude/ directory
# --------------------------------------------------------------------------
echo ""
echo "--- Test 4: Removes real .claude/ directory ---"
create_mock_target_repo "$TEST_TMPDIR/target4"
MOCK_PB4="$TEST_TMPDIR/playbook4"
create_mock_playbook "$MOCK_PB4"
mkdir -p "$TEST_TMPDIR/target4/.claude/rules"
echo "test rule" > "$TEST_TMPDIR/target4/.claude/rules/test.md"
output=$(bash "$MOCK_PB4/scripts/setup/uninstall-claude.sh" "$TEST_TMPDIR/target4" 2>&1)
assert_file_not_exists ".claude directory removed" "$TEST_TMPDIR/target4/.claude"

# --------------------------------------------------------------------------
# Test 5: Removes .claude-playbook/ and cleans .gitignore
# --------------------------------------------------------------------------
echo ""
echo "--- Test 5: Removes .claude-playbook/ and cleans .gitignore ---"
create_mock_target_repo "$TEST_TMPDIR/target5"
MOCK_PB5="$TEST_TMPDIR/playbook5"
create_mock_playbook "$MOCK_PB5"
mkdir -p "$TEST_TMPDIR/target5/.claude-playbook"
echo "clone data" > "$TEST_TMPDIR/target5/.claude-playbook/README"
cat > "$TEST_TMPDIR/target5/.gitignore" <<'EOF'
node_modules/
.claude-playbook/
*.log
EOF
output=$(bash "$MOCK_PB5/scripts/setup/uninstall-claude.sh" "$TEST_TMPDIR/target5" 2>&1)
assert_file_not_exists ".claude-playbook dir removed" "$TEST_TMPDIR/target5/.claude-playbook"
assert_not_grep_file ".gitignore no longer contains .claude-playbook/" \
    "$TEST_TMPDIR/target5/.gitignore" ".claude-playbook/"

# --------------------------------------------------------------------------
# Test 6: Removes submodule
# --------------------------------------------------------------------------
echo ""
echo "--- Test 6: Removes submodule ---"
MOCK_PB6="$TEST_TMPDIR/playbook6"
create_mock_playbook "$MOCK_PB6"
create_bare_remote "$MOCK_PB6" "$TEST_TMPDIR/playbook6-bare.git"
create_mock_target_repo "$TEST_TMPDIR/target6"
cd "$TEST_TMPDIR/target6"
git submodule add "file://$TEST_TMPDIR/playbook6-bare.git" claude-playbook 2>/dev/null
git commit -q -m "add submodule"
output=$(bash "$MOCK_PB6/scripts/setup/uninstall-claude.sh" "$TEST_TMPDIR/target6" 2>&1)
assert_file_not_exists "claude-playbook/ dir removed" "$TEST_TMPDIR/target6/claude-playbook"
assert_file_not_exists ".git/modules/claude-playbook removed" \
    "$TEST_TMPDIR/target6/.git/modules/claude-playbook"

# --------------------------------------------------------------------------
# Test 7: Skips missing items
# --------------------------------------------------------------------------
echo ""
echo "--- Test 7: Skips missing items ---"
create_mock_target_repo "$TEST_TMPDIR/target7"
MOCK_PB7="$TEST_TMPDIR/playbook7"
create_mock_playbook "$MOCK_PB7"
output=$(bash "$MOCK_PB7/scripts/setup/uninstall-claude.sh" "$TEST_TMPDIR/target7" 2>&1)
rc=$?
assert_exit_code "exit code 0 on empty repo" "0" "$rc"
assert_output_contains "output contains [skip]" "$output" "[skip]"

# --------------------------------------------------------------------------
# Test 8: Reports correct removed count
# --------------------------------------------------------------------------
echo ""
echo "--- Test 8: Reports correct removed count ---"
create_mock_target_repo "$TEST_TMPDIR/target8"
MOCK_PB8="$TEST_TMPDIR/playbook8"
create_mock_playbook "$MOCK_PB8"
ln -s /tmp/some-claude.md "$TEST_TMPDIR/target8/CLAUDE.md"
ln -s /tmp/some-claude-dir "$TEST_TMPDIR/target8/.claude"
output=$(bash "$MOCK_PB8/scripts/setup/uninstall-claude.sh" "$TEST_TMPDIR/target8" 2>&1)
assert_output_contains "output reports 2 items removed" "$output" "Removed 2 item(s)"

echo ""
echo "=== Tests: uninstall-global-claude.sh ==="

# --------------------------------------------------------------------------
# Test 9: Removes playbook symlinks from ~/.claude/
# --------------------------------------------------------------------------
echo ""
echo "--- Test 9: Removes playbook symlinks from ~/.claude/ ---"
MOCK_PB9="$TEST_TMPDIR/claude-playbook"
create_mock_playbook "$MOCK_PB9"
bash "$MOCK_PB9/scripts/setup/setup-global-claude.sh" "$MOCK_PB9" >/dev/null 2>&1
# Verify symlinks were created before uninstall
assert_symlink "pre-check: rules/test-rule.md is symlink" "$HOME/.claude/rules/test-rule.md"
assert_symlink "pre-check: commands/test-cmd.md is symlink" "$HOME/.claude/commands/test-cmd.md"
assert_symlink "pre-check: skills/test-skill is symlink" "$HOME/.claude/skills/test-skill"
bash "$MOCK_PB9/scripts/setup/uninstall-global-claude.sh" 2>&1
assert_file_not_exists "rules/test-rule.md removed" "$HOME/.claude/rules/test-rule.md"
assert_file_not_exists "commands/test-cmd.md removed" "$HOME/.claude/commands/test-cmd.md"
assert_file_not_exists "skills/test-skill removed" "$HOME/.claude/skills/test-skill"

# --------------------------------------------------------------------------
# Test 10: Preserves non-playbook symlinks
# --------------------------------------------------------------------------
echo ""
echo "--- Test 10: Preserves non-playbook symlinks ---"
# Re-create mock playbook with claude-playbook in the path so readlink -f matches
rm -rf "$TEST_TMPDIR/claude-playbook"
MOCK_PB10="$TEST_TMPDIR/claude-playbook"
create_mock_playbook "$MOCK_PB10"
bash "$MOCK_PB10/scripts/setup/setup-global-claude.sh" "$MOCK_PB10" >/dev/null 2>&1
# Create a non-playbook symlink
mkdir -p /tmp/test-uninstall-non-pb
echo "other rule" > /tmp/test-uninstall-non-pb/other.md
ln -sf /tmp/test-uninstall-non-pb/other.md "$HOME/.claude/rules/other.md"
bash "$MOCK_PB10/scripts/setup/uninstall-global-claude.sh" 2>&1
assert_symlink "non-playbook symlink preserved" "$HOME/.claude/rules/other.md"
rm -rf /tmp/test-uninstall-non-pb

# --------------------------------------------------------------------------
# Test 11: Preserves native files
# --------------------------------------------------------------------------
echo ""
echo "--- Test 11: Preserves native files ---"
rm -rf "$TEST_TMPDIR/claude-playbook"
MOCK_PB11="$TEST_TMPDIR/claude-playbook"
create_mock_playbook "$MOCK_PB11"
bash "$MOCK_PB11/scripts/setup/setup-global-claude.sh" "$MOCK_PB11" >/dev/null 2>&1
# Create a real file (not symlink)
echo "my custom rule" > "$HOME/.claude/rules/my-rule.md"
bash "$MOCK_PB11/scripts/setup/uninstall-global-claude.sh" 2>&1
assert_file_exists "native file preserved" "$HOME/.claude/rules/my-rule.md"
assert_not_symlink "native file is not a symlink" "$HOME/.claude/rules/my-rule.md"

# --------------------------------------------------------------------------
# Test 12: Handles broken symlinks without crashing
# --------------------------------------------------------------------------
echo ""
echo "--- Test 12: Handles broken symlinks without crashing ---"
rm -rf "$TEST_TMPDIR/claude-playbook"
MOCK_PB12="$TEST_TMPDIR/claude-playbook"
create_mock_playbook "$MOCK_PB12"
bash "$MOCK_PB12/scripts/setup/setup-global-claude.sh" "$MOCK_PB12" >/dev/null 2>&1
# Break a symlink (target no longer exists)
rm -rf "$MOCK_PB12/configs/global/.claude/rules/test-rule.md"
output=$(bash "$MOCK_PB12/scripts/setup/uninstall-global-claude.sh" 2>&1)
rc=$?
assert_exit_code "uninstall exits 0 with broken symlinks" "0" "$rc"

report_results

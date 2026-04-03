#!/usr/bin/env bash
# Functional tests for full end-to-end lifecycle:
#   install -> verify -> uninstall -> verify clean -> reinstall -> break -> recover -> verify
# Tests global, local-clone, submodule, and merge modes.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/helpers/test-helpers.sh"

setup_test_env

MOCK_PLAYBOOK="$TEST_TMPDIR/claude-playbook"
create_mock_playbook "$MOCK_PLAYBOOK"

BARE_REMOTE="$TEST_TMPDIR/claude-playbook-bare.git"
create_bare_remote "$MOCK_PLAYBOOK" "$BARE_REMOTE"

SETUP_DIR="$MOCK_PLAYBOOK/scripts/setup"

echo "=== Tests: Full Lifecycle ==="

# ============================================================================
# Lifecycle 1: Global mode
# ============================================================================
echo ""
echo "=== Lifecycle 1: Global mode ==="

# --- Step 1: Install ---
echo ""
echo "--- 1.1: Install global config ---"
output=$(bash "$SETUP_DIR/setup-global-claude.sh" "$MOCK_PLAYBOOK" 2>&1)
rc=$?
assert_exit_code "global install exits 0" "0" "$rc"

# --- Step 2: Verify ---
echo ""
echo "--- 1.2: Verify global install ---"
assert_symlink_valid "rules/test-rule.md is valid symlink" "$HOME/.claude/rules/test-rule.md"
assert_symlink_valid "commands/test-cmd.md is valid symlink" "$HOME/.claude/commands/test-cmd.md"
assert_symlink_valid "commands/sub-ns is valid symlink" "$HOME/.claude/commands/sub-ns"
assert_symlink_valid "skills/test-skill is valid symlink" "$HOME/.claude/skills/test-skill"
assert_symlink_valid "CLAUDE.md is valid symlink" "$HOME/.claude/CLAUDE.md"

# --- Step 3: Uninstall ---
echo ""
echo "--- 1.3: Uninstall global config ---"
output=$(bash "$SETUP_DIR/uninstall-global-claude.sh" 2>&1)
rc=$?
assert_exit_code "global uninstall exits 0" "0" "$rc"

# --- Step 4: Verify clean ---
echo ""
echo "--- 1.4: Verify global uninstall ---"
assert_file_not_exists "rules/test-rule.md gone" "$HOME/.claude/rules/test-rule.md"
assert_file_not_exists "commands/test-cmd.md gone" "$HOME/.claude/commands/test-cmd.md"
assert_file_not_exists "commands/sub-ns gone" "$HOME/.claude/commands/sub-ns"
assert_file_not_exists "skills/test-skill gone" "$HOME/.claude/skills/test-skill"
assert_file_not_exists "CLAUDE.md gone" "$HOME/.claude/CLAUDE.md"

# --- Step 5: Reinstall ---
echo ""
echo "--- 1.5: Reinstall global config ---"
output=$(bash "$SETUP_DIR/setup-global-claude.sh" "$MOCK_PLAYBOOK" 2>&1)
rc=$?
assert_exit_code "global reinstall exits 0" "0" "$rc"

# --- Step 6: Verify reinstall ---
echo ""
echo "--- 1.6: Verify global reinstall ---"
assert_symlink_valid "rules/test-rule.md valid after reinstall" "$HOME/.claude/rules/test-rule.md"
assert_symlink_valid "commands/test-cmd.md valid after reinstall" "$HOME/.claude/commands/test-cmd.md"
assert_symlink_valid "commands/sub-ns valid after reinstall" "$HOME/.claude/commands/sub-ns"
assert_symlink_valid "skills/test-skill valid after reinstall" "$HOME/.claude/skills/test-skill"
assert_symlink_valid "CLAUDE.md valid after reinstall" "$HOME/.claude/CLAUDE.md"

# ============================================================================
# Lifecycle 2: Local-clone mode
# ============================================================================
echo ""
echo "=== Lifecycle 2: Local-clone mode ==="

TARGET_LC="$TEST_TMPDIR/target-lc"
create_mock_target_repo "$TARGET_LC"

# --- Step 1: Install ---
echo ""
echo "--- 2.1: Install local-clone config ---"
output=$(bash "$SETUP_DIR/setup-claude-local-clone.sh" debugging "$TARGET_LC" 2>&1)
rc=$?
assert_exit_code "local-clone install exits 0" "0" "$rc"

# --- Step 2: Verify ---
echo ""
echo "--- 2.2: Verify local-clone install ---"
assert_dir_exists ".claude-playbook/ exists" "$TARGET_LC/.claude-playbook"
assert_symlink_valid ".claude is valid symlink" "$TARGET_LC/.claude"
assert_symlink_valid "CLAUDE.md is valid symlink" "$TARGET_LC/CLAUDE.md"
assert_grep_file ".gitignore has .claude-playbook/" "$TARGET_LC/.gitignore" ".claude-playbook/"

# --- Step 3: Uninstall ---
echo ""
echo "--- 2.3: Uninstall local-clone config ---"
output=$(bash "$SETUP_DIR/uninstall-claude.sh" "$TARGET_LC" 2>&1)
rc=$?
assert_exit_code "local-clone uninstall exits 0" "0" "$rc"

# --- Step 4: Verify clean ---
echo ""
echo "--- 2.4: Verify local-clone uninstall ---"
assert_file_not_exists ".claude-playbook/ gone" "$TARGET_LC/.claude-playbook"
assert_file_not_exists "CLAUDE.md gone" "$TARGET_LC/CLAUDE.md"
assert_file_not_exists ".claude gone" "$TARGET_LC/.claude"
assert_not_grep_file ".gitignore cleaned" "$TARGET_LC/.gitignore" ".claude-playbook/"

# --- Step 5: Reinstall on fresh target ---
echo ""
echo "--- 2.5: Reinstall local-clone on fresh target ---"
TARGET_LC2="$TEST_TMPDIR/target-lc2"
create_mock_target_repo "$TARGET_LC2"
output=$(bash "$SETUP_DIR/setup-claude-local-clone.sh" debugging "$TARGET_LC2" 2>&1)
rc=$?
assert_exit_code "local-clone reinstall exits 0" "0" "$rc"
assert_symlink_valid ".claude valid after reinstall" "$TARGET_LC2/.claude"
assert_symlink_valid "CLAUDE.md valid after reinstall" "$TARGET_LC2/CLAUDE.md"

# --- Step 6: Break .claude (keep CLAUDE.md valid for config detection) ---
echo ""
echo "--- 2.6: Break .claude and recover ---"
rm "$TARGET_LC2/.claude"
ln -sf /nonexistent "$TARGET_LC2/.claude"

# --- Step 7: Recover ---
output=$(bash "$SETUP_DIR/recover-config.sh" "$TARGET_LC2" 2>&1)
rc=$?
assert_exit_code "recover exits 0 after .claude break" "0" "$rc"

# --- Step 8: Verify .claude fixed ---
assert_symlink_valid ".claude valid after recovery" "$TARGET_LC2/.claude"

# --- Step 6b: Break CLAUDE.md (keep .claude valid for config detection) ---
echo ""
echo "--- 2.6b: Break CLAUDE.md and recover ---"
rm "$TARGET_LC2/CLAUDE.md"
ln -sf /nonexistent "$TARGET_LC2/CLAUDE.md"

output=$(bash "$SETUP_DIR/recover-config.sh" "$TARGET_LC2" 2>&1)
rc=$?
assert_exit_code "recover exits 0 after CLAUDE.md break" "0" "$rc"
assert_symlink_valid "CLAUDE.md valid after recovery" "$TARGET_LC2/CLAUDE.md"

# ============================================================================
# Lifecycle 3: Submodule mode
# ============================================================================
echo ""
echo "=== Lifecycle 3: Submodule mode ==="

TARGET_SM="$TEST_TMPDIR/target-sm"
create_mock_target_repo "$TARGET_SM"

# --- Step 1: Install ---
echo ""
echo "--- 3.1: Install submodule config ---"
output=$(bash "$SETUP_DIR/setup-claude-submodule.sh" debugging "$TARGET_SM" 2>&1)
rc=$?
assert_exit_code "submodule install exits 0" "0" "$rc"

# --- Step 2: Verify ---
echo ""
echo "--- 3.2: Verify submodule install ---"
assert_dir_exists "claude-playbook/ submodule exists" "$TARGET_SM/claude-playbook"
assert_symlink_valid ".claude is valid symlink" "$TARGET_SM/.claude"
assert_symlink_valid "CLAUDE.md is valid symlink" "$TARGET_SM/CLAUDE.md"

# --- Step 3: Uninstall ---
echo ""
echo "--- 3.3: Uninstall submodule config ---"
cd "$TARGET_SM"
git add -A 2>/dev/null && git commit -q -m "add submodule" 2>/dev/null || true
cd "$TEST_TMPDIR"
output=$(bash "$SETUP_DIR/uninstall-claude.sh" "$TARGET_SM" 2>&1)
rc=$?
assert_exit_code "submodule uninstall exits 0" "0" "$rc"

# --- Step 4: Verify clean ---
echo ""
echo "--- 3.4: Verify submodule uninstall ---"
assert_file_not_exists "claude-playbook/ gone" "$TARGET_SM/claude-playbook"
assert_file_not_exists ".git/modules/claude-playbook gone" "$TARGET_SM/.git/modules/claude-playbook"
assert_file_not_exists ".claude gone" "$TARGET_SM/.claude"
assert_file_not_exists "CLAUDE.md gone" "$TARGET_SM/CLAUDE.md"

# --- Step 5: Reinstall on fresh target ---
echo ""
echo "--- 3.5: Reinstall submodule on fresh target ---"
TARGET_SM2="$TEST_TMPDIR/target-sm2"
create_mock_target_repo "$TARGET_SM2"
output=$(bash "$SETUP_DIR/setup-claude-submodule.sh" debugging "$TARGET_SM2" 2>&1)
rc=$?
assert_exit_code "submodule reinstall exits 0" "0" "$rc"
assert_symlink_valid ".claude valid after reinstall" "$TARGET_SM2/.claude"
assert_symlink_valid "CLAUDE.md valid after reinstall" "$TARGET_SM2/CLAUDE.md"

# --- Step 6: Break .claude (keep CLAUDE.md valid for config detection) ---
echo ""
echo "--- 3.6: Break .claude and recover ---"
rm "$TARGET_SM2/.claude"
ln -sf /nonexistent "$TARGET_SM2/.claude"

# --- Step 7: Recover ---
output=$(bash "$SETUP_DIR/recover-config.sh" "$TARGET_SM2" 2>&1)
rc=$?
assert_exit_code "recover exits 0 after .claude break" "0" "$rc"

# --- Step 8: Verify ---
assert_symlink_valid ".claude valid after recovery" "$TARGET_SM2/.claude"

# ============================================================================
# Lifecycle 4: Merge mode
# ============================================================================
echo ""
echo "=== Lifecycle 4: Merge mode ==="

TARGET_MG="$TEST_TMPDIR/target-mg"
create_mock_target_repo "$TARGET_MG"

# --- Step 1: Install ---
echo ""
echo "--- 4.1: Install merge config ---"
output=$(bash "$SETUP_DIR/setup-claude-merge.sh" debugging "$TARGET_MG" 2>&1)
rc=$?
assert_exit_code "merge install exits 0" "0" "$rc"

# --- Step 2: Verify ---
echo ""
echo "--- 4.2: Verify merge install ---"
assert_not_symlink ".claude/ is real dir" "$TARGET_MG/.claude"
assert_symlink_valid ".claude/rules/debug-rule.md is valid symlink" "$TARGET_MG/.claude/rules/debug-rule.md"
assert_symlink_valid ".claude/commands/debug-cmd.md is valid symlink" "$TARGET_MG/.claude/commands/debug-cmd.md"
assert_symlink_valid ".claude/settings.json is valid symlink" "$TARGET_MG/.claude/settings.json"
assert_symlink_valid "CLAUDE.md is valid symlink" "$TARGET_MG/CLAUDE.md"

# --- Step 3: Uninstall ---
echo ""
echo "--- 4.3: Uninstall merge config ---"
output=$(bash "$SETUP_DIR/uninstall-claude.sh" "$TARGET_MG" 2>&1)
rc=$?
assert_exit_code "merge uninstall exits 0" "0" "$rc"

# --- Step 4: Verify clean ---
echo ""
echo "--- 4.4: Verify merge uninstall ---"
assert_file_not_exists ".claude/ gone" "$TARGET_MG/.claude"
assert_file_not_exists "CLAUDE.md gone" "$TARGET_MG/CLAUDE.md"

# --- Step 5: Reinstall ---
echo ""
echo "--- 4.5: Reinstall merge config ---"
output=$(bash "$SETUP_DIR/setup-claude-merge.sh" debugging "$TARGET_MG" 2>&1)
rc=$?
assert_exit_code "merge reinstall exits 0" "0" "$rc"
assert_symlink_valid ".claude/rules/debug-rule.md valid after reinstall" "$TARGET_MG/.claude/rules/debug-rule.md"
assert_symlink_valid "CLAUDE.md valid after reinstall" "$TARGET_MG/CLAUDE.md"

# --- Step 6: Break .claude/rules/debug-rule.md (keep CLAUDE.md valid) ---
echo ""
echo "--- 4.6: Break debug-rule.md and recover ---"
rm "$TARGET_MG/.claude/rules/debug-rule.md"
ln -sf /nonexistent "$TARGET_MG/.claude/rules/debug-rule.md"

# CLAUDE.md symlink points into the playbook via absolute path (setup-claude-merge.sh
# uses $CONFIG_DIR which is absolute). The recover script follows CLAUDE.md symlink
# target, extracts playbook path from ${link_target%%/configs/*}, and uses it.

# --- Step 7: Recover ---
output=$(bash "$SETUP_DIR/recover-config.sh" "$TARGET_MG" 2>&1)
rc=$?
assert_exit_code "recover exits 0 after debug-rule break" "0" "$rc"

# --- Step 8: Verify ---
assert_symlink_valid "debug-rule.md valid after recovery" "$TARGET_MG/.claude/rules/debug-rule.md"

report_results

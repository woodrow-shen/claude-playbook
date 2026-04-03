#!/usr/bin/env bash
# Functional tests for scripts/setup/setup-global-claude.sh
# Tests symlink creation for global config into $HOME/.claude/
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/helpers/test-helpers.sh"

setup_test_env

MOCK_PLAYBOOK="$TEST_TMPDIR/playbook"
create_mock_playbook "$MOCK_PLAYBOOK"

run_setup() {
    bash "$MOCK_PLAYBOOK/scripts/setup/setup-global-claude.sh" "$MOCK_PLAYBOOK" 2>&1
}

echo "=== Tests: setup-global-claude.sh ==="

# --------------------------------------------------------------------------
# Test 1: Fresh install creates structure
# --------------------------------------------------------------------------
echo ""
echo "--- Test 1: Fresh install creates structure ---"
output=$(run_setup)
assert_dir_exists "rules/ dir exists" "$HOME/.claude/rules"
assert_dir_exists "commands/ dir exists" "$HOME/.claude/commands"
assert_dir_exists "skills/ dir exists" "$HOME/.claude/skills"
assert_dir_exists "agents/ dir exists" "$HOME/.claude/agents"

# --------------------------------------------------------------------------
# Test 2: Symlinks rules
# --------------------------------------------------------------------------
echo ""
echo "--- Test 2: Symlinks rules ---"
assert_symlink_valid "rules/test-rule.md is a valid symlink" "$HOME/.claude/rules/test-rule.md"

# --------------------------------------------------------------------------
# Test 3: Symlinks flat commands
# --------------------------------------------------------------------------
echo ""
echo "--- Test 3: Symlinks flat commands ---"
assert_symlink_valid "commands/test-cmd.md is a valid symlink" "$HOME/.claude/commands/test-cmd.md"

# --------------------------------------------------------------------------
# Test 4: Symlinks command subdirs
# --------------------------------------------------------------------------
echo ""
echo "--- Test 4: Symlinks command subdirs ---"
assert_symlink_valid "commands/sub-ns is a valid symlink" "$HOME/.claude/commands/sub-ns"

# --------------------------------------------------------------------------
# Test 5: Symlinks skills
# --------------------------------------------------------------------------
echo ""
echo "--- Test 5: Symlinks skills ---"
assert_symlink_valid "skills/test-skill is a valid symlink" "$HOME/.claude/skills/test-skill"

# --------------------------------------------------------------------------
# Test 6: Symlinks agents
# --------------------------------------------------------------------------
echo ""
echo "--- Test 6: Symlinks agents ---"
assert_symlink_valid "agents/test-agent.md is a valid symlink" "$HOME/.claude/agents/test-agent.md"

# --------------------------------------------------------------------------
# Test 7: Symlinks CLAUDE.md
# --------------------------------------------------------------------------
echo ""
echo "--- Test 6: Symlinks CLAUDE.md ---"
assert_symlink_valid "CLAUDE.md is a valid symlink" "$HOME/.claude/CLAUDE.md"

# --------------------------------------------------------------------------
# Test 7: Idempotent re-run
# --------------------------------------------------------------------------
echo ""
echo "--- Test 7: Idempotent re-run ---"
output=$(run_setup)
assert_output_contains "re-run output contains [skip]" "$output" "[skip]"

# --------------------------------------------------------------------------
# Test 8: Preserves native files
# --------------------------------------------------------------------------
echo ""
echo "--- Test 8: Preserves native files ---"
# Reset HOME to fresh state
export HOME="$TEST_TMPDIR/home-native"
mkdir -p "$HOME/.claude/rules"
echo "native content" > "$HOME/.claude/rules/test-rule.md"
output=$(run_setup)
assert_not_symlink "native file preserved as real file" "$HOME/.claude/rules/test-rule.md"
assert_output_contains "output contains [WARN] for native file" "$output" "[WARN]"

# --------------------------------------------------------------------------
# Test 9: Replaces stale symlinks
# --------------------------------------------------------------------------
echo ""
echo "--- Test 9: Replaces stale symlinks ---"
export HOME="$TEST_TMPDIR/home-stale"
mkdir -p "$HOME/.claude/rules"
ln -s /nonexistent "$HOME/.claude/rules/test-rule.md"
output=$(run_setup)
assert_symlink_valid "stale symlink replaced with valid one" "$HOME/.claude/rules/test-rule.md"

# --------------------------------------------------------------------------
# Test 10: Exit code 1 when configs/global missing
# --------------------------------------------------------------------------
echo ""
echo "--- Test 10: Exit code 1 when configs/global missing ---"
export HOME="$TEST_TMPDIR/home-missing"
mkdir -p "$HOME"
mv "$MOCK_PLAYBOOK/configs/global" "$MOCK_PLAYBOOK/configs/global.bak"
output=$(bash "$MOCK_PLAYBOOK/scripts/setup/setup-global-claude.sh" "$MOCK_PLAYBOOK" 2>&1 || true)
rc=$?
# The script uses set -e so capture exit code differently
bash "$MOCK_PLAYBOOK/scripts/setup/setup-global-claude.sh" "$MOCK_PLAYBOOK" >/dev/null 2>&1
rc=$?
assert_exit_code "exit code is 1 when configs/global missing" "1" "$rc"
# Restore for cleanup
mv "$MOCK_PLAYBOOK/configs/global.bak" "$MOCK_PLAYBOOK/configs/global"

report_results

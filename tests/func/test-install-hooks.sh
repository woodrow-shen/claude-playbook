#!/usr/bin/env bash
# Functional tests for scripts/hooks/install-hooks.sh
# Tests manual fallback hook installation (Strategy 2).
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/helpers/test-helpers.sh"

setup_test_env

MOCK_PLAYBOOK="$TEST_TMPDIR/playbook"
create_mock_playbook "$MOCK_PLAYBOOK"

# Remove .pre-commit-config.yaml to force manual mode
rm -f "$MOCK_PLAYBOOK/.pre-commit-config.yaml"

run_install() {
    bash "$MOCK_PLAYBOOK/scripts/hooks/install-hooks.sh" 2>&1
}

echo "=== Tests: install-hooks.sh (manual fallback) ==="

# --------------------------------------------------------------------------
# Test 1: Creates pre-commit hook (manual mode)
# --------------------------------------------------------------------------
echo ""
echo "--- Test 1: Creates pre-commit hook (manual mode) ---"
output=$(run_install)
rc=$?
assert_exit_code "install exits 0" "0" "$rc"
assert_file_exists "pre-commit hook exists" "$MOCK_PLAYBOOK/.git/hooks/pre-commit"
if [[ -x "$MOCK_PLAYBOOK/.git/hooks/pre-commit" ]]; then
    assert_pass "pre-commit hook is executable"
else
    assert_fail "pre-commit hook is executable"
fi

# --------------------------------------------------------------------------
# Test 2: Creates commit-msg hook (manual mode)
# --------------------------------------------------------------------------
echo ""
echo "--- Test 2: Creates commit-msg hook (manual mode) ---"
assert_file_exists "commit-msg hook exists" "$MOCK_PLAYBOOK/.git/hooks/commit-msg"
if [[ -x "$MOCK_PLAYBOOK/.git/hooks/commit-msg" ]]; then
    assert_pass "commit-msg hook is executable"
else
    assert_fail "commit-msg hook is executable"
fi

# --------------------------------------------------------------------------
# Test 3: Pre-commit hook references check-command-injection
# --------------------------------------------------------------------------
echo ""
echo "--- Test 3: Pre-commit hook references check-command-injection ---"
assert_grep_file "pre-commit references check-command-injection.sh" \
    "$MOCK_PLAYBOOK/.git/hooks/pre-commit" "check-command-injection.sh"

# --------------------------------------------------------------------------
# Test 4: Commit-msg hook references check-commit-msg
# --------------------------------------------------------------------------
echo ""
echo "--- Test 4: Commit-msg hook references check-commit-msg ---"
assert_grep_file "commit-msg references check-commit-msg.sh" \
    "$MOCK_PLAYBOOK/.git/hooks/commit-msg" "check-commit-msg.sh"

# --------------------------------------------------------------------------
# Test 5: Works with submodule-style .git file
# --------------------------------------------------------------------------
echo ""
echo "--- Test 5: Works with submodule-style .git file ---"

# Set up a fake submodule structure
PARENT_GIT="$TEST_TMPDIR/parent/.git/modules/child"
CHILD_WORK="$TEST_TMPDIR/child_work"

# Create a bare-like git dir for the submodule
git init --bare -q "$PARENT_GIT"

# Create the child working tree with playbook contents
mkdir -p "$CHILD_WORK"
cp -r "$MOCK_PLAYBOOK/scripts" "$CHILD_WORK/"
cp -r "$MOCK_PLAYBOOK/configs" "$CHILD_WORK/"

# Replace .git dir with a .git file pointing to the modules dir
echo "gitdir: $PARENT_GIT" > "$CHILD_WORK/.git"

# Ensure hooks dir exists (bare init creates it, but be safe)
mkdir -p "$PARENT_GIT/hooks"

# Run install from the child working tree
output=$(bash "$CHILD_WORK/scripts/hooks/install-hooks.sh" 2>&1)
rc=$?
assert_exit_code "submodule install exits 0" "0" "$rc"
assert_file_exists "pre-commit hook in modules dir" "$PARENT_GIT/hooks/pre-commit"
assert_file_exists "commit-msg hook in modules dir" "$PARENT_GIT/hooks/commit-msg"
if [[ -x "$PARENT_GIT/hooks/pre-commit" ]]; then
    assert_pass "submodule pre-commit hook is executable"
else
    assert_fail "submodule pre-commit hook is executable"
fi

# --------------------------------------------------------------------------
# Test 6: Fails when not a git repo
# --------------------------------------------------------------------------
echo ""
echo "--- Test 6: Fails when not a git repo ---"

NO_GIT="$TEST_TMPDIR/nogit"
mkdir -p "$NO_GIT/scripts/hooks"
cp "$MOCK_PLAYBOOK/scripts/hooks/install-hooks.sh" "$NO_GIT/scripts/hooks/"
chmod +x "$NO_GIT/scripts/hooks/install-hooks.sh"

output=$(bash "$NO_GIT/scripts/hooks/install-hooks.sh" 2>&1)
rc=$?
assert_exit_code "non-git repo exits 1" "1" "$rc"
assert_output_contains "error message mentions not a git repo" "$output" "Not a git repository"

# --------------------------------------------------------------------------
# Test 7: Idempotent re-run
# --------------------------------------------------------------------------
echo ""
echo "--- Test 7: Idempotent re-run ---"

# Run install a second time on the mock playbook
output=$(run_install)
rc=$?
assert_exit_code "second install exits 0" "0" "$rc"
assert_file_exists "pre-commit still exists after re-run" "$MOCK_PLAYBOOK/.git/hooks/pre-commit"
assert_file_exists "commit-msg still exists after re-run" "$MOCK_PLAYBOOK/.git/hooks/commit-msg"
assert_grep_file "pre-commit still valid after re-run" \
    "$MOCK_PLAYBOOK/.git/hooks/pre-commit" "check-command-injection.sh"
assert_grep_file "commit-msg still valid after re-run" \
    "$MOCK_PLAYBOOK/.git/hooks/commit-msg" "check-commit-msg.sh"

# --------------------------------------------------------------------------

report_results

#!/usr/bin/env bash
# Shared test helpers for claude-setup functional tests.
# Source this file from test scripts. Provides temp dir setup,
# mock repo creation, and assertion functions.
#
# Usage:
#   source "$(dirname "${BASH_SOURCE[0]}")/helpers/test-helpers.sh"
#   setup_test_env
#   ... tests ...
#   report_results

set -uo pipefail

PLAYBOOK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../" && pwd)"

passed=0
failed=0
TEST_TMPDIR=""
ORIG_HOME=""

# ---------------------------------------------------------------------------
# Environment setup / teardown
# ---------------------------------------------------------------------------
setup_test_env() {
    TEST_TMPDIR="$(mktemp -d)"
    ORIG_HOME="$HOME"
    export HOME="$TEST_TMPDIR/fakehome"
    mkdir -p "$HOME"
    # Ensure git has minimal config in fake HOME
    git config --global user.email "test@test.com" 2>/dev/null || true
    git config --global user.name "Test User" 2>/dev/null || true
    git config --global init.defaultBranch main 2>/dev/null || true
    # Allow file:// protocol for local clone/submodule tests
    git config --global protocol.file.allow always 2>/dev/null || true
}

cleanup_test_env() {
    if [[ -n "$ORIG_HOME" ]]; then
        export HOME="$ORIG_HOME"
    fi
    if [[ -n "$TEST_TMPDIR" ]] && [[ -d "$TEST_TMPDIR" ]]; then
        rm -rf "$TEST_TMPDIR"
    fi
}

trap cleanup_test_env EXIT

# ---------------------------------------------------------------------------
# Mock playbook creation
# ---------------------------------------------------------------------------
# Creates a minimal playbook repo with configs structure.
# Args: $1 = path to create playbook at
create_mock_playbook() {
    local path="$1"
    mkdir -p "$path"

    # configs/global
    mkdir -p "$path/configs/global/.claude/rules"
    mkdir -p "$path/configs/global/.claude/commands/sub-ns"
    mkdir -p "$path/configs/global/.claude/skills/test-skill"
    echo "---" > "$path/configs/global/.claude/rules/test-rule.md"
    echo "name: test-rule" >> "$path/configs/global/.claude/rules/test-rule.md"
    echo "---" >> "$path/configs/global/.claude/rules/test-rule.md"
    echo "Test rule content." >> "$path/configs/global/.claude/rules/test-rule.md"

    echo "---" > "$path/configs/global/.claude/commands/test-cmd.md"
    echo "name: test-cmd" >> "$path/configs/global/.claude/commands/test-cmd.md"
    echo "---" >> "$path/configs/global/.claude/commands/test-cmd.md"
    echo "Test command." >> "$path/configs/global/.claude/commands/test-cmd.md"

    echo "---" > "$path/configs/global/.claude/commands/sub-ns/nested.md"
    echo "name: nested" >> "$path/configs/global/.claude/commands/sub-ns/nested.md"
    echo "---" >> "$path/configs/global/.claude/commands/sub-ns/nested.md"
    echo "Nested command." >> "$path/configs/global/.claude/commands/sub-ns/nested.md"

    echo "---" > "$path/configs/global/.claude/skills/test-skill/SKILL.md"
    echo "name: test-skill" >> "$path/configs/global/.claude/skills/test-skill/SKILL.md"
    echo "---" >> "$path/configs/global/.claude/skills/test-skill/SKILL.md"
    echo "Test skill." >> "$path/configs/global/.claude/skills/test-skill/SKILL.md"

    echo "# Global Config" > "$path/configs/global/CLAUDE.md"

    # configs/debugging (project-level config for testing)
    mkdir -p "$path/configs/debugging/.claude/rules"
    mkdir -p "$path/configs/debugging/.claude/commands"
    echo "---" > "$path/configs/debugging/.claude/rules/debug-rule.md"
    echo "name: debug-rule" >> "$path/configs/debugging/.claude/rules/debug-rule.md"
    echo "---" >> "$path/configs/debugging/.claude/rules/debug-rule.md"
    echo "Debug rule." >> "$path/configs/debugging/.claude/rules/debug-rule.md"

    echo "---" > "$path/configs/debugging/.claude/commands/debug-cmd.md"
    echo "name: debug-cmd" >> "$path/configs/debugging/.claude/commands/debug-cmd.md"
    echo "---" >> "$path/configs/debugging/.claude/commands/debug-cmd.md"
    echo "Debug command." >> "$path/configs/debugging/.claude/commands/debug-cmd.md"

    echo '{"allowedTools": []}' > "$path/configs/debugging/.claude/settings.json"
    echo "# Debugging Config" > "$path/configs/debugging/CLAUDE.md"

    # Minimal scripts stubs (so hooks don't fail)
    mkdir -p "$path/scripts/hooks"
    mkdir -p "$path/scripts/setup"

    # Copy actual setup scripts from real playbook
    cp "$PLAYBOOK_ROOT/scripts/setup/setup-global-claude.sh" "$path/scripts/setup/"
    cp "$PLAYBOOK_ROOT/scripts/setup/setup-claude-submodule.sh" "$path/scripts/setup/"
    cp "$PLAYBOOK_ROOT/scripts/setup/setup-claude-merge.sh" "$path/scripts/setup/"
    cp "$PLAYBOOK_ROOT/scripts/setup/setup-claude-local-clone.sh" "$path/scripts/setup/"
    cp "$PLAYBOOK_ROOT/scripts/setup/uninstall-claude.sh" "$path/scripts/setup/"
    cp "$PLAYBOOK_ROOT/scripts/setup/uninstall-global-claude.sh" "$path/scripts/setup/"
    cp "$PLAYBOOK_ROOT/scripts/setup/recover-config.sh" "$path/scripts/setup/"
    cp "$PLAYBOOK_ROOT/scripts/setup/sparse-checkout-helper.sh" "$path/scripts/setup/"
    cp "$PLAYBOOK_ROOT/scripts/hooks/install-hooks.sh" "$path/scripts/hooks/"
    chmod +x "$path/scripts/setup/"*.sh "$path/scripts/hooks/"*.sh

    # Minimal hook scripts (stubs that just exit 0)
    cat > "$path/scripts/hooks/check-command-injection.sh" << 'EOF'
#!/usr/bin/env bash
exit 0
EOF
    chmod +x "$path/scripts/hooks/check-command-injection.sh"

    cat > "$path/scripts/hooks/check-commit-msg.sh" << 'EOF'
#!/usr/bin/env bash
exit 0
EOF
    chmod +x "$path/scripts/hooks/check-commit-msg.sh"

    # Init as git repo (use -C to avoid cd side effects)
    git -C "$path" init -q
    git -C "$path" add -A
    git -C "$path" commit -q -m "initial mock playbook"
}

# Creates a bare remote from a mock playbook for clone/submodule tests.
# Args: $1 = mock playbook path, $2 = bare repo path
create_bare_remote() {
    local src="$1"
    local bare="$2"
    # Safety: refuse to modify repos outside TEST_TMPDIR
    if [[ -n "$TEST_TMPDIR" ]] && [[ "$src" != "$TEST_TMPDIR"* ]]; then
        echo "ERROR: create_bare_remote refusing to modify $src (outside TEST_TMPDIR)" >&2
        return 1
    fi
    git clone --bare -q "$src" "$bare"
    git -C "$src" remote remove origin 2>/dev/null || true
    git -C "$src" remote add origin "file://$bare"
}

# Creates a mock target project repo.
# Args: $1 = path
create_mock_target_repo() {
    local path="$1"
    mkdir -p "$path"
    git -C "$path" init -q
    echo "# My Project" > "$path/README.md"
    git -C "$path" add README.md
    git -C "$path" commit -q -m "initial project commit"
}

# ---------------------------------------------------------------------------
# Assertions
# ---------------------------------------------------------------------------
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

assert_file_exists() {
    local desc="$1"
    local path="$2"
    if [[ -e "$path" ]]; then
        assert_pass "$desc"
    else
        assert_fail "$desc (not found: $path)"
    fi
}

assert_file_not_exists() {
    local desc="$1"
    local path="$2"
    if [[ ! -e "$path" ]] && [[ ! -L "$path" ]]; then
        assert_pass "$desc"
    else
        assert_fail "$desc (still exists: $path)"
    fi
}

assert_dir_exists() {
    local desc="$1"
    local path="$2"
    if [[ -d "$path" ]]; then
        assert_pass "$desc"
    else
        assert_fail "$desc (dir not found: $path)"
    fi
}

assert_symlink() {
    local desc="$1"
    local path="$2"
    if [[ -L "$path" ]]; then
        assert_pass "$desc"
    else
        assert_fail "$desc (not a symlink: $path)"
    fi
}

assert_not_symlink() {
    local desc="$1"
    local path="$2"
    if [[ -e "$path" ]] && [[ ! -L "$path" ]]; then
        assert_pass "$desc"
    else
        if [[ -L "$path" ]]; then
            assert_fail "$desc (is a symlink: $path)"
        else
            assert_fail "$desc (does not exist: $path)"
        fi
    fi
}

assert_symlink_valid() {
    local desc="$1"
    local path="$2"
    if [[ -L "$path" ]] && [[ -e "$path" ]]; then
        assert_pass "$desc"
    elif [[ -L "$path" ]]; then
        assert_fail "$desc (broken symlink: $path -> $(readlink "$path"))"
    else
        assert_fail "$desc (not a symlink: $path)"
    fi
}

assert_output_contains() {
    local desc="$1"
    local output="$2"
    local pattern="$3"
    if echo "$output" | grep -qF "$pattern"; then
        assert_pass "$desc"
    else
        assert_fail "$desc (output missing: '$pattern')"
    fi
}

assert_exit_code() {
    local desc="$1"
    local expected="$2"
    local actual="$3"
    if [[ "$actual" == "$expected" ]]; then
        assert_pass "$desc"
    else
        assert_fail "$desc (expected exit $expected, got $actual)"
    fi
}

assert_grep_file() {
    local desc="$1"
    local file="$2"
    local pattern="$3"
    if grep -qF "$pattern" "$file" 2>/dev/null; then
        assert_pass "$desc"
    else
        assert_fail "$desc (pattern not found in $file)"
    fi
}

assert_not_grep_file() {
    local desc="$1"
    local file="$2"
    local pattern="$3"
    if ! grep -qF "$pattern" "$file" 2>/dev/null; then
        assert_pass "$desc"
    else
        assert_fail "$desc (pattern found in $file but shouldn't be)"
    fi
}

# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------
report_results() {
    echo ""
    echo "Results: $passed passed, $failed failed"
    [[ "$failed" -eq 0 ]]
}

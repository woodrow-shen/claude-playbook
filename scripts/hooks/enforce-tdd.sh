#!/bin/bash
# Pre-commit hook to enforce Test-Driven Development (TDD)
#
# Rules:
# 1. New/modified commands MUST have corresponding tests
# 2. Tests MUST exist BEFORE command code is committed
# 3. All tests MUST pass before commit
#
# Exit codes:
# 0 - All checks passed
# 1 - Missing tests or tests failed

set -e

REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT"

echo "============================================================"
echo "TDD Enforcement Check"
echo "============================================================"
echo ""

# Get staged command files
STAGED_COMMANDS=$(git diff --cached --name-only --diff-filter=AM | grep '\.claude/commands/.*\.md$' || true)

if [ -z "$STAGED_COMMANDS" ]; then
    echo "No command files staged - TDD check skipped"
    exit 0
fi

echo "Staged command files:"
echo "$STAGED_COMMANDS" | sed 's/^/  - /'
echo ""

# Check 1: Each command must have a test
echo "Check 1: Verify tests exist for all commands"
echo "------------------------------------------------------------"

MISSING_TESTS=()

for cmd_file in $STAGED_COMMANDS; do
    # Extract config name
    # Example: configs/global/.claude/commands/my-cmd.md -> global
    config_name=$(echo "$cmd_file" | sed 's|configs/\([^/]*\)/.*|\1|')

    # Extract command path relative to commands directory
    # Example: configs/global/.claude/commands/cp/issue.md -> cp/issue
    # Example: configs/global/.claude/commands/my-cmd.md -> my-cmd
    cmd_relative=$(echo "$cmd_file" | sed 's|.*/\.claude/commands/||' | sed 's|\.md$||')

    # Replace directory separators with hyphens for namespace commands
    # Example: cp/issue -> cp-issue
    cmd_normalized=$(echo "$cmd_relative" | tr '/' '-')

    # Determine expected test file name
    # - configs/global/.claude/commands/cp/issue.md -> test-cp-issue-deep.sh
    # - configs/global/.claude/commands/bug.md -> test-bug-deep.sh

    # For global commands, use normalized name directly
    if [ "$config_name" = "global" ]; then
        test_name="$cmd_normalized"
    else
        # For other configs, prepend config name if not already present
        if [[ "$cmd_normalized" =~ ^${config_name}- ]]; then
            test_name="$cmd_normalized"
        else
            test_name="${config_name}-${cmd_normalized}"
        fi
    fi

    expected_test="tests/func/test-${test_name}-deep.sh"

    if [ ! -f "$expected_test" ]; then
        MISSING_TESTS+=("$cmd_file -> $expected_test")
    else
        echo "  OK: $cmd_file"
        echo "     Test: $expected_test"
    fi
done

if [ ${#MISSING_TESTS[@]} -gt 0 ]; then
    echo ""
    echo "MISSING TESTS - TDD Violation!"
    echo ""
    echo "The following commands are missing tests:"
    for missing in "${MISSING_TESTS[@]}"; do
        echo "  FAIL: $missing"
    done
    echo ""
    echo "TDD Rule: Tests MUST be written BEFORE code!"
    echo ""
    echo "To fix:"
    echo "  1. Create the test file(s) listed above"
    echo "  2. Write tests that define expected behavior"
    echo "  3. Verify tests FAIL (red phase)"
    echo "  4. Then write the command code"
    echo "  5. Verify tests PASS (green phase)"
    echo "  6. Commit test AND code together"
    echo ""
    exit 1
fi

echo ""

# Check 2: All tests must pass
echo "Check 2: Run all tests to verify they pass"
echo "------------------------------------------------------------"
echo ""

# Run only the tests related to staged commands
TEST_FILES=()
for cmd_file in $STAGED_COMMANDS; do
    config_name=$(echo "$cmd_file" | sed 's|configs/\([^/]*\)/.*|\1|')
    cmd_relative=$(echo "$cmd_file" | sed 's|.*/\.claude/commands/||' | sed 's|\.md$||')
    cmd_normalized=$(echo "$cmd_relative" | tr '/' '-')

    if [ "$config_name" = "global" ]; then
        test_name="$cmd_normalized"
    else
        if [[ "$cmd_normalized" =~ ^${config_name}- ]]; then
            test_name="$cmd_normalized"
        else
            test_name="${config_name}-${cmd_normalized}"
        fi
    fi

    test_file="tests/func/test-${test_name}-deep.sh"
    if [ -f "$test_file" ]; then
        TEST_FILES+=("$test_file")
    fi
done

# Run each test
FAILED_TESTS=()
for test_file in "${TEST_FILES[@]}"; do
    echo "Running: $test_file"
    if ! bash "$test_file" > /tmp/tdd-test-output.log 2>&1; then
        FAILED_TESTS+=("$test_file")
        echo "  FAILED"
        echo ""
        echo "Test output:"
        tail -50 /tmp/tdd-test-output.log
        echo ""
    else
        echo "  PASSED"
    fi
done

if [ ${#FAILED_TESTS[@]} -gt 0 ]; then
    echo ""
    echo "TEST FAILURES - Cannot commit!"
    echo ""
    echo "The following tests failed:"
    for failed in "${FAILED_TESTS[@]}"; do
        echo "  FAIL: $failed"
    done
    echo ""
    echo "TDD Rule: All tests must PASS before commit!"
    echo ""
    echo "Fix the failing tests, then try again."
    echo ""
    exit 1
fi

echo ""
echo "============================================================"
echo "TDD Enforcement: All checks passed!"
echo "============================================================"
echo ""
echo "Summary:"
echo "  - All commands have corresponding tests"
echo "  - All tests passed"
echo "  - Ready to commit"
echo ""

exit 0

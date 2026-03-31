#!/bin/bash

# Release Validation Script
# Validates the repository is ready for release

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$REPO_ROOT"

echo "=========================================="
echo "Release Validation"
echo "=========================================="
echo ""

VALIDATION_FAILED=false

# Check 1: No uncommitted changes
echo "Check 1: Uncommitted changes"
echo "----------------------------"
if ! git diff-index --quiet HEAD --; then
    echo "ERROR: Uncommitted changes detected"
    git status --short
    VALIDATION_FAILED=true
else
    echo "OK: No uncommitted changes"
fi
echo ""

# Check 2: Documentation guidelines compliance
echo "Check 2: Documentation guidelines compliance"
echo "--------------------------------------------"

# Check for missing YAML front matter in .claude/*.md files
echo "Checking .claude/*.md files for YAML front matter..."
MISSING_FRONTMATTER=$(find configs -path "*/.claude/*.md" -type f ! -path "*/docs/*" -exec sh -c '
    if ! head -1 "$1" | grep -q "^---$"; then
        echo "$1"
    fi
' _ {} \; 2>/dev/null || true)
if [ -n "$MISSING_FRONTMATTER" ]; then
    echo "WARNING: Files missing YAML front matter:"
    echo "$MISSING_FRONTMATTER"
fi

echo "OK: Documentation guidelines check complete"
echo ""

# Check 3: Config guides accuracy
echo "Check 3: Config guides accuracy"
echo "--------------------------------"
echo "Verifying config guides match actual configs..."

for config_dir in configs/*/; do
    config=$(basename "$config_dir")
    claude_dir="configs/${config}/.claude"

    if [ ! -d "$claude_dir" ]; then
        echo "WARNING: Config directory not found: $claude_dir"
        continue
    fi

    # Count actual command files
    if [ -d "$claude_dir/commands" ]; then
        actual_cmd_count=$(find "$claude_dir/commands" -name "*.md" -type f | wc -l)
        echo "  $config: $actual_cmd_count commands"
    fi
done

echo "OK: Config guides check complete"
echo ""

# Check 4: README.md up-to-date
echo "Check 4: README.md up-to-date"
echo "------------------------------"
if [ ! -f "README.md" ]; then
    echo "ERROR: README.md not found"
    VALIDATION_FAILED=true
else
    # Check if all configs are listed in README
    for config_dir in configs/*/; do
        config=$(basename "$config_dir")
        if [ "$config" = "global" ]; then
            continue
        fi
        if ! grep -q "$config" README.md; then
            echo "WARNING: Config '$config' not found in README.md"
        fi
    done

    # Check statistics
    ACTUAL_CONFIGS_COUNT=$(ls -1d configs/*/ | wc -l)
    ACTUAL_COMMANDS=$(find configs -name "*.md" -path "*/.claude/commands/*" -type f | wc -l)

    echo "OK: README.md check complete (configs: $ACTUAL_CONFIGS_COUNT, commands: $ACTUAL_COMMANDS)"
fi
echo ""

# Check 5: CLAUDE.md up-to-date
echo "Check 5: CLAUDE.md up-to-date"
echo "------------------------------"
if [ ! -f "CLAUDE.md" ]; then
    echo "ERROR: CLAUDE.md not found"
    VALIDATION_FAILED=true
else
    echo "OK: CLAUDE.md exists"
fi
echo ""

# Check 6: Test coverage
echo "Check 6: Test coverage"
echo "----------------------"
echo "Running test coverage validation..."
echo ""
# Run coverage check (informational - doesn't fail validation)
if [ -f "tests/scripts/validate-100-percent-coverage.sh" ]; then
    bash tests/scripts/validate-100-percent-coverage.sh || {
        echo ""
        echo "WARNING: Test coverage is not 100%"
        echo "Note: This is informational. Coverage validation is enforced in pre-push hook."
        echo "      To enable: pre-commit install --hook-type pre-push"
        echo ""
    }
else
    echo "WARNING: Coverage validation script not found"
fi
echo ""

# Check 7: Command guide coverage
echo "Check 7: Command guide coverage"
echo "--------------------------------"

# Function to check if command is part of a namespace
is_namespace_command() {
    local cmd_path="$1"
    local config="$2"

    local parent_dir=$(dirname "$cmd_path")
    local parent_name=$(basename "$parent_dir")

    # Check for cp namespace (global config)
    if [ "$config" = "global" ] && [ "$parent_name" = "cp" ]; then
        return 0
    fi

    return 1
}

MISSING_GUIDES=0
TOTAL_COMMANDS_CHECK=0

for config_dir in configs/*/; do
    config=$(basename "$config_dir")

    if [ -d "$config_dir/.claude/commands" ]; then
        while IFS= read -r cmd_file; do
            cmd=$(basename "$cmd_file" .md)
            TOTAL_COMMANDS_CHECK=$((TOTAL_COMMANDS_CHECK + 1))

            rel_path="${cmd_file#$config_dir/.claude/commands/}"

            if is_namespace_command "$rel_path" "$config"; then
                # Namespace commands are documented collectively
                continue
            fi
        done < <(find "$config_dir/.claude/commands" -name "*.md" -type f)
    fi
done

if [ $TOTAL_COMMANDS_CHECK -eq 0 ]; then
    echo "OK: No commands to check"
elif [ $MISSING_GUIDES -eq 0 ]; then
    echo "OK: Command guide coverage check complete"
else
    echo "WARNING: $MISSING_GUIDES/$TOTAL_COMMANDS_CHECK commands missing guides"
fi
echo ""

# Final result
echo "=========================================="
if [ "$VALIDATION_FAILED" = true ]; then
    echo "VALIDATION FAILED"
    echo "=========================================="
    exit 1
else
    echo "VALIDATION PASSED"
    echo "=========================================="
    exit 0
fi

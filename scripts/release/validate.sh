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
    guide_file="docs/guides/configs/${config}-guide.md"

    if [ ! -d "$claude_dir" ]; then
        echo "WARNING: Config directory not found: $claude_dir"
        continue
    fi

    # Count actual command files
    if [ -d "$claude_dir/commands" ]; then
        actual_cmd_count=$(find "$claude_dir/commands" -name "*.md" -type f | wc -l)
        echo "  $config: $actual_cmd_count commands"

        # If guide exists, check count matches
        if [ -f "$guide_file" ]; then
            guide_cmd_count=$(grep -o "Commands ([0-9]*)" "$guide_file" | grep -o "[0-9]*" || echo "0")
            if [ "$actual_cmd_count" != "$guide_cmd_count" ] && [ "$guide_cmd_count" != "0" ]; then
                echo "  WARNING: $config commands count mismatch (actual: $actual_cmd_count, guide: $guide_cmd_count)"
            fi
        fi
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
        if ! grep -qi "$config" README.md; then
            echo "WARNING: Config '$config' not found in README.md"
        fi
    done

    # Check statistics in README.md
    ACTUAL_CONFIGS_COUNT=$(ls -1d configs/*/ | wc -l)
    ACTUAL_COMMANDS=$(find configs -name "*.md" -path "*/.claude/commands/*" -type f | wc -l)

    README_CONFIGS=$(grep -o "[0-9]* configs" README.md | head -1 | grep -o "[0-9]*")
    README_COMMANDS=$(grep -o "[0-9]* commands" README.md | head -1 | grep -o "[0-9]*")

    if [ -n "$README_CONFIGS" ] && [ "$ACTUAL_CONFIGS_COUNT" != "$README_CONFIGS" ]; then
        echo "ERROR: README.md configs count mismatch (actual: $ACTUAL_CONFIGS_COUNT, README: $README_CONFIGS)"
        VALIDATION_FAILED=true
    fi

    if [ -n "$README_COMMANDS" ] && [ "$ACTUAL_COMMANDS" != "$README_COMMANDS" ]; then
        echo "ERROR: README.md commands count mismatch (actual: $ACTUAL_COMMANDS, README: $README_COMMANDS)"
        VALIDATION_FAILED=true
    fi

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

# Function to get namespace guide file
get_namespace_guide() {
    local cmd_path="$1"
    local config="$2"

    local parent_dir=$(dirname "$cmd_path")
    local parent_name=$(basename "$parent_dir")

    # cp namespace -> cp-guide.md
    if [ "$config" = "global" ] && [ "$parent_name" = "cp" ]; then
        echo "configs/global/docs/cp-guide.md"
        return
    fi

    echo ""
}

MISSING_GUIDES=0
TOTAL_COMMANDS=0
CHECKED_NAMESPACES=""

for config_dir in configs/*/; do
    config=$(basename "$config_dir")
    config_docs="configs/${config}/docs"

    if [ -d "$config_dir/.claude/commands" ]; then
        # Find all command files
        while IFS= read -r cmd_file; do
            cmd=$(basename "$cmd_file" .md)
            TOTAL_COMMANDS=$((TOTAL_COMMANDS + 1))

            # Get relative path from commands directory
            rel_path="${cmd_file#$config_dir/.claude/commands/}"

            # Check if this is a namespace command
            if is_namespace_command "$rel_path" "$config"; then
                namespace_guide=$(get_namespace_guide "$rel_path" "$config")
                ns_key="${config}:$(dirname "$rel_path")"

                # Only warn once per namespace
                if echo "$CHECKED_NAMESPACES" | grep -qF "$ns_key"; then
                    continue
                fi
                CHECKED_NAMESPACES="$CHECKED_NAMESPACES $ns_key"

                if [ -n "$namespace_guide" ] && [ -f "$namespace_guide" ]; then
                    continue
                else
                    echo "WARNING: Namespace guide missing: $namespace_guide"
                    MISSING_GUIDES=$((MISSING_GUIDES + 1))
                fi
            else
                # Check for individual command guide
                guide_file="${config_docs}/${cmd}-guide.md"
                if [ ! -f "$guide_file" ]; then
                    echo "WARNING: Missing guide for /$cmd: $guide_file"
                    MISSING_GUIDES=$((MISSING_GUIDES + 1))
                fi
            fi
        done < <(find "$config_dir/.claude/commands" -name "*.md" -type f)
    fi
done

if [ $TOTAL_COMMANDS -eq 0 ]; then
    echo "OK: No commands to check"
elif [ $MISSING_GUIDES -eq 0 ]; then
    echo "OK: All commands have guides (100% coverage)"
else
    COVERAGE=$((100 * (TOTAL_COMMANDS - MISSING_GUIDES) / TOTAL_COMMANDS))
    echo "WARNING: $MISSING_GUIDES/$TOTAL_COMMANDS commands missing guides (${COVERAGE}% coverage)"
fi
echo ""

# Check 8: Agent documentation coverage
echo "Check 8: Agent documentation coverage"
echo "--------------------------------------"

MISSING_AGENT_DOCS=0
TOTAL_AGENTS=0

for config_dir in configs/*/; do
    config=$(basename "$config_dir")

    if [ -d "$config_dir/.claude/agents" ]; then
        # Find documentation source: config guide or CLAUDE.md
        guide_file="docs/guides/configs/${config}-guide.md"
        config_claude="$config_dir/CLAUDE.md"

        doc_file=""
        if [ -f "$guide_file" ]; then
            doc_file="$guide_file"
        elif [ -f "$config_claude" ]; then
            doc_file="$config_claude"
        fi

        while IFS= read -r agent_file; do
            agent=$(basename "$agent_file" .md)
            TOTAL_AGENTS=$((TOTAL_AGENTS + 1))

            if [ -z "$doc_file" ]; then
                echo "WARNING: [$config] agent '$agent' has no documentation file"
                MISSING_AGENT_DOCS=$((MISSING_AGENT_DOCS + 1))
            elif ! grep -q "$agent" "$doc_file" 2>/dev/null; then
                echo "WARNING: [$config] agent '$agent' not mentioned in $(basename "$doc_file")"
                MISSING_AGENT_DOCS=$((MISSING_AGENT_DOCS + 1))
            fi
        done < <(find "$config_dir/.claude/agents" -name "*.md" -type f)
    fi
done

if [ $TOTAL_AGENTS -eq 0 ]; then
    echo "OK: No agents to check"
elif [ $MISSING_AGENT_DOCS -eq 0 ]; then
    echo "OK: All agents are documented ($TOTAL_AGENTS agents checked)"
else
    echo "WARNING: $MISSING_AGENT_DOCS/$TOTAL_AGENTS agents missing documentation"
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

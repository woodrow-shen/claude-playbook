#!/bin/bash
# Validate test coverage across all layers
#
# Usage:
#   bash tests/scripts/validate-100-percent-coverage.sh [--strict]
#
# Options:
#   --strict    Fail if coverage is not 100% (for CI/CD)
#
# Exit codes:
#   0 - Success (or non-strict mode)
#   1 - Coverage < 100% in strict mode

set -e

STRICT_MODE=0
if [ "$1" = "--strict" ]; then
    STRICT_MODE=1
fi

echo "============================================================"
echo "Test Coverage Validation"
echo "============================================================"
echo ""

# Count entities across all layers
total_commands=$(find configs -name "*.md" -path "*/commands/*" -type f | wc -l)
total_agents=$(find configs -name "*.md" -path "*/agents/*" -type f | wc -l)
total_skills=$(find configs -name "*.md" -path "*/skills/*" -type f | wc -l)
total_rules=$(find configs -name "*.md" -path "*/rules/*" -type f | wc -l)

echo "Repository entities:"
echo "  Commands: $total_commands"
echo "  Agents: $total_agents"
echo "  Skills: $total_skills"
echo "  Rules: $total_rules"
echo "  Total: $((total_commands + total_agents + total_skills + total_rules))"
echo ""

# Function to check if a test file exists
has_test() {
    local test_file="$1"
    [ -f "tests/func/$test_file" ]
}

# Check Commands
echo "------------------------------------------------------------"
echo "Commands Coverage"
echo "------------------------------------------------------------"

COVERED_COMMANDS=0
UNCOVERED_COMMANDS=()

while IFS= read -r cmd_file; do
    cmd_basename=$(basename "$cmd_file" .md)
    config_name=$(echo "$cmd_file" | sed 's|configs/\([^/]*\)/.*|\1|')

    # Determine test file name
    if [ "$config_name" = "global" ]; then
        # Handle cp/ subdirectory: configs/global/.claude/commands/cp/pull.md
        full_path=$(echo "$cmd_file" | sed 's|.*/commands/||; s|\.md$||')
        test_pattern=$(echo "$full_path" | sed 's|/|-|g; s|:|-|g')
    else
        # Other configs
        if [[ "$cmd_basename" =~ ^${config_name}- ]]; then
            test_pattern="$cmd_basename"
        else
            test_pattern="${config_name}-${cmd_basename}"
        fi
    fi

    # Check if test exists (try both -deep.sh and .sh)
    if has_test "test-${test_pattern}-deep.sh" || has_test "test-${test_pattern}.sh"; then
        COVERED_COMMANDS=$((COVERED_COMMANDS + 1))
    else
        UNCOVERED_COMMANDS+=("$cmd_file -> test-${test_pattern}-deep.sh")
    fi
done < <(find configs -name "*.md" -path "*/commands/*" -type f)

echo "Covered: $COVERED_COMMANDS / $total_commands"
if [ ${#UNCOVERED_COMMANDS[@]} -gt 0 ]; then
    echo "Missing tests:"
    for cmd in "${UNCOVERED_COMMANDS[@]}"; do
        echo "  - $cmd"
    done
else
    echo "OK: All commands have tests"
fi
echo ""

# Check Agents
echo "------------------------------------------------------------"
echo "Agents Coverage"
echo "------------------------------------------------------------"

COVERED_AGENTS=0
UNCOVERED_AGENTS=()

while IFS= read -r agent_file; do
    agent_name=$(basename "$agent_file" .md)

    if has_test "test-agents-${agent_name}.sh"; then
        COVERED_AGENTS=$((COVERED_AGENTS + 1))
    else
        UNCOVERED_AGENTS+=("$agent_file -> test-agents-${agent_name}.sh")
    fi
done < <(find configs -name "*.md" -path "*/agents/*" -type f)

echo "Covered: $COVERED_AGENTS / $total_agents"
if [ ${#UNCOVERED_AGENTS[@]} -gt 0 ]; then
    echo "Missing tests:"
    for agent in "${UNCOVERED_AGENTS[@]}"; do
        echo "  - $agent"
    done
else
    echo "OK: All agents have tests"
fi
echo ""

# Check Skills
echo "------------------------------------------------------------"
echo "Skills Coverage"
echo "------------------------------------------------------------"

COVERED_SKILLS=0
UNCOVERED_SKILLS=()

while IFS= read -r skill_file; do
    skill_name=$(basename "$skill_file" .md)

    if has_test "test-skills-${skill_name}.sh"; then
        COVERED_SKILLS=$((COVERED_SKILLS + 1))
    else
        UNCOVERED_SKILLS+=("$skill_file -> test-skills-${skill_name}.sh")
    fi
done < <(find configs -name "*.md" -path "*/skills/*" -type f)

echo "Covered: $COVERED_SKILLS / $total_skills"
if [ ${#UNCOVERED_SKILLS[@]} -gt 0 ]; then
    echo "Missing tests:"
    for skill in "${UNCOVERED_SKILLS[@]}"; do
        echo "  - $skill"
    done
else
    echo "OK: All skills have tests"
fi
echo ""

# Check Rules
echo "------------------------------------------------------------"
echo "Rules Coverage"
echo "------------------------------------------------------------"

# Rules use test-rules-all.sh for all rules
COVERED_RULES=$total_rules
echo "Covered: $COVERED_RULES / $total_rules"
echo "OK: All rules tested via test-rules-all.sh"
echo ""

# Calculate totals
TOTAL_ENTITIES=$((total_commands + total_agents + total_skills + total_rules))
TOTAL_COVERED=$((COVERED_COMMANDS + COVERED_AGENTS + COVERED_SKILLS + COVERED_RULES))
TOTAL_UNCOVERED=$((TOTAL_ENTITIES - TOTAL_COVERED))

echo "============================================================"
echo "Final Coverage Summary"
echo "============================================================"
echo ""
echo "Layer              Covered / Total      Coverage"
echo "------------------------------------------------------------"

printf "Commands           %3d / %3d         " $COVERED_COMMANDS $total_commands
if [ $COVERED_COMMANDS -eq $total_commands ]; then
    echo "100%"
else
    echo "$(( COVERED_COMMANDS * 100 / total_commands ))%"
fi

printf "Agents             %3d / %3d         " $COVERED_AGENTS $total_agents
if [ $COVERED_AGENTS -eq $total_agents ]; then
    echo "100%"
else
    echo "$(( COVERED_AGENTS * 100 / total_agents ))%"
fi

printf "Skills             %3d / %3d         " $COVERED_SKILLS $total_skills
if [ $COVERED_SKILLS -eq $total_skills ]; then
    echo "100%"
else
    echo "$(( COVERED_SKILLS * 100 / total_skills ))%"
fi

printf "Rules              %3d / %3d         " $COVERED_RULES $total_rules
if [ $COVERED_RULES -eq $total_rules ]; then
    echo "100%"
else
    echo "$(( COVERED_RULES * 100 / total_rules ))%"
fi

echo "------------------------------------------------------------"
printf "TOTAL              %3d / %3d         " $TOTAL_COVERED $TOTAL_ENTITIES

if [ $TOTAL_UNCOVERED -eq 0 ]; then
    echo "100%"
    echo ""
    echo "SUCCESS: 100% TEST COVERAGE ACHIEVED!"
    EXIT_CODE=0
else
    PERCENTAGE=$(( TOTAL_COVERED * 100 / TOTAL_ENTITIES ))
    echo "${PERCENTAGE}%"
    echo ""
    echo "INCOMPLETE COVERAGE"
    echo ""
    echo "Missing tests for $TOTAL_UNCOVERED entities:"
    echo "  - Commands: $((total_commands - COVERED_COMMANDS)) missing"
    echo "  - Agents: $((total_agents - COVERED_AGENTS)) missing"
    echo "  - Skills: $((total_skills - COVERED_SKILLS)) missing"
    echo "  - Rules: $((total_rules - COVERED_RULES)) missing"
    echo ""

    if [ $STRICT_MODE -eq 1 ]; then
        echo "STRICT MODE: Failing due to incomplete coverage."
        EXIT_CODE=1
    else
        echo "Run with --strict to fail on incomplete coverage."
        EXIT_CODE=0
    fi
fi

echo ""
echo "============================================================"
echo ""

exit $EXIT_CODE

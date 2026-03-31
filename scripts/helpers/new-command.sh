#!/bin/bash
# Helper script to create a new command from secure template
# Usage: bash scripts/helpers/new-command.sh <config-name> <command-name>

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

usage() {
    cat << EOF
Usage: $0 <config-name> <command-name>

Create a new command from secure template with corresponding test file.

Arguments:
  config-name   Name of the config (e.g., global, debugging)
  command-name  Name of the command (e.g., my-new-command)

Examples:
  $0 global my-helper
  $0 debugging trace-logs

This script will:
  1. Check if config exists
  2. Copy secure-command-template.md
  3. Replace placeholders with your command name
  4. Create empty test file (TDD: write test first)
  5. Open the files in your editor

Template location: docs/templates/secure-command-template.md
EOF
    exit 1
}

# Check arguments
if [ $# -ne 2 ]; then
    usage
fi

CONFIG_NAME="$1"
COMMAND_NAME="$2"

# Validate command name (kebab-case)
if ! echo "$COMMAND_NAME" | grep -qE '^[a-z][a-z0-9-]*$'; then
    echo -e "${RED}Error: Command name must be in kebab-case (lowercase, hyphens only)${NC}"
    echo "  Examples: my-command, trace-logs, build-image"
    exit 1
fi

# Check if config exists
CONFIG_DIR="$WORKSPACE_ROOT/configs/$CONFIG_NAME"
if [ ! -d "$CONFIG_DIR" ]; then
    echo -e "${RED}Error: Config '$CONFIG_NAME' does not exist${NC}"
    echo ""
    echo "Available configs:"
    ls -1 "$WORKSPACE_ROOT/configs/" | sed 's/^/  - /'
    exit 1
fi

# Create commands directory if not exists
COMMANDS_DIR="$CONFIG_DIR/.claude/commands"
mkdir -p "$COMMANDS_DIR"

# Check if command already exists
COMMAND_FILE="$COMMANDS_DIR/$COMMAND_NAME.md"
if [ -f "$COMMAND_FILE" ]; then
    echo -e "${RED}Error: Command already exists: $COMMAND_FILE${NC}"
    exit 1
fi

# Copy template
TEMPLATE="$WORKSPACE_ROOT/docs/templates/secure-command-template.md"
if [ ! -f "$TEMPLATE" ]; then
    echo -e "${RED}Error: Template not found: $TEMPLATE${NC}"
    exit 1
fi

echo -e "${GREEN}Creating new command from secure template...${NC}"
echo ""

# Copy and customize template
cp "$TEMPLATE" "$COMMAND_FILE"

# Replace placeholders
sed -i "s/name: command-name/name: $COMMAND_NAME/" "$COMMAND_FILE"
sed -i "s/description: Brief description/description: TODO: Add description for $COMMAND_NAME/" "$COMMAND_FILE"
sed -i "s/# Command Name/# $COMMAND_NAME/" "$COMMAND_FILE"

echo -e "${GREEN}Created: $COMMAND_FILE${NC}"

# Create test file (TDD)
if [ "$CONFIG_NAME" = "global" ]; then
    TEST_NAME="$COMMAND_NAME"
else
    TEST_NAME="${CONFIG_NAME}-${COMMAND_NAME}"
fi

TEST_DIR="$WORKSPACE_ROOT/tests/func"
mkdir -p "$TEST_DIR"
TEST_FILE="$TEST_DIR/test-${TEST_NAME}-deep.sh"

if [ ! -f "$TEST_FILE" ]; then
    cat > "$TEST_FILE" << 'TESTEOF'
#!/bin/bash
# TDD test for command: COMMAND_PLACEHOLDER
# Write your tests here BEFORE implementing the command.
#
# Exit codes:
#   0 - All tests passed
#   1 - Test failed

set -e

echo "Running tests for: COMMAND_PLACEHOLDER"
echo ""

# TODO: Add test cases
# Example:
# echo "Test 1: Command file exists"
# if [ ! -f "COMMAND_FILE_PLACEHOLDER" ]; then
#     echo "FAIL: Command file not found"
#     exit 1
# fi
# echo "PASS"

echo ""
echo "WARNING: No tests implemented yet - TDD violation!"
exit 1
TESTEOF

    sed -i "s|COMMAND_PLACEHOLDER|$COMMAND_NAME|g" "$TEST_FILE"
    sed -i "s|COMMAND_FILE_PLACEHOLDER|$COMMAND_FILE|g" "$TEST_FILE"
    chmod +x "$TEST_FILE"

    echo -e "${GREEN}Created: $TEST_FILE${NC}"
else
    echo -e "${YELLOW}Test file already exists: $TEST_FILE${NC}"
fi

echo ""
echo "Next steps (TDD workflow):"
echo ""
echo "1. Write tests FIRST (red phase):"
echo "   ${YELLOW}vim $TEST_FILE${NC}"
echo ""
echo "2. Verify tests FAIL:"
echo "   ${YELLOW}bash $TEST_FILE${NC}"
echo ""
echo "3. Implement the command (green phase):"
echo "   ${YELLOW}vim $COMMAND_FILE${NC}"
echo ""
echo "4. Verify tests PASS:"
echo "   ${YELLOW}bash $TEST_FILE${NC}"
echo ""
echo "5. Commit test AND code together:"
echo "   ${YELLOW}git add $TEST_FILE $COMMAND_FILE${NC}"
echo "   ${YELLOW}git commit -s -m \"claude/configs/$CONFIG_NAME: add $COMMAND_NAME command\"${NC}"
echo ""

# Open in editor if EDITOR is set
if [ -n "$EDITOR" ]; then
    echo -e "${GREEN}Opening test file in editor (write tests first!)...${NC}"
    $EDITOR "$TEST_FILE"
elif command -v vim > /dev/null; then
    echo -e "${GREEN}Opening test file in vim (write tests first!)...${NC}"
    vim "$TEST_FILE"
else
    echo -e "${YELLOW}No editor found. Please edit manually:${NC}"
    echo "   $TEST_FILE"
fi

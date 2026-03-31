#!/bin/bash

# Check that claude-playbook submodule directory is not staged

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$REPO_ROOT"

echo "Checking for staged claude-playbook submodule..."

# Check if claude-playbook directory is staged
if git diff --cached --name-only | grep -q "^claude-playbook/"; then
    echo ""
    echo "ERROR: claude-playbook submodule directory is staged!"
    echo ""
    echo "NEVER stage the claude-playbook/ directory."
    echo ""
    echo "Only stage:"
    echo "  - .gitmodules (submodule configuration)"
    echo "  - .claude (symlink or directory with your configs)"
    echo ""
    echo "To unstage:"
    echo "  git reset HEAD claude-playbook/"
    echo ""
    exit 1
fi

echo "PASSED: No submodule directory staged"
exit 0

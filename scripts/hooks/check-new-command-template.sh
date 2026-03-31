#!/bin/bash
# Pre-commit hook to verify new commands use secure template patterns
# This checks if new command files follow security best practices

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$WORKSPACE_ROOT"

# Get new or modified command files in this commit
NEW_COMMANDS=$(git diff --cached --name-only --diff-filter=A | grep -E "\.claude/commands/.*\.md$" || true)
MODIFIED_COMMANDS=$(git diff --cached --name-only --diff-filter=M | grep -E "\.claude/commands/.*\.md$" || true)

if [ -z "$NEW_COMMANDS" ] && [ -z "$MODIFIED_COMMANDS" ]; then
    # No command files changed
    exit 0
fi

echo "Checking command files for secure template compliance..."
echo ""

ERRORS=0

# Function to check command file
check_command_file() {
    local file="$1"
    local is_new="$2"
    local errors=0

    echo "Checking: $file"

    # Check 1: For new commands, encourage security patterns
    if [ "$is_new" = "true" ]; then
        has_security_patterns=0

        # Check for input validation
        if grep -q "validate\|validation\|check.*input\|sanitize" "$file"; then
            has_security_patterns=$((has_security_patterns + 1))
        fi

        # Check for error handling
        if grep -qE "set -e|exit [0-9]|if.*then.*exit" "$file"; then
            has_security_patterns=$((has_security_patterns + 1))
        fi

        # Check for safety comments
        if grep -q "# SAFETY:\|# Security:\|# WARNING:" "$file"; then
            has_security_patterns=$((has_security_patterns + 1))
        fi

        if [ $has_security_patterns -eq 0 ]; then
            echo "  ⚠ Warning: New command lacks security patterns"
            echo "     Consider using: docs/templates/secure-command-template.md"
            echo "     Review: docs/security/SECURITY-CHECKLIST.md"
        else
            echo "  ✓ Has security patterns ($has_security_patterns found)"
        fi
    fi

    # Check 2: No obvious security issues
    if grep -E 'eval.*\$|exec.*\$[A-Z_]+[^}]' "$file" | grep -v "# SAFETY:" > /dev/null 2>&1; then
        echo "  ✗ Potential command injection (eval/exec with variable)"
        echo "     Add '# SAFETY:' comment if this is intentional"
        errors=$((errors + 1))
    fi

    if [ $errors -eq 0 ]; then
        echo "  ✓ All checks passed"
    fi

    return $errors
}

# Check new commands
for cmd in $NEW_COMMANDS; do
    if ! check_command_file "$cmd" "true"; then
        ERRORS=$((ERRORS + 1))
    fi
    echo ""
done

# Check modified commands (less strict)
for cmd in $MODIFIED_COMMANDS; do
    if ! check_command_file "$cmd" "false"; then
        ERRORS=$((ERRORS + 1))
    fi
    echo ""
done

if [ $ERRORS -gt 0 ]; then
    echo "============================================================"
    echo "✗ Command validation failed with $ERRORS error(s)"
    echo "============================================================"
    echo ""
    echo "Review security guidelines:"
    echo "  cat docs/security/SECURITY-CHECKLIST.md"
    echo ""
    exit 1
fi

echo "✓ All command files validated successfully"
exit 0

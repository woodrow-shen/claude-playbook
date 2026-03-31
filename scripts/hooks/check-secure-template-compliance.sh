#!/bin/bash
# Enhanced pre-commit hook to verify commands comply with secure template
# This validates against the actual secure-command-template.md structure

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$WORKSPACE_ROOT"

TEMPLATE_FILE="docs/templates/secure-command-template.md"

# Get new command files in this commit
NEW_COMMANDS=$(git diff --cached --name-only --diff-filter=A | grep -E "\.claude/commands/.*\.md$" || true)

if [ -z "$NEW_COMMANDS" ]; then
    exit 0
fi

echo "Checking new commands against secure template..."
echo ""

ERRORS=0

# Function to calculate template compliance score
check_template_compliance() {
    local file="$1"
    local score=0
    local max_score=8
    local warnings=0

    echo "Checking: $file"

    # Category 1: Security Sections (3 points)
    local security_score=0

    # Input Validation section
    if grep -qE "## Input Validation|### Input Validation|## Validation" "$file"; then
        security_score=$((security_score + 1))
    fi

    # Error Handling
    if grep -qE "## Error Handling|### Error Handling" "$file"; then
        security_score=$((security_score + 1))
    fi

    # Security Notes/Comments
    if grep -qE "## Security|### Security|# SAFETY:|# Security:" "$file"; then
        security_score=$((security_score + 1))
    fi

    score=$((score + security_score))
    echo "  Security sections: $security_score/3"

    # Category 2: Execution Steps (2 points)
    local steps=$(grep -cE "^## Step [0-9]|^### Step [0-9]" "$file" || echo 0)
    if [ "$steps" -ge 2 ]; then
        score=$((score + 2))
        echo "  ✓ Execution steps ($steps steps) (2/2)"
    elif [ "$steps" -eq 1 ]; then
        score=$((score + 1))
        echo "  ⚠ Only 1 step found (1/2)"
        warnings=$((warnings + 1))
    else
        echo "  ✗ No execution steps (0/2)"
    fi

    # Category 3: Security Patterns in Code (2 points)
    local pattern_score=0

    # Input validation patterns
    if grep -qE "validate|validation|check.*input|sanitize|\[\[ -n.*\]\]|\[\[ -z.*\]\]" "$file"; then
        pattern_score=$((pattern_score + 1))
    fi

    # Error handling patterns
    if grep -qE "set -e|exit [0-9]|if.*then.*exit|\|\| exit" "$file"; then
        pattern_score=$((pattern_score + 1))
    fi

    score=$((score + pattern_score))
    echo "  Security patterns: $pattern_score/2"

    # Category 4: No Dangerous Patterns (1 point - critical)
    if grep -E 'eval.*\$|exec.*\$[A-Z_]+[^}]|bash.*\$|sh.*\$' "$file" | grep -v "# SAFETY:" > /dev/null 2>&1; then
        echo "  ✗ CRITICAL: Dangerous pattern detected (eval/exec/bash with variable)"
        echo "     Add '# SAFETY: <reason>' comment if this is intentional and safe"
        return 1  # Critical failure
    else
        score=$((score + 1))
        echo "  ✓ No dangerous patterns (1/1)"
    fi

    # Calculate compliance percentage
    local percentage=$((score * 100 / max_score))

    echo ""
    echo "  Compliance Score: $score/$max_score ($percentage%)"

    # Determine pass/fail
    if [ $percentage -ge 80 ]; then
        echo "  ✓ PASS: Meets security template requirements"
        if [ $warnings -gt 0 ]; then
            echo "     (but has $warnings warning(s))"
        fi
        return 0
    elif [ $percentage -ge 60 ]; then
        echo "  ⚠ WARNING: Weak compliance ($percentage%)"
        echo "     Strongly recommend reviewing: $TEMPLATE_FILE"
        return 0
    else
        echo "  ✗ FAIL: Insufficient compliance ($percentage% < 60%)"
        echo ""
        echo "     Required improvements:"
        if [ $security_score -lt 2 ]; then
            echo "       - Add security sections (Input Validation, Error Handling)"
        fi
        if [ $steps -lt 1 ]; then
            echo "       - Add execution steps (## Step 1, ## Step 2, ...)"
        fi
        if [ $pattern_score -lt 1 ]; then
            echo "       - Add security patterns (validation, error handling)"
        fi
        echo ""
        echo "     Review the template:"
        echo "       $TEMPLATE_FILE"
        echo ""
        return 1
    fi
}

# Check all new commands
for cmd in $NEW_COMMANDS; do
    if ! check_template_compliance "$cmd"; then
        ERRORS=$((ERRORS + 1))
    fi
    echo ""
done

if [ $ERRORS -gt 0 ]; then
    echo "============================================================"
    echo "✗ Secure Template Compliance Check Failed"
    echo "============================================================"
    echo "$ERRORS command(s) do not meet security template requirements."
    echo ""
    echo "Security Guidelines:"
    echo "  - Checklist: docs/security/SECURITY-CHECKLIST.md"
    echo "  - Template: $TEMPLATE_FILE"
    echo "  - Guide: docs/security/secure-command-development.md"
    echo ""
    exit 1
fi

echo "✓ All new commands comply with secure template"
exit 0

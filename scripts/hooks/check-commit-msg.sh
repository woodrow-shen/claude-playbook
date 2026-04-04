#!/bin/bash

# Check commit message format

set -e

COMMIT_MSG_FILE="$1"

if [ ! -f "$COMMIT_MSG_FILE" ]; then
    echo "ERROR: Commit message file not found: $COMMIT_MSG_FILE"
    exit 1
fi

COMMIT_MSG=$(cat "$COMMIT_MSG_FILE")

# Skip merge commits
if echo "$COMMIT_MSG" | grep -q "^Merge "; then
    exit 0
fi

# Skip revert commits
if echo "$COMMIT_MSG" | grep -q "^Revert "; then
    exit 0
fi

echo "Checking commit message format..."

# Check for scope prefix
FIRST_LINE=$(echo "$COMMIT_MSG" | head -1)

if ! echo "$FIRST_LINE" | grep -qE "^claude(/[a-z0-9-]+)*: "; then
    echo ""
    echo "ERROR: Commit message must start with scope prefix"
    echo ""
    echo "Format: <scope>: <description>"
    echo ""
    echo "Valid scopes:"
    echo "  claude:                    - Root-level changes"
    echo "  claude/configs/<config>:   - Config-specific changes"
    echo "  claude/docs:               - Documentation changes"
    echo "  claude/scripts:            - Script changes"
    echo "  claude/tests:              - Test changes"
    echo ""
    echo "Examples:"
    echo "  claude: add TODO.md"
    echo "  claude/configs/global: add new command"
    echo "  claude/docs: update guide"
    echo ""
    echo "Your message:"
    echo "  $FIRST_LINE"
    echo ""
    exit 1
fi

# Extract description (part after "scope: ")
DESCRIPTION=$(echo "$FIRST_LINE" | sed 's/^[^:]*: //')

# Check description starts with lowercase
FIRST_CHAR=$(echo "$DESCRIPTION" | cut -c1)
if echo "$FIRST_CHAR" | grep -qE "^[A-Z]$"; then
    echo ""
    echo "ERROR: Description must start with lowercase"
    echo ""
    echo "  Wrong: claude: Add new feature"
    echo "  Right: claude: add new feature"
    echo ""
    echo "Your message:"
    echo "  $FIRST_LINE"
    echo ""
    exit 1
fi

# Check no trailing period
if echo "$FIRST_LINE" | grep -qE '\.$'; then
    echo ""
    echo "ERROR: Subject line must not end with a period"
    echo ""
    echo "  Wrong: claude: add new feature."
    echo "  Right: claude: add new feature"
    echo ""
    echo "Your message:"
    echo "  $FIRST_LINE"
    echo ""
    exit 1
fi

# Check subject line length (warn >50, error >72)
SUBJECT_LEN=${#FIRST_LINE}
if [ "$SUBJECT_LEN" -gt 72 ]; then
    echo ""
    echo "ERROR: Subject line is $SUBJECT_LEN chars (max 72)"
    echo ""
    echo "Your message:"
    echo "  $FIRST_LINE"
    echo ""
    exit 1
elif [ "$SUBJECT_LEN" -gt 50 ]; then
    echo "WARNING: Subject line is $SUBJECT_LEN chars (recommended max 50)"
fi

# Check for non-imperative mood (common past tense / third person endings)
if echo "$DESCRIPTION" | grep -qE "^(added|adds|fixed|fixes|updated|updates|removed|removes|changed|changes|moved|moves|renamed|renames|deleted|deletes|created|creates|refactored|refactors|implemented|implements) "; then
    echo ""
    echo "ERROR: Use imperative mood in description"
    echo ""
    echo "  Wrong: claude: added new feature"
    echo "  Right: claude: add new feature"
    echo ""
    echo "Your message:"
    echo "  $FIRST_LINE"
    echo ""
    exit 1
fi

# Check for Signed-off-by
if ! echo "$COMMIT_MSG" | grep -q "^Signed-off-by: "; then
    echo ""
    echo "ERROR: Commit message must include Signed-off-by line"
    echo ""
    echo "Use: git commit -s"
    echo ""
    echo "This adds:"
    echo "  Signed-off-by: Your Name <your.email@example.com>"
    echo ""
    exit 1
fi

echo "PASSED: Commit message format is correct"
exit 0

#!/bin/bash

# Release Preparation Script
# Prepares the repository for release by updating CHANGELOG.md

set -e

if [ -z "$1" ]; then
    echo "ERROR: Version required"
    echo "Usage: $0 <version>"
    exit 1
fi

VERSION="$1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$REPO_ROOT"

echo "=========================================="
echo "Release Preparation: $VERSION"
echo "=========================================="
echo ""

# Get current date
RELEASE_DATE=$(date +%Y-%m-%d)

echo "Preparing release $VERSION for $RELEASE_DATE"
echo ""

# Check if CHANGELOG.md exists
if [ ! -f "CHANGELOG.md" ]; then
    echo "ERROR: CHANGELOG.md not found"
    exit 1
fi

# Create temporary file for new CHANGELOG
TEMP_CHANGELOG=$(mktemp)

# Add new release section at the top
cat > "$TEMP_CHANGELOG" << EOF
# Changelog

All notable changes to claude-playbook will be documented in this file.

## [$VERSION] - $RELEASE_DATE

### Added

- (Add new features here)

### Changed

- (Add changes here)

### Fixed

- (Add bug fixes here)

### Removed

- (Add removed features here)

---

EOF

# Append existing CHANGELOG content (skip the header)
tail -n +3 CHANGELOG.md >> "$TEMP_CHANGELOG"

# Replace CHANGELOG.md
mv "$TEMP_CHANGELOG" CHANGELOG.md

echo "OK: CHANGELOG.md updated with release $VERSION"
echo ""

echo "=========================================="
echo "Preparation Complete"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Edit CHANGELOG.md to add release notes"
echo "2. Review changes: git diff CHANGELOG.md"
echo "3. Commit: git commit -s -m 'claude: prepare release $VERSION'"
echo "4. Run: /cp:release publish $VERSION"
echo ""

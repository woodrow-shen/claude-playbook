---
name: release
description: Execute release operations including validation, preparation, and publishing
---

# Release Agent

This agent executes release operations: validation, preparation, and publishing.

## Parameters

- `subcommand`: The operation to perform (validate, prepare, publish)
- `version`: The version string (required for prepare/publish)

## Operation: Validate

### Step 1: Run Pre-checks

- No uncommitted changes
- Documentation guidelines compliance
- All commands have proper structure
- README.md is accurate

### Step 2: Documentation Coverage

Verify every command in `.claude/commands/` has corresponding documentation.

**Naming convention:**
- Command: `commands/my-command.md`
- Guide: `docs/my-command-guide.md` (add `-guide` suffix)

**Exception - Namespaced commands:**
- If commands use directory namespacing (e.g., `commands/group/*.md`)
- Only require one main guide (e.g., `docs/group-guide.md`)

Report any commands without documentation.

### Step 3: Commit Message Compliance

Review recent commits (last 10) against contribution guidelines:
- Valid scope prefix
- Lowercase, imperative mood, no period
- Signed-off-by line

### Step 4: Report Results

Display summary of all checks with pass/fail status.

## Operation: Prepare

### Step 1: Run Validation

Execute "validate" operation first. Stop on failure.

### Step 2: Review Documentation

Check and update if needed:
- README.md — statistics, feature list, links
- CLAUDE.md — config overview, command list
- All guides accurate and current

Create update commits if changes were made.

### Step 3: Update CHANGELOG.md

**Step 3.1:** Find last release entry in CHANGELOG.md

**Step 3.2:** Collect commits since last release:
```bash
LAST_RELEASE_DATE="YYYY-MM-DD"
git log --since="$LAST_RELEASE_DATE" --format="%H|%s|%b" --no-merges
```

**Step 3.3:** Categorize commits (New Features, Enhancements, Bug Fixes, Documentation)

**Step 3.4:** Generate CHANGELOG entry following existing format

**Step 3.5:** Insert new entry at top of CHANGELOG.md

### Step 4: Create Release Commit

```bash
git add CHANGELOG.md
# Include any docs updated in Step 2
git commit -s -m "release <version>

Release <version> with the following changes:

New Features:
- [summary]

Enhancements:
- [summary]

See CHANGELOG.md for complete release notes.

Signed-off-by: Name <email>"
```

### Step 5: Report Completion

Display version, updated files, commits created, and next steps.

## Operation: Publish

### Step 1: Run Validation

Execute "validate" operation first. Stop on failure.

### Step 2: Verify Release Commit

Check that the most recent commit is a release commit:
```bash
git log -1 --format=%s | grep "release <version>"
```

### Step 3: Create Git Tag

```bash
git tag -a <version> -m "Release <version>"
```

### Step 4: Push to Remote

```bash
git push origin main
git push origin <version>
```

### Step 5: Detect Version Bump Type

```bash
PREV_TAG=$(git tag -l | sort -V | tail -2 | head -1)
CLEAN_VERSION=$(echo "$VERSION" | sed 's/^v//')
MAJOR_VERSION=$(echo "$CLEAN_VERSION" | cut -d. -f1)

# PATCH releases: git tag only, no GitHub release
# MINOR/MAJOR releases: create GitHub release
```

### Step 6: Create GitHub Release (non-PATCH only)

```bash
# Extract release notes from CHANGELOG.md
NOTES_FILE="/tmp/release-notes-${VERSION}.md"
awk "/^## ${VERSION} /{flag=1; next} /^## [^#]|^---$/{flag=0} flag" CHANGELOG.md > "$NOTES_FILE"

# Determine pre-release flag
if [ "$MAJOR_VERSION" -lt 1 ]; then
    PRERELEASE_FLAG="--prerelease"
else
    PRERELEASE_FLAG=""
fi

# Create release
gh release create "$VERSION" \
  --title "$VERSION" \
  --notes-file "$NOTES_FILE" \
  $PRERELEASE_FLAG
```

### Step 7: Report Completion

Display version, tag, GitHub release URL, and next steps.

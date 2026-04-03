---
name: release
description: Execute release operations including validation, preparation, and publishing
---

# Release Agent

This agent executes release operations for claude-playbook.

## Parameters

- `subcommand`: The operation to perform (validate, prepare, publish)
- `version`: The version string (required for prepare/publish)

## Operation: Validate

### Step 1: Run Automated Validation Script

Execute `bash scripts/release/validate.sh` which checks:
- Check 1: No uncommitted changes
- Check 2: Documentation guidelines compliance (YAML front matter)
- Check 3: Config guides accuracy (command counts match)
- Check 4: README.md structure and statistics
- Check 5: CLAUDE.md exists
- Check 6: Test coverage (100% target)
- Check 7: Command guide coverage (per-command guide files)
- Check 8: Agent documentation coverage

If script fails, stop and report errors.

### Step 2: AI-Assisted Deep Validation

Use AI to verify documentation quality beyond automated checks:

**Documentation Guidelines Compliance:**

Verify all `.claude/*.md` files follow `docs/documentation-guidelines.md`:

- **Commands (`commands/*.md`):**
  - Have YAML front matter with name and description
  - Use actual bash code blocks (not pseudocode)
  - No emojis (use text prefixes: OK:, ERROR:, WARNING:, NOTE:)
  - Have Input Validation and Error Handling sections

- **Agents/Skills/Rules:**
  - Have YAML front matter with name and description
  - No emojis in content
  - Clear, concise, precise instructions

- **Documentation files (`docs/*.md`):**
  - Clean markdown, no excessive styling
  - No box-drawing characters
  - Follow consolidation principle (integrate into existing files)

**Guide Accuracy:**

Verify guides accurately describe current implementation:

- `configs/global/docs/cp-guide.md` - all `/cp:*` commands documented
- All individual command guide files match their command implementation
- All command examples work and are up-to-date
- No outdated information or broken references

### Step 3: Command Documentation Coverage

Verify that every command has corresponding documentation:

**For each config in `configs/*/`:**

1. List all commands in `configs/<config>/.claude/commands/*.md`
2. For each command, check if a corresponding guide file exists in `configs/<config>/docs/`

**Naming convention:**
- Command file: `commands/my-command.md`
- Guide file: `docs/my-command-guide.md` (add `-guide` suffix)

**Exception - Namespacing:**
- If commands use directory-based namespacing (e.g., `commands/cp/*.md`)
- Only require one main entry point documentation (e.g., `docs/cp-guide.md`)
- Individual namespace commands don't need separate docs
- The main guide should document all commands in the namespace

**Examples:**

*Namespaced commands:*
- `configs/global/.claude/commands/cp/pull.md` -> covered by `configs/global/docs/cp-guide.md`
- `configs/global/.claude/commands/cp/push.md` -> covered by `configs/global/docs/cp-guide.md`
- All `/cp:*` commands documented in one `cp-guide.md` file

*Regular commands (one-to-one mapping):*
- `configs/global/.claude/commands/bug.md` -> `configs/global/docs/bug-guide.md`
- `configs/global/.claude/commands/commit.md` -> `configs/global/docs/commit-guide.md`

**Report:**
- List any commands without corresponding documentation
- Suggest creating missing guide files with correct naming

### Step 4: Config Guide Completeness

Verify that every config has a comprehensive guide:

**For each config in `configs/*/`:**

1. Check if config-level documentation exists:
   - `docs/guides/configs/<config>-guide.md` (preferred for configs with 4+ commands)
   - `configs/<config>/CLAUDE.md` (acceptable for smaller configs)
2. Verify the documentation is up-to-date by checking:
   - All commands from `configs/<config>/.claude/commands/` are documented
   - All agents from `configs/<config>/.claude/agents/` are mentioned
   - All skills from `configs/<config>/.claude/skills/` are described
   - Examples are current and accurate
   - Workflow descriptions match actual implementation

**Verification method:**
- Read the guide and compare with actual files
- Check that command names, descriptions, and usage match
- Verify workflow steps are accurate
- Ensure no outdated information

**Report:**
- List any missing guides
- List any guides that are outdated or incomplete
- Suggest updates needed

### Step 5: Commit Message Compliance

Review recent commits (last 10) against `configs/global/.claude/rules/claude-playbook-contribution.md`:

**Check each commit has:**
- Valid scope: `claude/configs/<config>:`, `claude/docs:`, `claude/scripts:`, `claude/tests:`, or `claude:`
- Lowercase, imperative mood, no period
- Signed-off-by line
- Body explaining what and why (for non-trivial changes)

Report any non-compliant commits.

### Step 6: Report Validation Results

Display summary:
```
============================================================
Validation Results
============================================================

Automated Checks:
  [pass/fail] Check 1: No uncommitted changes
  [pass/fail] Check 2: YAML front matter
  [pass/fail] Check 3: Config guides accuracy
  [pass/fail] Check 4: README.md statistics
  [pass/fail] Check 5: CLAUDE.md exists
  [pass/fail] Check 6: Test coverage
  [pass/fail] Check 7: Command guide coverage
  [pass/fail] Check 8: Agent documentation coverage

AI-Assisted Checks:
  [pass/fail] Documentation guidelines compliance
  [pass/fail] Guide accuracy
  [pass/fail] Config guide completeness

Git Status:
  [pass/fail] No uncommitted changes

Commit Messages:
  [pass/fail] All commits follow contribution guidelines

============================================================
Result: PASS/FAIL
============================================================
```

If any check fails, display detailed error and exit with failure.

## Operation: Prepare

### Step 1: Run Validation

Execute "validate" operation first. If validation fails, stop and report errors.

### Step 2: Review and Update Documentation Files

**Step 2.1: Review CLAUDE.md (root)**

Check and update if needed:
- Config overview matches actual configs in `configs/*/`
- Command count matches actual count
- Agent count matches actual count
- Skill and rule counts match
- Feature list is current
- Structure section reflects actual directory layout

**Actions:**
- If outdated: Update CLAUDE.md and create commit
- If current: Note "CLAUDE.md is current"

**Step 2.2: Review README.md**

**Overview Section:**
- [ ] Statistics are accurate:
  - Total commands: `find configs -name "*.md" -path "*/.claude/commands/*" -type f | wc -l`
  - Total configs: `ls -1d configs/*/ | wc -l`
- [ ] Feature highlights are current
- [ ] Link to docs/guides/overview.md is present

**Available Configs:**
- [ ] All configs listed in table format
- [ ] Each config has use case description
- [ ] Counts match actual file counts

**Installation Section:**
- [ ] Quick Start uses `claude-setup` command
- [ ] Manual Setup summary is accurate
- [ ] All setup script names are correct

**CI/CD Status Section:**
- [ ] Pre-commit hooks status is accurate
- [ ] Test commands are correct

**Documentation Section:**
- [ ] References CLAUDE.md, CHANGELOG.md, docs/guides/overview.md
- [ ] All links work (no broken references)

**Common Issues:**
- [ ] No duplicate sections
- [ ] No outdated command names
- [ ] No references to removed features

**Actions:**
- If outdated: Update README.md and create commit
- If current: Note "README.md is current"

**Step 2.3: Review docs/guides/overview.md**

**Directory Structure:**
- [ ] Matches actual directory tree
- [ ] All configs listed
- [ ] Script counts are correct
- [ ] No missing or extra directories

**Available Configs (Detailed):**
- [ ] All configs have descriptions
- [ ] Key features are accurate

**Setup Scripts Overview:**
- [ ] All setup scripts documented
- [ ] Script descriptions are accurate
- [ ] Summary table is current

**CI/CD Status (Detailed):**
- [ ] Pre-commit hooks section is accurate
- [ ] Test commands are correct

**Actions:**
- If outdated: Update docs/guides/overview.md and create commit
- If current: Note "docs/guides/overview.md is current"

**Step 2.4: Review configs/global/CLAUDE.md**

- [ ] Command list matches actual commands in `.claude/commands/`
- [ ] Agent list matches actual agents in `.claude/agents/`
- [ ] Skill list matches actual skills in `.claude/skills/`
- [ ] Rule list matches actual rules in `.claude/rules/`
- [ ] All counts are accurate

**Actions:**
- If outdated: Update and create commit
- If current: Note "configs/global/CLAUDE.md is current"

**Step 2.5: Consistency Check**

Verify consistency between files:
- Directory structure matches between CLAUDE.md, README.md, and docs/guides/overview.md
- Config names are consistent across all documentation
- No conflicting information
- Counts align across all files
- README.md links to docs/guides/overview.md for detailed information
- No duplicate content between README.md and docs/guides/overview.md

**Step 2.6: Create Update Commits (if needed)**

If any documentation files were updated:
```bash
# If CLAUDE.md updated
git add CLAUDE.md
git commit -s -m "claude: update CLAUDE.md for release"

# If README.md updated
git add README.md
git commit -s -m "claude: update README.md for release"

# If docs/guides/overview.md updated
git add docs/guides/overview.md
git commit -s -m "claude/docs: update overview.md for release"

# If configs/global/CLAUDE.md updated
git add configs/global/CLAUDE.md
git commit -s -m "claude/configs/global: update CLAUDE.md for release"
```

These commits should be created BEFORE the release commit.

### Step 3: Update CHANGELOG.md

**Step 3.1: Find Last Release**

Determine the last release entry in CHANGELOG.md:
- Look for the most recent version heading (e.g., `## [0.1.0] - 2026-04-01`)
- Extract the date from that heading
- If no previous release, collect all commits

**Step 3.2: Collect Commits Since Last Release**

```bash
# Find commits since last release
LAST_RELEASE_DATE="YYYY-MM-DD"  # from CHANGELOG.md
git log --since="$LAST_RELEASE_DATE" --format="%H|%s|%b" --no-merges
```

**Step 3.3: Categorize Commits by Scope**

Group commits by their scope prefix:
- `claude/configs/global:` -> Global Config
- `claude/configs/debugging:` -> Debugging Config
- `claude/configs/openra2-rust:` -> OpenRA2-Rust Config
- `claude/docs:` -> Documentation
- `claude/scripts:` -> Scripts
- `claude/tests:` -> Tests
- `claude:` -> General/Setup/Infrastructure

**Step 3.4: Generate CHANGELOG Entry**

Follow Keep a Changelog format:

```markdown
## [<version>] - YYYY-MM-DD

### Added

- New commands, agents, skills, or major functionality
- Group related commits into feature categories

### Changed

- Improvements to existing features
- Refactoring, optimization, workflow improvements

### Fixed

- Bug fixes for broken functionality
- Error handling improvements

### Documentation

- New guides, updated documentation
- Fixed documentation errors

### Repository Statistics

- **Configs**: X
- **Commands**: Y (Z% guide coverage)
- **Agents**: N
- **Test Scripts**: M
```

**Step 3.5: Add Entry to CHANGELOG.md**

Insert the new release section at the top of CHANGELOG.md, after the header and before any existing release entries.

Preserve all existing entries.

### Step 4: Create Release Commit

**Commit Title Format:**
```
claude: release <version>
```

**NOT:**
- WRONG: `claude: prepare release <version>`
- WRONG: `claude: prepare for release <version>`

**Files to Include:**

The release commit should include CHANGELOG.md and any documentation files updated in Step 2:

```bash
git add CHANGELOG.md
# Include any files updated in Step 2
git commit -s -m "claude: release <version>

Release <version> with the following changes:

New Features:
- [Brief summary of major new features]

Enhancements:
- [Brief summary of major enhancements]

See CHANGELOG.md for complete release notes.

Signed-off-by: Name <email>"
```

### Step 5: Report Completion

Display:
```
============================================================
Release Preparation Complete
============================================================

Version: <version>
Date: YYYY-MM-DD

Documentation Review:
  [current/updated] CLAUDE.md
  [current/updated] README.md
  [current/updated] docs/guides/overview.md
  [current/updated] configs/global/CLAUDE.md

Updated files in release commit:
  CHANGELOG.md
  [other files if updated]

Commits created:
  [<hash>] claude: update CLAUDE.md for release (if needed)
  [<hash>] claude: update README.md for release (if needed)
  <hash> claude: release <version>

Commits included in this release: X (since last release)
  - Added: Y commits
  - Changed: Z commits
  - Fixed: N commits
  - Documentation: M commits

Next steps:
1. Review the release commit: git show HEAD
2. Review CHANGELOG.md: head -100 CHANGELOG.md
3. Publish release: /cp:release publish <version>
============================================================
```

## Operation: Publish

### Step 1: Run Validation

Execute "validate" operation first. If validation fails, stop and report errors.

### Step 2: Verify Preparation Commit

Check that the most recent commit is a release commit:
```bash
git log -1 --format=%s | grep "release <version>"
```

If not found, warn user and ask for confirmation to continue.

### Step 3: Create Git Tag

```bash
git tag -a <version> -m "Release <version>

[Include brief summary from CHANGELOG.md]"
```

### Step 4: Push to Remote

```bash
git push origin main
git push origin <version>
```

### Step 5: Detect Version Bump Type and Create GitHub Release

**Step 5.1: Detect version bump type**

Version format: `<major>.<minor>.<patch>[-<stage>.<n>]`
Stages: `alpha`, `beta`, `rc` only.
Examples: `0.1.0`, `1.0.0-alpha.1`, `1.0.0-beta.2`, `1.0.0-rc.1`

```bash
# Extract previous version tag (no v prefix in our format)
PREV_TAG=$(git tag -l | sort -V | tail -2 | head -1)

if [ -z "$PREV_TAG" ]; then
    echo "No previous tag found. Assuming first release."
    IS_PATCH_RELEASE=false
else
    # Strip stage suffix to get base version for comparison
    PREV_MAJOR=$(echo "$PREV_TAG" | cut -d. -f1)
    PREV_MINOR=$(echo "$PREV_TAG" | cut -d. -f2)
    PREV_PATCH=$(echo "$PREV_TAG" | cut -d. -f3 | cut -d- -f1)

    CURR_MAJOR=$(echo "$VERSION" | cut -d. -f1)
    CURR_MINOR=$(echo "$VERSION" | cut -d. -f2)
    CURR_PATCH=$(echo "$VERSION" | cut -d. -f3 | cut -d- -f1)

    # PATCH releases: git tag only, no GitHub release
    if [ "$CURR_MAJOR" = "$PREV_MAJOR" ] && [ "$CURR_MINOR" = "$PREV_MINOR" ] && [ "$CURR_PATCH" != "$PREV_PATCH" ]; then
        IS_PATCH_RELEASE=true
        echo "Detected PATCH release: $PREV_TAG -> $VERSION"
        echo "PATCH releases only create git tags (no GitHub release)"
    else
        IS_PATCH_RELEASE=false
        if [ "$CURR_MAJOR" != "$PREV_MAJOR" ]; then
            echo "Detected MAJOR release: $PREV_TAG -> $VERSION"
        elif [ "$CURR_MINOR" != "$PREV_MINOR" ]; then
            echo "Detected MINOR release: $PREV_TAG -> $VERSION"
        fi
    fi
fi
```

**Step 5.2: Skip GitHub release for PATCH versions**

```bash
if [ "$IS_PATCH_RELEASE" = true ]; then
    echo ""
    echo "PATCH release completed successfully"
    echo "  - Git tag created: $VERSION"
    echo "  - Tag pushed to origin"
    echo "  - CHANGELOG.md updated"
    echo ""
    echo "Note: PATCH releases do not create GitHub releases"
    # Skip to Step 6
fi
```

**Step 5.3: Determine release type**

Auto-detect based on version format `<major>.<minor>.<patch>[-<stage>.<n>]`:

```bash
# All versions < 1.0.0 are Pre-release
# All versions >= 1.0.0 are Official release
# Versions with -alpha, -beta, -rc stage suffix are always Pre-release

MAJOR_VERSION=$(echo "$VERSION" | cut -d. -f1)

if echo "$VERSION" | grep -qE '-(alpha|beta|rc)\.'; then
    PRERELEASE_FLAG="--prerelease"
    RELEASE_TYPE_NAME="Pre-release"
elif [ "$MAJOR_VERSION" -lt 1 ]; then
    PRERELEASE_FLAG="--prerelease"
    RELEASE_TYPE_NAME="Pre-release (< 1.0.0)"
else
    PRERELEASE_FLAG=""
    RELEASE_TYPE_NAME="Official release"
fi

echo "Release type: $RELEASE_TYPE_NAME"
```

**Step 5.4: Extract release notes from CHANGELOG.md**

```bash
NOTES_FILE="/tmp/release-notes-${VERSION}.md"

# Extract section for this version
awk "/^## \\[${VERSION}\\]/{flag=1; next} /^## \\[|^---$/{flag=0} flag" CHANGELOG.md > "$NOTES_FILE"

if [ ! -s "$NOTES_FILE" ]; then
    echo "Warning: Could not extract release notes from CHANGELOG.md"
    echo "Creating basic release notes..."
    echo "See [CHANGELOG.md](CHANGELOG.md) for details." > "$NOTES_FILE"
fi
```

**Step 5.5: Create GitHub release**

```bash
if ! command -v gh &> /dev/null; then
    echo "Error: GitHub CLI (gh) not found"
    echo "Release notes saved to: $NOTES_FILE"
    echo "Create release manually on GitHub"
else
    gh release create "$VERSION" \
      --title "$VERSION" \
      --notes-file "$NOTES_FILE" \
      $PRERELEASE_FLAG

    if [ $? -eq 0 ]; then
        echo "GitHub release created successfully!"
    else
        echo "Failed to create GitHub release"
        echo "Release notes saved to: $NOTES_FILE"
    fi
fi
```

### Step 6: Report Completion

Display:
```
============================================================
Release Published Successfully
============================================================

Version: <version>
Date: YYYY-MM-DD
Tag: <version>
Commit: <commit-hash>

Git operations:
  Tag created and pushed
  Branch pushed to remote

GitHub release:
  [Created/Skipped] as <Pre-release|Official release>

Next steps:
1. Verify release on GitHub
2. Announce release
3. Update dependent repositories
============================================================
```

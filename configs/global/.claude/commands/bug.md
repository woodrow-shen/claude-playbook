---
name: bug
description: "Bug triage, GitHub issue, fix, PR, and merge"
argument-hint: "[description]"
---

# Claude Code User Command: Bug

Automated bug triage, fix, and PR workflow. The user is reporting a bug — act fast.

## Usage

```
/bug <description of the bug>
```

`$ARGUMENTS` contains the bug description: symptoms, affected page/feature, error messages, or a screenshot path.

## What This Command Does

1. Triage and locate the bug from the description.
2. Create a GitHub issue to track it.
3. Identify root cause and update the issue with the fix plan.
4. Fix, verify (tests + lint), commit, and push to a new branch.
5. Create a PR with fix summary.
6. Deep review the PR, then ask the developer for merge confirmation.
7. Auto-merge after confirmation and verify CI passes.

## Severity Classification

Before diving in, assess severity:

- **Trivial**: Typo, styling glitch, minor UI issue, single-line fix.
- **Critical**: Infinite loop, data loss, crash, security issue, architectural flaw, multi-file systemic bug. → Enter **plan mode** first. Read `docs/PROJECT_STATUS.md` for known issues context. Design the fix with the user, then update `docs/*.md` after the fix is complete.

Use your judgement. When in doubt, treat it as critical.

## Instructions

Follow these steps strictly:

### Step 1: Triage

- Parse `$ARGUMENTS` for: affected file/page, error message, reproduction steps, screenshot path.
- If a screenshot path is provided, read it immediately.
- Check Docker logs (`docker compose logs --tail=30 <service>`) if the bug involves runtime errors.
- Locate the relevant source files quickly using Grep/Glob. Do NOT do broad exploration — be surgical.

### Step 2: Create GitHub Issue

Create a GitHub issue immediately using `gh`:

```bash
gh issue create --title "bug: <concise title>" --body "<body>"
```

The issue body MUST include:
- **Description**: what is broken
- **Reproduction steps**: how to trigger it
- **Expected vs actual behavior**
- **Severity**: trivial or critical

Save the issue number for later steps.

### Step 3: Root Cause & Fix Plan

- Read only the files needed to understand the bug.
- Identify the exact line(s) causing the issue.
- State the root cause in one sentence.
- Write a clear resolution/fix plan.
- **Update the GitHub issue description** with the root cause and fix plan:

```bash
gh issue edit <number> --body "<updated body with fix plan>"
```

### Step 4: Fix & Verify

- Apply the minimal fix. Do not refactor surrounding code.
- Do not add features, comments, or "improvements" beyond the fix.
- If the fix spans multiple files, edit them all in parallel.
- Run relevant tests (`uv run pytest` for backend, `npx tsc --noEmit` for frontend).
- If tests fail, fix them immediately.
- Run lint on changed files.

### Step 5: Commit & Push

- Create a new branch from main:

```bash
git checkout -b fix/<issue-number>-<short-description>
```

- Commit the fix with sign-off, referencing the issue:

```bash
git commit -s -m "fix: <description>

Fixes #<issue-number>"
```

- Push the branch:

```bash
git push -u origin fix/<issue-number>-<short-description>
```

### Step 6: Create PR

Create a PR using `gh` that links to the issue:

```bash
gh pr create --title "fix: <description>" --body "$(cat <<'EOF'
## Summary
- **Bug**: <what was broken>
- **Cause**: <why it was broken>
- **Fix**: <what was changed (file:line)>

## Test Results
<paste test/lint output summary>

Fixes #<issue-number>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

### Step 7: Review & Confirm

- Perform a deep review of the PR diff using `gh pr diff <number>`.
- Verify all changes are correct, minimal, and safe.
- Present the review summary to the developer.
- **MUST ask the developer for confirmation before proceeding to merge.** Use AskUserQuestion:
  - "Approve and merge this PR?"
  - Options: "Yes, merge it" / "No, needs changes"
- Do NOT merge without explicit developer approval.

### Step 8: Merge & Verify CI

- Check CI status before merging:

```bash
gh run list --branch fix/<branch> --limit 1
gh run watch <run-id> --exit-status
```

- If CI passes and developer confirmed, merge the PR:

```bash
gh pr merge <number> --squash --delete-branch
```

- If CI fails, diagnose and fix before merging.
- Switch back to main and pull:

```bash
git checkout main && git pull
```

### Step 9: Update Project Status

After the fix is merged, update `docs/PROJECT_STATUS.md`:
- Check off resolved items in the Known Issues table (set status to "Fixed")
- Update relevant feature checklists if the bug revealed missing items
- Add to Release History if this is a significant fix

### Step 10: Checkpoint (critical bugs only)

For critical bugs, run the full Checkpoint Validation per CLAUDE.md:
1. **Code** — implementation matches the intended fix
2. **Design docs** — `docs/PRD.md` and `docs/ARCHITECTURE.md` updated to reflect the change
3. **Project status** — `docs/PROJECT_STATUS.md` known issues and checklists updated
4. **Tests** — relevant tests added/updated and all pass
5. **Lint** — no lint errors in changed files

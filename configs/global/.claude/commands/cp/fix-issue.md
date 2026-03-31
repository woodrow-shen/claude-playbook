---
name: cp:fix-issue
description: "Automatically fix a claude-playbook issue and merge to main"
argument-hint: "[issue-number]"
---

Fix a claude-playbook GitHub issue, commit, and push to main.

Parse $ARGUMENTS: first word is the issue number.

## Step 1: Validate Issue Number

If no issue number provided, display usage and exit:
```
Usage: /cp:fix-issue <issue-number>
Example: /cp:fix-issue 7
```

Validate the issue number is numeric.

## Step 2: Fetch Issue from GitHub

```bash
gh issue view "$ISSUE_NUMBER" --json title,body,labels
```

Store ISSUE_TITLE, ISSUE_BODY, ISSUE_LABELS. If failed, display error with troubleshooting steps (check issue number, repo access, gh auth).

## Step 3: Display Issue Information

Show the issue title, body, and labels.

## Step 4: Ask for Fix Approach

Ask the user:
1. Describe the fix (agent implements it)
2. Let agent analyze and propose a fix
3. Cancel

If option 2: use codebase search to find relevant files, analyze the issue, propose a fix, and ask for confirmation before proceeding.

## Step 5: Find claude-playbook Location

Locate the claude-playbook repository:
1. If `.claude` is a symlink: follow it to find claude-playbook
2. If `claude-playbook` directory exists: use it
3. Search for `configs` directory

Store as WORKSPACE_PATH. If not found, display error and exit.

## Step 6: Implement the Fix

Based on the fix description or proposed fix:
1. Find the relevant files to modify
2. Understand the current implementation
3. Make the necessary changes

Display list of modified files.

## Step 7: Show Changes and Confirm

Display diff of all changes. Ask user to confirm before committing:
- Commit all changes to claude-playbook
- Push directly to main branch
- Automatically close the issue

## Step 8: Commit and Push

```bash
git add .
git commit -s -m "Fix #${ISSUE_NUMBER}: ${ISSUE_TITLE}" -m "$(cat <<EOF
Fixes issue #${ISSUE_NUMBER}

<Brief description of the fix>

Changes:
<list of modified files>

Fixes #${ISSUE_NUMBER}
EOF
)"
git push origin main
```

Display success message with commit details.

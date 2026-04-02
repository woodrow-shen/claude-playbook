---
name: cp:pr
description: "Create a pull request for claude-playbook changes"
argument-hint: "[branch-name]"
---

Create a pull request for review on the claude-playbook repository.

Parse $ARGUMENTS: optional first word is the branch name (defaults to current branch).

## Step 1: Determine Branch

```bash
BRANCH_NAME="$ARGUMENTS"

if [ -z "$BRANCH_NAME" ]; then
    BRANCH_NAME=$(git rev-parse --abbrev-ref HEAD)
    echo "Using current branch: $BRANCH_NAME"
fi

# Security: Validate branch name
if [[ ! "$BRANCH_NAME" =~ ^[a-zA-Z0-9._/-]+$ ]]; then
    echo "Error: Invalid branch name: $BRANCH_NAME"
    exit 1
fi

if [ "$BRANCH_NAME" = "main" ]; then
    echo "Error: Cannot create PR from main branch"
    echo "Please create a feature/fix branch first"
    exit 1
fi
```

## Step 2: Find claude-playbook

```bash
if [ -L ".claude" ]; then
    PLAYBOOK_PATH=$(readlink ".claude" | sed 's|/configs/.*||')
elif [ -d ".claude-playbook" ]; then
    PLAYBOOK_PATH=".claude-playbook"
elif [ -d "claude-playbook" ]; then
    PLAYBOOK_PATH="claude-playbook"
else
    PLAYBOOK_PATH=$(find . -maxdepth 2 -type d -name "configs" -path "*/configs" | \
                     xargs -I {} dirname {} | head -1)
fi

if [ -z "$PLAYBOOK_PATH" ]; then
    echo "Error: Could not find claude-playbook"
    exit 1
fi

cd "$PLAYBOOK_PATH"
```

## Step 3: Validate Branch Exists

```bash
if ! git rev-parse --verify "$BRANCH_NAME" >/dev/null 2>&1; then
    echo "Error: Branch '$BRANCH_NAME' does not exist"
    exit 1
fi

git checkout "$BRANCH_NAME"
```

## Step 4: Check for Uncommitted Changes

```bash
if ! git diff-index --quiet HEAD --; then
    echo "Warning: You have uncommitted changes"
    echo "Please commit or stash them first"
    git status --short
    exit 1
fi
```

## Step 5: Push Branch to Remote

```bash
echo "Pushing branch to remote..."
git push -u origin "$BRANCH_NAME"
```

## Step 6: Detect Changes and Generate PR Content

```bash
CHANGED_FILES=$(git diff --name-only main..."$BRANCH_NAME")
COMMIT_COUNT=$(git rev-list --count main..."$BRANCH_NAME")
LAST_COMMIT_MSG=$(git log -1 --pretty=%B)

# Try to extract issue number from branch name or commits
ISSUE_NUMBER=$(echo "$BRANCH_NAME" | grep -oP '(?<=issue-)\d+|(?<=fix/)\d+' || \
               git log main..."$BRANCH_NAME" --pretty=%B | grep -oP '(?<=#)\d+' | head -1 || echo "")

# Generate PR title from last commit or branch name
if [ -n "$LAST_COMMIT_MSG" ]; then
    PR_TITLE="$LAST_COMMIT_MSG"
else
    PR_TITLE=$(echo "$BRANCH_NAME" | sed 's/-/ /g')
fi

# Generate PR body
PR_BODY="## Changes

$CHANGED_FILES

## Commits

$COMMIT_COUNT commit(s) in this PR

## Checklist

- [ ] Code follows project style guidelines
- [ ] All commits are signed off
- [ ] Tests pass locally
- [ ] Documentation updated (if needed)
"

if [ -n "$ISSUE_NUMBER" ]; then
    PR_BODY="$PR_BODY
Closes #$ISSUE_NUMBER"
fi
```

## Step 7: Determine Reviewers from CODEOWNERS

```bash
REVIEWERS=""
if [ -f "CODEOWNERS" ]; then
    for file in $CHANGED_FILES; do
        owner=$(grep -E "^$file|^/${file}|^\*" CODEOWNERS | tail -1 | awk '{print $2}' | tr -d '@')
        if [ -n "$owner" ]; then
            REVIEWERS="$REVIEWERS,$owner"
        fi
    done
    REVIEWERS=$(echo "$REVIEWERS" | tr ',' '\n' | sort -u | tr '\n' ',' | sed 's/,$//')
fi
```

## Step 8: Create PR

```bash
echo "Branch: $BRANCH_NAME"
echo "Title: $PR_TITLE"
echo "Creating PR..."

if [ -n "$REVIEWERS" ]; then
    gh pr create --title "$PR_TITLE" --body "$PR_BODY" --reviewer "$REVIEWERS"
else
    gh pr create --title "$PR_TITLE" --body "$PR_BODY"
fi

echo "PR created successfully!"
```

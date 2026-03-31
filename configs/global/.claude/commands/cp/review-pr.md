---
name: cp:review-pr
description: "Review a claude-playbook GitHub pull request"
argument-hint: "[pr-number]"
---

Review a GitHub pull request on the claude-playbook repository.

Parse $ARGUMENTS: first word is the PR number.

## Step 1: Validate PR Number

```bash
PR_NUMBER=$(echo "$ARGUMENTS" | awk '{print $1}')

if [[ ! "$PR_NUMBER" =~ ^[0-9]+$ ]]; then
    echo "Error: Invalid PR number: $PR_NUMBER"
    echo "Usage: /cp:review-pr <pr-number>"
    echo "Example: /cp:review-pr 42"
    exit 1
fi
```

## Step 2: Analyze

```bash
gh pr view "$PR_NUMBER"
gh pr diff "$PR_NUMBER"
gh pr view "$PR_NUMBER" --json body,title,number,labels
gh pr checks "$PR_NUMBER"
gh pr view "$PR_NUMBER" --json commits
```

Review: linked issues, acceptance criteria, CI/CD status, commit history.

## Step 3: Checkout and Review

```bash
gh pr checkout "$PR_NUMBER"
```

Review the code for:
- **Correctness**: bugs, edge cases, logic errors
- **Error handling**: proper validation
- **Security**: vulnerabilities, sensitive data exposure
- **Performance**: resource usage implications
- **Testing**: run test suite on affected areas, verify coverage
- **Observability**: meaningful logging, no sensitive data in logs

## Step 4: Verify Git Workflow Compliance

- All commits include `Signed-off-by` line
- Commit messages follow project conventions
- No unnecessary merge commits
- Branch is up to date with base branch

## Step 5: Provide Feedback

Categorize issues as blocking or non-blocking. Submit via `gh`:

```bash
# Approve
gh pr review "$PR_NUMBER" --approve --body "Review comments"

# Request changes
gh pr review "$PR_NUMBER" --request-changes --body "Issues found"

# Comment only
gh pr review "$PR_NUMBER" --comment --body "Questions/suggestions"
```

## Step 6: Iterate

```bash
gh pr view "$PR_NUMBER" --comments
```

Re-review after changes, verify CI/CD still passes, approve when all concerns are addressed.

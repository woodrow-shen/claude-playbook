---
name: cp:issue
description: "Report bug or request feature on claude-playbook GitHub"
---

Report a bug or request a feature on the claude-playbook GitHub repository.

## Step 1: Collect Issue Information

Ask the user:

```
What type of issue would you like to report?

1. Bug Report - Something isn't working
2. Feature Request - Suggest a new feature
3. Documentation - Improve or clarify documentation
4. Question - Ask a question

Your choice (1-4):
```

## Step 2: Collect Issue Details

Based on the issue type, collect appropriate information:

**For Bug Report:**
- What were you trying to do?
- What happened instead?
- Error messages (if any)
- Steps to reproduce

**For Feature Request:**
- What feature would you like to see?
- Why would this be useful?
- Any examples or references

**For Documentation:**
- Which documentation needs improvement?
- What is unclear or missing?
- Suggestions for improvement

**For Question:**
- Describe the question

## Step 3: Generate Issue Content

Create a formatted issue using the appropriate template:

**Bug Report:**
```markdown
## Bug Report

### Description
<description>

### Expected Behavior
<what should happen>

### Actual Behavior
<what actually happened>

### Steps to Reproduce
1. <step>

### Environment
- Config: <detected config if applicable>
- Branch: <current branch>
- Commit: <current commit hash>
```

**Feature Request:**
```markdown
## Feature Request

### Description
<feature description>

### Use Case
<why this would be useful>

### Examples
<examples or references>
```

**Documentation:**
```markdown
## Documentation Improvement

### Document
<which documentation>

### Issue
<what is unclear or missing>

### Suggestion
<suggestions>
```

## Step 4: Display and Confirm

Show the generated issue content preview. Ask user to confirm before creating.

## Step 5: Create GitHub Issue

```bash
ISSUE_TITLE="<issue type>: <brief summary>"
ISSUE_BODY="<generated content>"
ISSUE_LABEL="<bug|enhancement|documentation|question>"

ISSUE_URL=$(gh issue create \
  --title "$ISSUE_TITLE" \
  --label "$ISSUE_LABEL" \
  --body "$ISSUE_BODY" 2>&1)

if [ $? -eq 0 ]; then
    echo "Issue created successfully!"
    echo "Issue URL: $ISSUE_URL"
else
    echo "Failed to create issue via GitHub CLI."
    echo "Error: $ISSUE_URL"
    echo ""
    echo "Copy the following content to create manually:"
    echo "Title: $ISSUE_TITLE"
    echo "Label: $ISSUE_LABEL"
    echo "$ISSUE_BODY"
fi
```

## Step 6: Provide Guidance

After creating the issue:
- Include relevant logs or screenshots
- Mention which config you're using
- You can edit the issue on GitHub to add more details

# /bug Command Guide

Automated bug triage, fix, and PR workflow.

## Usage

```
/bug <description-or-issue-url>
```

## What It Does

1. **Triage** - Locates the bug, classifies severity (trivial/critical)
2. **Issue** - Creates a GitHub issue with structured details
3. **Fix** - Identifies root cause, implements targeted fix with verification
4. **PR** - Commits, pushes, creates PR linked to the issue
5. **Review** - Gets confirmation, monitors CI, merges when ready

## Key Features

- Severity classification guides fix approach
- Suggests plan mode for critical bugs
- Automatic issue linking in commit messages and PR
- CI monitoring after merge
- Project status updates in docs/

## When to Use

- Reproducing and fixing a reported bug
- Triaging a bug from user description or error logs
- Full lifecycle: from report to merged fix

## Agents Used

- general-code-quality-debugger (root cause analysis)
- general-technical-project-lead (review)

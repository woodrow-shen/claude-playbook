# /commit Command Guide

Create well-formatted conventional commits with auto-staging and sign-off.

## Usage

```
/commit
/commit <message-hint>
```

## What It Does

1. Checks for staged files; auto-stages if nothing is staged
2. Analyzes the diff to understand what changed
3. Detects if multiple logical changes should be separate commits
4. Generates a conventional commit message
5. Commits with sign-off (`-s`)

## Commit Format

```
<type>(<scope>): <short description>

<body explaining what and why>

Signed-off-by: Name <email>
```

Types: feat, fix, refactor, docs, test, chore, ci, style, perf

## Key Features

- Automatic staging of unstaged changes
- Detects multiple logical changes and suggests splitting
- Issue number linking from branch names
- Multiline messages for complex changes
- Always includes Signed-off-by

## Agents Used

- general-code-quality-debugger (change analysis)
- general-technical-project-lead (message quality)

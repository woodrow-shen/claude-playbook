# /review Command Guide

Enter plan mode to review and discuss feature design.

## Usage

```
/review
/review <feature-or-topic>
```

## What It Does

1. Enters plan mode for collaborative discussion
2. Reads docs/*.md files to understand current state
3. Explores the codebase for relevant context
4. Provides insights and identifies issues
5. Discusses design decisions with the user
6. Updates documentation before exiting plan mode

## Key Features

- Collaborative design review (not just code review)
- Reads existing documentation for context
- Identifies UX issues and suggests improvements
- Updates docs/ files with agreed changes
- Non-destructive: uses plan mode, no code changes until confirmed

## When to Use

- Before starting a large feature implementation
- Reviewing architecture decisions
- Discussing tradeoffs between approaches
- Aligning on design before writing code

## See Also

- `/reviewpr` for reviewing existing pull requests
- `/issue` for implementing GitHub issues

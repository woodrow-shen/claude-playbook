# /reviewpr Command Guide

Deep review a GitHub pull request for code quality, tests, and security.

## Usage

```
/reviewpr <pr-number-or-url>
```

## What It Does

1. **Analyze** - Gathers PR details, diff, CI status, commit history
2. **Review** - Evaluates code quality, observability, tests, security
3. **Feedback** - Provides structured review with specific line references
4. **Iterate** - Discusses findings and re-reviews after changes

## Review Categories

- **Correctness** - Logic errors, edge cases, error handling
- **Security** - Injection, auth, data exposure
- **Performance** - N+1 queries, unnecessary allocations
- **Testing** - Coverage, edge cases, meaningful assertions
- **Observability** - Logging, metrics, error reporting
- **Git workflow** - Commit messages, sign-off, history cleanliness

## Key Features

- Comprehensive multi-dimension review
- CI/CD status monitoring
- Browser automation support for UI PRs
- Iterative review (re-review after changes)

## Agents Used

- general-code-quality-debugger (code analysis)
- general-technical-project-lead (overall review)
- general-qa (test assessment)
- general-solution-architect (design review)

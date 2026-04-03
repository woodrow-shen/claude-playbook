# /issue Command Guide

Analyze, plan, implement, and create a PR for a GitHub issue.

## Usage

```
/issue <issue-number-or-url>
```

## What It Does

1. **Plan** - Reads the issue, researches codebase, creates implementation plan
2. **Create** - Implements changes with proper commits
3. **Test** - Verifies changes pass tests
4. **Deploy** - Updates docs, creates PR linked to the issue

## Workflow Types

- **Standard** - Full plan/implement/test/PR cycle
- **Exploration** - Research-focused for unclear issues
- **Test-first** - TDD approach: write tests before implementation
- **Rapid prototyping** - Quick implementation for simple issues

## Key Features

- Uses scratchpad for documenting progress
- Automatic issue linking in commits and PR
- Multiple workflow types based on issue complexity
- Uses /commit for properly formatted messages

## Agents Used

- general-fullstack-developer (implementation)
- general-backend-developer, general-frontend-developer (specialized work)
- general-qa (test verification)
- general-purpose (research and analysis)

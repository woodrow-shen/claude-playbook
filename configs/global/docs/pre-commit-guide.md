# /pre-commit Command Guide

Run pre-commit hooks to check code quality before committing.

## Usage

```
/pre-commit
```

## What It Does

1. Validates the current directory is a git repository
2. Detects the hook system:
   - **Framework mode** - Uses `pre-commit run --all-files` if `.pre-commit-config.yaml` exists
   - **Manual mode** - Runs `.git/hooks/pre-commit` directly
   - **None** - Reports no hooks found, suggests installing via option 10
3. Runs all hooks and captures results
4. Reports pass/fail for each hook
5. Re-stages files if hooks modified them (e.g., trailing whitespace fixes)

## Key Features

- Supports both pre-commit framework and manual git hooks
- Does not stop on first failure - runs all hooks
- Automatically re-stages modified files
- Reports which files were changed by hooks

## When to Use

- Before committing to catch issues early
- After staging changes to verify compliance
- To run all quality checks without committing

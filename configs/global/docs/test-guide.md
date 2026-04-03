# /test Command Guide

Run tests, fix failures, and add missing coverage.

## Usage

```
/test <file-or-directory>
/test <feature>
/test all
```

## What It Does

1. **Assess** - Identifies test scope, checks current coverage, reviews test patterns
2. **Run** - Executes targeted tests first, then integration and full suite
3. **Improve** - Fixes failures, adds missing tests, refactors for quality
4. **Validate** - Runs multiple times to catch flakiness, verifies coverage increase
5. **Report** - Documents results, updates PR description if applicable

## Key Features

- Automatic test framework detection (Jest, pytest, RSpec, xUnit, etc.)
- Scope detection: file, directory, feature name, or "all"
- Fail-fast mode during debugging
- Browser automation for E2E tests
- Coverage reporting and improvement

## Agents Used

- general-qa (test strategy and automation)
- general-code-quality-debugger (debugging failures)
- general-backend-developer (API and integration tests)
- general-frontend-developer (UI tests with browser automation)

## When to Use

- After implementing a feature to verify correctness
- To improve test coverage in a specific area
- To fix flaky or failing tests
- Before creating a PR to ensure all tests pass

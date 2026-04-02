---
name: tdd-enforcement
description: Enforce Test-Driven Development workflow for all code changes
---

# TDD Enforcement

All code changes MUST follow the Red-Green-Refactor cycle.

## Scope

Applies when: adding features, fixing bugs, refactoring code.

Does NOT apply to: documentation-only changes, config files without logic, trivial typo fixes.

## Workflow

### 1. Test First (RED)

Before writing any implementation code:
- Write a test that defines the expected behavior
- Run the test and verify it FAILS
- A test that passes before implementation is a broken test

### 2. Minimal Implementation (GREEN)

- Write the smallest amount of code to make the test pass
- Do not add untested behavior

### 3. Refactor

- Improve code structure while keeping tests green
- Commit only when all tests pass

## Rules

1. **NEVER write implementation code before a failing test exists**
2. **NEVER skip the RED step** — seeing the test fail proves it tests something
3. **Tests must work from a clean state** — no dependency on conversation context or prior runs
4. **If a test framework or tests/ directory does not exist in the project, create one before proceeding**

## Violation Recovery

If implementation was written without tests:
1. Stop and write the missing tests
2. Verify tests fail without the implementation (revert if needed)
3. Re-apply the implementation and verify tests pass

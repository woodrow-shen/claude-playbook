---
name: git-workflow
description: Git commit rules for openra2-rust — sign-off and pre-commit hooks required
---

# Git Workflow Rules

## Scope

Applies to all commits in the openra2-rust repository.

## Rules

### 1. Sign-off Required

Every commit MUST include a `Signed-off-by` line matching the git config identity.

- Use `git commit -s` to add the sign-off automatically
- Do NOT manually write `Signed-off-by` in the message body — the `-s` flag handles it
- The sign-off name and email MUST match `git config user.name` and `git config user.email`

### 2. Pre-commit Hooks Must Pass

Every commit MUST pass all pre-commit hooks before it is accepted.

- NEVER use `--no-verify` to bypass hooks
- If a hook fails, fix the underlying issue — do not skip the hook
- If a pre-commit hook modifies files (e.g., trailing whitespace fix), re-stage the modified files and commit again

### 3. No Hook Bypass

- NEVER use `git commit --no-verify`
- NEVER use `git push --no-verify`
- NEVER modify `.git/hooks/` to disable hooks
- NEVER modify `core.hooksPath` to point away from installed hooks

### 4. Failed Hook Recovery

When a pre-commit hook fails:

1. Read the hook output to understand the failure
2. Fix the issue in the source files
3. Re-stage the fixed files with `git add`
4. Create a NEW commit — do NOT amend the previous commit (the failed commit never happened)

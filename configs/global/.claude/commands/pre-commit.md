---
name: pre-commit
description: "Run pre-commit hooks on staged or all files"
---

# Run Pre-commit Hooks

Run pre-commit hooks to check code quality before committing.

## Input Validation

Validate that the current directory is a git repository:

```bash
if [[ ! -d ".git" ]]; then
    echo "ERROR: Not a git repository"
    exit 1
fi
```

## Step 1: Detect pre-commit method

Check which hook system is available:

```bash
if [[ -f ".pre-commit-config.yaml" ]] && command -v pre-commit &>/dev/null; then
    echo "MODE=framework"
elif [[ -d ".git/hooks" ]]; then
    echo "MODE=manual"
else
    echo "MODE=none"
fi
```

## Step 2: Run hooks

### If MODE=framework (pre-commit tool installed)

Run on all files:

```bash
pre-commit run --all-files
```

### If MODE=manual (git hooks only)

Run each hook script directly:

```bash
for hook in .git/hooks/pre-commit; do
    if [[ -x "$hook" ]]; then
        echo "Running: $(basename "$hook")"
        bash "$hook" # SAFETY: runs local git hook scripts only, no user-controlled input
    fi
done
```

### If MODE=none

Report error: "No pre-commit hooks found. Run claude-setup option 10 to install hooks."

## Error Handling

- If a hook exits with non-zero status, capture the output and report the failure
- Do not stop on first failure — run all hooks and report all results

## Step 3: Report results

- If all hooks pass: report success
- If any hook fails: show the failure output and suggest fixes
- If hooks modified files (e.g., trailing whitespace): report which files were modified and re-stage them with `git add`

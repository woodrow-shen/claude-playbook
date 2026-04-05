---
name: cp:pre-commit
description: "Run claude-playbook pre-commit hooks from any repo"
---

# Run Claude Playbook Pre-commit Hooks

Run pre-commit hooks from the claude-playbook repository, regardless of whether it is installed as a submodule or local clone.

## Step 1: Find Playbook

Locate the claude-playbook directory:

```bash
if [ -d "claude-playbook" ] && [ -f "claude-playbook/.pre-commit-config.yaml" ]; then
    PLAYBOOK_PATH="claude-playbook"
elif [ -d ".claude-playbook" ] && [ -f ".claude-playbook/.pre-commit-config.yaml" ]; then
    PLAYBOOK_PATH=".claude-playbook"
elif [ -L ".claude" ]; then
    RESOLVED=$(readlink ".claude" | sed 's|/configs/.*||')
    if [ -d "$RESOLVED" ] && [ -f "$RESOLVED/.pre-commit-config.yaml" ]; then
        PLAYBOOK_PATH="$RESOLVED"
    fi
fi

if [ -z "${PLAYBOOK_PATH:-}" ]; then
    echo "ERROR: Could not find claude-playbook"
    echo "Looked in: claude-playbook/, .claude-playbook/, .claude symlink target"
    exit 1
fi

echo "Found playbook at: $PLAYBOOK_PATH"
```

## Step 2: Run Pre-commit Hooks

Change to the playbook directory and run hooks.

### If pre-commit framework is available

```bash
cd "$PLAYBOOK_PATH"
if [ -f ".pre-commit-config.yaml" ] && command -v pre-commit &>/dev/null; then
    pre-commit run --all-files
fi
```

### If pre-commit framework is not installed

Fall back to running hook scripts directly from `scripts/hooks/`:

```bash
cd "$PLAYBOOK_PATH"
for hook in scripts/hooks/check-*.sh scripts/hooks/enforce-*.sh; do
    if [ -f "$hook" ] && [ -x "$hook" ]; then
        echo "Running: $(basename "$hook")"
        bash "$hook" # SAFETY: runs playbook hook scripts only, paths are glob-matched constants
    fi
done
```

## Step 3: Report Results

- If all hooks pass: report success
- If any hook fails: show failure output and suggest fixes
- If hooks modified files (e.g., trailing whitespace): report which files were modified

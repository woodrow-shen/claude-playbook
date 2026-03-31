---
name: cp:push
description: "Push local changes to claude-playbook submodule"
---

Push local changes to the claude-playbook submodule.

## Step 1: Find Submodule

```bash
if [ -L ".claude" ]; then
    SUBMODULE_PATH=$(readlink ".claude" | sed 's|/configs/.*||')
elif [ -d "claude-playbook" ]; then
    SUBMODULE_PATH="claude-playbook"
else
    SUBMODULE_PATH=$(find . -maxdepth 2 -type d -name "configs" -path "*/configs" | \
                     xargs -I {} dirname {} | head -1)
fi

if [ -z "$SUBMODULE_PATH" ]; then
    echo "Error: Could not find claude-playbook submodule"
    exit 1
fi
```

## Step 2: Detect Changes

```bash
cd "$SUBMODULE_PATH"
CHANGED_FILES=$(git status --porcelain configs/ scripts/ docs/ | awk '{print $2}')
```

If no changes, inform user and exit.

## Step 3: Determine Commit Scope

Based on changed file paths:
- `configs/global/` -> `claude/configs/global`
- `configs/debugging/` -> `claude/configs/debugging`
- `scripts/` -> `claude/scripts`
- `docs/` -> `claude/docs`

For any new configs added under `configs/`, use `claude/configs/<name>`.

## Step 4: Generate Commit Message

Analyze changed files to generate a descriptive title:
- Single config -> use specific scope (e.g., `claude/configs/global: update /cp command`)
- Multiple files in same config -> `claude/configs/<config>: update <count> files`
- Multiple configs -> `claude/configs: update <count> files across <config1>, <config2>`
- Mixed directories -> use most appropriate scope or `claude:` for cross-cutting changes

## Step 5: Commit and Push

```bash
git add .
git commit -s -m "$COMMIT_MSG"
git push origin main
```

## Step 6: Report Success

```bash
echo "Successfully pushed changes to claude-playbook"
```

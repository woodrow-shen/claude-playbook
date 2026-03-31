---
name: cp:pull
description: "Pull latest changes from claude-playbook submodule"
---

Pull latest changes from the claude-playbook submodule.

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

## Step 2: Pull Submodule

```bash
cd "$SUBMODULE_PATH"
git pull origin main
cd ..
```

If pull fails due to local changes, automatically stash with `git stash push -m "Auto-stash before /cp:pull"`, retry, and inform user.

## Step 3: Check Symlink Conflicts

Only handle conflicts for symlinks INSIDE `.claude/` directory (MERGE mode). Do NOT touch the `.claude` symlink itself (REPLACE mode).

```bash
git fetch origin 2>/dev/null
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
INCOMING_FILES=$(git diff --name-only HEAD..origin/$CURRENT_BRANCH 2>/dev/null)
FAILED_PULL_CONFLICTS=$(git status --porcelain 2>/dev/null | grep "^??" | awk '{print $2}')

ALL_POTENTIAL_CONFLICTS=$(echo -e "$FAILED_PULL_CONFLICTS\n$INCOMING_FILES" | sort -u | grep -v '^$')

if [ -n "$ALL_POTENTIAL_CONFLICTS" ]; then
    while IFS= read -r file; do
        # Skip .claude symlink itself
        if [ "$file" = ".claude" ]; then
            continue
        fi
        # Only remove symlinks inside .claude/ that conflict
        if [ -L "$file" ]; then
            echo "Removing conflicting symlink: $file"
            rm "$file"
        fi
    done <<< "$ALL_POTENTIAL_CONFLICTS"

    # If reactive scenario (failed git pull), retry
    if [ -n "$FAILED_PULL_CONFLICTS" ]; then
        git pull
    fi
fi
```

## Step 4: Refresh MERGE Mode Symlinks

If parent repo uses MERGE mode (`.claude` is a directory, not a symlink):

```bash
if [ -d ".claude" ] && [ ! -L ".claude" ]; then
    SETUP_SCRIPT="$SUBMODULE_PATH/scripts/setup/setup-claude-merge.sh"
    if [ -f "$SETUP_SCRIPT" ]; then
        bash "$SETUP_SCRIPT" --update
    fi
fi
```

## Step 5: Report Success

```bash
echo "Successfully pulled latest changes from claude-playbook"
```

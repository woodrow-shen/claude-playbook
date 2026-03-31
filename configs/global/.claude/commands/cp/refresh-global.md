---
name: cp:refresh-global
description: "Refresh global Claude configurations in ~/.claude"
---

Refresh global Claude Code configurations in `~/.claude`.

## Step 1: Detect claude-playbook Location

Find where claude-playbook is located:

1. If `~/.claude` has symlinks, follow one to extract the source path:
   ```bash
   symlink=$(find "$HOME/.claude" -type l | head -1)
   if [ -n "$symlink" ]; then
       target=$(readlink -f "$symlink")
       WORKSPACE="${target%%/configs/*}"
   fi
   ```

2. Check if current directory is within claude-playbook (walk up looking for `configs/global/.claude`)

3. Check `~/claude-playbook`

If not found, show error and stop.

## Step 2: Run Update Script

```bash
SETUP_SCRIPT="$WORKSPACE/scripts/setup/setup-global-claude.sh"
bash "$SETUP_SCRIPT" --update
```

## Step 3: Report Results

Show the script output (verified symlinks, removed broken symlinks, added new files).

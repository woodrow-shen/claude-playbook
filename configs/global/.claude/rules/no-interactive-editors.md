---
name: no-interactive-editors
description: Never use interactive editors or interactive CLI tools — use non-interactive alternatives
---

# No Interactive Editors

AI agents run in non-interactive environments. Interactive tools hang, waste tokens, and require manual intervention.

## Rules

### NEVER use interactive editors

- **NEVER** launch `vim`, `vi`, `nano`, `emacs`, or any interactive editor
- **NEVER** use `git commit` without `-m` (it opens an editor)
- **NEVER** use `git rebase -i` (interactive rebase)
- **NEVER** use `git add -i` or `git add -p` (interactive staging)
- **NEVER** use `crontab -e` (opens editor)
- **NEVER** use `visudo`, `vipw`, or any `vi*` wrapper

### NEVER use interactive prompts in shell commands

These rules apply to shell commands and scripts executed via bash, NOT to conversational prompts in slash commands (asking the user questions via chat is fine).

- **NEVER** use commands that expect `y/n` confirmation without providing the answer
- **NEVER** use `read` to wait for user input in shell scripts you execute
- **NEVER** use `select` menus in bash scripts

### Use non-interactive alternatives

| Interactive (WRONG) | Non-interactive (CORRECT) |
|---------------------|--------------------------|
| `git commit` (opens editor) | `git commit -m "message"` |
| `git rebase -i HEAD~3` | `git rebase HEAD~3` or specific cherry-picks |
| `git add -i` | `git add <specific-files>` |
| `vim file.txt` | Use the Edit/Write tool or `sed`/`cat` |
| `nano file.txt` | Use the Edit/Write tool or `sed`/`cat` |
| `rm -i file` | `rm file` (after confirming with user) |
| `apt install pkg` | `apt install -y pkg` |
| `pip install` (with prompts) | `pip install --yes` or `pip install -q` |
| `crontab -e` | `crontab <<< "..."` or write to temp file then `crontab file` | <!-- safe: documentation example showing non-interactive alternative -->

### File operations

- **Read files**: Use the Read tool, `cat`, or `head`/`tail`
- **Write files**: Use the Write tool or `cat << 'EOF' > file`
- **Edit files**: Use the Edit tool or `sed -i`
- **NEVER** open a file in an editor to view or modify it

### Git commits

```bash
# WRONG - opens editor
git commit

# WRONG - opens editor for multi-line
git commit -e

# CORRECT - inline message
git commit -m "scope: short description"

# CORRECT - multi-line with heredoc
git commit -m "$(cat <<'EOF'
scope: short description

Detailed body here.

Signed-off-by: Name <email>
EOF
)"
```

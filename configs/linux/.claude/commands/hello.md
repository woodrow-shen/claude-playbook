---
name: hello
description: Say hello and confirm the linux kernel learning config is working
---

Say hello and confirm the linux kernel learning config is working.

## Input Validation

This command takes no arguments. If `$ARGUMENTS` is non-empty, validate it
is empty; ignore any provided value silently and continue with the default
greeting. Never pass arguments to a shell command.

```bash
set -euo pipefail
if [[ -n "${ARGUMENTS:-}" ]]; then
    # Ignore — /hello takes no input.
    :
fi
```

## Step 1: Print the Greeting

Print exactly this line, with no leading whitespace:

    Hello from the Linux kernel learning config!

## Step 2: List Available Commands

Read `configs/linux/.claude/commands/` in the claude-playbook tree and
list each command file by name and one-line description drawn from the
frontmatter `description` field.

```bash
set -e
CMD_DIR="configs/linux/.claude/commands"
if [[ ! -d "$CMD_DIR" ]]; then
    echo "ERROR: commands directory not found"
    exit 1
fi
```

## Error Handling

- If the commands directory is missing or unreadable, print
  `ERROR: commands directory not found` and return cleanly with exit 1.
- Never shell out with user-supplied strings. This command takes no input
  and runs no user-controlled commands.
- On any internal failure, fail closed: print nothing beyond the greeting
  and the error line.

## Security

This command is read-only and does not execute user input. It does not
modify files, call the network, or spawn subshells. Safe by construction.
# SAFETY: No variables are interpolated into shell invocations.

# /hello Command Guide

Confirm the linux kernel learning config is loaded and list its commands.

## Usage

```
/hello
```

The command takes no arguments. Any provided arguments are ignored.

## What It Does

1. Prints the greeting line:

    ```
    Hello from the Linux kernel learning config!
    ```

2. Reads `configs/linux/.claude/commands/` and lists each command file
   by name with the one-line description from its frontmatter.

## When to Use

- Smoke-test the linux config after `/cp:pull` or initial setup.
- Verify that command files are visible to Claude Code in this repo.
- Quickly enumerate available commands without leaving the session.

## Output Example

```
Hello from the Linux kernel learning config!

Available commands:
- /hello -- Say hello and confirm the linux kernel learning config is working
```

## Error Handling

If `configs/linux/.claude/commands/` is missing or unreadable, the command
prints `ERROR: commands directory not found` and exits with status 1.
The greeting line is printed first, so the error path stays bounded.

## Security Notes

`/hello` is read-only. It takes no user input, makes no network calls, and
spawns no user-controlled subshells. It is safe to run in any context.

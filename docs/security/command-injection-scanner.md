# Command Injection Scanner

Automated security scanner for detecting shell injection patterns in AI command files.

## Overview

The command injection scanner (`scripts/hooks/check-command-injection.sh`) scans AI command/rule/config files for potentially dangerous shell patterns that could be exploited for code execution, privilege escalation, or data exfiltration.

**Key Principle:** Command files (`.claude/commands/*.md`) are executable instructions for AI agents, not documentation. Code blocks within these files will be executed directly by AI agents, so all shell patterns must be validated.

## Why This Matters

AI command files are different from regular documentation:

- **Regular Markdown:** Code blocks are for display only
- **AI Command Files:** Code blocks are executed by AI agents

**Example Risk:**
```markdown
## Step 1: Clone Repository

```bash
BRANCH_NAME="$ARGUMENTS"
git clone -b $BRANCH_NAME repo.git
```
```

If `BRANCH_NAME` contains `"; rm -rf / #"`, the AI agent will execute it.

## Pattern Categories

### CRITICAL Patterns (17 types)

These patterns are almost always malicious in AI command files. Commits containing these patterns will be **blocked**.

**Shell Execution:**
- `$(...)` - Command substitution
- `` `...` `` - Backtick execution
- `eval` - Evaluate string as code
- `exec` - Execute command
- `source` - Source external file

**Pipe to Shell:**
- `| sh`, `| bash` - Pipe to shell
- `| python`, `| perl`, `| ruby`, `| node` - Pipe to interpreter

**Download + Execute:**
- `curl | sh`, `wget | sh` - Download and execute
- `curl -o /tmp`, `wget -O /tmp` - Download to temp

**Encoding Tricks:**
- `base64 -d` - Base64 decode (obfuscation)
- `xxd -r` - Hex decode
- `printf \x` - Hex escape

**Reverse Shells:**
- `/dev/tcp/`, `/dev/udp/` - Bash reverse shell
- `nc -e`, `ncat -e` - Netcat execute
- `mkfifo` - Named pipe (reverse shell pattern)

### WARNING Patterns (20 types)

These patterns may have legitimate uses but warrant careful review. Commits will **proceed with warnings**.

**Destructive Operations:**
- `rm -rf /`, `rm -rf $`, `rm -rf *` - Dangerous deletions
- `mkfs.` - Format filesystem
- `dd if=` - Disk overwrite
- `> /dev/sd` - Write to disk device

**Privilege Escalation:**
- `sudo` - Superuser execution
- `chmod 777` - World-writable permissions
- `chmod +s` - Setuid bit
- `chown root` - Change owner to root

**Credential Access:**
- `cat .ssh/` - Reading SSH keys
- `cat /etc/shadow`, `cat /etc/passwd` - System credentials
- `$AWS_SECRET`, `$GITHUB_TOKEN` - Secrets in commands
- `credentials.json` - Credential files

**Data Exfiltration:**
- `curl -d`, `curl --data`, `curl -X POST` - HTTP POST
- `wget --post` - HTTP POST

**Environment Manipulation:**
- `export PATH=` - PATH hijacking
- `export LD_PRELOAD`, `export LD_LIBRARY_PATH` - Library injection
- `alias` - Alias injection

**Git Config:**
- `git config credential` - Credential access
- `git config core.hooksPath` - Hook path hijacking
- `git push --force` - Force push

## Usage

### Automatic (Pre-commit Hook)

The scanner runs automatically on every commit:

```bash
git add configs/global/.claude/commands/my-command.md
git commit -m "claude: add new command"

# Scanner runs automatically
# If CRITICAL patterns found: commit blocked
# If WARNING patterns found: commit proceeds with warnings
```

### Manual Scan

Scan specific files:

```bash
# Single file
./scripts/hooks/check-command-injection.sh configs/global/.claude/commands/bug.md

# Multiple files
./scripts/hooks/check-command-injection.sh configs/**/*.md

# All staged files (same as pre-commit hook)
./scripts/hooks/check-command-injection.sh
```

### Scan All Files

```bash
pre-commit run check-command-injection --all-files
```

## Handling Detections

### CRITICAL Patterns Detected

**Commit is blocked.** You must either:

1. **Remove the pattern** (recommended)
2. **Add safety comment** if pattern is necessary

### Adding Safety Comments

If a pattern is necessary and safe (e.g., internal variable expansion), add a comment:

```markdown
## Step 1: Generate Job Name

```bash
<!-- safe: UUID generation for SLURM job name, no user input --> ROBOT_JOB_NAME="robot-$(uuidgen | cut -d'-' -f1)"
```
```

The scanner will skip lines that **start with** `<!-- safe: ... -->` comments.

**Important:** The comment must be at the beginning of the line, before the code.

**Requirements for safety comments:**
- Must explain WHY the pattern is safe
- Must confirm no user input is involved
- Must be reviewed during PR review

### WARNING Patterns Detected

**Commit proceeds with warnings.** Review carefully:

1. Verify the pattern is necessary
2. Ensure proper input validation exists
3. Document the usage in PR description
4. Request security review if uncertain

## Best Practices

### 1. Validate All User Input

**Bad:**
```bash
BRANCH_NAME="$ARGUMENTS"
git clone -b $BRANCH_NAME repo.git
```

**Good:**
```bash
BRANCH_NAME="$ARGUMENTS"

# Security: Validate branch name
if [[ ! "$BRANCH_NAME" =~ ^[a-zA-Z0-9._/-]+$ ]]; then
    echo "Error: Invalid branch name"
    exit 1
fi

gh repo clone org/repo -- -b "$BRANCH_NAME"
```

### 2. Use gh Instead of git

**Bad:**
```bash
git clone git@github.com:org/repo.git
```

**Good:**
```bash
gh repo clone org/repo
```

Benefits:
- Better authentication handling
- No SSH key issues
- Cleaner syntax

### 3. Quote All Variables

**Bad:**
```bash
rm -rf /scratch/$USER/
```

**Good:**
```bash
rm -rf "/scratch/${USER}/"
```

### 4. Validate Environment Variables

**Bad:**
```bash
rm -rf /scratch/${USER}/
```

**Good:**
```bash
if [ -z "${USER}" ] || [ "${USER}" = "root" ]; then
    echo "Error: USER not set or is root"
    exit 1
fi

rm -rf "/scratch/${USER}/"
```

## See Also

- [Security Checklist](./SECURITY-CHECKLIST.md) - Quick reference checklist
- [Secure Command Development](./secure-command-development.md) - Complete guide

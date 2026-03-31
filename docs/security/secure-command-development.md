# Secure Command Development Guidelines

Best practices for developing secure AI command files in claude-playbook.

## Core Principle

**AI command files are executable code, not documentation.**

Code blocks in `.claude/commands/*.md` files are executed directly by AI agents. Every shell command, variable expansion, and pattern must be treated as executable code that could be exploited.

## Security Checklist

Use this checklist when creating or modifying command files:

### Input Validation

- [ ] All user input parameters are validated before use
- [ ] Branch names validated with: `^[a-zA-Z0-9._/-]+$`
- [ ] Version numbers validated with: `^[0-9]+\.[0-9]+\.[0-9]+$`
- [ ] URLs validated with: `^https?://[a-zA-Z0-9.-]+/`
- [ ] No path traversal patterns (`..`) in user input
- [ ] Machine names validated against whitelist

### Variable Handling

- [ ] All variables are properly quoted: `"$VAR"` not `$VAR`
- [ ] Environment variables validated before use (e.g., `$USER`)
- [ ] No unvalidated command substitution: `$(user_input)`
- [ ] No unvalidated backtick execution: `` `user_input` ``

### Command Safety

- [ ] Use `gh repo clone` instead of `git clone`
- [ ] Avoid `eval`, `exec`, `source` with user input
- [ ] Validate before `rm -rf` operations
- [ ] No piping to shell: `| sh`, `| bash`
- [ ] No download-and-execute: `curl | sh`

### Authentication

- [ ] Use `gh` CLI for GitHub operations (better auth)
- [ ] No hardcoded credentials or tokens
- [ ] No credential files in commands
- [ ] Use environment variables for secrets (validated)

## Validation Patterns

### Branch Name Validation

```bash
BRANCH_NAME="$ARGUMENTS"

# Security: Validate branch name
if [[ ! "$BRANCH_NAME" =~ ^[a-zA-Z0-9._/-]+$ ]]; then
    echo "Error: Invalid branch name: $BRANCH_NAME"
    echo "Branch name can only contain: a-z, A-Z, 0-9, ., _, -, /"
    exit 1
fi

# Safe to use
gh repo clone org/repo -- -b "$BRANCH_NAME"
```

### Version Number Validation

```bash
VERSION="$ARGUMENTS"

# Security: Validate version format
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Error: Invalid version format: $VERSION"
    echo "Expected format: X.Y.Z (e.g., 4.1.0)"
    exit 1
fi

# Safe to use
TOOLCHAIN_PATH="/path/to/toolchain-${VERSION}"
```

### URL Validation

```bash
URL="$ARGUMENTS"

# Security: Validate URL format
if [[ ! "$URL" =~ ^https?://[a-zA-Z0-9.-]+/ ]]; then
    echo "Error: Invalid URL format: $URL"
    echo "Expected format: https://hostname/path"
    exit 1
fi

# Safe to use
curl -s "$URL"
```

### USER Variable Validation

```bash
# Security: Validate USER before rm -rf
if [ -z "${USER}" ] || [ "${USER}" = "root" ]; then
    echo "Error: USER not set or is root"
    exit 1
fi

# Safe to use
rm -rf "/scratch/${USER}/"
```

### Machine Name Whitelist

```bash
MACHINE="$ARGUMENTS"

# Security: Validate against whitelist
case "$MACHINE" in
    sifive-fpga|sifive-firesim)
        # OK
        ;;
    *)
        echo "Error: Invalid machine: $MACHINE"
        echo "Allowed: sifive-fpga, sifive-firesim"
        exit 1
        ;;
esac

# Safe to use
bitbake -c build "$MACHINE"
```

## Common Vulnerabilities

### Command Injection

**Vulnerable:**
```bash
BRANCH_NAME="$ARGUMENTS"
git clone -b $BRANCH_NAME repo.git
```

**Attack:** `BRANCH_NAME="; rm -rf / #"`

**Secure:**
```bash
BRANCH_NAME="$ARGUMENTS"

if [[ ! "$BRANCH_NAME" =~ ^[a-zA-Z0-9._/-]+$ ]]; then
    echo "Error: Invalid branch name"
    exit 1
fi

gh repo clone org/repo -- -b "$BRANCH_NAME"
```

### Path Traversal

**Vulnerable:**
```bash
FILE_PATH="$ARGUMENTS"
cat "$FILE_PATH"
```

**Attack:** `FILE_PATH="../../../etc/passwd"`

**Secure:**
```bash
FILE_PATH="$ARGUMENTS"

if [[ "$FILE_PATH" =~ \.\. ]]; then
    echo "Error: Path traversal detected"
    exit 1
fi

if [[ "$FILE_PATH" =~ ^/ ]]; then
    echo "Error: Absolute paths not allowed"
    exit 1
fi

cat "$FILE_PATH"
```

### Unvalidated Environment Variables

**Vulnerable:**
```bash
rm -rf /scratch/${USER}/
```

**Attack:** `USER=""` or `USER="../../"`

**Secure:**
```bash
if [ -z "${USER}" ] || [ "${USER}" = "root" ]; then
    echo "Error: USER not set or is root"
    exit 1
fi

rm -rf "/scratch/${USER}/"
```

## Safety Comments

When a dangerous pattern is necessary and safe, add a safety comment:

```bash
<!-- safe: UUID generation for SLURM job name, no user input --> ROBOT_JOB_NAME="robot-$(uuidgen | cut -d'-' -f1)"
```

**Requirements:**
- Comment must start at beginning of line
- Must explain WHY the pattern is safe
- Must confirm no user input involved
- Must be reviewed during PR review

**Format:** `<!-- safe: reason --> CODE`

## Testing Your Commands

### Manual Testing

Before committing, test your command with malicious inputs:

```bash
# Test with command injection
/your-command "; rm -rf / #"

# Test with path traversal
/your-command "../../../etc/passwd"

# Test with special characters
/your-command "'; DROP TABLE users; --"

# Test with empty input
/your-command ""

# Test with very long input
/your-command "$(python -c 'print("A"*10000)')"
```

### Automated Testing

Run the scanner on your files:

```bash
# Scan specific file
./scripts/hooks/check-command-injection.sh configs/global/.claude/commands/your-command.md

# Scan all files
pre-commit run check-command-injection --all-files
```

## Code Review Guidelines

When reviewing PRs that modify command files:

### Security Review Checklist

- [ ] All user input is validated
- [ ] All variables are quoted
- [ ] No dangerous patterns without safety comments
- [ ] Safety comments are justified
- [ ] Error messages are clear
- [ ] Scanner warnings are addressed
- [ ] Tests pass

### Red Flags

Watch for these patterns in PRs:

- Unvalidated `$(...)` or `` `...` ``
- `eval`, `exec`, `source` with user input
- `rm -rf` without validation
- `curl | sh` or `wget | sh`
- Unquoted variables: `$VAR` instead of `"$VAR"`
- Path operations without traversal checks
- Hardcoded credentials or secrets

### Questions to Ask

1. **Where does this input come from?**
   - User argument? Validate it.
   - Environment variable? Validate it.
   - External API? Validate it.
   - Internal generation? Document it.

2. **What happens if input is malicious?**
   - Can it execute arbitrary code?
   - Can it access sensitive files?
   - Can it delete important data?
   - Can it escalate privileges?

3. **Is this pattern necessary?**
   - Can we use a safer alternative?
   - Can we use `gh` instead of `git`?
   - Can we avoid shell execution?
   - Can we use a whitelist?

## Best Practices Summary

### DO

- Validate all user input before use
- Use `gh repo clone` instead of `git clone`
- Quote all variables: `"$VAR"`
- Use whitelists for known values
- Add safety comments for necessary patterns
- Test with malicious inputs
- Run scanner before committing
- Document validation logic

### DON'T

- Trust user input
- Use `eval` or `exec` with user data
- Pipe to shell: `| sh`, `| bash`
- Download and execute: `curl | sh`
- Use unquoted variables
- Skip validation "because it's internal"
- Ignore scanner warnings
- Hardcode credentials

## Resources

- [Command Injection Scanner](./command-injection-scanner.md) - Scanner usage guide
- [Security Checklist](./SECURITY-CHECKLIST.md) - Quick reference checklist
- [Template Compliance](./template-compliance-validation.md) - Compliance scoring

## Getting Help

If you're unsure about security:

1. **Run the scanner** - It will catch most issues
2. **Check existing commands** - Look for similar patterns
3. **Ask for review** - Tag security-conscious reviewers
4. **Test thoroughly** - Try to break your own code
5. **Document assumptions** - Explain why something is safe

**When in doubt, validate more, not less.**

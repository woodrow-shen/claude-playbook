# Security Checklist for Command Development

Quick reference checklist for creating secure AI command files.

## Pre-Development

- [ ] Review [Secure Command Development Guide](./secure-command-development.md)
- [ ] Check [Command Template](../templates/secure-command-template.md)

## During Development

### Input Validation

- [ ] All user parameters validated before use
- [ ] Branch names: `^[a-zA-Z0-9._/-]+$`
- [ ] Version numbers: `^[0-9]+\.[0-9]+\.[0-9]+$`
- [ ] URLs: `^https?://[a-zA-Z0-9.-]+/`
- [ ] No path traversal: check for `..`
- [ ] Whitelist validation for known values

### Variable Handling

- [ ] All variables quoted: `"$VAR"` not `$VAR`
- [ ] Environment variables validated (e.g., `$USER`)
- [ ] No unvalidated `$(...)` command substitution
- [ ] No unvalidated `` `...` `` backtick execution

### Command Safety

- [ ] Use `gh repo clone` instead of `git clone`
- [ ] No `eval` with user input
- [ ] No `exec` with user input
- [ ] No `source` with user input
- [ ] No pipe to shell: `| sh`, `| bash`
- [ ] No download-execute: `curl | sh`, `wget | sh`
- [ ] Validate before `rm -rf`

### Authentication & Secrets

- [ ] Use `gh` CLI for GitHub (better auth)
- [ ] No hardcoded credentials
- [ ] No credential files in commands
- [ ] Secrets from environment variables (validated)

### Documentation

- [ ] Safety comments for dangerous patterns: `<!-- safe: reason --> CODE`
- [ ] Clear error messages
- [ ] Usage examples

## Before Committing

### Testing

- [ ] Test with valid inputs
- [ ] Test with malicious inputs:
  - [ ] Command injection: `"; rm -rf / #"`
  - [ ] Path traversal: `"../../../etc/passwd"`
  - [ ] SQL injection: `"'; DROP TABLE users; --"`
  - [ ] Empty input: `""`
  - [ ] Long input: 10,000+ characters
- [ ] Test error handling
- [ ] Test edge cases

### Automated Checks

- [ ] Run scanner: `./scripts/hooks/check-command-injection.sh your-file.md`
- [ ] Scanner passes (no CRITICAL patterns)
- [ ] Scanner warnings addressed or justified
- [ ] Pre-commit hooks pass
- [ ] All tests pass

### Code Review

- [ ] Self-review for security issues
- [ ] Check against this checklist
- [ ] Document any safety comments
- [ ] Prepare justification for warnings

## During Code Review

### As Author

- [ ] Explain validation logic
- [ ] Justify any safety comments
- [ ] Address reviewer concerns
- [ ] Update based on feedback

### As Reviewer

- [ ] Verify all inputs validated
- [ ] Check variable quoting
- [ ] Review dangerous patterns
- [ ] Verify safety comments justified
- [ ] Test with malicious inputs
- [ ] Check scanner results

## Common Patterns

### ✅ SAFE

```bash
# Validated input
BRANCH="$ARGUMENTS"
if [[ ! "$BRANCH" =~ ^[a-zA-Z0-9._/-]+$ ]]; then
    echo "Error: Invalid branch"
    exit 1
fi
gh repo clone org/repo -- -b "$BRANCH"

# Quoted variables
rm -rf "/scratch/${USER}/"

# Whitelist validation
case "$MACHINE" in
    sifive-fpga|sifive-firesim) ;;
    *) echo "Error: Invalid machine"; exit 1 ;;
esac

# Safety comment for internal generation
<!-- safe: UUID generation, no user input --> JOB_ID="$(uuidgen)"
```

### ❌ UNSAFE

```bash
# Unvalidated input
BRANCH="$ARGUMENTS"
git clone -b $BRANCH repo.git

# Unquoted variables
rm -rf /scratch/$USER/

# No validation
eval "$USER_INPUT"

# Download and execute
curl http://example.com/script.sh | bash

# Command injection
RESULT=$(curl -s "$USER_URL")
```

## Quick Reference

### Validation Regex

| Type | Pattern | Example |
|------|---------|---------|
| Branch | `^[a-zA-Z0-9._/-]+$` | `dev/feature-123` |
| Version | `^[0-9]+\.[0-9]+\.[0-9]+$` | `4.1.0` |
| URL | `^https?://[a-zA-Z0-9.-]+/` | `https://example.com/` |

### Dangerous Patterns

| Pattern | Risk | Alternative |
|---------|------|-------------|
| `git clone` | Auth issues | `gh repo clone` |
| `eval "$VAR"` | Code execution | Validate + use directly |
| `$VAR` | Injection | `"$VAR"` |
| `\| sh` | Code execution | Avoid piping to shell |
| `curl \| sh` | Remote execution | Download + validate + execute |
| `rm -rf $VAR` | Data loss | Validate + quote |

## Resources

- [Secure Command Development](./secure-command-development.md) - Complete guide
- [Command Template](../templates/secure-command-template.md) - Secure template
- [Scanner Documentation](./command-injection-scanner.md) - Scanner usage

## Emergency Response

If you discover a security vulnerability:

1. **Do not commit** the vulnerable code
2. **Report immediately** to security team
3. **Document** the vulnerability
4. **Fix** following this checklist
5. **Test** thoroughly
6. **Review** with security-conscious reviewer

## Questions?

When in doubt:

1. Run the scanner
2. Check existing secure commands
3. Ask for security review
4. Test with malicious inputs
5. **Validate more, not less**

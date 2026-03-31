# Pre-commit Validation Strategy

This document explains the **dual-layer validation strategy** for command files in claude-playbook.

## Overview

We use **two complementary pre-commit hooks** to validate command security:

1. **Basic Checker** (`check-new-command-template.sh`) - Validates all commands
2. **Strict Compliance** (`check-secure-template-compliance.sh`) - Validates only new commands

## Hook 1: Basic Security Checker

**Script:** `scripts/hooks/check-new-command-template.sh`

**Triggers on:**
- NEW commands (`--diff-filter=A`)
- MODIFIED commands (`--diff-filter=M`)

**What it checks:**

| Check | NEW Commands | MODIFIED Commands |
|-------|-------------|-------------------|
| Markdown heading | Required | Required |
| Execution steps | Required | Required |
| Security patterns | Warns if missing | Not checked |
| Dangerous patterns | Blocks | Blocks |

**Validation level:**
- **NEW commands:** Warns about missing security patterns (non-blocking)
- **MODIFIED commands:** Only checks structure and dangerous patterns
- **Both:** Block dangerous patterns (eval, exec without `# SAFETY:`)

**Example output:**

```
# NEW command without security patterns:
  Warning: New command lacks security patterns
  Consider using: docs/templates/secure-command-template.md

# MODIFIED command with proper structure:
  All checks passed (less strict for existing commands)

# ANY command with dangerous pattern:
  Potential command injection (eval/exec with variable)
  Add '# SAFETY:' comment if this is intentional
```

## Hook 2: Strict Compliance Checker

**Script:** `scripts/hooks/check-secure-template-compliance.sh`

**Triggers on:**
- NEW commands ONLY (`--diff-filter=A`)
- MODIFIED commands are skipped

**What it checks:**

8-point scoring system across 4 categories:

1. **Security Sections** (3 points) - Input validation, error handling, security notes
2. **Execution Steps** (2 points) - At least 2 numbered steps with clear structure
3. **Security Patterns** (2 points) - Validation code, error handling code
4. **No Dangerous Patterns** (1 point - critical) - No eval/exec/bash/sh with variables

**Compliance levels:**
- 80-100% (7-8 points): PASS
- 60-79% (5-6 points): WARNING (allowed)
- <60% (0-4 points): FAIL (blocked)

**Example output:**

```
Checking: configs/global/.claude/commands/new-command.md
  Security sections: 2/3
  Execution steps (2 steps) (2/2)
  Security patterns: 2/2
  No dangerous patterns (1/1)

  Compliance Score: 7/8 (87%)
  PASS: Meets security template requirements
```

## Combined Strategy: Defense in Depth

### When you ADD a new command:

```bash
git add configs/global/.claude/commands/my-new-command.md
git commit
```

**Both hooks run:**

1. **Basic Checker:**
   - Validates structure (headings, steps)
   - Warns if missing security patterns
   - Blocks dangerous patterns

2. **Strict Compliance:**
   - Calculates 8-point score
   - Requires >=60% compliance
   - Provides detailed feedback

**Result:** New commands must meet high security standards.

### When you MODIFY an existing command:

```bash
git add configs/global/.claude/commands/existing-command.md
git commit
```

**Only basic hook runs:**

1. **Basic Checker:**
   - Validates structure
   - Blocks dangerous patterns
   - No security pattern warnings

2. **Strict Compliance:**
   - Skipped (not a new file)

**Result:** Existing commands are "grandfathered in" but still protected from dangerous patterns.

### When you RENAME a command:

```bash
git mv configs/global/.claude/commands/old.md new.md
git commit
```

**Git treats this as DELETE + ADD:**

**Both hooks run on `new.md`:**
- Same as adding a new command
- Must meet compliance requirements

**Result:** Renamed commands are re-validated.

## Why This Strategy?

### Strict for New Code
- All new commands must follow secure template
- Enforces security-by-default
- Prevents accumulation of insecure code

### Lenient for Existing Code
- Doesn't break existing workflows
- Allows gradual improvement
- Focuses on preventing new issues

### Always Protect Against Critical Issues
- Dangerous patterns blocked for ALL commands
- No exceptions without `# SAFETY:` comment
- Defense in depth

## Bypass Options

### For Development/Testing

```bash
# Skip all pre-commit hooks (NOT RECOMMENDED)
git commit --no-verify

# Skip specific hook
SKIP=check-secure-template-compliance git commit
```

WARNING: Only bypass for testing. Never bypass for production commits.

### For Justified Exceptions

If you must use dangerous patterns (eval, exec):

```bash
# Add justification comment
# SAFETY: INPUT is validated against whitelist before use
eval "$VALIDATED_INPUT"
```

The hook will allow this with the comment.

## Testing Before Commit

```bash
# Test specific file
pre-commit run --files configs/global/.claude/commands/my-command.md

# Test all staged files
pre-commit run

# Test all files in repo
pre-commit run --all-files
```

## Summary Table

| Scenario | Basic Checker | Strict Compliance | Result |
|----------|--------------|-------------------|--------|
| ADD new command | Runs | Runs | Strict validation |
| MODIFY existing | Runs (lenient) | Skips | Lenient validation |
| DELETE command | Skips | Skips | No validation |
| RENAME command | Runs | Runs | Strict validation |

## References

- **Basic Checker:** `scripts/hooks/check-new-command-template.sh`
- **Strict Checker:** `scripts/hooks/check-secure-template-compliance.sh`
- **Injection Scanner:** `scripts/hooks/check-command-injection.sh`
- **Compliance Guide:** `docs/security/template-compliance-validation.md`
- **Secure Template:** `docs/templates/secure-command-template.md`
- **Security Checklist:** `docs/security/SECURITY-CHECKLIST.md`

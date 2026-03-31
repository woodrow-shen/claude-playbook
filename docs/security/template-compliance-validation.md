# Secure Template Compliance Validation

This document explains how the pre-commit hook validates that new commands comply with the secure command template.

## Overview

When you create or modify a command file (`.claude/commands/*.md`), the pre-commit hook automatically validates it against security best practices defined in `docs/templates/secure-command-template.md`.

## Validation Criteria

The compliance checker (`scripts/hooks/check-secure-template-compliance.sh`) evaluates commands on an **8-point scale** across 4 categories:

### Category 1: Security Sections (3 points)

**Required/Recommended sections:**
1. Input Validation section
2. Error Handling section
3. Security notes/comments

**Example:**
```markdown
## Input Validation

Validate all user inputs before use.

## Error Handling

Use `set -e` and proper exit codes.

## Security Notes

# SAFETY: This command validates all inputs before execution
```

**Scoring:**
- Each section present: **+1 point**
- Maximum: **3 points**

### Category 2: Execution Steps (2 points)

**Required:**
- At least 2 numbered execution steps
- Clear step structure (`## Step 1`, `## Step 2`, etc.)

**Example:**
```markdown
## Step 1: Validate Input

Check that required variables are set.

## Step 2: Execute Command

Run the validated command.
```

**Scoring:**
- 2+ steps: **2 points**
- 1 step: **1 point** (warning)
- 0 steps: **0 points** (fail)

### Category 3: Security Patterns in Code (2 points)

**Required patterns:**
1. **Input validation:** `validate`, `validation`, `check`, `sanitize`, `[[ -n ]]`, `[[ -z ]]`
2. **Error handling:** `set -e`, `exit N`, `if...then...exit`, `|| exit`

**Example:**
```bash
# Input validation pattern
if [ -z "$REQUIRED_VAR" ]; then
    echo "Error: REQUIRED_VAR is required"
    exit 1
fi

# Error handling pattern
set -e
command || exit 1
```

**Scoring:**
- Input validation present: **+1 point**
- Error handling present: **+1 point**
- Maximum: **2 points**

### Category 4: No Dangerous Patterns (1 point - CRITICAL)

**Blocked patterns:**
- `eval $VARIABLE` (command injection risk)
- `exec $VARIABLE` (command injection risk)
- `bash $VARIABLE` (command injection risk)
- `sh $VARIABLE` (command injection risk)

**Exception:**
If you must use these patterns, add a `# SAFETY:` comment explaining why it's safe.

**Example (BLOCKED):**
```bash
# This will be rejected
eval "$USER_INPUT"
```

**Example (ALLOWED with justification):**
```bash
# SAFETY: INPUT is validated against whitelist before use
eval "$VALIDATED_INPUT"
```

**Scoring:**
- No dangerous patterns OR justified with `# SAFETY:`: **1 point**
- Dangerous patterns without justification: **FAIL (critical)**

## Compliance Levels

Based on the total score out of 8:

### ✓ PASS (80-100% = 7-8 points)
- Command meets security template requirements
- Can be committed without changes
- May have minor warnings

### ⚠ WARNING (60-79% = 5-6 points)
- Command has weak compliance
- Strongly recommend using the template
- Can be committed but should be improved

### ✗ FAIL (<60% = 0-4 points)
- Insufficient security compliance
- **Cannot be committed** until fixed
- Required improvements will be listed

## How to Ensure Compliance

### Option 1: Copy the Template

```bash
cp docs/templates/secure-command-template.md \
   configs/global/.claude/commands/<name>.md
```

Then customize the template for your needs.

### Option 2: Fix Existing Command

If the pre-commit hook rejects your command, it will show:
- Current compliance score
- Missing elements
- Required improvements

Follow the suggestions to fix your command.

## Examples

### Example: Perfect Compliance (8/8 points)

See: `docs/templates/secure-command-template.md`

### Example: Good Compliance (7/8 points)

```markdown
# Deploy Service

## Input Validation

Validates service name and environment before deployment.

## Step 1: Validate Inputs

Check required parameters.

## Step 2: Deploy

Execute deployment with error handling.

## Security Notes

All inputs are validated against a whitelist.

## Execution

```bash
set -e

# SAFETY: SERVICE_NAME validated against whitelist
if [[ ! "$SERVICE_NAME" =~ ^[a-z0-9-]+$ ]]; then
    echo "Error: Invalid service name"
    exit 1
fi

deploy "$SERVICE_NAME"
```
```

**Score:** 8/8 (100%)

### Example: Weak Compliance (5/8 points)

```markdown
# Quick Script

## Step 1: Run command

```bash
set -e
some-command
```
```

**Score:** 5/8 (62% - WARNING)
- Missing: Input validation section, error handling section, security patterns

## Testing Your Command

Before committing, you can manually test compliance:

```bash
# Stage your new command
git add configs/global/.claude/commands/<name>.md

# Run pre-commit hooks
pre-commit run --files configs/global/.claude/commands/<name>.md
```

This will show the compliance check results without actually committing.

## References

- **Secure Template:** `docs/templates/secure-command-template.md`
- **Security Checklist:** `docs/security/SECURITY-CHECKLIST.md`
- **Development Guide:** `docs/security/secure-command-development.md`
- **Compliance Checker:** `scripts/hooks/check-secure-template-compliance.sh`

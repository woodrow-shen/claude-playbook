---
name: input-validation
description: Reusable input validation functions for security hardening
---

# Input Validation Skill

Reusable validation functions to prevent command injection, path traversal, and other security vulnerabilities.

## Usage

Reference these validation patterns in your command or agent files.

## Validation Functions

### 1. Branch Name Validation

Validates Git branch names to prevent command injection.

**Pattern:** `^[a-zA-Z0-9._/-]+$`

**Usage:**
```bash
BRANCH_NAME="dev/feature-123"

if [[ ! "$BRANCH_NAME" =~ ^[a-zA-Z0-9._/-]+$ ]]; then
    echo "Error: Invalid branch name: $BRANCH_NAME"
    echo "Branch name can only contain: a-z, A-Z, 0-9, ., _, -, /"
    exit 1
fi
```

**Allowed:** `main`, `dev/my-feature`, `feature/my-feature`, `bugfix/issue-123`

**Blocked:** `"; rm -rf / #"`, `../../../etc/passwd`, `branch name`

### 2. Version Number Validation

Validates semantic version numbers (X.Y.Z format).

**Pattern:** `^[0-9]+\.[0-9]+\.[0-9]+$`

**Usage:**
```bash
VERSION="4.1.0"

if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Error: Invalid version format: $VERSION"
    echo "Expected format: X.Y.Z (e.g., 4.1.0)"
    exit 1
fi
```

**Allowed:** `4.1.0`, `1.0.0`, `10.20.30`

**Blocked:** `4.1`, `v4.1.0`, `4.1.0-beta`

### 3. URL Validation

Validates HTTP/HTTPS URLs to prevent SSRF and command injection.

**Pattern:** `^https?://[a-zA-Z0-9.-]+/`

**Usage:**
```bash
URL="https://example.com/api/v1"

if [[ ! "$URL" =~ ^https?://[a-zA-Z0-9.-]+/ ]]; then
    echo "Error: Invalid URL format: $URL"
    echo "Expected format: https://hostname/path"
    exit 1
fi
```

**Allowed:** `https://example.com/api`, `http://localhost:8080/api`

**Blocked:** `file:///etc/passwd`, `javascript:alert(1)`, `https://evil.com@internal.com/`

### 4. Path Validation

Validates file paths to prevent path traversal attacks.

**Usage:**
```bash
USER_PATH="data/file.txt"

# Check for path traversal
if [[ "$USER_PATH" =~ \.\. ]]; then
    echo "Error: Path traversal detected in: $USER_PATH"
    exit 1
fi

# Check for absolute paths (if relative paths required)
if [[ "$USER_PATH" =~ ^/ ]]; then
    echo "Error: Absolute paths not allowed: $USER_PATH"
    exit 1
fi
```

**Allowed:** `data/file.txt`, `configs/global/test.md`

**Blocked:** `../../../etc/passwd`, `/etc/passwd`

### 5. USER Variable Validation

Validates USER environment variable before destructive operations.

**Usage:**
```bash
# Before rm -rf /scratch/${USER}/
if [ -z "${USER}" ] || [ "${USER}" = "root" ]; then
    echo "Error: USER not set or is root"
    exit 1
fi

rm -rf "/scratch/${USER}/"
```

**Checks:** USER is not empty, USER is not "root", path is properly quoted.

### 6. Whitelist Validation

Validates values against known good values.

**Usage:**
```bash
TARGET="production"

case "$TARGET" in
    staging|production)
        # OK
        ;;
    *)
        echo "Error: Invalid target: $TARGET"
        echo "Allowed: staging, production"
        exit 1
        ;;
esac
```

## Best Practices

1. **Always validate before use** — Validate all user input before using in commands
2. **Use proper quoting** — Always quote variables: `"$VAR"` not `$VAR`
3. **Whitelist over blacklist** — Use whitelists (allowed values) when possible
4. **Fail securely** — Exit on validation failure, don't continue
5. **Clear error messages** — Tell users what format is expected

## Common Patterns

### Validate and Use

```bash
# 1. Collect input
BRANCH_NAME="$1"

# 2. Validate
if [[ ! "$BRANCH_NAME" =~ ^[a-zA-Z0-9._/-]+$ ]]; then
    echo "Error: Invalid branch name"
    exit 1
fi

# 3. Use safely
gh repo clone org/repo -- -b "$BRANCH_NAME"
```

### Multiple Validations

```bash
# Validate all inputs before any operations
if [[ ! "$BRANCH" =~ ^[a-zA-Z0-9._/-]+$ ]]; then
    echo "Error: Invalid branch"
    exit 1
fi

if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Error: Invalid version"
    exit 1
fi

# Now safe to proceed
```

## See Also

- `docs/security/SECURITY-CHECKLIST.md` — Quick reference checklist
- `docs/security/secure-command-development.md` — Complete security guide

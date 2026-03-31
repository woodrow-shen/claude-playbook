# Secure Command Template

This template demonstrates security best practices for AI command files.

## Usage

Copy this template when creating new commands. Replace placeholders with your actual logic.

## Template

```markdown
Run [description of what this command does].

Parse $ARGUMENTS: first word is <param1>, optional second word is <param2>.

## Step 1: Validate Parameters

Parse and validate all input parameters:

```bash
PARAM1=$(echo "$ARGUMENTS" | awk '{print $1}')
PARAM2=$(echo "$ARGUMENTS" | awk '{print $2}')

# Validate required parameter
if [ -z "$PARAM1" ]; then
    echo "Error: Parameter 1 is required"
    echo "Usage: /command-name <param1> [param2]"
    echo "Example: /command-name value1 value2"
    exit 1
fi

# Security: Validate parameter format
# Choose appropriate validation pattern:

# For branch names:
if [[ ! "$PARAM1" =~ ^[a-zA-Z0-9._/-]+$ ]]; then
    echo "Error: Invalid parameter format: $PARAM1"
    echo "Allowed characters: a-z, A-Z, 0-9, ., _, -, /"
    exit 1
fi

# For version numbers:
# if [[ ! "$PARAM1" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
#     echo "Error: Invalid version format: $PARAM1"
#     echo "Expected format: X.Y.Z (e.g., 4.1.0)"
#     exit 1
# fi

# For URLs:
# if [[ ! "$PARAM1" =~ ^https?://[a-zA-Z0-9.-]+/ ]]; then
#     echo "Error: Invalid URL format: $PARAM1"
#     exit 1
# fi

# For known values (whitelist):
# case "$PARAM1" in
#     allowed-value1|allowed-value2)
#         # OK
#         ;;
#     *)
#         echo "Error: Invalid value: $PARAM1"
#         echo "Allowed: allowed-value1, allowed-value2"
#         exit 1
#         ;;
# esac

# Set default for optional parameter
if [ -z "$PARAM2" ]; then
    PARAM2="default-value"
fi

echo "Parameters validated:"
echo "  PARAM1: $PARAM1"
echo "  PARAM2: $PARAM2"
```

## Step 2: Execute Main Logic

Execute the command with validated parameters:

```bash
# Use validated parameters safely

# Prefer gh over git for GitHub operations
gh repo clone org/repo -- -b "$PARAM1"

# Always quote variables
echo "Processing: $PARAM1"

# Validate environment variables before use
if [ -z "${USER}" ] || [ "${USER}" = "root" ]; then
    echo "Error: USER not set or is root"
    exit 1
fi

# Use validated paths
WORK_DIR="/scratch/${USER}/work"
mkdir -p "$WORK_DIR"
cd "$WORK_DIR"

# If you must use command substitution, add safety comment
<!-- safe: Internal UUID generation, no user input --> JOB_ID="job-$(uuidgen | cut -d'-' -f1)"

echo "Job ID: $JOB_ID"
```

## Step 3: Handle Errors

Provide clear error messages:

```bash
if [ $? -ne 0 ]; then
    echo "Error: Operation failed"
    echo ""
    echo "Troubleshooting:"
    echo "  1. Check parameter format"
    echo "  2. Verify permissions"
    echo "  3. Check logs at: $WORK_DIR/error.log"
    exit 1
fi

echo "Success!"
```

## Step 4: Cleanup

Clean up temporary resources:

```bash
# Validate before cleanup
if [ -n "${WORK_DIR}" ] && [ -d "${WORK_DIR}" ]; then
    rm -rf "${WORK_DIR}"
    echo "Cleaned up: $WORK_DIR"
fi
```
```

## Security Checklist

Before committing your command, verify:

- [ ] All user input is validated
- [ ] All variables are quoted: `"$VAR"`
- [ ] No unvalidated command substitution: `$(user_input)`
- [ ] No `eval`, `exec`, `source` with user input
- [ ] Environment variables validated before use
- [ ] Use `gh` instead of `git` for GitHub operations
- [ ] Safety comments for necessary dangerous patterns
- [ ] Clear error messages
- [ ] Scanner passes: `./scripts/hooks/check-command-injection.sh your-file.md`

## Validation Patterns Reference

### Branch Name
```bash
if [[ ! "$BRANCH" =~ ^[a-zA-Z0-9._/-]+$ ]]; then
    echo "Error: Invalid branch name"
    exit 1
fi
```

### Version Number
```bash
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Error: Invalid version format"
    exit 1
fi
```

### URL
```bash
if [[ ! "$URL" =~ ^https?://[a-zA-Z0-9.-]+/ ]]; then
    echo "Error: Invalid URL"
    exit 1
fi
```

### USER Variable
```bash
if [ -z "${USER}" ] || [ "${USER}" = "root" ]; then
    echo "Error: USER not set or is root"
    exit 1
fi
```

### Whitelist
```bash
case "$VALUE" in
    allowed1|allowed2|allowed3)
        # OK
        ;;
    *)
        echo "Error: Invalid value"
        exit 1
        ;;
esac
```

## See Also

- [Secure Command Development](../security/secure-command-development.md) - Complete security guide
- [Command Injection Scanner](../security/command-injection-scanner.md) - Scanner usage
- [Security Checklist](../security/SECURITY-CHECKLIST.md) - Quick reference

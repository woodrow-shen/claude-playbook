---
name: cp:release
description: "Manage claude-playbook releases (validate, prepare, publish)"
argument-hint: "[subcommand] [version]"
---

Manage claude-playbook releases.

Parse $ARGUMENTS: first word is subcommand (validate|prepare|publish), optional second word is version.

## Step 1: Parse Subcommand

```bash
SUBCOMMAND=$(echo "$ARGUMENTS" | awk '{print $1}')
VERSION=$(echo "$ARGUMENTS" | awk '{print $2}')

if [ -z "$SUBCOMMAND" ]; then
    echo "Error: Subcommand required"
    echo "Usage: /cp:release <subcommand> [version]"
    echo ""
    echo "Subcommands:"
    echo "  validate           - Validate repository for release"
    echo "  prepare <version>  - Prepare release (update CHANGELOG, docs)"
    echo "  publish <version>  - Publish release (create tag, push)"
    echo ""
    echo "Examples:"
    echo "  /cp:release validate"
    echo "  /cp:release prepare 0.1.0"
    echo "  /cp:release publish 0.1.0"
    exit 1
fi

if [[ ! "$SUBCOMMAND" =~ ^(validate|prepare|publish)$ ]]; then
    echo "Error: Invalid subcommand: $SUBCOMMAND"
    echo "Valid subcommands: validate, prepare, publish"
    exit 1
fi
```

## Step 2: Validate Version Parameter

```bash
if [[ "$SUBCOMMAND" == "prepare" || "$SUBCOMMAND" == "publish" ]]; then
    if [ -z "$VERSION" ]; then
        echo "Error: Version required for $SUBCOMMAND"
        echo "Usage: /cp:release $SUBCOMMAND <version>"
        exit 1
    fi
fi
```

## Step 3: Delegate to Release Agent

Pass to the release agent:

```
Execute the $SUBCOMMAND operation for release.

Parameters:
- subcommand: $SUBCOMMAND
- version: $VERSION (if applicable)

Execute all steps as defined in the release agent's "Operation: $SUBCOMMAND" section.
```

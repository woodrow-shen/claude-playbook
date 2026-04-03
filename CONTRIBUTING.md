# Contributing to Claude Playbook

## Development Workflow

1. Create a feature branch
2. Write tests first (TDD enforced by pre-commit hooks)
3. Implement changes
4. Create corresponding guide files for any new commands/agents
5. Update documentation (CLAUDE.md files, README.md, overview.md)
6. Run `pre-commit run --all-files`
7. Commit with `claude/<scope>:` prefix and sign-off (`git commit -s`)
8. Push and verify CI passes

## Adding a New Command

```bash
# 1. Scaffold command and test
bash scripts/helpers/new-command.sh <config> <command-name>

# 2. Write test first (RED)
# Edit tests/func/test-<command-name>-deep.sh
bash tests/func/test-<command-name>-deep.sh  # must FAIL

# 3. Implement command (GREEN)
# Edit configs/<config>/.claude/commands/<command-name>.md

# 4. Create guide file
# Create configs/<config>/docs/<command-name>-guide.md

# 5. Update config CLAUDE.md
# Add command to configs/<config>/CLAUDE.md list

# 6. Verify coverage
bash tests/scripts/validate-100-percent-coverage.sh
```

## Adding a New Agent

1. Create `configs/<config>/.claude/agents/<agent-name>.md` with YAML front matter
2. Create test `tests/func/test-agents-<agent-name>.sh`
3. Add agent to config CLAUDE.md
4. Verify documentation coverage: `bash scripts/release/validate.sh`

## Adding a New Config

1. Use `claude-setup` option 8 (Create New Config), or manually:
   ```bash
   mkdir -p configs/<name>/.claude/{commands,agents,rules}
   mkdir -p configs/<name>/docs
   ```
2. Create `configs/<name>/CLAUDE.md` with command/agent lists
3. Add tests for all commands and agents
4. Update root README.md and docs/guides/overview.md
5. Verify: `bash scripts/release/validate.sh`

## Commit Message Format

```
<scope>: <short description>

<body explaining what and why>

Signed-off-by: Name <email>
```

Scopes:
- `claude/configs/<config>:` - Config changes
- `claude/docs:` - Documentation changes
- `claude/scripts:` - Script changes
- `claude/tests:` - Test changes
- `claude:` - Root-level files

Rules: lowercase, imperative mood, no period, 50-72 chars.

See `configs/global/.claude/rules/claude-playbook-contribution.md` for full details.

## Pre-commit Hooks

Hooks run automatically on every commit. Install with:

```bash
# Install commit hooks
pre-commit install

# Install push hooks (100% coverage enforcement)
pre-commit install --hook-type pre-push

# Or use claude-setup option 10
```

Never skip hooks with `--no-verify`.

## Documentation Requirements

Every change must maintain:
- 100% test coverage (every command/agent/skill/rule has a test)
- 100% guide coverage (every command has a guide file)
- Synced counts in CLAUDE.md files, README.md, and overview.md

## Testing

All tests must be mock-based functional tests. See `docs/testing/testing-guide.md`.

```bash
# Run all tests
for test in tests/func/test-*.sh; do bash "$test"; done

# Validate coverage
bash tests/scripts/validate-100-percent-coverage.sh
```

## Release Process

Only maintainers:
1. `/cp:release validate` - Run all checks
2. `/cp:release prepare <version>` - Update CHANGELOG, docs
3. `/cp:release publish <version>` - Tag, push, GitHub release

Version format: `<major>.<minor>.<patch>[-<stage>.<n>]` (stages: alpha, beta, rc)

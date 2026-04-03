# Testing Guide

## Running Tests

```bash
# Run all functional tests
for test in tests/func/test-*.sh; do bash "$test"; done

# Run a specific test
bash tests/func/test-setup-global.sh

# Validate 100% test coverage
bash tests/scripts/validate-100-percent-coverage.sh

# Strict mode (fails if not 100%)
bash tests/scripts/validate-100-percent-coverage.sh --strict
```

## Test Types

### Functional Tests (`tests/func/`)

All tests are mock-based functional tests using isolated environments:
- Temporary directories (`mktemp -d`)
- Mock git repositories (`create_mock_target_repo`, `create_mock_playbook`)
- HOME override to avoid touching real `~/.claude/`
- Shared helpers in `tests/func/helpers/test-helpers.sh`

Categories:
- `test-setup-*.sh` - Setup script tests (global, merge, local-clone, submodule)
- `test-uninstall.sh` - Uninstall script tests
- `test-recover-config.sh` - Configuration recovery tests
- `test-install-hooks.sh` - Hook installation tests
- `test-lifecycle.sh` - Full install/uninstall/reinstall/break/recover cycles
- `test-*-deep.sh` - Command and agent structure validation
- `test-agents-*.sh` - Agent definition validation
- `test-skills-*.sh` - Skill definition validation

### Coverage Validation (`tests/scripts/`)

- `validate-100-percent-coverage.sh` - Verifies every command, agent, skill, and rule has a corresponding test file

## Writing New Tests

Use `scripts/helpers/new-command.sh` to scaffold both command and test:

```bash
bash scripts/helpers/new-command.sh global my-feature
# Creates:
#   configs/global/.claude/commands/my-feature.md
#   tests/func/test-my-feature-deep.sh
```

For setup script tests, use the shared helpers:

```bash
source "$SCRIPT_DIR/helpers/test-helpers.sh"
setup_test_env
# ... assertions ...
report_results
```

## See Also

- [TDD Enforcement Summary](tdd-enforcement-summary.md)
- [Pre-commit Validation Strategy](../security/pre-commit-validation-strategy.md)

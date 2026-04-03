# Claude Playbook

Centralized AI assistant configuration hub that distributes shared Claude Code commands, agents, skills, and rules via symlinks.

## References

- Architecture and features: `docs/technical/architecture.md`
- Complete overview: `docs/guides/overview.md`
- Quick start: `README.md`
- Contributing: `CONTRIBUTING.md`
- Documentation standards: `docs/documentation-guidelines.md`
- Testing guide: `docs/testing/testing-guide.md`

## Rules

### Security

Each commit MUST pass security checks as the top priority. Pre-commit hooks run command injection scanning, template compliance, and secure pattern validation on every commit.

### Documentation

- `configs/global/.claude/rules/documentation-principle.md` MUST be obeyed. All execution files use plain text only, no emoji, no box-drawing. Precise instructions, input validation, self-contained content.
- `configs/global/.claude/rules/file-creation.md` MUST be followed. Read `docs/documentation-guidelines.md` before creating any .md file. Anti-sprawl: prefer adding to existing files.
- `configs/global/.claude/rules/config-documentation.md` MUST be followed. Every command needs a guide file at `configs/<config>/docs/<cmd>-guide.md`. Namespace commands need one shared guide. Every agent must be documented.
- All docs (*.md) MUST be synced for each change. When implementation changes, update corresponding guides, CLAUDE.md files, README.md, and overview.md to match.
- All documents for configs and playbook maintenance MUST reach 100% coverage.

### Contribution

- `configs/global/.claude/rules/claude-playbook-contribution.md` MUST be followed. Commit scope: `claude/configs/<config>:`, `claude/docs:`, `claude/scripts:`, `claude:`. Signed-off-by required.
- Each commit MUST run pre-commit hooks. Never skip with `--no-verify`.
- Adding a new command/agent/config MUST follow the workflow in `CONTRIBUTING.md`: scaffold, test first, implement, create guide, update docs, verify coverage.
- When commands, agents, or rules change, `configs/<config>/CLAUDE.md` counts and lists MUST be updated to match actual files.

### Testing

- `configs/global/.claude/rules/tdd-enforcement.md` MUST be obeyed. Red-Green-Refactor cycle for all code changes. Write failing test first.
- All test scripts MUST pass to maintain 100% coverage.
- All test scripts SHOULD be mock-based functional tests rather than structural tests. Use isolated temp directories, mock git repos, and HOME override for realistic testing.

### Setup

- Changes to `setup.sh` menu options MUST update `show_help()` and the menu prompt to stay in sync.
- Hook installation (`scripts/hooks/install-hooks.sh`) MUST be kept in sync with `.pre-commit-config.yaml`. Both manual hooks and pre-commit framework must work.

### CI/CD

- GitHub Actions CI (`.github/workflows/ci.yml`) runs on every push and PR to main: pre-commit hooks, all functional tests, 100% coverage validation, and release validation.
- CI MUST pass without errors on each push. If CI fails, the agent should fix the issue automatically before proceeding.

### Release

Version format: `<major>.<minor>.<patch>[-<stage>.<n>]` (stages: `alpha`, `beta`, `rc`).

- Maintainer MUST run `/cp:release validate` before doing a release.
- Maintainer MUST run `/cp:release prepare <version>` before publishing.
- Maintainer MUST run `/cp:release publish <version>` to release. The release agent handles GitHub release tag and notes.

# /cp:* Namespace Command Guide

Commands for managing the claude-playbook repository itself. All commands in this namespace operate on the playbook submodule, local clone, or the playbook repo directly.

## Commands

### /cp:pull

Pull latest changes from claude-playbook.

```
/cp:pull
```

Detects playbook location (submodule, local clone, or direct), runs `git pull`, handles conflicts by auto-stashing, and refreshes MERGE mode symlinks if applicable.

### /cp:push

Push local changes to claude-playbook.

```
/cp:push
```

Detects changes, determines commit scope (`configs/global`, `scripts`, `docs`, etc.), generates a scoped commit message, commits with sign-off, and pushes.

### /cp:pr

Create a pull request for claude-playbook changes.

```
/cp:pr [branch-name]
```

Finds the playbook, validates the branch, checks for uncommitted changes, pushes, generates PR title from commits, extracts issue numbers, assigns reviewers from CODEOWNERS, and creates the PR.

### /cp:review-pr

Review a claude-playbook GitHub pull request.

```
/cp:review-pr <pr-number>
```

Analyzes PR details, diff, CI checks, and commit history. Reviews for correctness, error handling, security, performance, testing, and git workflow compliance (signed commits, commit message format).

### /cp:issue

Report a bug or request a feature on claude-playbook.

```
/cp:issue
```

Collects issue details, determines type (bug/feature/docs/question), generates structured content with environment info (config, branch, commit), and creates the issue via `gh`.

### /cp:fix-issue

Automatically fix a claude-playbook issue and merge to main.

```
/cp:fix-issue <issue-number>
```

Fetches issue from GitHub, asks for fix approach, locates the playbook, implements the fix, shows changes for confirmation, commits, pushes directly to main, and closes the issue.

### /cp:release

Manage claude-playbook releases.

```
/cp:release validate
/cp:release prepare <version>
/cp:release publish <version>
```

Delegates to the release agent. `validate` runs all checks, `prepare` updates CHANGELOG.md, `publish` creates a git tag and pushes.

### /cp:refresh-global

Refresh global Claude configurations in ~/.claude.

```
/cp:refresh-global
```

Detects claude-playbook location (via symlinks, known directories, or search), then runs `setup-global-claude.sh` to refresh all symlinks in `~/.claude/`.

## Playbook Detection

All `/cp:*` commands automatically detect the playbook location:
1. Follow `.claude` symlink to find playbook path
2. Check `.claude-playbook/` (local clone mode)
3. Check `claude-playbook/` (submodule mode)
4. Search parent directories

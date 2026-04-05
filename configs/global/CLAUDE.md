# Global Config

Global commands, agents, skills, and rules shared across all projects.

## Commands (21)

### General (12)

- `/bug` — Bug triage, GitHub issue, fix, PR, and merge
- `/commit` — Conventional commits with auto-staging and sign-off
- `/issue` — Analyze, plan, implement, and PR a GitHub issue
- `/reviewpr` — Deep review a GitHub PR: code quality, tests, security
- `/test` — Run tests, fix failures, add coverage
- `/review` — Enter plan mode to review and discuss feature design
- `/clean-dev-cache` — Clean up dev caches, build artifacts, temp files
- `/help-commands` — List all available slash commands
- `/custom-init` — Generate or refresh CLAUDE.md with codebase analysis
- `/tmux` — Send instructions to Claude Code in another tmux session
- `/monitor-tmux` — Monitor a tmux session and report progress
- `/pre-commit` — Run pre-commit hooks on staged or all files

### `/cp:*` Namespace (9)

- `/cp:pull` — Pull latest changes from claude-playbook submodule
- `/cp:push` — Push local changes to claude-playbook submodule
- `/cp:pr` — Create a pull request for claude-playbook changes
- `/cp:review-pr` — Review a claude-playbook GitHub pull request
- `/cp:issue` — Report bug or request feature on claude-playbook GitHub
- `/cp:fix-issue` — Automatically fix a claude-playbook issue and merge
- `/cp:release` — Manage releases (validate, prepare, publish)
- `/cp:pre-commit` — Run claude-playbook pre-commit hooks from any repo
- `/cp:refresh-global` — Refresh global Claude configurations in ~/.claude

## Agents (13)

### General Purpose (10)

- general-fullstack-developer, general-frontend-developer, general-backend-developer
- general-solution-architect, general-technical-project-lead, general-pm
- general-qa, general-code-quality-debugger, general-technical-writer, general-devops

### Specialized (3)

- monitor — Long-running process monitoring
- release — Release operations (validate, prepare, publish)
- tmux — Cross-session debugging via tmux

## Skills (2)

- input-validation — Reusable input validation patterns for security
- tmux-session-management — Multi-session navigation and debugging

## Rules (9)

- claude-playbook-contribution — Commit message and contribution guidelines
- bug-report — Bug reporting and debugging guidelines
- documentation-principle — Documentation standards for all file types
- file-creation — Rules for creating new files
- review-pr — PR review guidelines and checklist
- token-efficiency — Maximize value per token spent
- no-interactive-editors — Never use vim/nano/interactive tools
- tdd-enforcement — Red-Green-Refactor cycle for all code changes
- config-documentation — Each config's commands/agents must have documentation

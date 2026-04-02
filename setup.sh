#!/bin/bash
# Claude Playbook Setup Script
# Usage: source setup.sh
#
# This script can be sourced from anywhere. It will:
# 1. Define 'claude-setup' function in your shell
# 2. Optionally run the setup menu immediately

# Detect if being sourced or executed
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    echo "ERROR: This script must be sourced, not executed"
    echo "Usage: source setup.sh"
    exit 1
fi

# Get the directory where this script is located
CLAUDE_PLAYBOOK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper function to print colored messages
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Display banner (only when running claude-setup, not when sourcing)
show_banner() {
    cat << 'EOF'
============================================================
   _____ _                 _
  / ____| |               | |
 | |    | | __ _ _   _  __| | ___
 | |    | |/ _` | | | |/ _` |/ _ \
 | |____| | (_| | |_| | (_| |  __/
  \_____|_|\__,_|\__,_|\__,_|\___|
        Playbook Setup
============================================================
EOF
    echo ""
    print_info "Claude Playbook: $CLAUDE_PLAYBOOK_ROOT"
    echo ""
}

# Main menu
show_menu() {
    echo "What would you like to do?"
    echo ""
    echo "1. Setup Global Claude (install to ~/.claude)"
    echo "2. Setup Project with Submodule (REPLACE mode)"
    echo "3. Setup Project with Submodule (MERGE mode)"
    echo "4. Setup Project with Local Clone (no submodule)"
    echo "5. Update Global Claude"
    echo "6. Uninstall Global Claude"
    echo "7. Uninstall Project Claude"
    echo "8. Create New Config"
    echo "9. Show Help"
    echo "0. Exit"
    echo ""
}

# Function to run setup scripts
run_setup_global() {
    print_info "Running global claude setup..."
    bash "$CLAUDE_PLAYBOOK_ROOT/scripts/setup/setup-global-claude.sh"
    if [ $? -eq 0 ]; then
        print_success "Global claude setup completed!"
    else
        print_error "Global claude setup failed!"
    fi
}

# Helper: list available project configs (excludes global)
_list_project_configs() {
    local configs=()
    for d in "$CLAUDE_PLAYBOOK_ROOT/configs"/*/; do
        [[ -d "$d" ]] || continue
        local name
        name="$(basename "$d")"
        [[ "$name" == "global" ]] && continue
        configs+=("$name")
    done
    echo "${configs[@]}"
}

# Helper: create a new config scaffold under configs/<name>
# Usage: _create_config <config-name>
_create_config() {
    local name="$1"
    local config_dir="$CLAUDE_PLAYBOOK_ROOT/configs/$name"

    mkdir -p "$config_dir/.claude/commands"
    mkdir -p "$config_dir/.claude/agents"
    mkdir -p "$config_dir/.claude/rules"
    mkdir -p "$config_dir/docs"

    cat > "$config_dir/CLAUDE.md" << EOF
# ${name} Config

## Overview

Configuration for ${name} project.

## Commands

(Add your commands here)

## Getting Started

See [Claude Playbook Documentation](../../README.md) for more information.
EOF

    cat > "$config_dir/.claude/commands/hello.md" << 'CMDEOF'
Say hello and confirm the config is working.

When the user runs this command:
1. Print "Hello from the config!"
2. List available commands in this config
CMDEOF
}

# Helper: ask user for config name with validation
# If the config doesn't exist, offers to create it.
# Usage: _ask_config_name VARNAME [default-suggestion]
# Sets the variable named VARNAME to the chosen config.
_ask_config_name() {
    local _varname="$1"
    local _suggestion="${2:-}"
    local _available
    _available=($(_list_project_configs))

    if [[ ${#_available[@]} -gt 0 ]]; then
        echo "Available configs:"
        for _cfg in "${_available[@]}"; do
            echo "  - $_cfg"
        done
        echo ""
    fi

    # Determine default: use suggestion if valid, else first available, else empty
    local _default=""
    if [[ -n "$_suggestion" ]] && [[ "$_suggestion" =~ ^[a-z0-9-]+$ ]]; then
        _default="$_suggestion"
    elif [[ ${#_available[@]} -gt 0 ]]; then
        _default="${_available[0]}"
    fi

    local _prompt="Config name"
    [[ -n "$_default" ]] && _prompt="$_prompt (default: $_default)"
    read -p "$_prompt: " _input
    _input="${_input:-$_default}"

    if [[ -z "$_input" ]]; then
        print_error "Config name cannot be empty"
        return 1
    fi

    if [[ "$_input" == "global" ]]; then
        print_error "Use option 1 (Setup Global Claude) for global config"
        return 1
    fi

    # Validate name format
    if ! [[ "$_input" =~ ^[a-z0-9-]+$ ]]; then
        print_error "Invalid config name. Use lowercase letters, numbers, and hyphens only."
        return 1
    fi

    # If config doesn't exist, offer to create it
    if [[ ! -d "$CLAUDE_PLAYBOOK_ROOT/configs/$_input" ]]; then
        print_warning "Config '$_input' does not exist yet."
        read -p "Create it now? (Y/n): " _create
        _create="${_create:-Y}"
        if [[ "$_create" =~ ^[Yy]$ ]]; then
            _create_config "$_input"
            print_success "Created config '$_input'"
            echo ""
        else
            print_info "Setup cancelled."
            return 1
        fi
    fi

    eval "$_varname=\$_input"
}

run_setup_submodule() {
    print_info "Running submodule mode setup..."
    echo ""

    # Get current directory or ask for project path
    read -p "Project path (press Enter to use current directory): " PROJECT_PATH

    if [ -z "$PROJECT_PATH" ]; then
        PROJECT_PATH="$(pwd)"
    fi

    # Expand ~ to home directory
    PROJECT_PATH="${PROJECT_PATH/#\~/$HOME}"

    # Check if it's a git repository
    if [ ! -d "$PROJECT_PATH/.git" ]; then
        print_error "$PROJECT_PATH is not a git repository"
        return 1
    fi

    print_info "Project: $PROJECT_PATH"
    echo ""

    # Ask for config name with validation (suggest project basename)
    CONFIG_NAME=""
    if ! _ask_config_name "CONFIG_NAME" "$(basename "$PROJECT_PATH" | tr '[:upper:]' '[:lower:]')"; then
        return 1
    fi

    # Build command
    CMD="cd '$PROJECT_PATH' && bash '$CLAUDE_PLAYBOOK_ROOT/scripts/setup/setup-claude-submodule.sh' '$CONFIG_NAME' '$PROJECT_PATH'"

    print_info "Running: $CMD"
    echo ""

    eval "$CMD"
    if [ $? -eq 0 ]; then
        print_success "Submodule mode setup completed!"
    else
        print_error "Submodule mode setup failed!"
    fi
}

run_setup_merge() {
    print_info "Running merge mode setup..."
    echo ""

    # Get current directory or ask for project path
    read -p "Project path (press Enter to use current directory): " PROJECT_PATH

    if [ -z "$PROJECT_PATH" ]; then
        PROJECT_PATH="$(pwd)"
    fi

    # Expand ~ to home directory
    PROJECT_PATH="${PROJECT_PATH/#\~/$HOME}"

    # Check if it's a git repository
    if [ ! -d "$PROJECT_PATH/.git" ]; then
        print_error "$PROJECT_PATH is not a git repository"
        return 1
    fi

    print_info "Project: $PROJECT_PATH"
    echo ""

    # Ask for config name with validation (suggest project basename)
    CONFIG_NAME=""
    if ! _ask_config_name "CONFIG_NAME" "$(basename "$PROJECT_PATH" | tr '[:upper:]' '[:lower:]')"; then
        return 1
    fi

    # Build command
    CMD="bash '$CLAUDE_PLAYBOOK_ROOT/scripts/setup/setup-claude-merge.sh' '$CONFIG_NAME' '$PROJECT_PATH'"

    print_info "Running: $CMD"
    echo ""

    eval "$CMD"
    if [ $? -eq 0 ]; then
        print_success "Merge mode setup completed!"
    else
        print_error "Merge mode setup failed!"
    fi
}

run_setup_local_clone() {
    print_info "Running local clone mode setup..."
    echo ""

    # Get current directory or ask for project path
    read -p "Project path (press Enter to use current directory): " PROJECT_PATH

    if [ -z "$PROJECT_PATH" ]; then
        PROJECT_PATH="$(pwd)"
    fi

    # Expand ~ to home directory
    PROJECT_PATH="${PROJECT_PATH/#\~/$HOME}"

    # Check if it's a git repository
    if [ ! -d "$PROJECT_PATH/.git" ]; then
        print_error "$PROJECT_PATH is not a git repository"
        return 1
    fi

    print_info "Project: $PROJECT_PATH"
    echo ""

    # Ask for config name with validation (suggest project basename)
    CONFIG_NAME=""
    if ! _ask_config_name "CONFIG_NAME" "$(basename "$PROJECT_PATH" | tr '[:upper:]' '[:lower:]')"; then
        return 1
    fi

    # Build command
    CMD="bash '$CLAUDE_PLAYBOOK_ROOT/scripts/setup/setup-claude-local-clone.sh' '$CONFIG_NAME' '$PROJECT_PATH'"

    print_info "Running: $CMD"
    echo ""

    eval "$CMD"
    if [ $? -eq 0 ]; then
        print_success "Local clone mode setup completed!"
    else
        print_error "Local clone mode setup failed!"
    fi
}

run_update_global() {
    print_info "Updating global claude..."
    bash "$CLAUDE_PLAYBOOK_ROOT/scripts/setup/setup-global-claude.sh"
    if [ $? -eq 0 ]; then
        print_success "Global claude updated!"
    else
        print_error "Global claude update failed!"
    fi
}

run_uninstall_global() {
    print_warning "This will remove claude-playbook symlinks from ~/.claude"
    read -p "Are you sure? (yes/no): " CONFIRM

    if [ "$CONFIRM" = "yes" ]; then
        bash "$CLAUDE_PLAYBOOK_ROOT/scripts/setup/uninstall-global-claude.sh"
        if [ $? -eq 0 ]; then
            print_success "Global claude uninstalled!"
        else
            print_error "Global claude uninstall failed!"
        fi
    else
        print_info "Uninstall cancelled"
    fi
}

run_uninstall_project() {
    print_info "Running project claude uninstall..."
    echo ""

    # Get current directory or ask for project path
    read -p "Project path (press Enter to use current directory): " PROJECT_PATH

    if [ -z "$PROJECT_PATH" ]; then
        PROJECT_PATH="$(pwd)"
    fi

    # Expand ~ to home directory
    PROJECT_PATH="${PROJECT_PATH/#\~/$HOME}"

    # Check if .claude exists
    if [ ! -e "$PROJECT_PATH/.claude" ]; then
        print_warning "$PROJECT_PATH/.claude does not exist"
        read -p "Continue anyway? (yes/no): " CONTINUE
        if [ "$CONTINUE" != "yes" ]; then
            return 0
        fi
    fi

    print_info "Project: $PROJECT_PATH"
    echo ""

    bash "$CLAUDE_PLAYBOOK_ROOT/scripts/setup/uninstall-claude.sh" "$PROJECT_PATH"
    if [ $? -eq 0 ]; then
        print_success "Project claude uninstalled!"
    else
        print_error "Project claude uninstall failed!"
    fi
}

create_new_config() {
    print_info "Creating new config..."
    echo ""

    # Ask for config name
    read -p "Enter config name (lowercase, kebab-case): " CONFIG_NAME

    if [ -z "$CONFIG_NAME" ]; then
        print_error "Config name cannot be empty"
        return 1
    fi

    # Validate config name (lowercase, alphanumeric, hyphens only)
    if ! [[ "$CONFIG_NAME" =~ ^[a-z0-9-]+$ ]]; then
        print_error "Invalid config name. Use lowercase letters, numbers, and hyphens only."
        print_info "Example: arch-specs, my-project, kernel-dev"
        return 1
    fi

    # Check if config already exists
    if [ -d "$CLAUDE_PLAYBOOK_ROOT/configs/$CONFIG_NAME" ]; then
        print_error "Config '$CONFIG_NAME' already exists"
        return 1
    fi

    print_info "Creating config: $CONFIG_NAME"
    echo ""

    _create_config "$CONFIG_NAME"

    local CONFIG_DIR="$CLAUDE_PLAYBOOK_ROOT/configs/$CONFIG_NAME"
    print_success "Created config structure at: $CONFIG_DIR"
    echo ""
    print_info "Directory structure created:"
    tree -L 3 "$CONFIG_DIR" 2>/dev/null || find "$CONFIG_DIR" -type d | sed 's|[^/]*/| |g'
    echo ""

    print_success "Next steps:"
    echo "  1. Add your commands to:    $CONFIG_DIR/.claude/commands/"
    echo "  2. Add your agents to:      $CONFIG_DIR/.claude/agents/"
    echo "  3. Add your rules to:       $CONFIG_DIR/.claude/rules/"
    echo "  4. Edit CLAUDE.md:          $CONFIG_DIR/CLAUDE.md"
    echo "  5. Commit changes:          git add configs/$CONFIG_NAME && git commit"
    echo ""
}

show_help() {
    cat << 'EOF'

Claude Playbook Setup Help
============================================================

1. Setup Global Claude
   - Installs global configs to ~/.claude
   - Available in all repositories
   - Includes shared commands, agents, rules
   - Run this first for new users

2. Setup Project with Submodule (REPLACE mode)
   - Adds claude-playbook as git submodule
   - Entire .claude/ symlinked to upstream config
   - No local overrides — always matches upstream
   - Easy to update with git submodule update

3. Setup Project with Submodule (MERGE mode)
   - Adds claude-playbook as git submodule
   - Individual symlinks inside .claude/
   - Local files take priority over symlinked ones
   - Best for mature projects needing local commands

4. Setup Project with Local Clone (no submodule)
   - Clones claude-playbook to .claude-playbook/
   - Added to .gitignore (not tracked as submodule)
   - Symlinks .claude/ to upstream config (REPLACE mode)
   - Update with cd .claude-playbook && git pull
   - Lighter weight than submodule for simple setups

5. Update Global Claude
   - Refreshes ~/.claude with latest configs
   - Run after pulling claude-playbook updates

6. Uninstall Global Claude
   - Removes claude-playbook symlinks from ~/.claude
   - Does not affect project-specific configs

7. Uninstall Project Claude
   - Removes .claude symlinks from project
   - Does not delete native (non-symlinked) files

8. Create New Config
   - Creates a new config directory structure
   - Generates template files (CLAUDE.md, sample command)
   - Ready for customization

For more information, see:
- README.md
- docs/guides/

============================================================
EOF
}

# Main loop
claude_setup_main() {
    # Check if CLAUDE_PLAYBOOK_ROOT is set
    if [ -z "$CLAUDE_PLAYBOOK_ROOT" ]; then
        print_error "CLAUDE_PLAYBOOK_ROOT is not set"
        print_info "Please source setup.sh from claude-playbook directory"
        return 1
    fi

    # Show banner when running the menu
    show_banner

    while true; do
        show_menu
        read -p "Enter your choice [0-9]: " choice
        echo ""

        case $choice in
            1)
                run_setup_global
                ;;
            2)
                run_setup_submodule
                ;;
            3)
                run_setup_merge
                ;;
            4)
                run_setup_local_clone
                ;;
            5)
                run_update_global
                ;;
            6)
                run_uninstall_global
                ;;
            7)
                run_uninstall_project
                ;;
            8)
                create_new_config
                ;;
            9)
                show_help
                ;;
            0)
                print_info "Exiting setup"
                break
                ;;
            *)
                print_error "Invalid choice. Please enter 0-9."
                ;;
        esac

        echo ""
        read -p "Press Enter to continue..."
        echo ""
    done
}

# Define the claude-setup command
claude-setup() {
    claude_setup_main
}

# Print info message only when explicitly sourced (not from .bashrc)
if [ -z "$CLAUDE_SETUP_TEST_MODE" ] && [ -z "$CLAUDE_SETUP_SILENT" ]; then
    case $- in
        *i*)
            echo ""
            print_success "Claude setup functions loaded!"
            print_info "Claude Playbook: $CLAUDE_PLAYBOOK_ROOT"
            echo ""
            print_info "Run 'claude-setup' to access the setup menu"
            echo ""
            ;;
        *)
            ;;
    esac
fi

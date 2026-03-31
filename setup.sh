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
    echo "4. Update Global Claude"
    echo "5. Uninstall Global Claude"
    echo "6. Uninstall Project Claude"
    echo "7. Create New Config"
    echo "8. Show Help"
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

    # Auto-detect config name from directory basename
    AUTO_CONFIG_NAME=$(basename "$PROJECT_PATH")

    # Validate auto-detected name (must be lowercase, alphanumeric, hyphens only)
    if [[ "$AUTO_CONFIG_NAME" =~ ^[a-z0-9-]+$ ]]; then
        DEFAULT_CONFIG="$AUTO_CONFIG_NAME"
        PROMPT_MSG="Config name (default: $DEFAULT_CONFIG, press Enter to use): "
    else
        DEFAULT_CONFIG="global"
        PROMPT_MSG="Config name (default: $DEFAULT_CONFIG, directory name '$AUTO_CONFIG_NAME' is invalid): "
    fi

    # Ask for config name
    read -p "$PROMPT_MSG" CONFIG_NAME
    CONFIG_NAME="${CONFIG_NAME:-$DEFAULT_CONFIG}"

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

    # Auto-detect config name from directory basename
    AUTO_CONFIG_NAME=$(basename "$PROJECT_PATH")

    # Validate auto-detected name (must be lowercase, alphanumeric, hyphens only)
    if [[ "$AUTO_CONFIG_NAME" =~ ^[a-z0-9-]+$ ]]; then
        DEFAULT_CONFIG="$AUTO_CONFIG_NAME"
        PROMPT_MSG="Config name (default: $DEFAULT_CONFIG, press Enter to use): "
    else
        DEFAULT_CONFIG="global"
        PROMPT_MSG="Config name (default: $DEFAULT_CONFIG, directory name '$AUTO_CONFIG_NAME' is invalid): "
    fi

    # Ask for config name
    read -p "$PROMPT_MSG" CONFIG_NAME
    CONFIG_NAME="${CONFIG_NAME:-$DEFAULT_CONFIG}"

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

    # Create directory structure
    CONFIG_DIR="$CLAUDE_PLAYBOOK_ROOT/configs/$CONFIG_NAME"
    mkdir -p "$CONFIG_DIR/.claude/commands"
    mkdir -p "$CONFIG_DIR/.claude/agents"
    mkdir -p "$CONFIG_DIR/.claude/rules"
    mkdir -p "$CONFIG_DIR/docs"

    # Create CLAUDE.md
    cat > "$CONFIG_DIR/CLAUDE.md" << EOF
# ${CONFIG_NAME} Config

## Overview

Configuration for ${CONFIG_NAME} project.

## Commands

(Add your commands here)

## Getting Started

See [Claude Playbook Documentation](../../README.md) for more information.
EOF

    # Create sample command
    cat > "$CONFIG_DIR/.claude/commands/hello.md" << 'CMDEOF'
Say hello and confirm the config is working.

When the user runs this command:
1. Print "Hello from the config!"
2. List available commands in this config
CMDEOF

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

4. Update Global Claude
   - Refreshes ~/.claude with latest configs
   - Run after pulling claude-playbook updates

5. Uninstall Global Claude
   - Removes claude-playbook symlinks from ~/.claude
   - Does not affect project-specific configs

6. Uninstall Project Claude
   - Removes .claude symlinks from project
   - Does not delete native (non-symlinked) files

7. Create New Config
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
        read -p "Enter your choice [0-8]: " choice
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
                run_update_global
                ;;
            5)
                run_uninstall_global
                ;;
            6)
                run_uninstall_project
                ;;
            7)
                create_new_config
                ;;
            8)
                show_help
                ;;
            0)
                print_info "Exiting setup"
                break
                ;;
            *)
                print_error "Invalid choice. Please enter 0-8."
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

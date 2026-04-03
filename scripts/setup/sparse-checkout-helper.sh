#!/usr/bin/env bash
# Helper to configure sparse checkout on a playbook clone/submodule.
# Usage: source this file, then call configure_sparse_checkout <repo-path> <config-name>

# Minimum git version for sparse-checkout cone mode
MIN_GIT_MAJOR=2
MIN_GIT_MINOR=25

# Check if git version supports sparse-checkout cone mode (>= 2.25)
git_supports_sparse_checkout() {
    local ver
    ver="$(git --version | sed 's/git version //')"
    local major minor
    major="$(echo "$ver" | cut -d. -f1)"
    minor="$(echo "$ver" | cut -d. -f2)"
    if [[ "$major" -gt "$MIN_GIT_MAJOR" ]] || \
       { [[ "$major" -eq "$MIN_GIT_MAJOR" ]] && [[ "$minor" -ge "$MIN_GIT_MINOR" ]]; }; then
        return 0
    fi
    return 1
}

# Configure sparse checkout on an already-cloned repo.
# Cone mode includes root files automatically.
# Args: $1 = repo path, $2 = config name
# Returns 0 on success, 1 if not supported (non-fatal).
configure_sparse_checkout() {
    local repo_path="$1"
    local config_name="$2"

    if ! git_supports_sparse_checkout; then
        echo "  [info] Git $(git --version | sed 's/git version //') < 2.25, sparse checkout unavailable"
        echo "  [info] Full checkout will be used instead"
        return 1
    fi

    cd "$repo_path"
    git sparse-checkout init --cone
    git sparse-checkout set \
        configs/global \
        "configs/$config_name" \
        scripts

    echo "  [sparse] Checkout: configs/global, configs/$config_name, scripts"
    return 0
}

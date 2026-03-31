#!/usr/bin/env bash
# Pre-commit hook: scan AI command/rule/config files for shell injection patterns.
# Exits non-zero if suspicious patterns are found in executable AI files.
#
# File classification:
#   STRICT (block on critical): commands/, rules/, agents/, CLAUDE.md, AGENTS.md
#   RELAXED (warn only):        docs/, README, guides, other .md files
#
# Usage:
#   As pre-commit hook (via .pre-commit-config.yaml or install-hooks.sh)
#   Or standalone: ./check-command-injection.sh [file ...]
set -euo pipefail

RED='\033[0;31m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# ---------------------------------------------------------------------------
# Target files
# ---------------------------------------------------------------------------
if [[ $# -gt 0 ]]; then
    FILES=("$@")
else
    # When run as pre-commit hook, check staged files
    mapfile -t FILES < <(
        git diff --cached --name-only --diff-filter=ACM 2>/dev/null | \
        grep -E '\.(md|yaml|yml|json)$' || true
    )
fi

if [[ ${#FILES[@]} -eq 0 ]]; then
    exit 0
fi

# ---------------------------------------------------------------------------
# Classify files: strict (AI-executable) vs relaxed (documentation)
# ---------------------------------------------------------------------------
is_strict_file() {
    local file="$1"
    # .claude/ commands, rules, agents are directly executed by AI — strict scanning
    # .claude/ commands, rules, agents, skills, and CLAUDE.md are directly executed by AI
    if echo "$file" | grep -qiE '(\.claude/(commands|rules)/|agents/|skills/|CLAUDE\.md|AGENTS\.md)'; then
        return 0
    fi
    return 1
}

# ---------------------------------------------------------------------------
# Pattern categories
# ---------------------------------------------------------------------------

CRITICAL_PATTERNS=(
    # Shell execution via subshell / eval
    '\$\(.*\)'                          # $(command substitution)
    '`[^`]+`'                           # `backtick execution`
    '\beval\b'                          # eval
    '\bexec\b\s'                        # exec (with space, not "execute")
    '\bsource\b\s+[^.]'                # source non-dotfile

    # Pipe to shell
    '\|\s*(ba)?sh\b'                    # | sh, | bash
    '\|\s*python[23]?\b'               # | python
    '\|\s*perl\b'                       # | perl
    '\|\s*ruby\b'                       # | ruby
    '\|\s*node\b'                       # | node

    # Download + execute
    'curl\b.*\|\s*(ba)?sh'             # curl | sh
    'wget\b.*\|\s*(ba)?sh'            # wget | sh
    'curl\b.*-o\s*/tmp'               # curl download to /tmp
    'wget\b.*-O\s*/tmp'               # wget download to /tmp

    # Encoding tricks
    'base64\s+(-d|--decode)'           # base64 decode (obfuscation)
    '\bxxd\b.*-r'                      # hex decode
    'printf\b.*\\\\x'                  # printf hex escape

    # Reverse shells
    '/dev/tcp/'                         # bash reverse shell
    '/dev/udp/'                         # bash reverse shell udp
    'nc\b.*-e'                          # netcat exec
    'ncat\b.*-e'                        # ncat exec
    'mkfifo'                            # named pipe (reverse shell pattern)
)

WARNING_PATTERNS=(
    # Destructive operations
    '\brm\s+-rf\s+/'                   # rm -rf /
    '\brm\s+-rf\s+\$'                  # rm -rf $VAR
    '\brm\s+-rf\s+\*'                  # rm -rf *
    'mkfs\.'                            # format filesystem
    '\bdd\b\s+if='                     # dd (disk overwrite)
    '>\s*/dev/sd'                       # write to disk device

    # Privilege escalation
    '\bsudo\b'                          # sudo
    '\bchmod\b.*777'                    # world-writable
    '\bchmod\b.*\+s'                    # setuid
    '\bchown\b.*root'                   # chown to root

    # Credential / secrets access
    '\bcat\b.*\.ssh/'                  # reading SSH keys
    '\bcat\b.*/etc/(shadow|passwd)'    # reading system credentials
    '\$AWS_SECRET'                      # AWS secrets in commands
    '\$GITHUB_TOKEN'                    # GitHub token reference
    'credentials?\.(json|yaml|yml)'    # credential files

    # Exfiltration
    'curl\b.*-d\s'                     # curl POST (data exfil)
    'curl\b.*--data'                   # curl POST
    'curl\b.*-X\s*POST'               # curl POST
    'wget\b.*--post'                   # wget POST

    # Environment manipulation
    '\bexport\b.*PATH='               # PATH hijacking
    '\bexport\b.*LD_PRELOAD'          # LD_PRELOAD injection
    '\bexport\b.*LD_LIBRARY_PATH'     # library path hijacking
    '\balias\b\s'                      # alias injection

    # Git config manipulation
    'git\s+config\b.*credential'       # git credential access
    'git\s+config\b.*core\.hooksPath'  # hook path hijacking
    '\bgit\s+push\b.*--force'         # force push
)

# ---------------------------------------------------------------------------
# Scan
# ---------------------------------------------------------------------------
found_critical=0
found_warning=0
found_relaxed=0

scan_file() {
    local file="$1"
    local level="$2"
    local label="$3"
    local color="$4"
    local strict="$5"
    shift 5
    local patterns=("$@")

    for pattern in "${patterns[@]}"; do
        [[ -f "$file" ]] || continue

        local matches
        matches=$(grep -nP "$pattern" "$file" 2>/dev/null || true)
        if [[ -n "$matches" ]]; then
            while IFS= read -r match; do
                local lineno="${match%%:*}"
                local content="${match#*:}"
                content="$(echo "$content" | sed 's/^[[:space:]]*//')"

                # Skip <!-- safe: reason --> annotated lines
                if echo "$content" | grep -qP '<!--\s*safe:'; then
                    continue
                fi
                # Skip HTML comments
                if echo "$content" | grep -qP '^\s*<!--.*-->'; then
                    continue
                fi
                # Skip markdown code fence markers
                if echo "$content" | grep -qP '^\s*```'; then
                    continue
                fi

                if [[ "$strict" == "true" ]]; then
                    printf "${color}[%s]${NC} %s:%s: %s\n" "$label" "$file" "$lineno" "$content"
                    printf "  Pattern: %s\n" "$pattern"
                    echo ""

                    if [[ "$level" == "critical" ]]; then
                        found_critical=$((found_critical + 1))
                    else
                        found_warning=$((found_warning + 1))
                    fi
                else
                    # Relaxed mode: critical -> warning, warning -> silent
                    if [[ "$level" == "critical" ]]; then
                        printf "${CYAN}[RELAXED]${NC} %s:%s: %s\n" "$file" "$lineno" "$content"
                        printf "  Pattern: %s\n" "$pattern"
                        echo ""
                        found_relaxed=$((found_relaxed + 1))
                    fi
                fi
            done <<< "$matches"
        fi
    done
}

# Count files by type
strict_count=0
relaxed_count=0
for file in "${FILES[@]}"; do
    if is_strict_file "$file"; then
        strict_count=$((strict_count + 1))
    else
        relaxed_count=$((relaxed_count + 1))
    fi
done

echo "Scanning ${#FILES[@]} file(s) ($strict_count strict, $relaxed_count relaxed)..."
echo ""

for file in "${FILES[@]}"; do
    if is_strict_file "$file"; then
        scan_file "$file" "critical" "CRITICAL" "$RED"    "true"  "${CRITICAL_PATTERNS[@]}"
        scan_file "$file" "warning"  "WARNING"  "$YELLOW" "true"  "${WARNING_PATTERNS[@]}"
    else
        scan_file "$file" "critical" "CRITICAL" "$RED"    "false" "${CRITICAL_PATTERNS[@]}"
        scan_file "$file" "warning"  "WARNING"  "$YELLOW" "false" "${WARNING_PATTERNS[@]}"
    fi
done

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
if [[ $found_critical -gt 0 ]]; then
    echo ""
    printf "${RED}BLOCKED: Found %d critical pattern(s) in AI-executable files.${NC}\n" "$found_critical"
    echo "These files (commands/, rules/, agents/, CLAUDE.md) are directly executed by AI agents."
    echo "If intentional, annotate the line with <!-- safe: reason --> and request PR review."
    exit 1
fi

if [[ $found_warning -gt 0 ]]; then
    echo ""
    printf "${YELLOW}WARNING: Found %d suspicious pattern(s) in AI-executable files.${NC}\n" "$found_warning"
    echo "Review carefully during PR review."
fi

if [[ $found_relaxed -gt 0 ]]; then
    echo ""
    printf "${CYAN}INFO: Found %d pattern(s) in documentation files (not blocking).${NC}\n" "$found_relaxed"
fi

exit 0

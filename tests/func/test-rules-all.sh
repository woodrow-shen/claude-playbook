#!/usr/bin/env bash
# Functional tests for all rule files across all configs.
# Dynamically scans configs/*/. claude/rules/*.md and validates
# structure, front matter, and content quality for each rule.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

passed=0
failed=0
total_rules=0

assert_pass() {
    local desc="$1"
    echo "  PASS: $desc"
    ((passed++)) || true
}

assert_fail() {
    local desc="$1"
    echo "  FAIL: $desc"
    ((failed++)) || true
}

# Validate a single rule file
validate_rule() {
    local file="$1"
    local name
    name="$(basename "$file" .md)"
    local rel_path="${file#$REPO_ROOT/}"

    ((total_rules++)) || true
    echo ""
    echo "--- Rule: $rel_path ---"

    # 1. File is non-empty
    if [[ -s "$file" ]]; then
        assert_pass "file is non-empty"
    else
        assert_fail "file is empty: $rel_path"
        return
    fi

    # 2. Starts with YAML front matter delimiter
    local first_line
    first_line="$(head -1 "$file")"
    if [[ "$first_line" == "---" ]]; then
        assert_pass "starts with YAML front matter"
    else
        assert_fail "missing YAML front matter opening '---'"
    fi

    # 3. Has name field in front matter
    if head -10 "$file" | grep -q '^name:'; then
        assert_pass "has 'name:' in front matter"
    else
        assert_fail "missing 'name:' in front matter"
    fi

    # 4. Has description field in front matter
    if head -10 "$file" | grep -q '^description:'; then
        assert_pass "has 'description:' in front matter"
    else
        assert_fail "missing 'description:' in front matter"
    fi

    # 5. Front matter closes with second '---'
    local fm_close
    fm_close="$(awk 'NR>1 && /^---$/{print NR; exit}' "$file")"
    if [[ -n "$fm_close" ]]; then
        assert_pass "front matter closes with '---'"
    else
        assert_fail "front matter never closes (missing second '---')"
    fi

    # 6. Has at least one markdown heading
    if grep -q '^#' "$file"; then
        assert_pass "has markdown heading"
    else
        assert_fail "no markdown heading found"
    fi

    # 7. No emoji characters (common unicode emoji ranges)
    if grep -Pq '[\x{1F300}-\x{1F9FF}\x{2600}-\x{26FF}\x{2700}-\x{27BF}]' "$file" 2>/dev/null; then
        assert_fail "contains emoji (not allowed in execution files)"
    else
        assert_pass "no emoji"
    fi

    # 8. No box-drawing characters
    if grep -Pq '[\x{2500}-\x{257F}]' "$file" 2>/dev/null; then
        assert_fail "contains box-drawing characters"
    else
        assert_pass "no box-drawing characters"
    fi

    # 9. name field value matches filename (without .md)
    local fm_name
    fm_name="$(grep '^name:' "$file" | head -1 | sed 's/^name: *//')"
    if [[ "$fm_name" == "$name" ]]; then
        assert_pass "name field matches filename"
    else
        assert_fail "name field '$fm_name' does not match filename '$name'"
    fi

    # 10. Has substantive content (more than just front matter and heading)
    local content_lines
    content_lines="$(wc -l < "$file")"
    if [[ "$content_lines" -ge 10 ]]; then
        assert_pass "has substantive content ($content_lines lines)"
    else
        assert_fail "too short ($content_lines lines) - may lack substance"
    fi
}

echo "=== Tests: All Rules ==="

# Find all rule files across all configs
rule_files=()
while IFS= read -r f; do
    rule_files+=("$f")
done < <(find "$REPO_ROOT/configs" -path "*/rules/*.md" -type f | sort)

if [[ ${#rule_files[@]} -eq 0 ]]; then
    echo "FAIL: No rule files found"
    exit 1
fi

echo "Found ${#rule_files[@]} rule file(s)"

for rule_file in "${rule_files[@]}"; do
    validate_rule "$rule_file"
done

echo ""
echo "=== Summary ==="
echo "Rules checked: $total_rules"
echo "Results: $passed passed, $failed failed"
[[ "$failed" -eq 0 ]]

#!/usr/bin/env python3
"""Auto-fix stale srcRef line numbers in animation modules.

Uses the same detection as verify-srcrefs.py. For each ref where the function
name appears within ±200 lines of the expected line (DRIFT), rewrites the line
number to the closest actual occurrence. Skips MOVED/MISSING cases.

Dry-run by default; pass --write to persist changes.
"""

import argparse
import os
import re
import sys
from pathlib import Path

REPO_ROOT = Path('/home/woodrow/work/github/linux')
MODULES_DIR = REPO_ROOT / '.claude-playbook/configs/linux/web/src/animation/modules'

SRCREF_STR = re.compile(r"srcRef:\s*(['\"])(.+?)\1")
# Capture groups that allow in-place substitution:
#   path:  g1 (word+dots/slashes ending .c/.h/.S)
#   sep:   g2 (the `:` with surrounding optional space)
#   line:  g3 (digits)
#   gap:   g4 (whitespace)
#   func:  g5 (identifier)
REF_RE = re.compile(
    r"([\w./+-]+\.(?:[ch]|[Sh]))(\s*:\s*)(\d+)(\s+)([A-Za-z_][A-Za-z0-9_]*)(?=\s*\()"
)

CLOSE_WINDOW = 50
FAR_WINDOW = 200


def find_function_lines(source_path: Path, func_name: str) -> list[int]:
    try:
        content = source_path.read_text(encoding='utf-8', errors='replace')
    except Exception:
        return []
    pattern = re.compile(rf'\b{re.escape(func_name)}\s*\(')
    return [content.count('\n', 0, m.start()) + 1 for m in pattern.finditer(content)]


def closest(lines: list[int], expected: int) -> int | None:
    return min(lines, key=lambda ln: abs(ln - expected)) if lines else None


def fix_srcref_body(body: str) -> tuple[str, list[str]]:
    """Fix bare-filename refs by inheriting directory; update drifted line numbers.

    Returns (new_body, list_of_change_descriptions).
    """
    changes = []
    last_dir = ''

    def replace(match: re.Match) -> str:
        nonlocal last_dir
        path, sep, line_str, gap, func = match.groups()
        expected = int(line_str)
        # Inherit directory for bare filenames.
        full_path = path if '/' in path else (f'{last_dir}/{path}' if last_dir else path)
        if '/' in path:
            last_dir = os.path.dirname(path)
        full = REPO_ROOT / full_path
        if not full.is_file():
            return match.group(0)
        lines = find_function_lines(full, func)
        actual = closest(lines, expected)
        if actual is None:
            return match.group(0)
        delta = actual - expected
        if abs(delta) == 0 or abs(delta) > FAR_WINDOW:
            return match.group(0)
        changes.append(f'{full_path}:{expected} -> :{actual} {func}() ({delta:+d})')
        return f'{path}{sep}{actual}{gap}{func}'

    return REF_RE.sub(replace, body), changes


def process_module(ts_path: Path, write: bool) -> list[str]:
    content = ts_path.read_text(encoding='utf-8')
    all_changes = []

    def replace_srcref(match: re.Match) -> str:
        quote, body = match.groups()
        new_body, changes = fix_srcref_body(body)
        all_changes.extend(changes)
        return f'srcRef: {quote}{new_body}{quote}'

    new_content = SRCREF_STR.sub(replace_srcref, content)
    if new_content != content:
        if write:
            ts_path.write_text(new_content, encoding='utf-8')
        return all_changes
    return []


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--write', action='store_true',
                    help='persist changes (default: dry run)')
    args = ap.parse_args()

    total_changes = 0
    for ts in sorted(MODULES_DIR.glob('*.ts')):
        if ts.name.endswith('.test.ts'):
            continue
        changes = process_module(ts, args.write)
        if changes:
            print(f'\n## {ts.stem}')
            for c in changes:
                print(f'  {c}')
            total_changes += len(changes)

    mode = 'WROTE' if args.write else 'WOULD WRITE'
    print(f'\n{mode} {total_changes} line-number fixes')
    return 0


if __name__ == '__main__':
    sys.exit(main())

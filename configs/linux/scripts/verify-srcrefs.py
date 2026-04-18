#!/usr/bin/env python3
"""Verify srcRef values in animation modules against the current kernel tree.

srcRef format: 'file/path:LINE function_name()'

For each srcRef, we check:
  1. File exists at the given path (repo root).
  2. The function name is present in the file.
  3. The referenced line is within a small window of the function definition.

Output is a table grouped by module, with status per entry:
  OK            function at expected line
  DRIFT N       function exists but is N lines away
  MOVED         function exists in file but far from expected line (>200 lines)
  MISSING_FN    function not in file
  MISSING_FILE  file not found

Exit code is 0 on success (we report drift, we don't fail CI here).
"""

import os
import re
import sys
from pathlib import Path
from collections import defaultdict

REPO_ROOT = Path('/home/woodrow/work/github/linux')
MODULES_DIR = REPO_ROOT / '.claude-playbook/configs/linux/web/src/animation/modules'

# srcRef pattern: a string literal that may contain one or more `path:line func()`
# references separated by `->`. We pull out each ref individually.
#   - path: word chars, slashes, dots, dashes; must end in .c/.h/.S
#   - line: digits
#   - func: C identifier followed by `(`
SRCREF_STR = re.compile(r"srcRef:\s*(['\"])(.+?)\1")
REF_RE = re.compile(
    r"([\w./+-]+\.(?:[ch]|[Sh]))\s*:\s*(\d+)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\("
)

CLOSE_WINDOW = 50   # lines
FAR_WINDOW = 200    # lines


def find_function_lines(source_path: Path, func_name: str) -> list[int]:
    """Return all line numbers in `source_path` where `func_name(` appears.

    A srcRef may point to a definition OR a call-site; we just want any
    occurrence of the symbol as a callable, so we accept both.
    """
    try:
        content = source_path.read_text(encoding='utf-8', errors='replace')
    except Exception:
        return []
    pattern = re.compile(rf'\b{re.escape(func_name)}\s*\(')
    lines = []
    for m in pattern.finditer(content):
        lines.append(content.count('\n', 0, m.start()) + 1)
    return lines


def closest_line(lines: list[int], expected: int) -> int | None:
    if not lines:
        return None
    return min(lines, key=lambda ln: abs(ln - expected))


def parse_module(path: Path):
    """Yield (line_in_module, file_path, expected_line, func_name).

    Each srcRef may contain multiple `path:line func()` references; yield each.
    If a later ref uses a bare filename (no `/`), inherit directory from the
    previous ref in the same srcRef — authors often abbreviate `rt.c` after
    first mentioning `kernel/sched/rt.c`.
    """
    content = path.read_text(encoding='utf-8', errors='replace')
    for sm in SRCREF_STR.finditer(content):
        module_line = content.count('\n', 0, sm.start()) + 1
        srcref_body = sm.group(2)
        last_dir = ''
        for rm in REF_RE.finditer(srcref_body):
            ref_path = rm.group(1)
            if '/' not in ref_path and last_dir:
                ref_path = f'{last_dir}/{ref_path}'
            else:
                last_dir = os.path.dirname(ref_path)
            yield module_line, ref_path, int(rm.group(2)), rm.group(3)


def main() -> int:
    results = defaultdict(list)
    totals = {'OK': 0, 'DRIFT': 0, 'MOVED': 0, 'MISSING_FN': 0, 'MISSING_FILE': 0}

    for ts_file in sorted(MODULES_DIR.glob('*.ts')):
        if ts_file.name.endswith('.test.ts'):
            continue
        module = ts_file.stem
        for module_line, src_path, expected, func in parse_module(ts_file):
            full = REPO_ROOT / src_path
            if not full.is_file():
                results[module].append(
                    (module_line, src_path, expected, func, 'MISSING_FILE', None)
                )
                totals['MISSING_FILE'] += 1
                continue
            all_lines = find_function_lines(full, func)
            found = closest_line(all_lines, expected)
            if found is None:
                results[module].append(
                    (module_line, src_path, expected, func, 'MISSING_FN', None)
                )
                totals['MISSING_FN'] += 1
                continue
            delta = found - expected
            if abs(delta) <= CLOSE_WINDOW:
                status = 'OK'
                totals['OK'] += 1
            elif abs(delta) <= FAR_WINDOW:
                status = 'DRIFT'
                totals['DRIFT'] += 1
            else:
                status = 'MOVED'
                totals['MOVED'] += 1
            results[module].append(
                (module_line, src_path, expected, func, status, found)
            )

    # Print per-module report.
    for module in sorted(results):
        entries = results[module]
        stale = [e for e in entries if e[4] != 'OK']
        if not stale:
            continue
        print(f'\n## {module}  ({len(stale)}/{len(entries)} stale)')
        for module_line, src_path, expected, func, status, found in stale:
            if status == 'MISSING_FILE':
                print(f'  L{module_line:<4} {status:<12} {src_path} -> file not found')
            elif status == 'MISSING_FN':
                print(f'  L{module_line:<4} {status:<12} {src_path}:{expected} {func}() -> not found')
            else:
                delta = found - expected
                sign = '+' if delta > 0 else ''
                print(f'  L{module_line:<4} {status:<12} {src_path}:{expected} {func}() -> actually {found} ({sign}{delta})')

    # Summary.
    print('\n## Summary')
    total = sum(totals.values())
    for k, v in totals.items():
        print(f'  {k:<13} {v}')
    print(f'  TOTAL         {total}')
    modules_with_stale = sum(
        1 for m, es in results.items() if any(e[4] != 'OK' for e in es)
    )
    print(f'  Modules with stale refs: {modules_with_stale}/{len(results)}')
    return 0


if __name__ == '__main__':
    sys.exit(main())

import { describe, it, expect } from 'vitest';
import { parseSrcRef, extractSnippet, collectSrcRefs, buildSnippetIndex } from './srcref-snippets.js';

describe('parseSrcRef', () => {
  it('parses a single "path:line function()" ref', () => {
    const refs = parseSrcRef('mm/page_alloc.c:5272 __alloc_pages_noprof()');
    expect(refs).toEqual([
      { path: 'mm/page_alloc.c', line: 5272, annotation: '__alloc_pages_noprof()' },
    ]);
  });

  it('parses a bare "path:line" with no annotation', () => {
    const refs = parseSrcRef('arch/x86/kernel/setup.c:884');
    expect(refs).toEqual([
      { path: 'arch/x86/kernel/setup.c', line: 884, annotation: '' },
    ]);
  });

  it('parses composite refs joined with " -> "', () => {
    const refs = parseSrcRef(
      'kernel/sched/fair.c:1378 update_curr() -> fair.c:297 calc_delta_fair()',
    );
    expect(refs).toEqual([
      { path: 'kernel/sched/fair.c', line: 1378, annotation: 'update_curr()' },
      { path: 'kernel/sched/fair.c', line: 297, annotation: 'calc_delta_fair()' },
    ]);
  });

  it('inherits directory from the previous ref when the next ref is a bare basename', () => {
    const refs = parseSrcRef(
      'kernel/sched/rt.c:1676 pick_next_rt_entity() -> rt.c:1683 sched_find_first_bit()',
    );
    expect(refs[1].path).toBe('kernel/sched/rt.c');
  });

  it('does not inherit directory when the next ref has its own path segments', () => {
    const refs = parseSrcRef(
      'mm/page_alloc.c:944 __free_one_page() -> include/linux/mm.h:100 some_helper()',
    );
    expect(refs[0].path).toBe('mm/page_alloc.c');
    expect(refs[1].path).toBe('include/linux/mm.h');
  });

  it('returns an empty array for unparseable strings', () => {
    expect(parseSrcRef('not a srcref')).toEqual([]);
    expect(parseSrcRef('')).toEqual([]);
  });

  it('handles extra trailing annotation after the function call', () => {
    const refs = parseSrcRef('mm/page_alloc.c:1932 __rmqueue_smallest() return');
    expect(refs).toHaveLength(1);
    expect(refs[0].path).toBe('mm/page_alloc.c');
    expect(refs[0].line).toBe(1932);
  });
});

describe('extractSnippet', () => {
  // A 20-line file for boundary testing
  const FILE = Array.from({ length: 20 }, (_, i) => `line${i + 1}`).join('\n');

  it('extracts ±context lines around the target line', () => {
    const snip = extractSnippet(FILE, 10, 3);
    expect(snip.startLine).toBe(7);
    expect(snip.endLine).toBe(13);
    expect(snip.code.split('\n')).toEqual(['line7', 'line8', 'line9', 'line10', 'line11', 'line12', 'line13']);
  });

  it('clamps the start to line 1 near the top of the file', () => {
    const snip = extractSnippet(FILE, 2, 5);
    expect(snip.startLine).toBe(1);
    expect(snip.endLine).toBe(7);
    expect(snip.code.startsWith('line1\n')).toBe(true);
  });

  it('clamps the end to the last line near the bottom of the file', () => {
    const snip = extractSnippet(FILE, 19, 5);
    expect(snip.startLine).toBe(14);
    expect(snip.endLine).toBe(20);
    expect(snip.code.endsWith('line20')).toBe(true);
  });

  it('preserves leading whitespace in snippet lines', () => {
    const content = 'void foo(void)\n{\n\tint x = 1;\n\treturn;\n}\n';
    const snip = extractSnippet(content, 3, 1);
    expect(snip.code).toContain('\tint x = 1;');
  });

  it('does not append a trailing newline', () => {
    const snip = extractSnippet(FILE, 10, 2);
    expect(snip.code.endsWith('\n')).toBe(false);
  });

  it('throws if the target line is out of range', () => {
    expect(() => extractSnippet(FILE, 0, 3)).toThrow(/line/);
    expect(() => extractSnippet(FILE, 21, 3)).toThrow(/line/);
  });

  it('throws if context is negative', () => {
    expect(() => extractSnippet(FILE, 5, -1)).toThrow(/context/);
  });

  it('returns just the target line when context is 0', () => {
    const snip = extractSnippet(FILE, 5, 0);
    expect(snip.startLine).toBe(5);
    expect(snip.endLine).toBe(5);
    expect(snip.code).toBe('line5');
  });
});

describe('collectSrcRefs', () => {
  it('extracts every srcRef literal from a module source', () => {
    const source = `
      frames.push({ action: 'a', srcRef: 'mm/page_alloc.c:100 foo()' });
      frames.push({ action: 'b', srcRef: 'kernel/sched/fair.c:200 bar()' });
    `;
    const refs = collectSrcRefs(source);
    expect(refs).toEqual([
      'mm/page_alloc.c:100 foo()',
      'kernel/sched/fair.c:200 bar()',
    ]);
  });

  it('supports double-quoted srcRefs', () => {
    const source = `srcRef: "fs/exec.c:1500 do_execveat()"`;
    expect(collectSrcRefs(source)).toEqual(['fs/exec.c:1500 do_execveat()']);
  });

  it('returns [] when no srcRef literals are present', () => {
    expect(collectSrcRefs('const x = 1;')).toEqual([]);
  });
});

describe('buildSnippetIndex', () => {
  const fileA = Array.from({ length: 30 }, (_, i) => `A${i + 1}`).join('\n');
  const fileB = Array.from({ length: 30 }, (_, i) => `B${i + 1}`).join('\n');

  function readFile(path: string): string | null {
    if (path === 'a.c') return fileA;
    if (path === 'b.c') return fileB;
    return null;
  }

  it('builds an index keyed by "path:line" with ±context snippets', () => {
    const refs = [
      { path: 'a.c', line: 10, annotation: 'foo()' },
      { path: 'b.c', line: 5, annotation: 'bar()' },
    ];
    const { snippets, misses } = buildSnippetIndex(refs, readFile, 2);
    expect(Object.keys(snippets).sort()).toEqual(['a.c:10', 'b.c:5']);
    expect(snippets['a.c:10'].startLine).toBe(8);
    expect(snippets['a.c:10'].endLine).toBe(12);
    expect(snippets['a.c:10'].code.split('\n')).toEqual(['A8', 'A9', 'A10', 'A11', 'A12']);
    expect(misses).toEqual([]);
  });

  it('dedupes multiple refs to the same path:line', () => {
    const refs = [
      { path: 'a.c', line: 10, annotation: 'foo()' },
      { path: 'a.c', line: 10, annotation: 'foo() return' },
    ];
    const { snippets } = buildSnippetIndex(refs, readFile, 1);
    expect(Object.keys(snippets)).toEqual(['a.c:10']);
  });

  it('records misses for unreadable files instead of throwing', () => {
    const refs = [{ path: 'missing.c', line: 1, annotation: '' }];
    const { snippets, misses } = buildSnippetIndex(refs, readFile, 1);
    expect(snippets).toEqual({});
    expect(misses).toEqual([{ path: 'missing.c', line: 1, reason: 'file-not-found' }]);
  });

  it('records misses for out-of-range line numbers', () => {
    const refs = [{ path: 'a.c', line: 9999, annotation: '' }];
    const { snippets, misses } = buildSnippetIndex(refs, readFile, 1);
    expect(snippets).toEqual({});
    expect(misses[0].reason).toBe('line-out-of-range');
  });
});

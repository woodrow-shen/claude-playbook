import { describe, it, expect } from 'vitest';
import { parsePrimaryRef, snippetKey, githubUrl } from './srcref.js';

describe('parsePrimaryRef', () => {
  it('extracts the first path:line from a srcRef with annotation', () => {
    expect(parsePrimaryRef('mm/page_alloc.c:5272 __alloc_pages_noprof()')).toEqual({
      path: 'mm/page_alloc.c',
      line: 5272,
    });
  });

  it('extracts the first ref from a composite "-> " srcRef', () => {
    expect(
      parsePrimaryRef('kernel/sched/fair.c:1378 update_curr() -> fair.c:297 calc_delta_fair()'),
    ).toEqual({ path: 'kernel/sched/fair.c', line: 1378 });
  });

  it('handles bare "path:line" with no annotation', () => {
    expect(parsePrimaryRef('arch/x86/kernel/setup.c:884')).toEqual({
      path: 'arch/x86/kernel/setup.c',
      line: 884,
    });
  });

  it('returns null for empty or unparseable input', () => {
    expect(parsePrimaryRef('')).toBeNull();
    expect(parsePrimaryRef('not a ref')).toBeNull();
    expect(parsePrimaryRef(undefined as unknown as string)).toBeNull();
  });
});

describe('snippetKey', () => {
  it('returns "path:line" for a parseable srcRef', () => {
    expect(snippetKey('mm/page_alloc.c:5272 __alloc_pages_noprof()')).toBe('mm/page_alloc.c:5272');
  });

  it('uses the first ref from a composite srcRef', () => {
    expect(snippetKey('kernel/sched/fair.c:1378 update_curr() -> fair.c:297 x()')).toBe(
      'kernel/sched/fair.c:1378',
    );
  });

  it('returns null for an unparseable srcRef', () => {
    expect(snippetKey('garbage')).toBeNull();
  });
});

describe('githubUrl', () => {
  it('builds a blob URL with #L<line> for a parseable srcRef', () => {
    expect(githubUrl('mm/page_alloc.c:5272 foo()', 'v7.0')).toBe(
      'https://github.com/torvalds/linux/blob/v7.0/mm/page_alloc.c#L5272',
    );
  });

  it('uses the first ref in a composite srcRef', () => {
    expect(
      githubUrl('kernel/sched/fair.c:1378 update_curr() -> fair.c:297 x()', 'v7.0'),
    ).toBe('https://github.com/torvalds/linux/blob/v7.0/kernel/sched/fair.c#L1378');
  });

  it('returns null for unparseable input', () => {
    expect(githubUrl('', 'v7.0')).toBeNull();
  });
});

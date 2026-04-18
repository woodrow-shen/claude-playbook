import { describe, it, expect, beforeEach } from 'vitest';
import { createSrcRefViewer, type SnippetIndex } from './srcref-viewer.js';

const SNIPPETS: SnippetIndex = {
  'mm/page_alloc.c:5272': {
    path: 'mm/page_alloc.c',
    line: 5272,
    startLine: 5257,
    endLine: 5287,
    code: 'struct page *\n__alloc_pages_noprof(...)\n{\n\treturn NULL;\n}',
  },
  'kernel/sched/fair.c:1378': {
    path: 'kernel/sched/fair.c',
    line: 1378,
    startLine: 1363,
    endLine: 1393,
    code: 'void update_curr(void) { }',
  },
};

describe('createSrcRefViewer', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
  });

  it('renders nothing when srcRef is null', () => {
    const v = createSrcRefViewer(container, SNIPPETS);
    v.update(null);
    expect(container.querySelector('.srcref-viewer')?.classList.contains('is-hidden')).toBe(true);
  });

  it('shows the path:line header and a GitHub link when srcRef is provided', () => {
    const v = createSrcRefViewer(container, SNIPPETS);
    v.update('mm/page_alloc.c:5272 __alloc_pages_noprof()');
    const header = container.querySelector('.srcref-header');
    expect(header?.textContent).toContain('mm/page_alloc.c:5272');
    const link = container.querySelector('a.srcref-link') as HTMLAnchorElement;
    expect(link.href).toBe('https://github.com/torvalds/linux/blob/v7.0/mm/page_alloc.c#L5272');
    expect(link.target).toBe('_blank');
  });

  it('starts collapsed and expands when the toggle is clicked', () => {
    const v = createSrcRefViewer(container, SNIPPETS);
    v.update('mm/page_alloc.c:5272 foo()');
    const snippet = container.querySelector('.srcref-snippet') as HTMLElement;
    const toggle = container.querySelector('.srcref-toggle') as HTMLButtonElement;
    expect(snippet.classList.contains('is-expanded')).toBe(false);
    toggle.click();
    expect(snippet.classList.contains('is-expanded')).toBe(true);
    expect(snippet.textContent).toContain('__alloc_pages_noprof');
  });

  it('shows "source unavailable" when the srcRef has no matching snippet', () => {
    const v = createSrcRefViewer(container, SNIPPETS);
    v.update('mm/unknown.c:1 foo()');
    const header = container.querySelector('.srcref-header');
    expect(header?.textContent).toContain('mm/unknown.c:1');
    const toggle = container.querySelector('.srcref-toggle');
    expect(toggle).toBeNull();
    const missing = container.querySelector('.srcref-missing');
    expect(missing?.textContent).toMatch(/source unavailable|not extracted/i);
  });

  it('updates snippet content when srcRef changes', () => {
    const v = createSrcRefViewer(container, SNIPPETS);
    v.update('mm/page_alloc.c:5272 a()');
    (container.querySelector('.srcref-toggle') as HTMLButtonElement).click();
    expect(container.querySelector('.srcref-snippet')?.textContent).toContain('__alloc_pages_noprof');
    v.update('kernel/sched/fair.c:1378 update_curr()');
    (container.querySelector('.srcref-toggle') as HTMLButtonElement).click();
    expect(container.querySelector('.srcref-snippet')?.textContent).toContain('update_curr');
  });

  it('hides again when update(null) is called after a previous srcRef', () => {
    const v = createSrcRefViewer(container, SNIPPETS);
    v.update('mm/page_alloc.c:5272 a()');
    v.update(null);
    expect(container.querySelector('.srcref-viewer')?.classList.contains('is-hidden')).toBe(true);
  });

  it('displays the start--end line range for the snippet', () => {
    const v = createSrcRefViewer(container, SNIPPETS);
    v.update('mm/page_alloc.c:5272 foo()');
    const header = container.querySelector('.srcref-header');
    expect(header?.textContent).toContain('5257');
    expect(header?.textContent).toContain('5287');
  });
});

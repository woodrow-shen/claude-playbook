import { parsePrimaryRef, snippetKey, githubUrl } from './srcref.js';

export interface KernelSnippet {
  path: string;
  line: number;
  startLine: number;
  endLine: number;
  code: string;
}

export type SnippetIndex = Record<string, KernelSnippet>;

const KERNEL_TAG = 'v7.0';

export interface SrcRefViewer {
  update(srcRef: string | null): void;
}

export function createSrcRefViewer(container: HTMLElement, snippets: SnippetIndex): SrcRefViewer {
  const root = document.createElement('div');
  root.className = 'srcref-viewer is-hidden';

  const header = document.createElement('div');
  header.className = 'srcref-header';
  root.appendChild(header);

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'srcref-toggle';
  toggle.textContent = 'Show source';

  const link = document.createElement('a');
  link.className = 'srcref-link';
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = 'Open on GitHub';

  const snippet = document.createElement('pre');
  snippet.className = 'srcref-snippet';

  const missing = document.createElement('div');
  missing.className = 'srcref-missing';
  missing.textContent = 'Source unavailable: snippet not extracted for this reference.';

  container.appendChild(root);

  toggle.addEventListener('click', () => {
    snippet.classList.toggle('is-expanded');
    toggle.textContent = snippet.classList.contains('is-expanded') ? 'Hide source' : 'Show source';
  });

  function clearChildren(): void {
    while (root.children.length > 1) root.removeChild(root.lastChild!);
  }

  return {
    update(srcRef: string | null): void {
      clearChildren();
      const ref = parsePrimaryRef(srcRef);
      if (!ref || !srcRef) {
        root.classList.add('is-hidden');
        header.textContent = '';
        return;
      }
      root.classList.remove('is-hidden');
      const key = snippetKey(srcRef);
      const snip = key ? snippets[key] : undefined;

      if (snip) {
        header.textContent = `${ref.path}:${ref.line}  (lines ${snip.startLine}--${snip.endLine})`;
        snippet.textContent = snip.code;
        snippet.classList.remove('is-expanded');
        toggle.textContent = 'Show source';
        root.appendChild(toggle);
        const url = githubUrl(srcRef, KERNEL_TAG);
        if (url) {
          link.href = url;
          root.appendChild(link);
        }
        root.appendChild(snippet);
      } else {
        header.textContent = `${ref.path}:${ref.line}`;
        root.appendChild(missing);
        const url = githubUrl(srcRef, KERNEL_TAG);
        if (url) {
          link.href = url;
          root.appendChild(link);
        }
      }
    },
  };
}

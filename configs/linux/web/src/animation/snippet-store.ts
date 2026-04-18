import type { SnippetIndex } from './srcref-viewer.js';

let cached: Promise<SnippetIndex> | null = null;

export function loadSnippets(): Promise<SnippetIndex> {
  if (cached) return cached;
  cached = import('../../data/srcref-snippets.json')
    .then((mod) => (mod.default ?? mod) as SnippetIndex)
    .catch((err) => {
      cached = null;
      throw err;
    });
  return cached;
}

export function resetSnippetCache(): void {
  cached = null;
}

export interface SrcRefEntry {
  path: string;
  line: number;
  annotation: string;
}

export interface Snippet {
  startLine: number;
  endLine: number;
  code: string;
}

const REF_RE = /([\w./+-]+\.(?:[chS]|[hH]))\s*:\s*(\d+)(?:\s+([^-]*?))?(?=\s*(?:->|$))/g;

export function parseSrcRef(input: string): SrcRefEntry[] {
  if (!input) return [];
  const refs: SrcRefEntry[] = [];
  let lastDir = '';
  REF_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = REF_RE.exec(input)) !== null) {
    let path = m[1];
    const line = Number(m[2]);
    const annotation = (m[3] ?? '').trim();
    if (!path.includes('/') && lastDir) {
      path = `${lastDir}/${path}`;
    }
    const lastSlash = path.lastIndexOf('/');
    if (lastSlash !== -1) {
      lastDir = path.slice(0, lastSlash);
    }
    refs.push({ path, line, annotation });
  }
  return refs;
}

const SRCREF_LITERAL = /srcRef:\s*(['"])([^'"]+)\1/g;

export function collectSrcRefs(moduleSource: string): string[] {
  const refs: string[] = [];
  SRCREF_LITERAL.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SRCREF_LITERAL.exec(moduleSource)) !== null) {
    refs.push(m[2]);
  }
  return refs;
}

export type MissReason = 'file-not-found' | 'line-out-of-range';

export interface SnippetIndexResult {
  snippets: Record<string, Snippet & { path: string; line: number }>;
  misses: { path: string; line: number; reason: MissReason }[];
}

export function buildSnippetIndex(
  refs: SrcRefEntry[],
  readFile: (path: string) => string | null,
  context: number,
): SnippetIndexResult {
  const snippets: SnippetIndexResult['snippets'] = {};
  const misses: SnippetIndexResult['misses'] = [];
  const fileCache = new Map<string, string | null>();

  for (const ref of refs) {
    const key = `${ref.path}:${ref.line}`;
    if (snippets[key]) continue;
    if (!fileCache.has(ref.path)) {
      fileCache.set(ref.path, readFile(ref.path));
    }
    const content = fileCache.get(ref.path) ?? null;
    if (content === null) {
      misses.push({ path: ref.path, line: ref.line, reason: 'file-not-found' });
      continue;
    }
    try {
      const snip = extractSnippet(content, ref.line, context);
      snippets[key] = { path: ref.path, line: ref.line, ...snip };
    } catch {
      misses.push({ path: ref.path, line: ref.line, reason: 'line-out-of-range' });
    }
  }
  return { snippets, misses };
}

export function extractSnippet(fileContent: string, line: number, context: number): Snippet {
  if (context < 0) {
    throw new Error('context must be >= 0');
  }
  const lines = fileContent.split('\n');
  const hasTrailingNewline = fileContent.endsWith('\n');
  const totalLines = hasTrailingNewline ? lines.length - 1 : lines.length;
  if (line < 1 || line > totalLines) {
    throw new Error(`line ${line} out of range (1..${totalLines})`);
  }
  const startLine = Math.max(1, line - context);
  const endLine = Math.min(totalLines, line + context);
  const slice = lines.slice(startLine - 1, endLine);
  return {
    startLine,
    endLine,
    code: slice.join('\n'),
  };
}

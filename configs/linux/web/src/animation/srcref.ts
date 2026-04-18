const PRIMARY_RE = /^\s*([\w./+-]+\.(?:[chS]|h))\s*:\s*(\d+)/;

export interface PrimaryRef {
  path: string;
  line: number;
}

export function parsePrimaryRef(srcRef: string | null | undefined): PrimaryRef | null {
  if (!srcRef) return null;
  const m = PRIMARY_RE.exec(srcRef);
  if (!m) return null;
  return { path: m[1], line: Number(m[2]) };
}

export function snippetKey(srcRef: string | null | undefined): string | null {
  const ref = parsePrimaryRef(srcRef);
  return ref ? `${ref.path}:${ref.line}` : null;
}

export function githubUrl(srcRef: string | null | undefined, tag: string): string | null {
  const ref = parsePrimaryRef(srcRef);
  if (!ref) return null;
  return `https://github.com/torvalds/linux/blob/${tag}/${ref.path}#L${ref.line}`;
}

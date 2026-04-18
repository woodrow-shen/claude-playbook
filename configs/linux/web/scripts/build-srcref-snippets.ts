#!/usr/bin/env node
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  collectSrcRefs,
  parseSrcRef,
  buildSnippetIndex,
  type SrcRefEntry,
} from './srcref-snippets.js';

const CONTEXT_LINES = 15;

function main(): void {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const webRoot = resolve(scriptDir, '..');
  const modulesDir = resolve(webRoot, 'src/animation/modules');
  const outPath = resolve(webRoot, 'data/srcref-snippets.json');
  const kernelRoot = resolve(webRoot, '../../../..');

  const moduleFiles = readdirSync(modulesDir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => resolve(modulesDir, f));

  const allRefs: SrcRefEntry[] = [];
  for (const filePath of moduleFiles) {
    const source = readFileSync(filePath, 'utf8');
    for (const refString of collectSrcRefs(source)) {
      allRefs.push(...parseSrcRef(refString));
    }
  }

  const readFile = (relPath: string): string | null => {
    try {
      return readFileSync(resolve(kernelRoot, relPath), 'utf8');
    } catch {
      return null;
    }
  };

  const { snippets, misses } = buildSnippetIndex(allRefs, readFile, CONTEXT_LINES);

  writeFileSync(outPath, JSON.stringify(snippets, null, 2) + '\n', 'utf8');

  const totalBytes = JSON.stringify(snippets).length;
  process.stdout.write(
    `Wrote ${outPath}\n` +
      `  snippets: ${Object.keys(snippets).length}\n` +
      `  misses:   ${misses.length}\n` +
      `  compact:  ${(totalBytes / 1024).toFixed(1)} KB (no whitespace)\n`,
  );
  if (misses.length > 0) {
    process.stdout.write('  miss sample:\n');
    for (const m of misses.slice(0, 5)) {
      process.stdout.write(`    ${m.reason}: ${m.path}:${m.line}\n`);
    }
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const modulePath = fileURLToPath(import.meta.url);
if (invokedPath === modulePath) {
  main();
}

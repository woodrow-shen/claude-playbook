#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { LearningPath } from '../src/learning-paths.js';

const START_MARKER = '<!-- learning-paths:start -->';
const END_MARKER = '<!-- learning-paths:end -->';
const WRAP_WIDTH = 90;

export function formatPath(index: number, path: LearningPath): string {
  const header = `**Path ${index}: ${path.name}** -- ${path.tagline}`;
  const chainLines = wrapChain(path.skills, WRAP_WIDTH);
  return [header, ...chainLines].join('\n');
}

function wrapChain(skills: string[], width: number): string[] {
  if (skills.length === 0) return [];
  const lines: string[] = [];
  let line = skills[0];
  for (let i = 1; i < skills.length; i++) {
    const skill = skills[i];
    const candidate = `${line} -> ${skill}`;
    const isLast = i === skills.length - 1;
    const suffix = isLast ? '' : ' ->';
    if (candidate.length + suffix.length <= width) {
      line = candidate;
    } else {
      lines.push(`${line} ->`);
      line = skill;
    }
  }
  lines.push(line);
  return lines;
}

export function formatPathsSection(paths: LearningPath[]): string {
  return paths.map((p, i) => formatPath(i + 1, p)).join('\n\n');
}

export function replaceSentinelBlock(content: string, replacement: string): string {
  const startIdx = content.indexOf(START_MARKER);
  const endIdx = content.indexOf(END_MARKER);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error('learning-paths sentinel marker not found');
  }
  if (endIdx < startIdx) {
    throw new Error('learning-paths sentinel markers are in wrong order');
  }
  return (
    content.slice(0, startIdx) +
    `${START_MARKER}\n${replacement}\n${END_MARKER}` +
    content.slice(endIdx + END_MARKER.length)
  );
}

async function main(): Promise<void> {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const webRoot = resolve(scriptDir, '..');
  const jsonPath = resolve(webRoot, 'data/learning-paths.json');
  const readmePath = resolve(webRoot, '../docs/README.md');

  const paths = JSON.parse(await readFile(jsonPath, 'utf8')) as LearningPath[];
  const readme = await readFile(readmePath, 'utf8');
  const section = formatPathsSection(paths);
  const updated = replaceSentinelBlock(readme, section);

  const check = process.argv.includes('--check');
  if (check) {
    if (updated !== readme) {
      process.stderr.write(
        'docs/README.md learning-paths block is out of sync with data/learning-paths.json.\n' +
          'Run: npm run sync-paths-docs\n',
      );
      process.exit(1);
    }
    process.stdout.write('docs/README.md learning-paths block is in sync.\n');
    return;
  }

  if (updated !== readme) {
    await writeFile(readmePath, updated, 'utf8');
    process.stdout.write(`Updated ${readmePath}\n`);
  } else {
    process.stdout.write('No changes.\n');
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const modulePath = fileURLToPath(import.meta.url);
if (invokedPath === modulePath) {
  main().catch((err: Error) => {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  });
}

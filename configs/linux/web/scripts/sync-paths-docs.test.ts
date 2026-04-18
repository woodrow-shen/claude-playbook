import { describe, it, expect } from 'vitest';
import { formatPath, formatPathsSection, replaceSentinelBlock } from './sync-paths-docs.js';
import type { LearningPath } from '../src/learning-paths.js';

const MEMORY_PATH: LearningPath = {
  id: 'memory-deep-dive',
  name: 'Memory Deep Dive',
  tagline: 'From physical pages to OOM killer',
  skills: [
    'boot-and-init',
    'system-calls',
    'process-lifecycle',
    'page-allocation',
    'virtual-memory-areas',
    'page-fault-handling',
    'page-reclaim-and-swap',
    'memcg-and-oom',
  ],
};

const TRACING_PATH: LearningPath = {
  id: 'tracing-ebpf',
  name: 'Tracing and eBPF',
  tagline: 'From ftrace probes to BPF maps',
  skills: [
    'boot-and-init',
    'system-calls',
    'kernel-modules',
    'ftrace-and-kprobes',
    'ebpf-programs',
    'ebpf-maps-and-helpers',
  ],
};

describe('formatPath', () => {
  it('renders a header line with "Path N: Name -- Tagline"', () => {
    const md = formatPath(1, MEMORY_PATH);
    const lines = md.split('\n');
    expect(lines[0]).toBe('**Path 1: Memory Deep Dive** -- From physical pages to OOM killer');
  });

  it('joins skills with " -> " and wraps lines at ~90 chars', () => {
    const md = formatPath(1, MEMORY_PATH);
    const skillLines = md.split('\n').slice(1);
    for (const line of skillLines) {
      expect(line.length).toBeLessThanOrEqual(92);
    }
    // No trailing " ->" on last line
    expect(skillLines[skillLines.length - 1].endsWith(' ->')).toBe(false);
  });

  it('continues with arrow at end of line when wrapping', () => {
    const md = formatPath(1, MEMORY_PATH);
    const skillLines = md.split('\n').slice(1);
    expect(skillLines.length).toBeGreaterThan(1);
    for (let i = 0; i < skillLines.length - 1; i++) {
      expect(skillLines[i].endsWith(' ->')).toBe(true);
    }
  });

  it('keeps a single-line chain for short paths', () => {
    const short: LearningPath = { id: 's', name: 'Short', tagline: 'x', skills: ['a', 'b'] };
    const md = formatPath(3, short);
    expect(md).toBe('**Path 3: Short** -- x\na -> b');
  });

  it('escapes nothing -- content is trusted JSON', () => {
    // Sanity: the "--" in the header is literal, not a markdown feature
    const md = formatPath(1, MEMORY_PATH);
    expect(md).toContain(' -- ');
  });

  it('round-trips the skill order exactly', () => {
    const md = formatPath(1, MEMORY_PATH);
    const body = md.split('\n').slice(1).join(' ').replace(/\s+->\s+/g, ' ');
    const tokens = body.split(' ').filter(Boolean);
    expect(tokens).toEqual(MEMORY_PATH.skills);
  });
});

describe('formatPathsSection', () => {
  it('joins multiple paths with a blank line between', () => {
    const section = formatPathsSection([MEMORY_PATH, TRACING_PATH]);
    // Should contain each header and a blank line separator
    expect(section).toContain('**Path 1: Memory Deep Dive**');
    expect(section).toContain('**Path 2: Tracing and eBPF**');
    expect(section).toMatch(/memcg-and-oom\n\n\*\*Path 2/);
  });

  it('does not add trailing whitespace or extra blank lines', () => {
    const section = formatPathsSection([MEMORY_PATH]);
    expect(section.endsWith('\n')).toBe(false);
    expect(section.match(/\n\n\n/)).toBeNull();
  });

  it('numbers paths starting at 1 based on array order', () => {
    const section = formatPathsSection([TRACING_PATH, MEMORY_PATH]);
    expect(section).toContain('**Path 1: Tracing and eBPF**');
    expect(section).toContain('**Path 2: Memory Deep Dive**');
  });
});

describe('replaceSentinelBlock', () => {
  const START = '<!-- learning-paths:start -->';
  const END = '<!-- learning-paths:end -->';

  it('replaces content between markers, preserving surrounding text', () => {
    const original = `prefix\n${START}\nold content\n${END}\nsuffix`;
    const result = replaceSentinelBlock(original, 'NEW');
    expect(result).toBe(`prefix\n${START}\nNEW\n${END}\nsuffix`);
  });

  it('is idempotent when new content already matches', () => {
    const original = `a\n${START}\nX\n${END}\nb`;
    const once = replaceSentinelBlock(original, 'X');
    const twice = replaceSentinelBlock(once, 'X');
    expect(twice).toBe(once);
  });

  it('throws when the start marker is missing', () => {
    expect(() => replaceSentinelBlock('no markers here', 'X')).toThrow(/marker/);
  });

  it('throws when the end marker is missing', () => {
    const content = `prefix\n${START}\nold`;
    expect(() => replaceSentinelBlock(content, 'X')).toThrow(/marker/);
  });

  it('throws when end marker appears before start marker', () => {
    const content = `${END}\n${START}`;
    expect(() => replaceSentinelBlock(content, 'X')).toThrow(/order/i);
  });
});

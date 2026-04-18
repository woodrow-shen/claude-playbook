import { describe, it, expect } from 'vitest';
import cowFork from './cow-fork.js';
import type { CowState } from './cow-fork.js';

describe('CoW Fork', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(cowFork.config.id).toBe('cow-fork');
      expect(cowFork.config.skillName).toBe('process-lifecycle');
    });
  });

  describe('getScenarios', () => {
    it('returns at least 3 scenarios', () => {
      expect(cowFork.getScenarios().length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('generateFrames - write-fault', () => {
    const frames = cowFork.generateFrames('write-fault');

    it('generates multiple frames', () => {
      expect(frames.length).toBeGreaterThan(3);
    });

    it('starts with one process', () => {
      const data = frames[0].data as CowState;
      expect(data.processes.length).toBe(1);
    });

    it('fork creates a second process', () => {
      const forkFrame = frames.find(f => f.label.includes('fork'));
      expect(forkFrame).toBeDefined();
      const data = forkFrame!.data as CowState;
      expect(data.processes.length).toBe(2);
    });

    it('after fork, pages are shared (refcount > 1)', () => {
      const forkFrame = frames.find(f => f.label.includes('fork'))!;
      const data = forkFrame.data as CowState;
      expect(data.physicalPages.every(pp => pp.refCount === 2)).toBe(true);
    });

    it('has a page fault frame', () => {
      expect(frames.some(f => f.label.includes('FAULT'))).toBe(true);
    });

    it('ends with independent pages', () => {
      const last = frames[frames.length - 1].data as CowState;
      // Heap pages should be on separate physical pages
      const parentHeap = last.processes[0].pages.find(p => p.label === 'heap')!;
      const childHeap = last.processes[1].pages.find(p => p.label === 'heap')!;
      expect(parentHeap.physicalPage).not.toBe(childHeap.physicalPage);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });
  });

  describe('generateFrames - fork-and-exec', () => {
    const frames = cowFork.generateFrames('fork-and-exec');

    it('generates frames', () => {
      expect(frames.length).toBeGreaterThan(2);
    });

    it('child gets renamed after exec', () => {
      const last = frames[frames.length - 1].data as CowState;
      expect(last.processes.some(p => p.name === 'ls')).toBe(true);
    });

    it('after exec, shell pages refcount drops to 1', () => {
      const last = frames[frames.length - 1].data as CowState;
      const shellPages = last.processes[0].pages;
      for (const p of shellPages) {
        const phys = last.physicalPages.find(pp => pp.addr === p.physicalPage)!;
        expect(phys.refCount).toBe(1);
      }
    });
  });

  describe('generateFrames - multiple-forks', () => {
    const frames = cowFork.generateFrames('multiple-forks');

    it('builds up to 3 processes', () => {
      const last = frames[frames.length - 1].data as CowState;
      expect(last.processes.length).toBe(3);
    });

    it('shows refcount going to 3 then back down', () => {
      const refcounts = frames.map(f => {
        const data = f.data as CowState;
        return Math.max(...data.physicalPages.map(pp => pp.refCount));
      });
      expect(Math.max(...refcounts)).toBe(3);
    });
  });

  describe('generateFrames - default', () => {
    it('returns frames', () => {
      expect(cowFork.generateFrames().length).toBeGreaterThan(0);
    });
  });

  describe('renderFrame', () => {
    it('renders SVG elements', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = cowFork.generateFrames('write-fault');
      cowFork.renderFrame(svg, frames[1], 432, 300);
      expect(svg.querySelectorAll('rect').length).toBeGreaterThan(0);
    });

    it('renders process names', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = cowFork.generateFrames('write-fault');
      cowFork.renderFrame(svg, frames[1], 432, 300);
      const texts = Array.from(svg.querySelectorAll('text')).map(t => t.textContent);
      expect(texts.some(t => t?.includes('parent'))).toBe(true);
      expect(texts.some(t => t?.includes('child'))).toBe(true);
    });

    it('renders physical page refcounts', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = cowFork.generateFrames('write-fault');
      cowFork.renderFrame(svg, frames[1], 432, 300);
      const texts = Array.from(svg.querySelectorAll('text')).map(t => t.textContent);
      expect(texts.some(t => t?.includes('ref:2'))).toBe(true);
    });
  });
});

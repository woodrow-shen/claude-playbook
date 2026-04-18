import { describe, it, expect } from 'vitest';
import pageTableWalk from './page-table-walk.js';
import type { PageWalkState } from './page-table-walk.js';

describe('Page Table Walk', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(pageTableWalk.config.id).toBe('page-table-walk');
      expect(pageTableWalk.config.skillName).toBe('page-allocation');
    });

    it('has correct title', () => {
      expect(pageTableWalk.config.title).toBe('4-Level Page Table Walk');
    });
  });

  describe('getScenarios', () => {
    it('returns 3 scenarios', () => {
      expect(pageTableWalk.getScenarios().length).toBe(3);
    });

    it('each scenario has id and label', () => {
      for (const s of pageTableWalk.getScenarios()) {
        expect(s.id).toBeTruthy();
        expect(s.label).toBeTruthy();
      }
    });

    it('includes tlb-miss-walk scenario', () => {
      expect(pageTableWalk.getScenarios().some(s => s.id === 'tlb-miss-walk')).toBe(true);
    });

    it('includes demand-paging-fault scenario', () => {
      expect(pageTableWalk.getScenarios().some(s => s.id === 'demand-paging-fault')).toBe(true);
    });

    it('includes cow-write-fault scenario', () => {
      expect(pageTableWalk.getScenarios().some(s => s.id === 'cow-write-fault')).toBe(true);
    });
  });

  describe('generateFrames - tlb-miss-walk (default)', () => {
    const frames = pageTableWalk.generateFrames('tlb-miss-walk');

    it('generates non-empty array', () => {
      expect(frames.length).toBeGreaterThan(0);
    });

    it('has at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('first frame has step 0', () => {
      expect(frames[0].step).toBe(0);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('each frame has required fields', () => {
      for (const f of frames) {
        expect(f.step).toBeGreaterThanOrEqual(0);
        expect(f.label).toBeTruthy();
        expect(f.description).toBeTruthy();
        expect(Array.isArray(f.highlights)).toBe(true);
        expect(f.data).toBeDefined();
      }
    });

    it('data includes virtualAddress and addressBits', () => {
      const data = frames[0].data as PageWalkState;
      expect(data.virtualAddress).toBeTruthy();
      expect(data.addressBits).toBeDefined();
      expect(typeof data.addressBits.pgd).toBe('number');
      expect(typeof data.addressBits.pud).toBe('number');
      expect(typeof data.addressBits.pmd).toBe('number');
      expect(typeof data.addressBits.pte).toBe('number');
      expect(typeof data.addressBits.offset).toBe('number');
    });

    it('has 4 level transitions (PGD->PUD->PMD->PTE)', () => {
      const levelNames = ['PGD', 'PUD', 'PMD', 'PTE'];
      for (const name of levelNames) {
        const hasLevel = frames.some(f => {
          const data = f.data as PageWalkState;
          return data.levels.some(l => l.name === name && l.activeIndex >= 0);
        });
        expect(hasLevel).toBe(true);
      }
    });

    it('ends with phase complete and physical page resolved', () => {
      const last = frames[frames.length - 1].data as PageWalkState;
      expect(last.phase).toBe('complete');
      expect(last.physicalPage).not.toBeNull();
    });

    it('has faultType none throughout', () => {
      for (const f of frames) {
        const data = f.data as PageWalkState;
        expect(data.faultType).toBe('none');
      }
    });

    it('data includes cr3 register', () => {
      const data = frames[0].data as PageWalkState;
      expect(typeof data.cr3).toBe('number');
    });
  });

  describe('generateFrames - demand-paging-fault', () => {
    const frames = pageTableWalk.generateFrames('demand-paging-fault');

    it('generates non-empty array', () => {
      expect(frames.length).toBeGreaterThan(0);
    });

    it('has at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('first frame has step 0', () => {
      expect(frames[0].step).toBe(0);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('has a frame with faultType not-present', () => {
      const hasFault = frames.some(f => {
        const data = f.data as PageWalkState;
        return data.faultType === 'not-present';
      });
      expect(hasFault).toBe(true);
    });

    it('has a frame with phase faulting', () => {
      const hasFaulting = frames.some(f => {
        const data = f.data as PageWalkState;
        return data.phase === 'faulting';
      });
      expect(hasFaulting).toBe(true);
    });

    it('has a frame with phase allocating', () => {
      const hasAllocating = frames.some(f => {
        const data = f.data as PageWalkState;
        return data.phase === 'allocating';
      });
      expect(hasAllocating).toBe(true);
    });

    it('ends with phase complete after fault resolution', () => {
      const last = frames[frames.length - 1].data as PageWalkState;
      expect(last.phase).toBe('complete');
      expect(last.physicalPage).not.toBeNull();
    });
  });

  describe('generateFrames - cow-write-fault', () => {
    const frames = pageTableWalk.generateFrames('cow-write-fault');

    it('generates non-empty array', () => {
      expect(frames.length).toBeGreaterThan(0);
    });

    it('has at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('first frame has step 0', () => {
      expect(frames[0].step).toBe(0);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('has a frame with faultType write-protect', () => {
      const hasFault = frames.some(f => {
        const data = f.data as PageWalkState;
        return data.faultType === 'write-protect';
      });
      expect(hasFault).toBe(true);
    });

    it('ends with phase complete and writable PTE', () => {
      const last = frames[frames.length - 1].data as PageWalkState;
      expect(last.phase).toBe('complete');
      const pteLevel = last.levels.find(l => l.name === 'PTE');
      expect(pteLevel).toBeDefined();
      const activeEntry = pteLevel!.entries[pteLevel!.activeIndex];
      expect(activeEntry.writable).toBe(true);
    });
  });

  describe('generateFrames - default', () => {
    it('returns frames for default scenario (no argument)', () => {
      const frames = pageTableWalk.generateFrames();
      expect(frames.length).toBeGreaterThan(0);
    });
  });

  describe('renderFrame', () => {
    it('renders SVG elements into container', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = pageTableWalk.generateFrames('tlb-miss-walk');
      pageTableWalk.renderFrame(svg, frames[0], 900, 480);
      expect(svg.childNodes.length).toBeGreaterThan(0);
    });

    it('renders rect elements for page table entries', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = pageTableWalk.generateFrames('tlb-miss-walk');
      pageTableWalk.renderFrame(svg, frames[3], 900, 480);
      expect(svg.querySelectorAll('rect').length).toBeGreaterThan(0);
    });

    it('renders text elements for labels', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = pageTableWalk.generateFrames('tlb-miss-walk');
      pageTableWalk.renderFrame(svg, frames[0], 900, 480);
      expect(svg.querySelectorAll('text').length).toBeGreaterThan(0);
    });

    it('renders different content for different frames', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = pageTableWalk.generateFrames('tlb-miss-walk');
      pageTableWalk.renderFrame(svg, frames[0], 900, 480);
      const html1 = svg.innerHTML;
      pageTableWalk.renderFrame(svg, frames[frames.length - 1], 900, 480);
      const html2 = svg.innerHTML;
      expect(html1).not.toBe(html2);
    });

    it('renders virtual address bit fields', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = pageTableWalk.generateFrames('tlb-miss-walk');
      pageTableWalk.renderFrame(svg, frames[0], 900, 480);
      const texts = Array.from(svg.querySelectorAll('text')).map(t => t.textContent);
      expect(texts.some(t => t?.includes('PGD'))).toBe(true);
    });

    it('renders CR3 label', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = pageTableWalk.generateFrames('tlb-miss-walk');
      pageTableWalk.renderFrame(svg, frames[0], 900, 480);
      const texts = Array.from(svg.querySelectorAll('text')).map(t => t.textContent);
      expect(texts.some(t => t?.includes('CR3'))).toBe(true);
    });
  });
});

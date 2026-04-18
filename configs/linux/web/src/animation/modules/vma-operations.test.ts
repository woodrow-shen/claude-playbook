import { describe, it, expect } from 'vitest';
import vmaOperations from './vma-operations.js';

interface VmaState {
  currentFunction: string;
  srcRef: string;
  vmas: Array<{
    id: string;
    label: string;
    start: string;
    end: string;
    flags: string;
    state: 'existing' | 'new' | 'merged' | 'split' | 'removed' | 'modified';
  }>;
  description: string;
  vmaFlagsType?: 'legacy' | 'typed';
  unmapDesc?: {
    start: string;
    end: string;
    mm: string;
    uf?: string;
  };
}

describe('VmaOperations', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(vmaOperations.config.id).toBe('vma-operations');
      expect(vmaOperations.config.skillName).toBe('virtual-memory-areas');
    });

    it('has a display title', () => {
      expect(vmaOperations.config.title).toBeTruthy();
    });
  });

  describe('getScenarios', () => {
    const scenarios = vmaOperations.getScenarios();

    it('returns at least 4 scenarios', () => {
      expect(scenarios.length).toBeGreaterThanOrEqual(4);
    });

    it('includes required scenario IDs', () => {
      const ids = scenarios.map(s => s.id);
      expect(ids).toContain('mmap-anonymous');
      expect(ids).toContain('vma-merge-and-split');
      expect(ids).toContain('munmap-path');
      expect(ids).toContain('vma-flags-unmap-desc');
    });

    it('each scenario has id and label', () => {
      for (const s of scenarios) {
        expect(s.id).toBeTruthy();
        expect(s.label).toBeTruthy();
      }
    });
  });

  describe('generateFrames - mmap-anonymous (default)', () => {
    const frames = vmaOperations.generateFrames('mmap-anonymous');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
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
      }
    });

    it('each frame has typed VmaState data with srcRef', () => {
      for (const f of frames) {
        const data = f.data as VmaState;
        expect(data.currentFunction).toBeTruthy();
        expect(data.srcRef).toBeTruthy();
        expect(Array.isArray(data.vmas)).toBe(true);
      }
    });

    it('descriptions reference real kernel functions', () => {
      const kernelFunctions = [
        'do_mmap',
        'mmap_region',
        '__mmap_region',
        'vma_merge_new_range',
        '__mmap_new_vma',
      ];
      for (const fn of kernelFunctions) {
        const found = frames.some(f => f.description.includes(fn));
        expect(found, `Expected description referencing ${fn}`).toBe(true);
      }
    });

    it('descriptions reference real kernel file paths', () => {
      const filePaths = ['mm/mmap.c', 'mm/vma.c'];
      for (const path of filePaths) {
        const found = frames.some(f => f.description.includes(path));
        expect(found, `Expected description referencing ${path}`).toBe(true);
      }
    });

    it('first frame starts at do_mmap', () => {
      const data = frames[0].data as VmaState;
      expect(data.currentFunction).toBe('do_mmap');
      expect(data.srcRef).toContain('mm/mmap.c');
    });

    it('default scenario matches mmap-anonymous', () => {
      const defaultFrames = vmaOperations.generateFrames();
      const explicitFrames = vmaOperations.generateFrames('mmap-anonymous');
      expect(defaultFrames.length).toBe(explicitFrames.length);
    });
  });

  describe('generateFrames - vma-merge-and-split', () => {
    const frames = vmaOperations.generateFrames('vma-merge-and-split');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('each frame has typed VmaState data with srcRef', () => {
      for (const f of frames) {
        const data = f.data as VmaState;
        expect(data.srcRef).toBeTruthy();
        expect(data.currentFunction).toBeTruthy();
        expect(Array.isArray(data.vmas)).toBe(true);
      }
    });

    it('covers merge and split functions', () => {
      const expectedFunctions = [
        'vma_merge_new_range',
        'vma_expand',
        '__split_vma',
        'mprotect_fixup',
      ];
      for (const fn of expectedFunctions) {
        const found = frames.some(f => {
          const data = f.data as VmaState;
          return data.currentFunction === fn || f.description.includes(fn);
        });
        expect(found, `Expected frame referencing ${fn}`).toBe(true);
      }
    });

    it('descriptions reference mm/vma.c', () => {
      const found = frames.some(f => f.description.includes('mm/vma.c'));
      expect(found).toBe(true);
    });

    it('shows VMA state transitions including merged and split', () => {
      const allStates = new Set<string>();
      for (const f of frames) {
        const data = f.data as VmaState;
        for (const vma of data.vmas) {
          allStates.add(vma.state);
        }
      }
      expect(allStates.has('merged')).toBe(true);
      expect(allStates.has('split')).toBe(true);
    });
  });

  describe('generateFrames - munmap-path', () => {
    const frames = vmaOperations.generateFrames('munmap-path');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('each frame has typed VmaState data with srcRef', () => {
      for (const f of frames) {
        const data = f.data as VmaState;
        expect(data.srcRef).toBeTruthy();
        expect(data.currentFunction).toBeTruthy();
        expect(Array.isArray(data.vmas)).toBe(true);
      }
    });

    it('covers munmap path functions', () => {
      const expectedFunctions = [
        'do_munmap',
        'do_vmi_munmap',
        'vms_gather_munmap_vmas',
        'vms_complete_munmap_vmas',
      ];
      for (const fn of expectedFunctions) {
        const found = frames.some(f => {
          const data = f.data as VmaState;
          return data.currentFunction === fn || f.description.includes(fn);
        });
        expect(found, `Expected frame referencing ${fn}`).toBe(true);
      }
    });

    it('shows VMA removal', () => {
      const lastFrameData = frames[frames.length - 1].data as VmaState;
      const hasRemoved = frames.some(f => {
        const data = f.data as VmaState;
        return data.vmas.some(v => v.state === 'removed');
      });
      expect(hasRemoved).toBe(true);
    });

    it('references mm/mmap.c and mm/vma.c', () => {
      const foundMmap = frames.some(f => f.description.includes('mm/mmap.c'));
      const foundVma = frames.some(f => f.description.includes('mm/vma.c'));
      expect(foundMmap).toBe(true);
      expect(foundVma).toBe(true);
    });
  });

  describe('generateFrames - vma-flags-unmap-desc (v7.0)', () => {
    const frames = vmaOperations.generateFrames('vma-flags-unmap-desc');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('generates at most 12 frames', () => {
      expect(frames.length).toBeLessThanOrEqual(12);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('each frame has typed VmaState data with srcRef', () => {
      for (const f of frames) {
        const data = f.data as VmaState;
        expect(data.srcRef).toBeTruthy();
        expect(data.currentFunction).toBeTruthy();
        expect(Array.isArray(data.vmas)).toBe(true);
      }
    });

    it('at least one frame marks vmaFlagsType as typed (v7.0)', () => {
      const found = frames.some(f => {
        const data = f.data as VmaState;
        return data.vmaFlagsType === 'typed';
      });
      expect(found).toBe(true);
    });

    it('references vma_flags_t and helper functions', () => {
      const expectedTokens = [
        'vma_flags_t',
        'vma_flags_clear_all',
        'vma_flags_to_legacy',
      ];
      for (const token of expectedTokens) {
        const found = frames.some(f => f.description.includes(token));
        expect(found, `Expected description referencing ${token}`).toBe(true);
      }
    });

    it('references struct unmap_desc and unmap_region', () => {
      const expectedTokens = [
        'struct unmap_desc',
        'unmap_region',
      ];
      for (const token of expectedTokens) {
        const found = frames.some(f => f.description.includes(token));
        expect(found, `Expected description referencing ${token}`).toBe(true);
      }
    });

    it('references verified v7.0 srcRef lines', () => {
      const expectedRefs = [
        'include/linux/mm_types.h:909',
        'include/linux/mm_types.h:1078',
        'include/linux/mm_types.h:1090',
        'mm/vma.c:481',
        'mm/vma.c:1278',
        'mm/mmap.c:1279',
      ];
      for (const ref of expectedRefs) {
        const found = frames.some(f => {
          const data = f.data as VmaState;
          return data.srcRef.includes(ref) || f.description.includes(ref);
        });
        expect(found, `Expected frame referencing ${ref}`).toBe(true);
      }
    });

    it('srcRef format includes a function-style suffix', () => {
      // Each srcRef should end with a function name followed by () or describe
      // a named field/struct to keep the "path:line ident" convention.
      for (const f of frames) {
        const data = f.data as VmaState;
        expect(data.srcRef).toMatch(/:\d+\s+\S+/);
      }
    });

    it('at least one frame populates unmapDesc with start/end/mm', () => {
      const found = frames.some(f => {
        const data = f.data as VmaState;
        return !!data.unmapDesc
          && !!data.unmapDesc.start
          && !!data.unmapDesc.end
          && !!data.unmapDesc.mm;
      });
      expect(found).toBe(true);
    });

    it('shows VMA removal as part of the unmap path', () => {
      const found = frames.some(f => {
        const data = f.data as VmaState;
        return data.vmas.some(v => v.state === 'removed');
      });
      expect(found).toBe(true);
    });

    it('renders without throwing for every frame', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      for (const frame of frames) {
        expect(() => {
          vmaOperations.renderFrame(svg, frame, 432, 400);
        }).not.toThrow();
      }
    });
  });

  describe('renderFrame', () => {
    it('renders SVG elements into container', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = vmaOperations.generateFrames('mmap-anonymous');
      vmaOperations.renderFrame(svg, frames[0], 432, 400);
      expect(svg.querySelectorAll('rect').length).toBeGreaterThan(0);
    });

    it('renders text elements with function names', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = vmaOperations.generateFrames('mmap-anonymous');
      vmaOperations.renderFrame(svg, frames[0], 432, 400);
      const texts = Array.from(svg.querySelectorAll('text')).map(t => t.textContent);
      expect(texts.some(t => t?.includes('do_mmap'))).toBe(true);
    });

    it('renders different content for different frames', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = vmaOperations.generateFrames('mmap-anonymous');
      vmaOperations.renderFrame(svg, frames[0], 432, 400);
      const html1 = svg.innerHTML;
      vmaOperations.renderFrame(svg, frames[frames.length - 1], 432, 400);
      const html2 = svg.innerHTML;
      expect(html1).not.toBe(html2);
    });

    it('applies highlight class to active VMA', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = vmaOperations.generateFrames('mmap-anonymous');
      const frameWithHighlights = frames.find(f => f.highlights.length > 0);
      if (frameWithHighlights) {
        vmaOperations.renderFrame(svg, frameWithHighlights, 432, 400);
        expect(svg.querySelectorAll('.anim-highlight').length).toBeGreaterThan(0);
      }
    });

    it('uses semantic CSS classes', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = vmaOperations.generateFrames('mmap-anonymous');
      vmaOperations.renderFrame(svg, frames[0], 432, 400);
      expect(svg.querySelectorAll('.anim-vma').length).toBeGreaterThan(0);
      expect(svg.querySelectorAll('.anim-function').length).toBeGreaterThan(0);
    });

    it('renders all scenarios without errors', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      for (const scenario of vmaOperations.getScenarios()) {
        const frames = vmaOperations.generateFrames(scenario.id);
        for (const frame of frames) {
          expect(() => {
            vmaOperations.renderFrame(svg, frame, 432, 400);
          }).not.toThrow();
        }
      }
    });

    it('renders source reference labels', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = vmaOperations.generateFrames('mmap-anonymous');
      vmaOperations.renderFrame(svg, frames[0], 432, 400);
      const texts = Array.from(svg.querySelectorAll('.anim-srcref')).map(t => t.textContent);
      expect(texts.some(t => t?.includes('mm/'))).toBe(true);
    });
  });
});

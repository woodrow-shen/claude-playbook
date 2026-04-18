import { describe, it, expect } from 'vitest';
import slabAllocator from './slab-allocator.js';

describe('SlabAllocator', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(slabAllocator.config.id).toBe('slab-allocator');
      expect(slabAllocator.config.title).toBe('SLUB Slab Allocator');
      expect(slabAllocator.config.skillName).toBe('slab-allocator');
    });
  });

  describe('getScenarios', () => {
    it('returns exactly 3 scenarios', () => {
      expect(slabAllocator.getScenarios().length).toBe(3);
    });

    it('each scenario has id and label', () => {
      for (const s of slabAllocator.getScenarios()) {
        expect(s.id).toBeTruthy();
        expect(s.label).toBeTruthy();
      }
    });

    it('includes fast-path-alloc, slow-path-new-slab, and free-and-reclaim', () => {
      const ids = slabAllocator.getScenarios().map(s => s.id);
      expect(ids).toContain('fast-path-alloc');
      expect(ids).toContain('slow-path-new-slab');
      expect(ids).toContain('free-and-reclaim');
    });
  });

  describe('generateFrames - common properties', () => {
    for (const scenarioId of ['fast-path-alloc', 'slow-path-new-slab', 'free-and-reclaim']) {
      describe(`scenario: ${scenarioId}`, () => {
        const frames = slabAllocator.generateFrames(scenarioId);

        it('returns at least 5 frames', () => {
          expect(frames.length).toBeGreaterThanOrEqual(5);
        });

        it('first frame has step 0', () => {
          expect(frames[0].step).toBe(0);
        });

        it('last frame step matches length - 1', () => {
          expect(frames[frames.length - 1].step).toBe(frames.length - 1);
        });

        it('steps are sequential', () => {
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

        it('data has expected slab state fields', () => {
          for (const f of frames) {
            const data = f.data as Record<string, unknown>;
            expect(data).toHaveProperty('objects');
            expect(data).toHaveProperty('freelist');
            expect(data).toHaveProperty('slabs');
          }
        });
      });
    }
  });

  describe('generateFrames - fast-path-alloc', () => {
    const frames = slabAllocator.generateFrames('fast-path-alloc');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('shows objects being allocated from freelist', () => {
      const hasAllocation = frames.some(f => {
        const data = f.data as { objects: { state: string }[] };
        return data.objects.some(o => o.state === 'allocated');
      });
      expect(hasAllocation).toBe(true);
    });

    it('descriptions reference kernel function names', () => {
      const allDescriptions = frames.map(f => f.description).join(' ');
      expect(allDescriptions).toMatch(/kmem_cache_alloc|___slab_alloc|freelist|per-CPU/i);
    });

    it('starts with objects on the freelist', () => {
      const data = frames[0].data as { freelist: number[] };
      expect(data.freelist.length).toBeGreaterThan(0);
    });
  });

  describe('generateFrames - slow-path-new-slab', () => {
    const frames = slabAllocator.generateFrames('slow-path-new-slab');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('includes buddy allocator page allocation', () => {
      const allDescriptions = frames.map(f => f.description).join(' ');
      expect(allDescriptions).toMatch(/buddy|alloc_pages|allocate_slab|new slab/i);
    });

    it('shows a new slab being created', () => {
      const hasNewSlab = frames.some(f => {
        const data = f.data as { slabs: { state: string }[] };
        return data.slabs.some(s => s.state === 'new' || s.state === 'active');
      });
      expect(hasNewSlab).toBe(true);
    });
  });

  describe('generateFrames - free-and-reclaim', () => {
    const frames = slabAllocator.generateFrames('free-and-reclaim');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('shows objects being freed', () => {
      const hasFree = frames.some(f => f.label.toLowerCase().includes('free'));
      expect(hasFree).toBe(true);
    });

    it('shows slab reclamation back to buddy allocator', () => {
      const allDescriptions = frames.map(f => f.description).join(' ');
      expect(allDescriptions).toMatch(/buddy|reclaim|return.*page|empty slab/i);
    });
  });

  describe('generateFrames - default', () => {
    it('returns frames for default scenario (same as fast-path-alloc)', () => {
      const frames = slabAllocator.generateFrames();
      expect(frames.length).toBeGreaterThan(0);
    });
  });

  describe('renderFrame', () => {
    it('renders SVG elements into container', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = slabAllocator.generateFrames('fast-path-alloc');
      slabAllocator.renderFrame(svg, frames[0], 900, 480);
      expect(svg.querySelectorAll('rect').length).toBeGreaterThan(0);
    });

    it('renders different content for different frames', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = slabAllocator.generateFrames('fast-path-alloc');
      slabAllocator.renderFrame(svg, frames[0], 900, 480);
      const html1 = svg.innerHTML;
      slabAllocator.renderFrame(svg, frames[frames.length - 1], 900, 480);
      const html2 = svg.innerHTML;
      expect(html1).not.toBe(html2);
    });

    it('applies highlight classes to active elements', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = slabAllocator.generateFrames('fast-path-alloc');
      const frameWithHighlights = frames.find(f => f.highlights.length > 0);
      if (frameWithHighlights) {
        slabAllocator.renderFrame(svg, frameWithHighlights, 900, 480);
        expect(svg.querySelectorAll('.anim-highlight').length).toBeGreaterThan(0);
      }
    });

    it('renders title text', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = slabAllocator.generateFrames('fast-path-alloc');
      slabAllocator.renderFrame(svg, frames[0], 900, 480);
      const texts = Array.from(svg.querySelectorAll('text')).map(t => t.textContent);
      expect(texts.some(t => t?.includes('SLUB Slab Allocator'))).toBe(true);
    });

    it('renders per-CPU label', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = slabAllocator.generateFrames('fast-path-alloc');
      slabAllocator.renderFrame(svg, frames[0], 900, 480);
      const texts = Array.from(svg.querySelectorAll('text')).map(t => t.textContent);
      expect(texts.some(t => t?.toLowerCase().includes('cpu'))).toBe(true);
    });
  });
});

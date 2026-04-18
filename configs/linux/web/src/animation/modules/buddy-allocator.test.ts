import { describe, it, expect } from 'vitest';
import buddyAllocator from './buddy-allocator.js';

describe('BuddyAllocator', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(buddyAllocator.config.id).toBe('buddy-allocator');
      expect(buddyAllocator.config.skillName).toBe('page-allocation');
    });
  });

  describe('getScenarios', () => {
    it('returns at least 2 scenarios', () => {
      expect(buddyAllocator.getScenarios().length).toBeGreaterThanOrEqual(2);
    });

    it('each scenario has id and label', () => {
      for (const s of buddyAllocator.getScenarios()) {
        expect(s.id).toBeTruthy();
        expect(s.label).toBeTruthy();
      }
    });

    it('includes the v7.0 pcp-lock-optimization scenario', () => {
      const ids = buddyAllocator.getScenarios().map(s => s.id);
      expect(ids).toContain('pcp-lock-optimization');
    });
  });

  describe('generateFrames - allocate-order-0', () => {
    const frames = buddyAllocator.generateFrames('allocate-order-0');

    it('generates multiple frames', () => {
      expect(frames.length).toBeGreaterThan(3);
    });

    it('first frame starts with all memory free', () => {
      const data = frames[0].data as { blocks: { state: string }[] };
      expect(data.blocks.every(b => b.state === 'free')).toBe(true);
    });

    it('last frame has one allocated block of order 0', () => {
      const data = frames[frames.length - 1].data as { blocks: { state: string; order: number }[] };
      const allocated = data.blocks.filter(b => b.state === 'allocated');
      expect(allocated.length).toBe(1);
      expect(allocated[0].order).toBe(0);
    });

    it('each frame has required fields', () => {
      for (const f of frames) {
        expect(f.step).toBeGreaterThanOrEqual(0);
        expect(f.label).toBeTruthy();
        expect(f.description).toBeTruthy();
        expect(Array.isArray(f.highlights)).toBe(true);
      }
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('intermediate frames show splitting', () => {
      const splittingFrames = frames.filter(f => {
        const data = f.data as { blocks: { state: string }[] };
        return data.blocks.some(b => b.state === 'splitting');
      });
      expect(splittingFrames.length).toBeGreaterThan(0);
    });
  });

  describe('generateFrames - free-and-coalesce', () => {
    const frames = buddyAllocator.generateFrames('free-and-coalesce');

    it('generates multiple frames', () => {
      expect(frames.length).toBeGreaterThan(3);
    });

    it('contains coalescing state at some point', () => {
      const hasCoalescing = frames.some(f => {
        const data = f.data as { blocks: { state: string }[] };
        return data.blocks.some(b => b.state === 'coalescing');
      });
      expect(hasCoalescing).toBe(true);
    });

    it('ends with memory fully free again', () => {
      const data = frames[frames.length - 1].data as { blocks: { state: string }[] };
      expect(data.blocks.every(b => b.state === 'free')).toBe(true);
    });
  });

  describe('generateFrames - pcp-lock-optimization', () => {
    const frames = buddyAllocator.generateFrames('pcp-lock-optimization');

    it('generates between 8 and 12 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
      expect(frames.length).toBeLessThanOrEqual(12);
    });

    it('each frame has required fields and sequential steps', () => {
      frames.forEach((f, i) => {
        expect(f.step).toBe(i);
        expect(f.label).toBeTruthy();
        expect(f.description).toBeTruthy();
        expect(Array.isArray(f.highlights)).toBe(true);
      });
    });

    it('exposes fpiTrylock state once the flag is set', () => {
      const withFlag = frames.filter(f => {
        const d = f.data as { fpiTrylock?: boolean };
        return d.fpiTrylock === true;
      });
      expect(withFlag.length).toBeGreaterThan(0);
    });

    it('mentions FPI_TRYLOCK in at least one description', () => {
      const mentions = frames.filter(f => f.description.includes('FPI_TRYLOCK'));
      expect(mentions.length).toBeGreaterThan(0);
    });

    it('describes IRQ-save removal', () => {
      const matches = frames.filter(f => /IRQ/.test(f.description));
      expect(matches.length).toBeGreaterThan(0);
    });

    it('references pcp_spin_trylock and pcp_spin_unlock in srcRefs', () => {
      const srcRefs = frames
        .map(f => (f.data as { srcRef?: string }).srcRef || '')
        .join('\n');
      expect(srcRefs).toContain('pcp_spin_trylock');
      expect(srcRefs).toContain('pcp_spin_unlock');
    });

    it('references the v7.0 free_one_page FPI_TRYLOCK branches at lines 1550 and 1561', () => {
      const srcRefs = frames
        .map(f => (f.data as { srcRef?: string }).srcRef || '')
        .join('\n');
      expect(srcRefs).toContain('mm/page_alloc.c:1550');
      expect(srcRefs).toContain('mm/page_alloc.c:1561');
    });

    it('shows the allocated page being released by the end', () => {
      const last = frames[frames.length - 1].data as { blocks: { state: string }[]; pcpLocked?: boolean };
      expect(last.blocks.every(b => b.state === 'free')).toBe(true);
      expect(last.pcpLocked).toBe(false);
    });
  });

  describe('generateFrames - default', () => {
    it('returns frames for default scenario', () => {
      const frames = buddyAllocator.generateFrames();
      expect(frames.length).toBeGreaterThan(0);
    });
  });

  describe('renderFrame', () => {
    it('renders SVG elements into container', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = buddyAllocator.generateFrames('allocate-order-0');
      buddyAllocator.renderFrame(svg, frames[0], 432, 300);
      expect(svg.querySelectorAll('rect').length).toBeGreaterThan(0);
    });

    it('renders different content for different frames', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = buddyAllocator.generateFrames('allocate-order-0');
      buddyAllocator.renderFrame(svg, frames[0], 432, 300);
      const html1 = svg.innerHTML;
      buddyAllocator.renderFrame(svg, frames[frames.length - 1], 432, 300);
      const html2 = svg.innerHTML;
      expect(html1).not.toBe(html2);
    });

    it('applies highlight classes to active blocks', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = buddyAllocator.generateFrames('allocate-order-0');
      // Find a frame with highlights
      const frameWithHighlights = frames.find(f => f.highlights.length > 0);
      if (frameWithHighlights) {
        buddyAllocator.renderFrame(svg, frameWithHighlights, 432, 300);
        expect(svg.querySelectorAll('.anim-highlight').length).toBeGreaterThan(0);
      }
    });

    it('renders free list labels', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = buddyAllocator.generateFrames('allocate-order-0');
      buddyAllocator.renderFrame(svg, frames[0], 432, 300);
      const texts = Array.from(svg.querySelectorAll('text')).map(t => t.textContent);
      expect(texts.some(t => t?.includes('Order'))).toBe(true);
    });
  });
});

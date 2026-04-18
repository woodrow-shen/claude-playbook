import { describe, it, expect } from 'vitest';
import pageReclaim from './page-reclaim.js';

interface PageInfo {
  id: string;
  type: 'anon' | 'file' | 'unevictable';
  state: 'active' | 'inactive' | 'reclaiming' | 'freed' | 'dirty' | 'writeback';
  accessed: boolean;
  dirty: boolean;
  mapped: boolean;
  owner: string;
}

interface LruList {
  name: string;
  pages: PageInfo[];
}

interface WatermarkState {
  freePages: number;
  minWatermark: number;
  lowWatermark: number;
  highWatermark: number;
  totalPages: number;
}

interface ReclaimState {
  lruLists: LruList[];
  watermarks: WatermarkState;
  kswapdState: 'sleeping' | 'running' | 'done';
  directReclaim: boolean;
  oomTriggered: boolean;
  oomVictim: string | null;
  phase: string;
  scanCount: number;
  reclaimedCount: number;
  folioSize?: number;
  ptesToFlush?: number;
  tlbFlushes?: number;
  batchMode?: boolean;
}

describe('PageReclaim', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(pageReclaim.config.id).toBe('page-reclaim');
      expect(pageReclaim.config.skillName).toBe('page-reclaim-and-swap');
    });

    it('has a title', () => {
      expect(pageReclaim.config.title).toBe('Page Reclaim & LRU');
    });
  });

  describe('getScenarios', () => {
    it('returns exactly 4 scenarios', () => {
      expect(pageReclaim.getScenarios()).toHaveLength(4);
    });

    it('each scenario has id and label', () => {
      for (const s of pageReclaim.getScenarios()) {
        expect(s.id).toBeTruthy();
        expect(s.label).toBeTruthy();
      }
    });

    it('includes watermark-reclaim, lru-aging, oom-kill, and batched-large-folio-unmap scenarios', () => {
      const ids = pageReclaim.getScenarios().map(s => s.id);
      expect(ids).toContain('watermark-reclaim');
      expect(ids).toContain('lru-aging');
      expect(ids).toContain('oom-kill');
      expect(ids).toContain('batched-large-folio-unmap');
    });

    it('batched-large-folio-unmap scenario is labelled with v7.0 tag', () => {
      const s = pageReclaim.getScenarios().find(
        x => x.id === 'batched-large-folio-unmap',
      );
      expect(s).toBeDefined();
      expect(s!.label).toMatch(/v7\.0/);
    });
  });

  describe('generateFrames - common', () => {
    for (const scenarioId of [
      'watermark-reclaim',
      'lru-aging',
      'oom-kill',
      'batched-large-folio-unmap',
    ]) {
      describe(`scenario: ${scenarioId}`, () => {
        const frames = pageReclaim.generateFrames(scenarioId);

        it('returns non-empty array', () => {
          expect(frames.length).toBeGreaterThan(0);
        });

        it('first frame has step=0', () => {
          expect(frames[0].step).toBe(0);
        });

        it('has sequential step numbers', () => {
          frames.forEach((f, i) => expect(f.step).toBe(i));
        });

        it('has at least 10 frames', () => {
          expect(frames.length).toBeGreaterThanOrEqual(10);
        });

        it('each frame has required fields', () => {
          for (const f of frames) {
            expect(f.step).toBeGreaterThanOrEqual(0);
            expect(f.label).toBeTruthy();
            expect(f.description).toBeTruthy();
            expect(Array.isArray(f.highlights)).toBe(true);
          }
        });

        it('each frame data has lruLists, watermarks, and phase', () => {
          for (const f of frames) {
            const data = f.data as ReclaimState;
            expect(Array.isArray(data.lruLists)).toBe(true);
            expect(data.watermarks).toBeDefined();
            expect(data.watermarks.minWatermark).toBeDefined();
            expect(data.watermarks.lowWatermark).toBeDefined();
            expect(data.watermarks.highWatermark).toBeDefined();
            expect(typeof data.phase).toBe('string');
          }
        });
      });
    }
  });

  describe('generateFrames - default', () => {
    it('returns frames for default scenario (watermark-reclaim)', () => {
      const frames = pageReclaim.generateFrames();
      expect(frames.length).toBeGreaterThan(0);
      // Default should be watermark-reclaim
      const data = frames[0].data as ReclaimState;
      expect(data.watermarks).toBeDefined();
    });
  });

  describe('generateFrames - watermark-reclaim', () => {
    const frames = pageReclaim.generateFrames('watermark-reclaim');

    it('kswapd starts sleeping', () => {
      const data = frames[0].data as ReclaimState;
      expect(data.kswapdState).toBe('sleeping');
    });

    it('kswapd transitions to running at some point', () => {
      const hasRunning = frames.some(f => {
        const data = f.data as ReclaimState;
        return data.kswapdState === 'running';
      });
      expect(hasRunning).toBe(true);
    });

    it('watermarks have min < low < high', () => {
      const data = frames[0].data as ReclaimState;
      const wm = data.watermarks;
      expect(wm.minWatermark).toBeLessThan(wm.lowWatermark);
      expect(wm.lowWatermark).toBeLessThan(wm.highWatermark);
    });

    it('free pages decrease then increase after reclaim', () => {
      const freePagesCounts = frames.map(f => (f.data as ReclaimState).watermarks.freePages);
      // Should see a decrease then increase pattern
      const minFree = Math.min(...freePagesCounts);
      const lastFree = freePagesCounts[freePagesCounts.length - 1];
      expect(lastFree).toBeGreaterThan(minFree);
    });
  });

  describe('generateFrames - lru-aging', () => {
    const frames = pageReclaim.generateFrames('lru-aging');

    it('has pages that move between active and inactive states', () => {
      const hasActive = frames.some(f => {
        const data = f.data as ReclaimState;
        return data.lruLists.some(l =>
          l.name.includes('active') && !l.name.includes('inactive') && l.pages.length > 0
        );
      });
      const hasInactive = frames.some(f => {
        const data = f.data as ReclaimState;
        return data.lruLists.some(l =>
          l.name.includes('inactive') && l.pages.length > 0
        );
      });
      expect(hasActive).toBe(true);
      expect(hasInactive).toBe(true);
    });

    it('some pages have accessed=true at some point', () => {
      const hasAccessed = frames.some(f => {
        const data = f.data as ReclaimState;
        return data.lruLists.some(l => l.pages.some(p => p.accessed));
      });
      expect(hasAccessed).toBe(true);
    });

    it('shows pages being reclaimed eventually', () => {
      const hasReclaimed = frames.some(f => {
        const data = f.data as ReclaimState;
        return data.lruLists.some(l => l.pages.some(p => p.state === 'freed'));
      });
      expect(hasReclaimed).toBe(true);
    });
  });

  describe('generateFrames - oom-kill', () => {
    const frames = pageReclaim.generateFrames('oom-kill');

    it('has frame with oomTriggered=true', () => {
      const hasOom = frames.some(f => {
        const data = f.data as ReclaimState;
        return data.oomTriggered === true;
      });
      expect(hasOom).toBe(true);
    });

    it('has frame with oomVictim set', () => {
      const hasVictim = frames.some(f => {
        const data = f.data as ReclaimState;
        return data.oomVictim !== null && data.oomVictim !== '';
      });
      expect(hasVictim).toBe(true);
    });

    it('has directReclaim=true at some point', () => {
      const hasDirect = frames.some(f => {
        const data = f.data as ReclaimState;
        return data.directReclaim === true;
      });
      expect(hasDirect).toBe(true);
    });

    it('reclaimed count increases after OOM kill', () => {
      const oomFrame = frames.findIndex(f => (f.data as ReclaimState).oomTriggered);
      expect(oomFrame).toBeGreaterThan(-1);
      // Frames after OOM should show reclaim happening
      const laterFrames = frames.slice(oomFrame);
      const hasReclaimed = laterFrames.some(f => (f.data as ReclaimState).reclaimedCount > 0);
      expect(hasReclaimed).toBe(true);
    });
  });

  describe('generateFrames - batched-large-folio-unmap (v7.0)', () => {
    const frames = pageReclaim.generateFrames('batched-large-folio-unmap');

    it('has between 8 and 12 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
      expect(frames.length).toBeLessThanOrEqual(12);
    });

    it('first frame describes a 16-page large folio', () => {
      const data = frames[0].data as ReclaimState;
      expect(data.folioSize).toBe(16);
    });

    it('includes a frame that contrasts pre-v7.0 per-page unmap', () => {
      const hasContrast = frames.some(f =>
        /pre-?v7|per-page|per-subpage|before commit/i.test(f.description) ||
        /pre-?v7|per-page|per-subpage/i.test(f.label),
      );
      expect(hasContrast).toBe(true);
    });

    it('includes a frame that shows v7.0 batched behavior', () => {
      const hasBatch = frames.some(f => {
        const data = f.data as ReclaimState;
        return data.batchMode === true;
      });
      expect(hasBatch).toBe(true);
    });

    it('references try_to_unmap in some frame srcRef or description', () => {
      const hasTTU = frames.some(f =>
        /try_to_unmap\b/.test(f.description) ||
        /try_to_unmap\b/.test(f.label),
      );
      expect(hasTTU).toBe(true);
    });

    it('references try_to_unmap_one (the per-VMA rmap walk callback)', () => {
      const hasOne = frames.some(f =>
        /try_to_unmap_one/.test(f.description),
      );
      expect(hasOne).toBe(true);
    });

    it('shows a TLB flush happening (tlbFlushes transitions to >=1)', () => {
      const anyFlush = frames.some(f => {
        const data = f.data as ReclaimState;
        return (data.tlbFlushes ?? 0) >= 1;
      });
      expect(anyFlush).toBe(true);
    });

    it('reclaims at least 16 pages by the end (the large folio)', () => {
      const last = frames[frames.length - 1].data as ReclaimState;
      expect(last.reclaimedCount).toBeGreaterThanOrEqual(16);
    });

    it('starts with kswapd running (reclaim context)', () => {
      const data = frames[0].data as ReclaimState;
      expect(data.kswapdState).toBe('running');
    });

    it('free pages increase by the end', () => {
      const first = frames[0].data as ReclaimState;
      const last = frames[frames.length - 1].data as ReclaimState;
      expect(last.watermarks.freePages).toBeGreaterThan(first.watermarks.freePages);
    });
  });

  describe('renderFrame', () => {
    it('renders SVG elements into container', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = pageReclaim.generateFrames('watermark-reclaim');
      pageReclaim.renderFrame(svg, frames[0], 900, 480);
      expect(svg.querySelectorAll('rect').length).toBeGreaterThan(0);
    });

    it('renders different content for different frames', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = pageReclaim.generateFrames('watermark-reclaim');
      pageReclaim.renderFrame(svg, frames[0], 900, 480);
      const html1 = svg.innerHTML;
      pageReclaim.renderFrame(svg, frames[frames.length - 1], 900, 480);
      const html2 = svg.innerHTML;
      expect(html1).not.toBe(html2);
    });

    it('renders text elements for labels', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = pageReclaim.generateFrames('watermark-reclaim');
      pageReclaim.renderFrame(svg, frames[0], 900, 480);
      const texts = Array.from(svg.querySelectorAll('text')).map(t => t.textContent);
      expect(texts.length).toBeGreaterThan(0);
    });

    it('applies highlight classes', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = pageReclaim.generateFrames('watermark-reclaim');
      const frameWithHighlights = frames.find(f => f.highlights.length > 0);
      if (frameWithHighlights) {
        pageReclaim.renderFrame(svg, frameWithHighlights, 900, 480);
        expect(svg.querySelectorAll('.anim-highlight').length).toBeGreaterThan(0);
      }
    });

    it('renders watermark bar with marker lines', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = pageReclaim.generateFrames('watermark-reclaim');
      pageReclaim.renderFrame(svg, frames[0], 900, 480);
      expect(svg.querySelectorAll('line').length).toBeGreaterThan(0);
    });

    it('renders OOM scenario elements', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = pageReclaim.generateFrames('oom-kill');
      const oomFrame = frames.find(f => (f.data as ReclaimState).oomTriggered);
      if (oomFrame) {
        pageReclaim.renderFrame(svg, oomFrame, 900, 480);
        const texts = Array.from(svg.querySelectorAll('text')).map(t => t.textContent || '');
        const hasOomText = texts.some(t => t.includes('OOM'));
        expect(hasOomText).toBe(true);
      }
    });
  });
});

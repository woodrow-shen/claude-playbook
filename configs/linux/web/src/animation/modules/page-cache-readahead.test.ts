import { describe, it, expect } from 'vitest';
import pageCacheReadahead from './page-cache-readahead.js';
import type { PageCacheReadaheadState } from './page-cache-readahead.js';

describe('Page Cache and Readahead', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(pageCacheReadahead.config.id).toBe('page-cache-readahead');
      expect(pageCacheReadahead.config.skillName).toBe('page-cache-and-readahead');
    });

    it('has a descriptive title', () => {
      expect(pageCacheReadahead.config.title).toBeTruthy();
    });
  });

  describe('getScenarios', () => {
    it('returns 3 scenarios', () => {
      expect(pageCacheReadahead.getScenarios().length).toBe(3);
    });

    it('each scenario has id and label', () => {
      for (const s of pageCacheReadahead.getScenarios()) {
        expect(s.id).toBeTruthy();
        expect(s.label).toBeTruthy();
      }
    });

    it('includes page-cache-hit scenario', () => {
      expect(pageCacheReadahead.getScenarios().some(s => s.id === 'page-cache-hit')).toBe(true);
    });

    it('includes readahead-window scenario', () => {
      expect(pageCacheReadahead.getScenarios().some(s => s.id === 'readahead-window')).toBe(true);
    });

    it('includes cache-miss-and-read scenario', () => {
      expect(pageCacheReadahead.getScenarios().some(s => s.id === 'cache-miss-and-read')).toBe(true);
    });
  });

  describe('generateFrames - page-cache-hit (default)', () => {
    const frames = pageCacheReadahead.generateFrames('page-cache-hit');

    it('generates at least 8 frames', () => {
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

    it('every frame has a srcRef', () => {
      for (const f of frames) {
        const data = f.data as PageCacheReadaheadState;
        expect(data.srcRef).toBeTruthy();
      }
    });

    it('mentions filemap_read in a frame description', () => {
      const has = frames.some(f => f.description.includes('filemap_read'));
      expect(has).toBe(true);
    });

    it('mentions filemap_get_pages in a frame description', () => {
      const has = frames.some(f => f.description.includes('filemap_get_pages'));
      expect(has).toBe(true);
    });

    it('mentions filemap_get_read_batch in a frame description', () => {
      const has = frames.some(f => f.description.includes('filemap_get_read_batch'));
      expect(has).toBe(true);
    });

    it('mentions copy_folio_to_iter in a frame description', () => {
      const has = frames.some(f => f.description.includes('copy_folio_to_iter'));
      expect(has).toBe(true);
    });

    it('has cache-hit phase', () => {
      const has = frames.some(f => {
        const data = f.data as PageCacheReadaheadState;
        return data.phase === 'cache-hit';
      });
      expect(has).toBe(true);
    });

    it('ends in completed phase', () => {
      const last = frames[frames.length - 1].data as PageCacheReadaheadState;
      expect(last.phase).toBe('completed');
    });
  });

  describe('generateFrames - readahead-window', () => {
    const frames = pageCacheReadahead.generateFrames('readahead-window');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('first frame has step 0', () => {
      expect(frames[0].step).toBe(0);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('every frame has a srcRef', () => {
      for (const f of frames) {
        const data = f.data as PageCacheReadaheadState;
        expect(data.srcRef).toBeTruthy();
      }
    });

    it('mentions page_cache_sync_ra in a frame description', () => {
      const has = frames.some(f => f.description.includes('page_cache_sync_ra'));
      expect(has).toBe(true);
    });

    it('mentions page_cache_ra_unbounded in a frame description', () => {
      const has = frames.some(f => f.description.includes('page_cache_ra_unbounded'));
      expect(has).toBe(true);
    });

    it('mentions page_cache_async_ra in a frame description', () => {
      const has = frames.some(f => f.description.includes('page_cache_async_ra'));
      expect(has).toBe(true);
    });

    it('has readahead-submit phase', () => {
      const has = frames.some(f => {
        const data = f.data as PageCacheReadaheadState;
        return data.phase === 'readahead-submit';
      });
      expect(has).toBe(true);
    });

    it('shows readahead window growing', () => {
      const windowSizes = frames
        .map(f => (f.data as PageCacheReadaheadState).readaheadWindow?.size)
        .filter((s): s is number => s !== undefined && s > 0);
      expect(windowSizes.length).toBeGreaterThanOrEqual(2);
      // Window should grow over sequential access
      expect(windowSizes[windowSizes.length - 1]).toBeGreaterThan(windowSizes[0]);
    });

    it('ends in completed phase', () => {
      const last = frames[frames.length - 1].data as PageCacheReadaheadState;
      expect(last.phase).toBe('completed');
    });
  });

  describe('generateFrames - cache-miss-and-read', () => {
    const frames = pageCacheReadahead.generateFrames('cache-miss-and-read');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('first frame has step 0', () => {
      expect(frames[0].step).toBe(0);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('every frame has a srcRef', () => {
      for (const f of frames) {
        const data = f.data as PageCacheReadaheadState;
        expect(data.srcRef).toBeTruthy();
      }
    });

    it('mentions filemap_add_folio in a frame description', () => {
      const has = frames.some(f => f.description.includes('filemap_add_folio'));
      expect(has).toBe(true);
    });

    it('mentions filemap_create_folio in a frame description', () => {
      const has = frames.some(f => f.description.includes('filemap_create_folio'));
      expect(has).toBe(true);
    });

    it('mentions read_pages or read_folio in a frame description', () => {
      const has = frames.some(f =>
        f.description.includes('read_pages') || f.description.includes('read_folio')
      );
      expect(has).toBe(true);
    });

    it('has cache-miss phase', () => {
      const has = frames.some(f => {
        const data = f.data as PageCacheReadaheadState;
        return data.phase === 'cache-miss';
      });
      expect(has).toBe(true);
    });

    it('has folio-alloc phase', () => {
      const has = frames.some(f => {
        const data = f.data as PageCacheReadaheadState;
        return data.phase === 'folio-alloc';
      });
      expect(has).toBe(true);
    });

    it('ends in completed phase', () => {
      const last = frames[frames.length - 1].data as PageCacheReadaheadState;
      expect(last.phase).toBe('completed');
    });
  });

  describe('generateFrames - default', () => {
    it('returns frames for default scenario (no argument)', () => {
      const frames = pageCacheReadahead.generateFrames();
      expect(frames.length).toBeGreaterThan(0);
    });

    it('default matches page-cache-hit scenario', () => {
      const defaultFrames = pageCacheReadahead.generateFrames();
      const namedFrames = pageCacheReadahead.generateFrames('page-cache-hit');
      expect(defaultFrames.length).toBe(namedFrames.length);
    });
  });

  describe('real kernel function names in descriptions', () => {
    const allFrames = [
      ...pageCacheReadahead.generateFrames('page-cache-hit'),
      ...pageCacheReadahead.generateFrames('readahead-window'),
      ...pageCacheReadahead.generateFrames('cache-miss-and-read'),
    ];
    const allDescriptions = allFrames.map(f => f.description).join(' ');

    it('references filemap_read', () => {
      expect(allDescriptions).toContain('filemap_read');
    });

    it('references filemap_get_pages', () => {
      expect(allDescriptions).toContain('filemap_get_pages');
    });

    it('references filemap_get_read_batch', () => {
      expect(allDescriptions).toContain('filemap_get_read_batch');
    });

    it('references page_cache_sync_ra', () => {
      expect(allDescriptions).toContain('page_cache_sync_ra');
    });

    it('references page_cache_ra_unbounded', () => {
      expect(allDescriptions).toContain('page_cache_ra_unbounded');
    });

    it('references filemap_add_folio', () => {
      expect(allDescriptions).toContain('filemap_add_folio');
    });

    it('references copy_folio_to_iter', () => {
      expect(allDescriptions).toContain('copy_folio_to_iter');
    });
  });

  describe('renderFrame', () => {
    it('renders SVG elements into container', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = pageCacheReadahead.generateFrames('page-cache-hit');
      pageCacheReadahead.renderFrame(svg, frames[0], 900, 480);
      expect(svg.childNodes.length).toBeGreaterThan(0);
    });

    it('renders rect elements', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = pageCacheReadahead.generateFrames('page-cache-hit');
      pageCacheReadahead.renderFrame(svg, frames[3], 900, 480);
      expect(svg.querySelectorAll('rect').length).toBeGreaterThan(0);
    });

    it('renders text elements', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = pageCacheReadahead.generateFrames('page-cache-hit');
      pageCacheReadahead.renderFrame(svg, frames[0], 900, 480);
      expect(svg.querySelectorAll('text').length).toBeGreaterThan(0);
    });

    it('renders different content for different frames', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = pageCacheReadahead.generateFrames('page-cache-hit');
      pageCacheReadahead.renderFrame(svg, frames[0], 900, 480);
      const html1 = svg.innerHTML;
      pageCacheReadahead.renderFrame(svg, frames[frames.length - 1], 900, 480);
      const html2 = svg.innerHTML;
      expect(html1).not.toBe(html2);
    });
  });
});

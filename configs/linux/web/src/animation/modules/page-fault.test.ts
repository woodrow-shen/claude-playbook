import { describe, it, expect } from 'vitest';
import pageFault from './page-fault.js';
import type { PageFaultState } from './page-fault.js';

describe('Page Fault Handling', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(pageFault.config.id).toBe('page-fault');
      expect(pageFault.config.skillName).toBe('page-fault-handling');
    });

    it('has a descriptive title', () => {
      expect(pageFault.config.title).toBeTruthy();
    });
  });

  describe('getScenarios', () => {
    it('returns 3 scenarios', () => {
      expect(pageFault.getScenarios().length).toBe(3);
    });

    it('each scenario has id and label', () => {
      for (const s of pageFault.getScenarios()) {
        expect(s.id).toBeTruthy();
        expect(s.label).toBeTruthy();
      }
    });

    it('includes anonymous-page-fault scenario', () => {
      expect(pageFault.getScenarios().some(s => s.id === 'anonymous-page-fault')).toBe(true);
    });

    it('includes copy-on-write scenario', () => {
      expect(pageFault.getScenarios().some(s => s.id === 'copy-on-write')).toBe(true);
    });

    it('includes file-backed-fault scenario', () => {
      expect(pageFault.getScenarios().some(s => s.id === 'file-backed-fault')).toBe(true);
    });
  });

  describe('generateFrames - anonymous-page-fault (default)', () => {
    const frames = pageFault.generateFrames('anonymous-page-fault');

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
        const data = f.data as PageFaultState;
        expect(data.srcRef).toBeTruthy();
      }
    });

    it('mentions exc_page_fault in early frame description', () => {
      const hasExcPageFault = frames.some(f =>
        f.description.includes('exc_page_fault')
      );
      expect(hasExcPageFault).toBe(true);
    });

    it('mentions handle_mm_fault in a frame description', () => {
      const has = frames.some(f =>
        f.description.includes('handle_mm_fault')
      );
      expect(has).toBe(true);
    });

    it('mentions do_anonymous_page in a frame description', () => {
      const has = frames.some(f =>
        f.description.includes('do_anonymous_page')
      );
      expect(has).toBe(true);
    });

    it('shows page table walk through all levels', () => {
      const allLevelsPopulated = frames.some(f => {
        const data = f.data as PageFaultState;
        return data.pageTableLevels.pgd !== null &&
               data.pageTableLevels.p4d !== null &&
               data.pageTableLevels.pud !== null &&
               data.pageTableLevels.pmd !== null;
      });
      expect(allLevelsPopulated).toBe(true);
    });

    it('starts in trap phase and ends in resolved phase', () => {
      const first = frames[0].data as PageFaultState;
      const last = frames[frames.length - 1].data as PageFaultState;
      expect(first.phase).toBe('trap');
      expect(last.phase).toBe('resolved');
    });

    it('allocates a physical page by the end', () => {
      const last = frames[frames.length - 1].data as PageFaultState;
      expect(last.physicalPage).not.toBeNull();
    });

    it('has a faultAddress set', () => {
      const first = frames[0].data as PageFaultState;
      expect(first.faultAddress).toBeTruthy();
    });
  });

  describe('generateFrames - copy-on-write', () => {
    const frames = pageFault.generateFrames('copy-on-write');

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
        const data = f.data as PageFaultState;
        expect(data.srcRef).toBeTruthy();
      }
    });

    it('mentions do_wp_page in a frame description', () => {
      const has = frames.some(f =>
        f.description.includes('do_wp_page')
      );
      expect(has).toBe(true);
    });

    it('has cow-copy phase', () => {
      const has = frames.some(f => {
        const data = f.data as PageFaultState;
        return data.phase === 'cow-copy';
      });
      expect(has).toBe(true);
    });

    it('fault type is write', () => {
      const first = frames[0].data as PageFaultState;
      expect(first.faultType).toBe('write');
    });

    it('ends in resolved phase with physical page', () => {
      const last = frames[frames.length - 1].data as PageFaultState;
      expect(last.phase).toBe('resolved');
      expect(last.physicalPage).not.toBeNull();
    });
  });

  describe('generateFrames - file-backed-fault', () => {
    const frames = pageFault.generateFrames('file-backed-fault');

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
        const data = f.data as PageFaultState;
        expect(data.srcRef).toBeTruthy();
      }
    });

    it('mentions filemap_fault in a frame description', () => {
      const has = frames.some(f =>
        f.description.includes('filemap_fault')
      );
      expect(has).toBe(true);
    });

    it('has file-read phase', () => {
      const has = frames.some(f => {
        const data = f.data as PageFaultState;
        return data.phase === 'file-read';
      });
      expect(has).toBe(true);
    });

    it('ends in resolved phase with physical page', () => {
      const last = frames[frames.length - 1].data as PageFaultState;
      expect(last.phase).toBe('resolved');
      expect(last.physicalPage).not.toBeNull();
    });
  });

  describe('generateFrames - default', () => {
    it('returns frames for default scenario (no argument)', () => {
      const frames = pageFault.generateFrames();
      expect(frames.length).toBeGreaterThan(0);
    });

    it('default matches anonymous-page-fault scenario', () => {
      const defaultFrames = pageFault.generateFrames();
      const namedFrames = pageFault.generateFrames('anonymous-page-fault');
      expect(defaultFrames.length).toBe(namedFrames.length);
    });
  });

  describe('real kernel function names in descriptions', () => {
    const allFrames = [
      ...pageFault.generateFrames('anonymous-page-fault'),
      ...pageFault.generateFrames('copy-on-write'),
      ...pageFault.generateFrames('file-backed-fault'),
    ];
    const allDescriptions = allFrames.map(f => f.description).join(' ');

    it('references exc_page_fault', () => {
      expect(allDescriptions).toContain('exc_page_fault');
    });

    it('references handle_mm_fault', () => {
      expect(allDescriptions).toContain('handle_mm_fault');
    });

    it('references do_anonymous_page', () => {
      expect(allDescriptions).toContain('do_anonymous_page');
    });

    it('references do_wp_page', () => {
      expect(allDescriptions).toContain('do_wp_page');
    });

    it('references do_user_addr_fault', () => {
      expect(allDescriptions).toContain('do_user_addr_fault');
    });
  });

  describe('renderFrame', () => {
    it('renders SVG elements into container', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = pageFault.generateFrames('anonymous-page-fault');
      pageFault.renderFrame(svg, frames[0], 900, 480);
      expect(svg.childNodes.length).toBeGreaterThan(0);
    });

    it('renders rect elements', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = pageFault.generateFrames('anonymous-page-fault');
      pageFault.renderFrame(svg, frames[3], 900, 480);
      expect(svg.querySelectorAll('rect').length).toBeGreaterThan(0);
    });

    it('renders text elements', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = pageFault.generateFrames('anonymous-page-fault');
      pageFault.renderFrame(svg, frames[0], 900, 480);
      expect(svg.querySelectorAll('text').length).toBeGreaterThan(0);
    });

    it('renders different content for different frames', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = pageFault.generateFrames('anonymous-page-fault');
      pageFault.renderFrame(svg, frames[0], 900, 480);
      const html1 = svg.innerHTML;
      pageFault.renderFrame(svg, frames[frames.length - 1], 900, 480);
      const html2 = svg.innerHTML;
      expect(html1).not.toBe(html2);
    });
  });
});

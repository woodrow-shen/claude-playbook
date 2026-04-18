import { describe, it, expect } from 'vitest';
import module_ from './module-lifecycle.js';
import type { ModuleState } from './module-lifecycle.js';

describe('ModuleLifecycle', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(module_.config.id).toBe('module-lifecycle');
      expect(module_.config.skillName).toBe('kernel-modules');
    });

    it('has a title', () => {
      expect(module_.config.title).toBe('Kernel Module Lifecycle');
    });
  });

  describe('getScenarios', () => {
    it('returns at least 3 scenarios', () => {
      expect(module_.getScenarios().length).toBeGreaterThanOrEqual(3);
    });

    it('each scenario has id and label', () => {
      for (const s of module_.getScenarios()) {
        expect(s.id).toBeTruthy();
        expect(s.label).toBeTruthy();
      }
    });

    it('includes module-load, module-unload, and symbol-resolution', () => {
      const ids = module_.getScenarios().map(s => s.id);
      expect(ids).toContain('module-load');
      expect(ids).toContain('module-unload');
      expect(ids).toContain('symbol-resolution');
    });
  });

  describe('generateFrames - module-load', () => {
    const frames = module_.generateFrames('module-load');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('first frame starts in loading state', () => {
      const data = frames[0].data as ModuleState;
      expect(data.state).toBe('loading');
      expect(data.phase).toBe('init_module');
    });

    it('last frame has state live', () => {
      const data = frames[frames.length - 1].data as ModuleState;
      expect(data.state).toBe('live');
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

    it('every frame has srcRef in data', () => {
      for (const f of frames) {
        const data = f.data as ModuleState;
        expect(data.srcRef).toBeTruthy();
        expect(data.srcRef.length).toBeGreaterThan(0);
      }
    });

    it('descriptions reference real kernel functions', () => {
      const allDescs = frames.map(f => f.description).join(' ');
      expect(allDescs).toContain('init_module');
      expect(allDescs).toContain('load_module');
      expect(allDescs).toContain('do_init_module');
      expect(allDescs).toContain('simplify_symbols');
      expect(allDescs).toContain('apply_relocations');
      expect(allDescs).toContain('complete_formation');
    });

    it('progresses through ELF section statuses', () => {
      const firstData = frames[0].data as ModuleState;
      const lastData = frames[frames.length - 1].data as ModuleState;
      expect(firstData.sections.some(s => s.status === 'pending')).toBe(true);
      expect(lastData.sections.every(s => s.status === 'finalized')).toBe(true);
    });

    it('symbols start unresolved and end resolved', () => {
      const firstData = frames[0].data as ModuleState;
      const lastData = frames[frames.length - 1].data as ModuleState;
      expect(firstData.symbols.every(s => s.resolved === false)).toBe(true);
      expect(lastData.symbols.every(s => s.resolved === true)).toBe(true);
    });
  });

  describe('generateFrames - module-unload', () => {
    const frames = module_.generateFrames('module-unload');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('first frame starts with live module', () => {
      const data = frames[0].data as ModuleState;
      expect(data.state).toBe('live');
    });

    it('last frame has state unloaded', () => {
      const data = frames[frames.length - 1].data as ModuleState;
      expect(data.state).toBe('unloaded');
    });

    it('passes through going state', () => {
      const goingFrame = frames.find(f => (f.data as ModuleState).state === 'going');
      expect(goingFrame).toBeTruthy();
    });

    it('descriptions reference delete_module and free_module', () => {
      const allDescs = frames.map(f => f.description).join(' ');
      expect(allDescs).toContain('delete_module');
      expect(allDescs).toContain('free_module');
      expect(allDescs).toContain('free_mod_mem');
    });

    it('every frame has srcRef in data', () => {
      for (const f of frames) {
        const data = f.data as ModuleState;
        expect(data.srcRef).toBeTruthy();
      }
    });

    it('sections end as freed', () => {
      const lastData = frames[frames.length - 1].data as ModuleState;
      expect(lastData.sections.every(s => s.status === 'freed')).toBe(true);
    });
  });

  describe('generateFrames - symbol-resolution', () => {
    const frames = module_.generateFrames('symbol-resolution');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
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

    it('describes the symbol search path', () => {
      const allDescs = frames.map(f => f.description).join(' ');
      expect(allDescs).toContain('find_symbol');
      expect(allDescs).toContain('resolve_symbol');
      expect(allDescs).toContain('__ksymtab');
      expect(allDescs).toContain('kallsyms');
    });

    it('symbols progressively become resolved', () => {
      const resolvedCounts = frames.map(f => {
        const data = f.data as ModuleState;
        return data.symbols.filter(s => s.resolved).length;
      });
      // Should be non-decreasing
      for (let i = 1; i < resolvedCounts.length; i++) {
        expect(resolvedCounts[i]).toBeGreaterThanOrEqual(resolvedCounts[i - 1]);
      }
    });

    it('all symbols are resolved by the last frame', () => {
      const lastData = frames[frames.length - 1].data as ModuleState;
      expect(lastData.symbols.every(s => s.resolved === true)).toBe(true);
    });

    it('every frame has srcRef in data', () => {
      for (const f of frames) {
        const data = f.data as ModuleState;
        expect(data.srcRef).toBeTruthy();
      }
    });
  });

  describe('generateFrames - default', () => {
    it('returns frames for default scenario (module-load)', () => {
      const frames = module_.generateFrames();
      expect(frames.length).toBeGreaterThan(0);
      const firstData = frames[0].data as ModuleState;
      expect(firstData.phase).toBe('init_module');
    });
  });

  describe('renderFrame', () => {
    it('renders SVG elements into container', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = module_.generateFrames('module-load');
      module_.renderFrame(svg, frames[0], 500, 300);
      expect(svg.querySelectorAll('rect').length).toBeGreaterThan(0);
    });

    it('renders different content for different frames', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = module_.generateFrames('module-load');
      module_.renderFrame(svg, frames[0], 500, 300);
      const html1 = svg.innerHTML;
      module_.renderFrame(svg, frames[frames.length - 1], 500, 300);
      const html2 = svg.innerHTML;
      expect(html1).not.toBe(html2);
    });

    it('applies highlight classes to active elements', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = module_.generateFrames('module-load');
      // Find a frame with section or symbol highlights (rendered as rects)
      const frameWithHighlights = frames.find(f =>
        f.highlights.some(h => h.startsWith('section-') || h.startsWith('symbol-'))
      );
      if (frameWithHighlights) {
        module_.renderFrame(svg, frameWithHighlights, 500, 300);
        expect(svg.querySelectorAll('.anim-highlight').length).toBeGreaterThan(0);
      }
    });

    it('renders elements with .anim-module class', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = module_.generateFrames('module-load');
      module_.renderFrame(svg, frames[0], 500, 300);
      expect(svg.querySelectorAll('.anim-module').length).toBeGreaterThan(0);
    });

    it('renders elements with .anim-section class', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = module_.generateFrames('module-load');
      module_.renderFrame(svg, frames[0], 500, 300);
      expect(svg.querySelectorAll('.anim-section').length).toBeGreaterThan(0);
    });

    it('renders elements with .anim-symbol class', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = module_.generateFrames('module-load');
      module_.renderFrame(svg, frames[0], 500, 300);
      expect(svg.querySelectorAll('.anim-symbol').length).toBeGreaterThan(0);
    });

    it('clears container before rendering', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = module_.generateFrames('module-load');
      module_.renderFrame(svg, frames[0], 500, 300);
      const countBefore = svg.childNodes.length;
      module_.renderFrame(svg, frames[0], 500, 300);
      const countAfter = svg.childNodes.length;
      expect(countAfter).toBe(countBefore);
    });

    it('renders source reference text', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = module_.generateFrames('module-load');
      module_.renderFrame(svg, frames[0], 500, 300);
      const texts = Array.from(svg.querySelectorAll('text')).map(t => t.textContent);
      expect(texts.some(t => t?.includes('src:'))).toBe(true);
    });
  });
});

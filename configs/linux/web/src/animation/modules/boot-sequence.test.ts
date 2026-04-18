import { describe, it, expect } from 'vitest';
import bootSequence from './boot-sequence.js';
import type { BootState } from './boot-sequence.js';

describe('BootSequence', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(bootSequence.config.id).toBe('boot-sequence');
      expect(bootSequence.config.skillName).toBe('boot-and-init');
    });

    it('has a display title', () => {
      expect(bootSequence.config.title).toBe('Kernel Boot Sequence');
    });
  });

  describe('getScenarios', () => {
    const scenarios = bootSequence.getScenarios();

    it('returns at least 3 scenarios', () => {
      expect(scenarios.length).toBeGreaterThanOrEqual(3);
    });

    it('includes required scenario IDs', () => {
      const ids = scenarios.map(s => s.id);
      expect(ids).toContain('start-kernel-to-init');
      expect(ids).toContain('memory-init');
      expect(ids).toContain('scheduler-init');
    });

    it('each scenario has id and label', () => {
      for (const s of scenarios) {
        expect(s.id).toBeTruthy();
        expect(s.label).toBeTruthy();
      }
    });
  });

  describe('generateFrames - start-kernel-to-init', () => {
    const frames = bootSequence.generateFrames('start-kernel-to-init');

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

    it('each frame has typed BootState data', () => {
      for (const f of frames) {
        const data = f.data as BootState;
        expect(data.currentFunction).toBeTruthy();
        expect(data.srcRef).toBeTruthy();
        expect(Array.isArray(data.completedPhases)).toBe(true);
        expect(Array.isArray(data.phases)).toBe(true);
      }
    });

    it('first frame starts at start_kernel', () => {
      const data = frames[0].data as BootState;
      expect(data.currentFunction).toBe('start_kernel');
      expect(data.srcRef).toContain('init/main.c');
    });

    it('last frame reaches run_init_process', () => {
      const data = frames[frames.length - 1].data as BootState;
      expect(data.currentFunction).toBe('run_init_process');
    });

    it('completed phases accumulate over frames', () => {
      const firstData = frames[0].data as BootState;
      const lastData = frames[frames.length - 1].data as BootState;
      expect(lastData.completedPhases.length).toBeGreaterThan(firstData.completedPhases.length);
    });

    it('descriptions reference real kernel functions with file paths', () => {
      const kernelFunctions = [
        'start_kernel',
        'setup_arch',
        'rest_init',
        'kernel_init',
        'run_init_process',
      ];
      for (const fn of kernelFunctions) {
        const found = frames.some(f => f.description.includes(fn));
        expect(found, `Expected description referencing ${fn}`).toBe(true);
      }

      const filePaths = ['init/main.c', 'arch/x86/kernel/setup.c', 'mm/mm_init.c'];
      for (const path of filePaths) {
        const found = frames.some(f => f.description.includes(path));
        expect(found, `Expected description referencing ${path}`).toBe(true);
      }
    });
  });

  describe('generateFrames - memory-init', () => {
    const frames = bootSequence.generateFrames('memory-init');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('each frame has typed BootState data with srcRef', () => {
      for (const f of frames) {
        const data = f.data as BootState;
        expect(data.srcRef).toBeTruthy();
        expect(data.currentFunction).toBeTruthy();
      }
    });

    it('covers key memory init functions', () => {
      const expectedFunctions = [
        'setup_arch',
        'mm_core_init',
        'mem_init',
        'kmem_cache_init',
      ];
      for (const fn of expectedFunctions) {
        const found = frames.some(f => {
          const data = f.data as BootState;
          return data.currentFunction === fn || f.description.includes(fn);
        });
        expect(found, `Expected frame referencing ${fn}`).toBe(true);
      }
    });

    it('descriptions reference mm/mm_init.c', () => {
      const found = frames.some(f => f.description.includes('mm/mm_init.c'));
      expect(found).toBe(true);
    });
  });

  describe('generateFrames - scheduler-init', () => {
    const frames = bootSequence.generateFrames('scheduler-init');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('each frame has typed BootState data with srcRef', () => {
      for (const f of frames) {
        const data = f.data as BootState;
        expect(data.srcRef).toBeTruthy();
        expect(data.currentFunction).toBeTruthy();
      }
    });

    it('covers key scheduler functions', () => {
      const expectedFunctions = [
        'sched_init',
        'smp_init',
        'sched_init_smp',
      ];
      for (const fn of expectedFunctions) {
        const found = frames.some(f => {
          const data = f.data as BootState;
          return data.currentFunction === fn || f.description.includes(fn);
        });
        expect(found, `Expected frame referencing ${fn}`).toBe(true);
      }
    });

    it('describes per-CPU runqueue initialization', () => {
      const found = frames.some(f => f.description.includes('runqueue') || f.description.includes('rq'));
      expect(found).toBe(true);
    });

    it('references kernel/sched/core.c', () => {
      const found = frames.some(f => f.description.includes('kernel/sched/core.c'));
      expect(found).toBe(true);
    });

    it('mentions idle thread setup', () => {
      const found = frames.some(f => f.description.includes('idle'));
      expect(found).toBe(true);
    });
  });

  describe('generateFrames - default', () => {
    it('returns frames for default scenario', () => {
      const frames = bootSequence.generateFrames();
      expect(frames.length).toBeGreaterThan(0);
    });

    it('default scenario matches start-kernel-to-init', () => {
      const defaultFrames = bootSequence.generateFrames();
      const explicitFrames = bootSequence.generateFrames('start-kernel-to-init');
      expect(defaultFrames.length).toBe(explicitFrames.length);
    });
  });

  describe('renderFrame', () => {
    it('renders SVG elements into container', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = bootSequence.generateFrames('start-kernel-to-init');
      bootSequence.renderFrame(svg, frames[0], 432, 400);
      expect(svg.querySelectorAll('rect').length).toBeGreaterThan(0);
    });

    it('renders text elements with function names', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = bootSequence.generateFrames('start-kernel-to-init');
      bootSequence.renderFrame(svg, frames[0], 432, 400);
      const texts = Array.from(svg.querySelectorAll('text')).map(t => t.textContent);
      expect(texts.some(t => t?.includes('start_kernel'))).toBe(true);
    });

    it('renders different content for different frames', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = bootSequence.generateFrames('start-kernel-to-init');
      bootSequence.renderFrame(svg, frames[0], 432, 400);
      const html1 = svg.innerHTML;
      bootSequence.renderFrame(svg, frames[frames.length - 1], 432, 400);
      const html2 = svg.innerHTML;
      expect(html1).not.toBe(html2);
    });

    it('applies highlight class to active phase', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = bootSequence.generateFrames('start-kernel-to-init');
      const frameWithHighlights = frames.find(f => f.highlights.length > 0);
      if (frameWithHighlights) {
        bootSequence.renderFrame(svg, frameWithHighlights, 432, 400);
        expect(svg.querySelectorAll('.anim-highlight').length).toBeGreaterThan(0);
      }
    });

    it('uses semantic CSS classes', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = bootSequence.generateFrames('start-kernel-to-init');
      bootSequence.renderFrame(svg, frames[0], 432, 400);
      expect(svg.querySelectorAll('.anim-phase').length).toBeGreaterThan(0);
      expect(svg.querySelectorAll('.anim-function').length).toBeGreaterThan(0);
    });

    it('renders connector lines between phases', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = bootSequence.generateFrames('start-kernel-to-init');
      bootSequence.renderFrame(svg, frames[0], 432, 400);
      expect(svg.querySelectorAll('line').length).toBeGreaterThan(0);
    });

    it('renders all scenarios without errors', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      for (const scenario of bootSequence.getScenarios()) {
        const frames = bootSequence.generateFrames(scenario.id);
        for (const frame of frames) {
          expect(() => {
            bootSequence.renderFrame(svg, frame, 432, 400);
          }).not.toThrow();
        }
      }
    });

    it('renders source reference labels', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = bootSequence.generateFrames('start-kernel-to-init');
      bootSequence.renderFrame(svg, frames[0], 432, 400);
      const texts = Array.from(svg.querySelectorAll('.anim-srcref')).map(t => t.textContent);
      expect(texts.some(t => t?.includes('init/main.c'))).toBe(true);
    });
  });
});

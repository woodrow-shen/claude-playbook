import { describe, it, expect } from 'vitest';
import kbuildKconfig from './kbuild-kconfig.js';
import type { KbuildState } from './kbuild-kconfig.js';

describe('Kbuild & Kconfig', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(kbuildKconfig.config.id).toBe('kbuild-kconfig');
      expect(kbuildKconfig.config.skillName).toBe('kbuild-and-kconfig');
      expect(kbuildKconfig.config.title).toBe('Kbuild & Kconfig System');
    });
  });

  describe('getScenarios', () => {
    it('returns 3 scenarios', () => {
      const scenarios = kbuildKconfig.getScenarios();
      expect(scenarios.length).toBe(3);
      expect(scenarios.map(s => s.id)).toContain('kconfig-parsing');
      expect(scenarios.map(s => s.id)).toContain('make-build-flow');
      expect(scenarios.map(s => s.id)).toContain('config-dependency-resolution');
    });
  });

  describe('generateFrames - kconfig-parsing (default)', () => {
    const frames = kbuildKconfig.generateFrames('kconfig-parsing');

    it('generates 8-12 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
      expect(frames.length).toBeLessThanOrEqual(12);
    });

    it('first frame has step 0', () => {
      expect(frames[0].step).toBe(0);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('starts in parse phase', () => {
      const data = frames[0].data as KbuildState;
      expect(data.phase).toBe('parse');
    });

    it('transitions through phases', () => {
      const phases = frames.map(f => (f.data as KbuildState).phase);
      expect(phases).toContain('parse');
      expect(phases).toContain('read-config');
      expect(phases).toContain('calc-value');
    });

    it('data includes symbols array', () => {
      const data = frames[0].data as KbuildState;
      expect(Array.isArray(data.symbols)).toBe(true);
    });

    it('data includes dependencies', () => {
      const data = frames[0].data as KbuildState;
      expect(Array.isArray(data.dependencies)).toBe(true);
    });

    it('data includes currentFile', () => {
      const data = frames[0].data as KbuildState;
      expect(data.currentFile).toBeDefined();
      expect(data.currentFile.length).toBeGreaterThan(0);
    });

    it('data includes srcRef on all frames', () => {
      frames.forEach(f => {
        const data = f.data as KbuildState;
        expect(data.srcRef).toBeDefined();
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });

    it('references conf_parse', () => {
      const hasRef = frames.some(f => f.description.includes('conf_parse'));
      expect(hasRef).toBe(true);
    });

    it('references conf_read', () => {
      const hasRef = frames.some(f => f.description.includes('conf_read'));
      expect(hasRef).toBe(true);
    });

    it('references sym_calc_value', () => {
      const hasRef = frames.some(f => f.description.includes('sym_calc_value'));
      expect(hasRef).toBe(true);
    });

    it('symbols accumulate over frames', () => {
      const firstData = frames[0].data as KbuildState;
      const laterFrame = frames.find(f => {
        const d = f.data as KbuildState;
        return d.symbols.length > firstData.symbols.length;
      });
      expect(laterFrame).toBeDefined();
    });
  });

  describe('generateFrames - default scenario', () => {
    it('returns frames when called without argument', () => {
      const frames = kbuildKconfig.generateFrames();
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });
  });

  describe('generateFrames - make-build-flow', () => {
    const frames = kbuildKconfig.generateFrames('make-build-flow');

    it('generates 8-12 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
      expect(frames.length).toBeLessThanOrEqual(12);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('includes build phase', () => {
      const hasBuild = frames.some(f => {
        const data = f.data as KbuildState;
        return data.phase === 'build';
      });
      expect(hasBuild).toBe(true);
    });

    it('includes compile phase', () => {
      const hasCompile = frames.some(f => {
        const data = f.data as KbuildState;
        return data.phase === 'compile';
      });
      expect(hasCompile).toBe(true);
    });

    it('references Makefile.build', () => {
      const hasRef = frames.some(f => f.description.includes('Makefile.build'));
      expect(hasRef).toBe(true);
    });

    it('references cmd_cc_o_c', () => {
      const hasRef = frames.some(f => f.description.includes('cmd_cc_o_c'));
      expect(hasRef).toBe(true);
    });

    it('references top-level Makefile', () => {
      const hasRef = frames.some(f => f.description.includes('Makefile'));
      expect(hasRef).toBe(true);
    });

    it('has buildTarget set', () => {
      const hasTarget = frames.some(f => {
        const data = f.data as KbuildState;
        return data.buildTarget.length > 0;
      });
      expect(hasTarget).toBe(true);
    });

    it('has srcRef on all frames', () => {
      frames.forEach(f => {
        const data = f.data as KbuildState;
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });
  });

  describe('generateFrames - config-dependency-resolution', () => {
    const frames = kbuildKconfig.generateFrames('config-dependency-resolution');

    it('generates 8-12 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
      expect(frames.length).toBeLessThanOrEqual(12);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('includes dep-check phase', () => {
      const hasDepCheck = frames.some(f => {
        const data = f.data as KbuildState;
        return data.phase === 'dep-check';
      });
      expect(hasDepCheck).toBe(true);
    });

    it('includes resolve phase', () => {
      const hasResolve = frames.some(f => {
        const data = f.data as KbuildState;
        return data.phase === 'resolve';
      });
      expect(hasResolve).toBe(true);
    });

    it('references sym_check_deps', () => {
      const hasRef = frames.some(f => f.description.includes('sym_check_deps'));
      expect(hasRef).toBe(true);
    });

    it('references expr_calc_value', () => {
      const hasRef = frames.some(f => f.description.includes('expr_calc_value'));
      expect(hasRef).toBe(true);
    });

    it('dependencies accumulate', () => {
      const firstData = frames[0].data as KbuildState;
      const laterFrame = frames.find(f => {
        const d = f.data as KbuildState;
        return d.dependencies.length > firstData.dependencies.length;
      });
      expect(laterFrame).toBeDefined();
    });

    it('has srcRef on all frames', () => {
      frames.forEach(f => {
        const data = f.data as KbuildState;
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });
  });

  describe('renderFrame', () => {
    it('renders title text', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = kbuildKconfig.generateFrames('kconfig-parsing');
      kbuildKconfig.renderFrame(svg, frames[0], 900, 480);
      const title = svg.querySelector('.anim-title');
      expect(title).not.toBeNull();
    });

    it('renders phase blocks', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = kbuildKconfig.generateFrames('kconfig-parsing');
      kbuildKconfig.renderFrame(svg, frames[3], 900, 480);
      const blocks = svg.querySelectorAll('.anim-block');
      expect(blocks.length).toBeGreaterThan(0);
    });

    it('renders mode indicator', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = kbuildKconfig.generateFrames('kconfig-parsing');
      kbuildKconfig.renderFrame(svg, frames[0], 900, 480);
      const modeElements = svg.querySelectorAll('.anim-mode');
      expect(modeElements.length).toBeGreaterThan(0);
    });

    it('renders symbol entries as registers', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = kbuildKconfig.generateFrames('kconfig-parsing');
      const frameWithSyms = frames.find(f => (f.data as KbuildState).symbols.length > 0);
      if (frameWithSyms) {
        kbuildKconfig.renderFrame(svg, frameWithSyms, 900, 480);
        const regs = svg.querySelectorAll('.anim-register');
        expect(regs.length).toBeGreaterThan(0);
      }
    });

    it('renders stack frames for dependencies', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = kbuildKconfig.generateFrames('config-dependency-resolution');
      const frameWithDeps = frames.find(f => (f.data as KbuildState).dependencies.length > 0);
      if (frameWithDeps) {
        kbuildKconfig.renderFrame(svg, frameWithDeps, 900, 480);
        const stackFrames = svg.querySelectorAll('.anim-stack-frame');
        expect(stackFrames.length).toBeGreaterThan(0);
      }
    });

    it('clears previous content on re-render', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = kbuildKconfig.generateFrames('kconfig-parsing');
      kbuildKconfig.renderFrame(svg, frames[0], 900, 480);
      const countBefore = svg.childElementCount;
      kbuildKconfig.renderFrame(svg, frames[1], 900, 480);
      expect(svg.childElementCount).toBeLessThanOrEqual(countBefore + 10);
    });

    it('renders highlight elements', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = kbuildKconfig.generateFrames('kconfig-parsing');
      const highlightFrame = frames.find(f => f.highlights.length > 0);
      if (highlightFrame) {
        kbuildKconfig.renderFrame(svg, highlightFrame, 900, 480);
        const highlights = svg.querySelectorAll('.anim-highlight');
        expect(highlights.length).toBeGreaterThan(0);
      }
    });
  });
});

import { describe, it, expect } from 'vitest';
import elfLoader from './elf-loader.js';

describe('ElfLoader', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(elfLoader.config.id).toBe('elf-loader');
      expect(elfLoader.config.title).toBe('ELF Binary Loading');
      expect(elfLoader.config.skillName).toBe('process-lifecycle');
    });
  });

  describe('getScenarios', () => {
    it('returns 3 scenarios', () => {
      expect(elfLoader.getScenarios().length).toBe(3);
    });

    it('each scenario has id and label', () => {
      for (const s of elfLoader.getScenarios()) {
        expect(s.id).toBeTruthy();
        expect(s.label).toBeTruthy();
      }
    });

    it('includes static-binary, dynamic-binary, and exec-replaces-process', () => {
      const ids = elfLoader.getScenarios().map(s => s.id);
      expect(ids).toContain('static-binary');
      expect(ids).toContain('dynamic-binary');
      expect(ids).toContain('exec-replaces-process');
    });
  });

  describe('generateFrames - common requirements', () => {
    const scenarios = ['static-binary', 'dynamic-binary', 'exec-replaces-process'];

    for (const scenario of scenarios) {
      describe(`scenario: ${scenario}`, () => {
        const frames = elfLoader.generateFrames(scenario);

        it('generates at least 10 frames', () => {
          expect(frames.length).toBeGreaterThanOrEqual(10);
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

        it('frame data includes elfHeader, programHeaders, memoryMap, and phase', () => {
          for (const f of frames) {
            const data = f.data as Record<string, unknown>;
            expect(data).toHaveProperty('elfHeader');
            expect(data).toHaveProperty('programHeaders');
            expect(data).toHaveProperty('memoryMap');
            expect(data).toHaveProperty('phase');
          }
        });
      });
    }
  });

  describe('generateFrames - static-binary', () => {
    const frames = elfLoader.generateFrames('static-binary');

    it('elfHeader has a valid entry point', () => {
      const data = frames[0].data as { elfHeader: { entry: number } };
      expect(data.elfHeader.entry).toBeGreaterThan(0);
    });

    it('elfHeader has correct magic bytes', () => {
      const data = frames[0].data as { elfHeader: { magic: string } };
      expect(data.elfHeader.magic).toBe('7f 45 4c 46');
    });

    it('programHeaders include at least one PT_LOAD', () => {
      const data = frames[0].data as { programHeaders: { type: string }[] };
      expect(data.programHeaders.some(ph => ph.type === 'PT_LOAD')).toBe(true);
    });

    it('has no interpreter path (statically linked)', () => {
      for (const f of frames) {
        const data = f.data as { interpreterPath: string | null };
        expect(data.interpreterPath).toBeNull();
      }
    });

    it('final frame shows memory regions mapped', () => {
      const lastFrame = frames[frames.length - 1];
      const data = lastFrame.data as { memoryMap: { state: string }[] };
      const mapped = data.memoryMap.filter(r => r.state === 'mapped');
      expect(mapped.length).toBeGreaterThan(0);
    });

    it('stack contents are populated by the end', () => {
      const lastFrame = frames[frames.length - 1];
      const data = lastFrame.data as { stackContents: { label: string }[] };
      expect(data.stackContents.length).toBeGreaterThan(0);
      const labels = data.stackContents.map(e => e.label);
      expect(labels.some(l => l.includes('argc'))).toBe(true);
    });

    it('currentFunction references kernel functions', () => {
      const functions = frames.map(f => (f.data as { currentFunction: string }).currentFunction);
      expect(functions.some(fn => fn.includes('load_elf_binary'))).toBe(true);
    });
  });

  describe('generateFrames - dynamic-binary', () => {
    const frames = elfLoader.generateFrames('dynamic-binary');

    it('has interpreterPath set (non-null) in at least one frame', () => {
      const hasInterpreter = frames.some(f => {
        const data = f.data as { interpreterPath: string | null };
        return data.interpreterPath !== null;
      });
      expect(hasInterpreter).toBe(true);
    });

    it('programHeaders include PT_INTERP', () => {
      const data = frames[0].data as { programHeaders: { type: string }[] };
      expect(data.programHeaders.some(ph => ph.type === 'PT_INTERP')).toBe(true);
    });

    it('memory map includes an interp region', () => {
      const lastFrame = frames[frames.length - 1];
      const data = lastFrame.data as { memoryMap: { type: string }[] };
      expect(data.memoryMap.some(r => r.type === 'interp')).toBe(true);
    });

    it('elfHeader type is ET_DYN', () => {
      const data = frames[0].data as { elfHeader: { type: string } };
      expect(data.elfHeader.type).toBe('ET_DYN');
    });
  });

  describe('generateFrames - exec-replaces-process', () => {
    const frames = elfLoader.generateFrames('exec-replaces-process');

    it('shows memory regions transitioning from unmapped to mapped', () => {
      const firstData = frames[0].data as { memoryMap: { state: string }[] };
      const lastData = frames[frames.length - 1].data as { memoryMap: { state: string }[] };

      const firstUnmapped = firstData.memoryMap.filter(r => r.state === 'unmapped').length;
      const lastMapped = lastData.memoryMap.filter(r => r.state === 'mapped').length;

      // At the start most regions should be unmapped, at the end most should be mapped
      expect(firstUnmapped).toBeGreaterThan(0);
      expect(lastMapped).toBeGreaterThan(0);
    });

    it('references flush_old_exec in descriptions', () => {
      const descriptions = frames.map(f => f.description);
      expect(descriptions.some(d => d.includes('flush_old_exec'))).toBe(true);
    });

    it('shows the old process being replaced', () => {
      const labels = frames.map(f => f.label);
      const descriptions = frames.map(f => f.description);
      const allText = [...labels, ...descriptions].join(' ');
      expect(allText).toMatch(/old|previous|bash|destroy/i);
    });
  });

  describe('generateFrames - default scenario', () => {
    it('returns frames when called without a scenario argument', () => {
      const frames = elfLoader.generateFrames();
      expect(frames.length).toBeGreaterThanOrEqual(10);
    });
  });

  describe('renderFrame', () => {
    it('renders SVG elements into container', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = elfLoader.generateFrames('static-binary');
      elfLoader.renderFrame(svg, frames[0], 900, 480);
      expect(svg.childNodes.length).toBeGreaterThan(0);
    });

    it('renders different content for different frames', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = elfLoader.generateFrames('static-binary');
      elfLoader.renderFrame(svg, frames[0], 900, 480);
      const html1 = svg.innerHTML;
      elfLoader.renderFrame(svg, frames[frames.length - 1], 900, 480);
      const html2 = svg.innerHTML;
      expect(html1).not.toBe(html2);
    });

    it('creates rect elements for memory regions', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = elfLoader.generateFrames('static-binary');
      // Use a later frame where regions are mapped
      const laterFrame = frames[Math.floor(frames.length / 2)];
      elfLoader.renderFrame(svg, laterFrame, 900, 480);
      expect(svg.querySelectorAll('rect').length).toBeGreaterThan(0);
    });

    it('creates text elements', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = elfLoader.generateFrames('static-binary');
      elfLoader.renderFrame(svg, frames[0], 900, 480);
      expect(svg.querySelectorAll('text').length).toBeGreaterThan(0);
    });

    it('clears container between renders', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = elfLoader.generateFrames('static-binary');
      elfLoader.renderFrame(svg, frames[0], 900, 480);
      const count1 = svg.childNodes.length;
      elfLoader.renderFrame(svg, frames[0], 900, 480);
      const count2 = svg.childNodes.length;
      // Should not double up elements
      expect(count2).toBe(count1);
    });
  });
});

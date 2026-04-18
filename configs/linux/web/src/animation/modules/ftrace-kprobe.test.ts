import { describe, it, expect } from 'vitest';
import ftraceKprobe from './ftrace-kprobe.js';
import type { FtraceKprobeState } from './ftrace-kprobe.js';

describe('Ftrace and Kprobes', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(ftraceKprobe.config.id).toBe('ftrace-kprobe');
      expect(ftraceKprobe.config.skillName).toBe('ftrace-and-kprobes');
      expect(ftraceKprobe.config.title).toBe('Ftrace Function Tracing and Kprobes');
    });
  });

  describe('getScenarios', () => {
    it('returns 3 scenarios', () => {
      const scenarios = ftraceKprobe.getScenarios();
      expect(scenarios.length).toBe(3);
      expect(scenarios.map(s => s.id)).toEqual([
        'ftrace-function-tracing',
        'kprobe-insertion',
        'ftrace-ring-buffer',
      ]);
    });
  });

  describe('generateFrames - ftrace-function-tracing (default)', () => {
    const frames = ftraceKprobe.generateFrames('ftrace-function-tracing');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('first frame has step 0', () => {
      expect(frames[0].step).toBe(0);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('every frame has srcRef in data', () => {
      frames.forEach(f => {
        const data = f.data as FtraceKprobeState;
        expect(data.srcRef).toBeDefined();
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });

    it('mentions real kernel function names in descriptions', () => {
      const allDescriptions = frames.map(f => f.description).join(' ');
      expect(allDescriptions).toContain('register_ftrace_function');
      expect(allDescriptions).toContain('ftrace_startup');
      expect(allDescriptions).toContain('ftrace_replace_code');
      expect(allDescriptions).toContain('ring_buffer_write');
    });

    it('has ftrace call sites with NOP -> CALL patching', () => {
      const hasPatching = frames.some(f => {
        const data = f.data as FtraceKprobeState;
        return data.callSites.some(s => s.state === 'call');
      });
      expect(hasPatching).toBe(true);
    });

    it('has ring buffer entries', () => {
      const hasEntries = frames.some(f => {
        const data = f.data as FtraceKprobeState;
        return data.ringBuffer.entries.length > 0;
      });
      expect(hasEntries).toBe(true);
    });

    it('default scenario returns same frames as ftrace-function-tracing', () => {
      const defaultFrames = ftraceKprobe.generateFrames();
      expect(defaultFrames.length).toBe(frames.length);
      defaultFrames.forEach((f, i) => expect(f.step).toBe(i));
    });
  });

  describe('generateFrames - kprobe-insertion', () => {
    const frames = ftraceKprobe.generateFrames('kprobe-insertion');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('every frame has srcRef in data', () => {
      frames.forEach(f => {
        const data = f.data as FtraceKprobeState;
        expect(data.srcRef).toBeDefined();
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });

    it('mentions real kprobe function names in descriptions', () => {
      const allDescriptions = frames.map(f => f.description).join(' ');
      expect(allDescriptions).toContain('register_kprobe');
      expect(allDescriptions).toContain('prepare_kprobe');
      expect(allDescriptions).toContain('arm_kprobe');
      expect(allDescriptions).toContain('kprobe_int3_handler');
    });

    it('has kprobe with INT3 breakpoint state', () => {
      const hasInt3 = frames.some(f => {
        const data = f.data as FtraceKprobeState;
        return data.kprobe.state === 'armed';
      });
      expect(hasInt3).toBe(true);
    });

    it('shows pre_handler and post_handler execution', () => {
      const allDescriptions = frames.map(f => f.description).join(' ');
      expect(allDescriptions).toContain('pre_handler');
      expect(allDescriptions).toContain('post_handler');
    });
  });

  describe('generateFrames - ftrace-ring-buffer', () => {
    const frames = ftraceKprobe.generateFrames('ftrace-ring-buffer');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('every frame has srcRef in data', () => {
      frames.forEach(f => {
        const data = f.data as FtraceKprobeState;
        expect(data.srcRef).toBeDefined();
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });

    it('mentions ring buffer function names in descriptions', () => {
      const allDescriptions = frames.map(f => f.description).join(' ');
      expect(allDescriptions).toContain('ring_buffer_write');
      expect(allDescriptions).toContain('rb_reserve_next_event');
      expect(allDescriptions).toContain('rb_commit');
      expect(allDescriptions).toContain('ring_buffer_read_start');
    });

    it('has ring buffer with write and read pointers', () => {
      const hasPointers = frames.some(f => {
        const data = f.data as FtraceKprobeState;
        return data.ringBuffer.writePtr > 0 || data.ringBuffer.readPtr > 0;
      });
      expect(hasPointers).toBe(true);
    });

    it('has per-CPU ring buffer pages', () => {
      const data = frames[0].data as FtraceKprobeState;
      expect(data.ringBuffer.pages.length).toBeGreaterThan(0);
    });
  });

  describe('renderFrame', () => {
    it('renders call site elements for ftrace scenario', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = ftraceKprobe.generateFrames('ftrace-function-tracing');
      ftraceKprobe.renderFrame(svg, frames[0], 900, 480);
      const sites = svg.querySelectorAll('.anim-ftrace-site');
      expect(sites.length).toBeGreaterThan(0);
    });

    it('renders ring buffer elements', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = ftraceKprobe.generateFrames('ftrace-ring-buffer');
      ftraceKprobe.renderFrame(svg, frames[0], 900, 480);
      const pages = svg.querySelectorAll('.anim-rb-page');
      expect(pages.length).toBeGreaterThan(0);
    });

    it('renders kprobe elements', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = ftraceKprobe.generateFrames('kprobe-insertion');
      const frameWithKprobe = frames.find(f => (f.data as FtraceKprobeState).kprobe.state !== 'none');
      if (frameWithKprobe) {
        ftraceKprobe.renderFrame(svg, frameWithKprobe, 900, 480);
        const kp = svg.querySelectorAll('.anim-kprobe');
        expect(kp.length).toBeGreaterThan(0);
      }
    });

    it('renders source reference label', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = ftraceKprobe.generateFrames('ftrace-function-tracing');
      ftraceKprobe.renderFrame(svg, frames[0], 900, 480);
      const srcRef = svg.querySelector('.anim-ftrace-srcref');
      expect(srcRef).not.toBeNull();
    });

    it('renders title/phase label', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = ftraceKprobe.generateFrames('ftrace-function-tracing');
      ftraceKprobe.renderFrame(svg, frames[0], 900, 480);
      const title = svg.querySelector('.anim-title');
      expect(title).not.toBeNull();
    });
  });
});

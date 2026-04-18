import { describe, it, expect } from 'vitest';
import rtDeadlineSched from './rt-deadline-sched.js';
import type { RtDeadlineState } from './rt-deadline-sched.js';

describe('RT and Deadline Scheduling Animation', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(rtDeadlineSched.config.id).toBe('rt-deadline-sched');
      expect(rtDeadlineSched.config.skillName).toBe('rt-and-deadline-scheduling');
    });
  });

  describe('getScenarios', () => {
    it('returns exactly 3 scenarios', () => {
      const scenarios = rtDeadlineSched.getScenarios();
      expect(scenarios.length).toBe(3);
    });

    it('has rt-fifo-preemption, deadline-edf, and rt-throttling scenarios', () => {
      const ids = rtDeadlineSched.getScenarios().map(s => s.id);
      expect(ids).toContain('rt-fifo-preemption');
      expect(ids).toContain('deadline-edf');
      expect(ids).toContain('rt-throttling');
    });
  });

  describe('generateFrames - rt-fifo-preemption (default)', () => {
    const frames = rtDeadlineSched.generateFrames('rt-fifo-preemption');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('every frame has srcRef in data', () => {
      frames.forEach(f => {
        const data = f.data as RtDeadlineState;
        expect(data.srcRef).toBeTruthy();
        expect(typeof data.srcRef).toBe('string');
      });
    });

    it('descriptions reference real kernel function names', () => {
      const allDescriptions = frames.map(f => f.description).join(' ');
      expect(allDescriptions).toMatch(/enqueue_task_rt/);
      expect(allDescriptions).toMatch(/pick_next_rt_entity/);
      expect(allDescriptions).toMatch(/wakeup_preempt_rt/);
    });

    it('srcRef references actual kernel source files', () => {
      const allSrcRefs = frames.map(f => (f.data as RtDeadlineState).srcRef).join(' ');
      expect(allSrcRefs).toMatch(/kernel\/sched\/rt\.c/);
    });

    it('shows RT priority bitmap and queue structure', () => {
      const allDescriptions = frames.map(f => f.description).join(' ');
      expect(allDescriptions).toMatch(/bitmap/i);
    });

    it('default scenario returns the same frames as rt-fifo-preemption', () => {
      const defaultFrames = rtDeadlineSched.generateFrames();
      expect(defaultFrames.length).toBe(frames.length);
      expect(defaultFrames[0].label).toBe(frames[0].label);
    });
  });

  describe('generateFrames - deadline-edf', () => {
    const frames = rtDeadlineSched.generateFrames('deadline-edf');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('every frame has srcRef in data', () => {
      frames.forEach(f => {
        const data = f.data as RtDeadlineState;
        expect(data.srcRef).toBeTruthy();
      });
    });

    it('descriptions reference real deadline kernel function names', () => {
      const allDescriptions = frames.map(f => f.description).join(' ');
      expect(allDescriptions).toMatch(/enqueue_task_dl/);
      expect(allDescriptions).toMatch(/pick_next_dl_entity/);
      expect(allDescriptions).toMatch(/dl_task_timer/);
      expect(allDescriptions).toMatch(/replenish_dl_entity/);
    });

    it('srcRef references deadline.c', () => {
      const allSrcRefs = frames.map(f => (f.data as RtDeadlineState).srcRef).join(' ');
      expect(allSrcRefs).toMatch(/kernel\/sched\/deadline\.c/);
    });

    it('mentions CBS algorithm', () => {
      const allDescriptions = frames.map(f => f.description).join(' ');
      expect(allDescriptions).toMatch(/CBS/);
    });
  });

  describe('generateFrames - rt-throttling', () => {
    const frames = rtDeadlineSched.generateFrames('rt-throttling');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('every frame has srcRef in data', () => {
      frames.forEach(f => {
        const data = f.data as RtDeadlineState;
        expect(data.srcRef).toBeTruthy();
      });
    });

    it('descriptions reference throttling kernel functions', () => {
      const allDescriptions = frames.map(f => f.description).join(' ');
      expect(allDescriptions).toMatch(/update_curr_rt/);
      expect(allDescriptions).toMatch(/sched_rt_runtime_exceeded/);
    });

    it('srcRef references rt.c', () => {
      const allSrcRefs = frames.map(f => (f.data as RtDeadlineState).srcRef).join(' ');
      expect(allSrcRefs).toMatch(/kernel\/sched\/rt\.c/);
    });

    it('mentions throttling quota values', () => {
      const allDescriptions = frames.map(f => f.description).join(' ');
      expect(allDescriptions).toMatch(/0\.95s|950ms|950000/);
    });

    it('shows CFS tasks getting CPU after throttle', () => {
      const allDescriptions = frames.map(f => f.description).join(' ');
      expect(allDescriptions).toMatch(/CFS|fair/i);
    });
  });

  describe('renderFrame', () => {
    it('renders SVG elements', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = rtDeadlineSched.generateFrames('rt-fifo-preemption');
      rtDeadlineSched.renderFrame(svg, frames[0], 432, 300);
      expect(svg.querySelectorAll('rect').length).toBeGreaterThan(0);
      expect(svg.querySelectorAll('text').length).toBeGreaterThan(0);
    });

    it('renders task names', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = rtDeadlineSched.generateFrames('rt-fifo-preemption');
      rtDeadlineSched.renderFrame(svg, frames[0], 432, 300);
      const texts = Array.from(svg.querySelectorAll('text')).map(t => t.textContent);
      expect(texts.some(t => t !== null && t.length > 0)).toBe(true);
    });
  });
});

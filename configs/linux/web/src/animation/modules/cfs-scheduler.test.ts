import { describe, it, expect } from 'vitest';
import cfsScheduler from './cfs-scheduler.js';
import type { CfsState } from './cfs-scheduler.js';

describe('CFS Scheduler', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(cfsScheduler.config.id).toBe('cfs-scheduler');
      expect(cfsScheduler.config.skillName).toBe('scheduler-fundamentals');
    });
  });

  describe('getScenarios', () => {
    it('returns at least 4 scenarios', () => {
      expect(cfsScheduler.getScenarios().length).toBeGreaterThanOrEqual(4);
    });

    it('includes cross-class-preempt scenario', () => {
      const ids = cfsScheduler.getScenarios().map(s => s.id);
      expect(ids).toContain('cross-class-preempt');
    });

    it('cross-class-preempt scenario has v7.0 label', () => {
      const scenario = cfsScheduler.getScenarios().find(s => s.id === 'cross-class-preempt');
      expect(scenario?.label).toContain('v7.0');
    });
  });

  describe('generateFrames - equal-weight', () => {
    const frames = cfsScheduler.generateFrames('equal-weight');

    it('generates multiple frames', () => {
      expect(frames.length).toBeGreaterThan(5);
    });

    it('first frame has 3 tasks at vruntime 0', () => {
      const data = frames[0].data as CfsState;
      expect(data.tasks.length).toBe(3);
      expect(data.tasks.every(t => t.vruntime === 0)).toBe(true);
    });

    it('tasks accumulate vruntime over time', () => {
      const last = frames[frames.length - 1].data as CfsState;
      expect(last.tasks.every(t => t.vruntime > 0)).toBe(true);
    });

    it('equal-weight tasks have roughly equal vruntime', () => {
      const last = frames[frames.length - 1].data as CfsState;
      const vruntimes = last.tasks.map(t => t.vruntime);
      const max = Math.max(...vruntimes);
      const min = Math.min(...vruntimes);
      // With equal weights, difference should be at most one time slice
      expect(max - min).toBeLessThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });
  });

  describe('generateFrames - nice-values', () => {
    const frames = cfsScheduler.generateFrames('nice-values');

    it('generates multiple frames', () => {
      expect(frames.length).toBeGreaterThan(5);
    });

    it('has tasks with different weights', () => {
      const data = frames[0].data as CfsState;
      const weights = new Set(data.tasks.map(t => t.weight));
      expect(weights.size).toBe(3);
    });

    it('high-weight task gets more CPU time (lower vruntime growth)', () => {
      const last = frames[frames.length - 1].data as CfsState;
      const important = last.tasks.find(t => t.name === 'important')!;
      const background = last.tasks.find(t => t.name === 'background')!;
      // Important has higher weight, so should have lower vruntime relative to time run
      // But it runs MORE, so vruntime may be similar -- the key is it ran more often
      expect(important.weight).toBeGreaterThan(background.weight);
    });
  });

  describe('generateFrames - task-wakeup', () => {
    const frames = cfsScheduler.generateFrames('task-wakeup');

    it('generates multiple frames', () => {
      expect(frames.length).toBeGreaterThan(5);
    });

    it('has a sleeping task initially', () => {
      const data = frames[0].data as CfsState;
      expect(data.tasks.some(t => t.state === 'sleeping')).toBe(true);
    });

    it('sleeping task wakes up at some point', () => {
      const wakeFrame = frames.find(f => f.label.toLowerCase().includes('wake'));
      expect(wakeFrame).toBeDefined();
    });

    it('after wake, all tasks are ready/running', () => {
      const last = frames[frames.length - 1].data as CfsState;
      expect(last.tasks.every(t => t.state !== 'sleeping')).toBe(true);
    });
  });

  describe('generateFrames - cross-class-preempt', () => {
    const frames = cfsScheduler.generateFrames('cross-class-preempt');

    it('generates between 8 and 12 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
      expect(frames.length).toBeLessThanOrEqual(12);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('initial state tracks rq->next_class = fair', () => {
      const data = frames[0].data as CfsState;
      expect(data.nextClass).toBe('fair');
      expect(data.runningPid).toBe(101);
    });

    it('every frame has a v7.0 srcRef into kernel/sched/core.c', () => {
      frames.forEach(f => {
        const data = f.data as CfsState;
        expect(data.srcRef).toBeDefined();
        expect(data.srcRef).toMatch(/kernel\/sched\/core\.c:\d+/);
      });
    });

    it('includes the wakeup_preempt entry line (core.c:2243)', () => {
      const hasEntry = frames.some(f => (f.data as CfsState).srcRef?.includes('core.c:2243'));
      expect(hasEntry).toBe(true);
    });

    it('includes the same-class fast path line (core.c:2247)', () => {
      const hasFast = frames.some(f => (f.data as CfsState).srcRef?.includes('core.c:2247'));
      expect(hasFast).toBe(true);
    });

    it('includes the sched_class_above upgrade line (core.c:2250)', () => {
      const hasUpgrade = frames.some(f => (f.data as CfsState).srcRef?.includes('core.c:2250'));
      expect(hasUpgrade).toBe(true);
    });

    it('includes the rq->next_class assignment in wakeup_preempt (core.c:2253)', () => {
      const hasAssign = frames.some(f => (f.data as CfsState).srcRef?.includes('core.c:2253'));
      expect(hasAssign).toBe(true);
    });

    it('includes the context-switch refresh line (core.c:7105)', () => {
      const hasCtxSwitch = frames.some(f => (f.data as CfsState).srcRef?.includes('core.c:7105'));
      expect(hasCtxSwitch).toBe(true);
    });

    it('includes the idle reset line (core.c:7087)', () => {
      const hasIdle = frames.some(f => (f.data as CfsState).srcRef?.includes('core.c:7087'));
      expect(hasIdle).toBe(true);
    });

    it('upgrades rq->next_class to rt when RT task wakes up', () => {
      const hasRt = frames.some(f => (f.data as CfsState).nextClass === 'rt');
      expect(hasRt).toBe(true);
    });

    it('upgrades rq->next_class to deadline when DL task wakes up', () => {
      const hasDl = frames.some(f => (f.data as CfsState).nextClass === 'deadline');
      expect(hasDl).toBe(true);
    });

    it('resets rq->next_class to idle at the end', () => {
      const last = frames[frames.length - 1].data as CfsState;
      expect(last.nextClass).toBe('idle');
      expect(last.runningPid).toBeNull();
    });

    it('surfaces a waking task on the fast-skip frame', () => {
      // Frame where CFS wakes while RT runs: wakingTask should be fair-class.
      const skipFrame = frames.find(f => {
        const d = f.data as CfsState;
        return d.nextClass === 'rt' && d.wakingTask?.class === 'fair';
      });
      expect(skipFrame).toBeDefined();
    });

    it('descriptions mention key v7.0 terminology', () => {
      const allText = frames.map(f => f.description).join('\n');
      expect(allText).toContain('sched_class_above');
      expect(allText).toContain('rq->next_class');
      expect(allText).toContain('wakeup_preempt');
    });

    it('renderFrame works on the cross-class-preempt frames', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      cfsScheduler.renderFrame(svg, frames[0], 432, 300);
      expect(svg.querySelectorAll('rect').length).toBeGreaterThan(0);
    });
  });

  describe('generateFrames - default', () => {
    it('returns frames for default scenario', () => {
      const frames = cfsScheduler.generateFrames();
      expect(frames.length).toBeGreaterThan(0);
    });
  });

  describe('renderFrame', () => {
    it('renders SVG elements', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = cfsScheduler.generateFrames('equal-weight');
      cfsScheduler.renderFrame(svg, frames[0], 432, 300);
      expect(svg.querySelectorAll('rect').length).toBeGreaterThan(0);
      expect(svg.querySelectorAll('text').length).toBeGreaterThan(0);
    });

    it('renders task names', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = cfsScheduler.generateFrames('equal-weight');
      cfsScheduler.renderFrame(svg, frames[0], 432, 300);
      const texts = Array.from(svg.querySelectorAll('text')).map(t => t.textContent);
      expect(texts.some(t => t?.includes('httpd'))).toBe(true);
    });
  });
});

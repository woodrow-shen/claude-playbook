import { describe, it, expect } from 'vitest';
import contextSwitching from './context-switching.js';
import type { ContextSwitchState } from './context-switching.js';

describe('Context Switching', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(contextSwitching.config.id).toBe('context-switching');
      expect(contextSwitching.config.skillName).toBe('context-switching');
      expect(contextSwitching.config.title).toBe('Context Switching');
    });
  });

  describe('getScenarios', () => {
    it('returns 3 scenarios', () => {
      const scenarios = contextSwitching.getScenarios();
      expect(scenarios.length).toBe(3);
      expect(scenarios.map(s => s.id)).toContain('voluntary-switch');
      expect(scenarios.map(s => s.id)).toContain('preemption');
      expect(scenarios.map(s => s.id)).toContain('kernel-to-user-mm-switch');
    });
  });

  describe('generateFrames - voluntary-switch (default)', () => {
    const frames = contextSwitching.generateFrames('voluntary-switch');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('first frame has step 0', () => {
      expect(frames[0].step).toBe(0);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('srcRef is present on every frame', () => {
      frames.forEach(f => {
        const data = f.data as ContextSwitchState;
        expect(data.srcRef).toBeDefined();
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });

    it('starts in schedule-entry phase', () => {
      const data = frames[0].data as ContextSwitchState;
      expect(data.phase).toBe('schedule-entry');
    });

    it('transitions through phases ending in finish', () => {
      const lastData = frames[frames.length - 1].data as ContextSwitchState;
      expect(lastData.phase).toBe('finish');
    });

    it('current task and next task are different', () => {
      const data = frames[0].data as ContextSwitchState;
      expect(data.currentTask).not.toBe(data.nextTask);
    });

    it('has kernelStack that grows over time', () => {
      const firstData = frames[0].data as ContextSwitchState;
      const midFrame = frames.find(f => {
        const d = f.data as ContextSwitchState;
        return d.phase === 'mm-switch' || d.phase === 'register-switch';
      });
      expect(midFrame).toBeDefined();
      const midData = midFrame!.data as ContextSwitchState;
      expect(midData.kernelStack.length).toBeGreaterThanOrEqual(firstData.kernelStack.length);
    });

    it('descriptions reference __schedule', () => {
      const hasRef = frames.some(f => f.description.includes('__schedule'));
      expect(hasRef).toBe(true);
    });

    it('descriptions reference context_switch', () => {
      const hasRef = frames.some(f => f.description.includes('context_switch'));
      expect(hasRef).toBe(true);
    });

    it('descriptions reference __switch_to', () => {
      const hasRef = frames.some(f => f.description.includes('__switch_to'));
      expect(hasRef).toBe(true);
    });

    it('descriptions reference finish_task_switch', () => {
      const hasRef = frames.some(f => f.description.includes('finish_task_switch'));
      expect(hasRef).toBe(true);
    });

    it('descriptions reference pick_next_task', () => {
      const hasRef = frames.some(f => f.description.includes('pick_next_task'));
      expect(hasRef).toBe(true);
    });

    it('descriptions reference kernel/sched/core.c', () => {
      const hasRef = frames.some(f => f.description.includes('kernel/sched/core.c'));
      expect(hasRef).toBe(true);
    });
  });

  describe('generateFrames - default scenario', () => {
    it('returns frames when called without argument', () => {
      const frames = contextSwitching.generateFrames();
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });
  });

  describe('generateFrames - preemption', () => {
    const frames = contextSwitching.generateFrames('preemption');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('srcRef is present on every frame', () => {
      frames.forEach(f => {
        const data = f.data as ContextSwitchState;
        expect(data.srcRef).toBeDefined();
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });

    it('mentions TIF_NEED_RESCHED in description', () => {
      const hasRef = frames.some(f => f.description.includes('TIF_NEED_RESCHED'));
      expect(hasRef).toBe(true);
    });

    it('mentions preempt_schedule_irq in description', () => {
      const hasRef = frames.some(f => f.description.includes('preempt_schedule_irq'));
      expect(hasRef).toBe(true);
    });

    it('mentions SM_PREEMPT in description', () => {
      const hasRef = frames.some(f => f.description.includes('SM_PREEMPT'));
      expect(hasRef).toBe(true);
    });

    it('ends in finish phase', () => {
      const lastData = frames[frames.length - 1].data as ContextSwitchState;
      expect(lastData.phase).toBe('finish');
    });

    it('has state transitions through phases', () => {
      const phases = frames.map(f => (f.data as ContextSwitchState).phase);
      const uniquePhases = [...new Set(phases)];
      expect(uniquePhases.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('generateFrames - kernel-to-user-mm-switch', () => {
    const frames = contextSwitching.generateFrames('kernel-to-user-mm-switch');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('srcRef is present on every frame', () => {
      frames.forEach(f => {
        const data = f.data as ContextSwitchState;
        expect(data.srcRef).toBeDefined();
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });

    it('mentions switch_mm_irqs_off in description', () => {
      const hasRef = frames.some(f => f.description.includes('switch_mm_irqs_off'));
      expect(hasRef).toBe(true);
    });

    it('mentions enter_lazy_tlb in description', () => {
      const hasRef = frames.some(f => f.description.includes('enter_lazy_tlb'));
      expect(hasRef).toBe(true);
    });

    it('covers all 4 mm switch cases', () => {
      const allDesc = frames.map(f => f.description).join(' ');
      expect(allDesc).toContain('kernel -> kernel');
      expect(allDesc).toContain('user -> kernel');
      expect(allDesc).toContain('kernel -> user');
      expect(allDesc).toContain('user -> user');
    });

    it('has mmState transitions', () => {
      const mmStates = frames.map(f => (f.data as ContextSwitchState).mmState);
      const uniqueStates = [...new Set(mmStates)];
      expect(uniqueStates.length).toBeGreaterThanOrEqual(2);
    });

    it('ends in finish phase', () => {
      const lastData = frames[frames.length - 1].data as ContextSwitchState;
      expect(lastData.phase).toBe('finish');
    });
  });

  describe('renderFrame', () => {
    it('renders title text', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = contextSwitching.generateFrames('voluntary-switch');
      contextSwitching.renderFrame(svg, frames[0], 900, 480);
      const title = svg.querySelector('.anim-title');
      expect(title).not.toBeNull();
    });

    it('renders phase indicator', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = contextSwitching.generateFrames('voluntary-switch');
      contextSwitching.renderFrame(svg, frames[0], 900, 480);
      const phases = svg.querySelectorAll('.anim-block');
      expect(phases.length).toBeGreaterThan(0);
    });

    it('renders task labels', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = contextSwitching.generateFrames('voluntary-switch');
      contextSwitching.renderFrame(svg, frames[0], 900, 480);
      const tasks = svg.querySelectorAll('.anim-task');
      expect(tasks.length).toBeGreaterThan(0);
    });

    it('clears previous content on re-render', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = contextSwitching.generateFrames('voluntary-switch');
      contextSwitching.renderFrame(svg, frames[0], 900, 480);
      const countBefore = svg.childElementCount;
      contextSwitching.renderFrame(svg, frames[1], 900, 480);
      expect(svg.childElementCount).toBeLessThanOrEqual(countBefore + 10);
    });
  });
});

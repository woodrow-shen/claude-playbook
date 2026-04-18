import { describe, it, expect } from 'vitest';
import waitqueueCompletion from './waitqueue-completion.js';
import type { WaitqueueState } from './waitqueue-completion.js';

describe('Waitqueue & Completion', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(waitqueueCompletion.config.id).toBe('waitqueue-completion');
      expect(waitqueueCompletion.config.skillName).toBe('waitqueue-and-completion');
      expect(waitqueueCompletion.config.title).toBe('Wait Queues & Completions');
    });
  });

  describe('getScenarios', () => {
    it('returns 3 scenarios', () => {
      const scenarios = waitqueueCompletion.getScenarios();
      expect(scenarios.length).toBe(3);
      expect(scenarios.map(s => s.id)).toContain('wait-event-wakeup');
      expect(scenarios.map(s => s.id)).toContain('exclusive-wakeup');
      expect(scenarios.map(s => s.id)).toContain('completion-wait');
    });
  });

  describe('generateFrames - wait-event-wakeup (default)', () => {
    const frames = waitqueueCompletion.generateFrames('wait-event-wakeup');

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

    it('data includes phase field', () => {
      const data = frames[0].data as WaitqueueState;
      expect(data.phase).toBeDefined();
    });

    it('data includes waiters array', () => {
      const data = frames[0].data as WaitqueueState;
      expect(Array.isArray(data.waiters)).toBe(true);
    });

    it('data includes wakeSource', () => {
      frames.forEach(f => {
        const data = f.data as WaitqueueState;
        expect(data.wakeSource).toBeDefined();
      });
    });

    it('data includes taskStates', () => {
      const data = frames[0].data as WaitqueueState;
      expect(data.taskStates).toBeDefined();
    });

    it('data includes completionDone', () => {
      frames.forEach(f => {
        const data = f.data as WaitqueueState;
        expect(typeof data.completionDone).toBe('number');
      });
    });

    it('data includes exclusiveCount', () => {
      frames.forEach(f => {
        const data = f.data as WaitqueueState;
        expect(typeof data.exclusiveCount).toBe('number');
      });
    });

    it('data includes srcRef on all frames', () => {
      frames.forEach(f => {
        const data = f.data as WaitqueueState;
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });

    it('transitions through init, prepare, sleeping, wakeup phases', () => {
      const phases = frames.map(f => (f.data as WaitqueueState).phase);
      expect(phases).toContain('init');
      expect(phases).toContain('prepare');
      expect(phases).toContain('sleeping');
      expect(phases).toContain('wakeup');
    });

    it('includes a running phase at end', () => {
      const lastData = frames[frames.length - 1].data as WaitqueueState;
      expect(lastData.phase).toBe('running');
    });

    it('references prepare_to_wait_event in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('prepare_to_wait_event'));
      expect(hasRef).toBe(true);
    });

    it('references schedule() in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('schedule()'));
      expect(hasRef).toBe(true);
    });

    it('references __wake_up_common in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('__wake_up_common'));
      expect(hasRef).toBe(true);
    });

    it('references try_to_wake_up in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('try_to_wake_up'));
      expect(hasRef).toBe(true);
    });

    it('mentions TASK_INTERRUPTIBLE or TASK_UNINTERRUPTIBLE', () => {
      const hasRef = frames.some(f =>
        f.description.includes('TASK_INTERRUPTIBLE') ||
        f.description.includes('TASK_UNINTERRUPTIBLE')
      );
      expect(hasRef).toBe(true);
    });

    it('waiter task state changes from RUNNING to sleeping and back', () => {
      const firstData = frames[0].data as WaitqueueState;
      expect(firstData.taskStates['TaskA']).toBe('TASK_RUNNING');

      const sleepFrame = frames.find(f => (f.data as WaitqueueState).phase === 'sleeping');
      expect(sleepFrame).toBeDefined();
      const sleepData = sleepFrame!.data as WaitqueueState;
      expect(
        sleepData.taskStates['TaskA'] === 'TASK_INTERRUPTIBLE' ||
        sleepData.taskStates['TaskA'] === 'TASK_UNINTERRUPTIBLE'
      ).toBe(true);

      const lastData = frames[frames.length - 1].data as WaitqueueState;
      expect(lastData.taskStates['TaskA']).toBe('TASK_RUNNING');
    });
  });

  describe('generateFrames - default scenario', () => {
    it('returns frames when called without argument', () => {
      const frames = waitqueueCompletion.generateFrames();
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });
  });

  describe('generateFrames - exclusive-wakeup', () => {
    const frames = waitqueueCompletion.generateFrames('exclusive-wakeup');

    it('generates 8-12 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
      expect(frames.length).toBeLessThanOrEqual(12);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('references add_wait_queue_exclusive in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('add_wait_queue_exclusive'));
      expect(hasRef).toBe(true);
    });

    it('references WQ_FLAG_EXCLUSIVE in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('WQ_FLAG_EXCLUSIVE'));
      expect(hasRef).toBe(true);
    });

    it('references nr_exclusive parameter in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('nr_exclusive'));
      expect(hasRef).toBe(true);
    });

    it('mentions thundering herd', () => {
      const hasRef = frames.some(f =>
        f.description.toLowerCase().includes('thundering herd') ||
        f.label.toLowerCase().includes('thundering herd')
      );
      expect(hasRef).toBe(true);
    });

    it('has multiple waiters with exclusive flags', () => {
      const midFrame = frames.find(f => {
        const data = f.data as WaitqueueState;
        return data.waiters.length >= 3;
      });
      expect(midFrame).toBeDefined();
      const data = midFrame!.data as WaitqueueState;
      const exclusiveWaiters = data.waiters.filter(w => w.exclusive);
      expect(exclusiveWaiters.length).toBeGreaterThanOrEqual(2);
    });

    it('exclusiveCount tracks number of exclusive wakers', () => {
      const wakeFrame = frames.find(f => (f.data as WaitqueueState).phase === 'wakeup');
      expect(wakeFrame).toBeDefined();
      const data = wakeFrame!.data as WaitqueueState;
      expect(data.exclusiveCount).toBeGreaterThanOrEqual(1);
    });

    it('has srcRef on all frames', () => {
      frames.forEach(f => {
        const data = f.data as WaitqueueState;
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });
  });

  describe('generateFrames - completion-wait', () => {
    const frames = waitqueueCompletion.generateFrames('completion-wait');

    it('generates 8-12 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
      expect(frames.length).toBeLessThanOrEqual(12);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('references init_completion in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('init_completion'));
      expect(hasRef).toBe(true);
    });

    it('references wait_for_completion in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('wait_for_completion'));
      expect(hasRef).toBe(true);
    });

    it('references complete() in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('complete()'));
      expect(hasRef).toBe(true);
    });

    it('references complete_all in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('complete_all'));
      expect(hasRef).toBe(true);
    });

    it('references done counter in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('done'));
      expect(hasRef).toBe(true);
    });

    it('completionDone changes from 0 to positive', () => {
      const firstData = frames[0].data as WaitqueueState;
      expect(firstData.completionDone).toBe(0);

      const completedFrame = frames.find(f => {
        const data = f.data as WaitqueueState;
        return data.completionDone > 0;
      });
      expect(completedFrame).toBeDefined();
    });

    it('has srcRef on all frames', () => {
      frames.forEach(f => {
        const data = f.data as WaitqueueState;
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });

    it('ends in running phase', () => {
      const lastData = frames[frames.length - 1].data as WaitqueueState;
      expect(lastData.phase).toBe('running');
    });
  });

  describe('renderFrame', () => {
    it('renders title text', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = waitqueueCompletion.generateFrames('wait-event-wakeup');
      waitqueueCompletion.renderFrame(svg, frames[0], 900, 480);
      const title = svg.querySelector('.anim-title');
      expect(title).not.toBeNull();
    });

    it('renders phase indicator', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = waitqueueCompletion.generateFrames('wait-event-wakeup');
      waitqueueCompletion.renderFrame(svg, frames[0], 900, 480);
      const blocks = svg.querySelectorAll('.anim-block');
      expect(blocks.length).toBeGreaterThan(0);
    });

    it('renders waiter entries', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = waitqueueCompletion.generateFrames('wait-event-wakeup');
      const midFrame = frames.find(f => {
        const data = f.data as WaitqueueState;
        return data.waiters.length > 0;
      });
      if (midFrame) {
        waitqueueCompletion.renderFrame(svg, midFrame, 900, 480);
        const waiters = svg.querySelectorAll('.anim-waiter');
        expect(waiters.length).toBeGreaterThan(0);
      }
    });

    it('renders task state labels', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = waitqueueCompletion.generateFrames('wait-event-wakeup');
      waitqueueCompletion.renderFrame(svg, frames[0], 900, 480);
      const labels = svg.querySelectorAll('.anim-task-state');
      expect(labels.length).toBeGreaterThan(0);
    });

    it('clears previous content on re-render', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = waitqueueCompletion.generateFrames('wait-event-wakeup');
      waitqueueCompletion.renderFrame(svg, frames[0], 900, 480);
      const countBefore = svg.childElementCount;
      waitqueueCompletion.renderFrame(svg, frames[1], 900, 480);
      expect(svg.childElementCount).toBeLessThanOrEqual(countBefore + 10);
    });

    it('renders highlight for wakeup frames', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = waitqueueCompletion.generateFrames('wait-event-wakeup');
      const wakeFrame = frames.find(f => (f.data as WaitqueueState).phase === 'wakeup');
      if (wakeFrame) {
        waitqueueCompletion.renderFrame(svg, wakeFrame, 900, 480);
        const highlights = svg.querySelectorAll('.anim-highlight');
        expect(highlights.length).toBeGreaterThan(0);
      }
    });
  });
});

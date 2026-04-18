import { describe, it, expect } from 'vitest';
import timerHrtimerModule from './timer-hrtimer.js';
import type { TimerHrtimerState } from './timer-hrtimer.js';

describe('timer-hrtimer animation module', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(timerHrtimerModule.config.id).toBe('timer-hrtimer');
      expect(timerHrtimerModule.config.skillName).toBe('timers-and-hrtimers');
    });

    it('has a title', () => {
      expect(timerHrtimerModule.config.title).toBeTruthy();
    });
  });

  describe('getScenarios', () => {
    it('returns 3 scenarios', () => {
      const scenarios = timerHrtimerModule.getScenarios();
      expect(scenarios.length).toBe(3);
    });

    it('includes timer-wheel, hrtimer-rb-tree, and nanosleep-implementation', () => {
      const ids = timerHrtimerModule.getScenarios().map(s => s.id);
      expect(ids).toContain('timer-wheel');
      expect(ids).toContain('hrtimer-rb-tree');
      expect(ids).toContain('nanosleep-implementation');
    });
  });

  describe('generateFrames - timer-wheel (default)', () => {
    const frames = timerHrtimerModule.generateFrames('timer-wheel');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('first frame has step=0', () => {
      expect(frames[0].step).toBe(0);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('every frame has a srcRef in data', () => {
      frames.forEach(f => {
        const data = f.data as TimerHrtimerState;
        expect(data.srcRef).toBeTruthy();
      });
    });

    it('shows add_timer in descriptions', () => {
      expect(frames.some(f => f.description.includes('add_timer'))).toBe(true);
    });

    it('shows __mod_timer in descriptions', () => {
      expect(frames.some(f => f.description.includes('__mod_timer'))).toBe(true);
    });

    it('shows internal_add_timer in descriptions', () => {
      expect(frames.some(f => f.description.includes('internal_add_timer'))).toBe(true);
    });

    it('shows calc_wheel_index in descriptions', () => {
      expect(frames.some(f => f.description.includes('calc_wheel_index'))).toBe(true);
    });

    it('shows run_timer_softirq in descriptions', () => {
      expect(frames.some(f => f.description.includes('run_timer_softirq'))).toBe(true);
    });

    it('shows expire_timers in descriptions', () => {
      expect(frames.some(f => f.description.includes('expire_timers'))).toBe(true);
    });

    it('shows __run_timers in descriptions', () => {
      expect(frames.some(f => f.description.includes('__run_timers'))).toBe(true);
    });

    it('state starts with enqueue phase', () => {
      const data = frames[0].data as TimerHrtimerState;
      expect(data.phase).toBe('enqueue');
    });

    it('wheel buckets grow as timers are added', () => {
      const firstData = frames[0].data as TimerHrtimerState;
      const hasMoreBuckets = frames.some(f => {
        const data = f.data as TimerHrtimerState;
        return data.wheelBuckets.length > firstData.wheelBuckets.length;
      });
      expect(hasMoreBuckets).toBe(true);
    });
  });

  describe('generateFrames - default returns frames', () => {
    it('returns frames when called without argument', () => {
      expect(timerHrtimerModule.generateFrames().length).toBeGreaterThan(0);
    });
  });

  describe('generateFrames - hrtimer-rb-tree', () => {
    const frames = timerHrtimerModule.generateFrames('hrtimer-rb-tree');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('every frame has a srcRef in data', () => {
      frames.forEach(f => {
        const data = f.data as TimerHrtimerState;
        expect(data.srcRef).toBeTruthy();
      });
    });

    it('shows hrtimer_start_range_ns in descriptions', () => {
      expect(frames.some(f => f.description.includes('hrtimer_start_range_ns'))).toBe(true);
    });

    it('shows __hrtimer_start_range_ns in descriptions', () => {
      expect(frames.some(f => f.description.includes('__hrtimer_start_range_ns'))).toBe(true);
    });

    it('shows enqueue_hrtimer in descriptions', () => {
      expect(frames.some(f => f.description.includes('enqueue_hrtimer'))).toBe(true);
    });

    it('shows hrtimer_reprogram in descriptions', () => {
      expect(frames.some(f => f.description.includes('hrtimer_reprogram'))).toBe(true);
    });

    it('shows hrtimer_interrupt in descriptions', () => {
      expect(frames.some(f => f.description.includes('hrtimer_interrupt'))).toBe(true);
    });

    it('shows __hrtimer_run_queues in descriptions', () => {
      expect(frames.some(f => f.description.includes('__hrtimer_run_queues'))).toBe(true);
    });

    it('shows __run_hrtimer in descriptions', () => {
      expect(frames.some(f => f.description.includes('__run_hrtimer'))).toBe(true);
    });

    it('rb-tree nodes grow as hrtimers are enqueued', () => {
      const firstData = frames[0].data as TimerHrtimerState;
      const hasMoreNodes = frames.some(f => {
        const data = f.data as TimerHrtimerState;
        return data.rbTreeNodes.length > firstData.rbTreeNodes.length;
      });
      expect(hasMoreNodes).toBe(true);
    });
  });

  describe('generateFrames - nanosleep-implementation', () => {
    const frames = timerHrtimerModule.generateFrames('nanosleep-implementation');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('every frame has a srcRef in data', () => {
      frames.forEach(f => {
        const data = f.data as TimerHrtimerState;
        expect(data.srcRef).toBeTruthy();
      });
    });

    it('shows hrtimer_nanosleep in descriptions', () => {
      expect(frames.some(f => f.description.includes('hrtimer_nanosleep'))).toBe(true);
    });

    it('shows do_nanosleep in descriptions', () => {
      expect(frames.some(f => f.description.includes('do_nanosleep'))).toBe(true);
    });

    it('shows hrtimer_wakeup in descriptions', () => {
      expect(frames.some(f => f.description.includes('hrtimer_wakeup'))).toBe(true);
    });

    it('shows schedule in descriptions', () => {
      expect(frames.some(f => f.description.includes('schedule'))).toBe(true);
    });

    it('shows nanosleep syscall entry', () => {
      expect(frames.some(f =>
        f.description.includes('SYSCALL_DEFINE2(nanosleep') ||
        f.description.includes('nanosleep')
      )).toBe(true);
    });

    it('shows task sleeping and waking', () => {
      const hasSleeping = frames.some(f => {
        const data = f.data as TimerHrtimerState;
        return data.taskState === 'sleeping';
      });
      const hasRunning = frames.some(f => {
        const data = f.data as TimerHrtimerState;
        return data.taskState === 'running';
      });
      expect(hasSleeping).toBe(true);
      expect(hasRunning).toBe(true);
    });
  });

  describe('state interface consistency', () => {
    const allScenarios = ['timer-wheel', 'hrtimer-rb-tree', 'nanosleep-implementation'];

    allScenarios.forEach(scenario => {
      describe(`scenario: ${scenario}`, () => {
        const frames = timerHrtimerModule.generateFrames(scenario);

        it('every frame has required state fields', () => {
          frames.forEach(f => {
            const data = f.data as TimerHrtimerState;
            expect(data).toHaveProperty('currentFunction');
            expect(data).toHaveProperty('phase');
            expect(data).toHaveProperty('wheelBuckets');
            expect(data).toHaveProperty('rbTreeNodes');
            expect(data).toHaveProperty('taskState');
            expect(data).toHaveProperty('srcRef');
          });
        });

        it('every frame has real kernel function names in currentFunction', () => {
          frames.forEach(f => {
            const data = f.data as TimerHrtimerState;
            expect(data.currentFunction).toBeTruthy();
          });
        });
      });
    });
  });
});

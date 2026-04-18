import { describe, it, expect } from 'vitest';
import interruptFlow from './interrupt-flow.js';
import type { InterruptState } from './interrupt-flow.js';

describe('Interrupt Flow', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(interruptFlow.config.id).toBe('interrupt-flow');
      expect(interruptFlow.config.skillName).toBe('interrupt-handling');
      expect(interruptFlow.config.title).toBe('Interrupt Handling Flow');
    });
  });

  describe('getScenarios', () => {
    it('returns 3 scenarios', () => {
      const scenarios = interruptFlow.getScenarios();
      expect(scenarios.length).toBe(3);
      expect(scenarios.map(s => s.id)).toContain('network-irq');
      expect(scenarios.map(s => s.id)).toContain('timer-softirq');
      expect(scenarios.map(s => s.id)).toContain('workqueue-deferred');
    });
  });

  describe('generateFrames - network-irq (default)', () => {
    const frames = interruptFlow.generateFrames('network-irq');

    it('generates at least 10 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(10);
    });

    it('first frame has step 0', () => {
      expect(frames[0].step).toBe(0);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('has frames with phase hardirq-entry', () => {
      const hasPhase = frames.some(f => {
        const data = f.data as InterruptState;
        return data.phase === 'hardirq-entry';
      });
      expect(hasPhase).toBe(true);
    });

    it('has frames with phase top-half', () => {
      const hasPhase = frames.some(f => {
        const data = f.data as InterruptState;
        return data.phase === 'top-half';
      });
      expect(hasPhase).toBe(true);
    });

    it('has frames with phase softirq', () => {
      const hasPhase = frames.some(f => {
        const data = f.data as InterruptState;
        return data.phase === 'softirq';
      });
      expect(hasPhase).toBe(true);
    });

    it('data includes cpus array', () => {
      const data = frames[0].data as InterruptState;
      expect(Array.isArray(data.cpus)).toBe(true);
      expect(data.cpus.length).toBeGreaterThan(0);
    });

    it('data includes phase field', () => {
      const data = frames[0].data as InterruptState;
      expect(data.phase).toBeDefined();
    });

    it('data includes softirqs array', () => {
      const data = frames[0].data as InterruptState;
      expect(Array.isArray(data.softirqs)).toBe(true);
    });

    it('shows NET_RX softirq becoming pending', () => {
      const hasNetRx = frames.some(f => {
        const data = f.data as InterruptState;
        return data.softirqs.some(s => s.name === 'NET_RX' && s.pending);
      });
      expect(hasNetRx).toBe(true);
    });

    it('shows NET_RX softirq running', () => {
      const hasNetRxRunning = frames.some(f => {
        const data = f.data as InterruptState;
        return data.softirqs.some(s => s.name === 'NET_RX' && s.running);
      });
      expect(hasNetRxRunning).toBe(true);
    });

    it('includes context stack', () => {
      const data = frames[0].data as InterruptState;
      expect(Array.isArray(data.contextStack)).toBe(true);
    });
  });

  describe('generateFrames - default scenario', () => {
    it('returns frames when called without argument', () => {
      const frames = interruptFlow.generateFrames();
      expect(frames.length).toBeGreaterThanOrEqual(10);
    });
  });

  describe('generateFrames - timer-softirq', () => {
    const frames = interruptFlow.generateFrames('timer-softirq');

    it('generates at least 10 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(10);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('has softirq entries with name TIMER', () => {
      const hasTimer = frames.some(f => {
        const data = f.data as InterruptState;
        return data.softirqs.some(s => s.name === 'TIMER' && (s.pending || s.running));
      });
      expect(hasTimer).toBe(true);
    });

    it('has softirq entries with name SCHED', () => {
      const hasSched = frames.some(f => {
        const data = f.data as InterruptState;
        return data.softirqs.some(s => s.name === 'SCHED' && (s.pending || s.running));
      });
      expect(hasSched).toBe(true);
    });

    it('has frames with phase softirq', () => {
      const hasPhase = frames.some(f => {
        const data = f.data as InterruptState;
        return data.phase === 'softirq';
      });
      expect(hasPhase).toBe(true);
    });
  });

  describe('generateFrames - workqueue-deferred', () => {
    const frames = interruptFlow.generateFrames('workqueue-deferred');

    it('generates at least 10 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(10);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('has frame with phase workqueue', () => {
      const hasPhase = frames.some(f => {
        const data = f.data as InterruptState;
        return data.phase === 'workqueue';
      });
      expect(hasPhase).toBe(true);
    });

    it('has workqueue items', () => {
      const hasWorkqueue = frames.some(f => {
        const data = f.data as InterruptState;
        return data.workqueue.length > 0;
      });
      expect(hasWorkqueue).toBe(true);
    });

    it('shows workqueue item running', () => {
      const hasRunning = frames.some(f => {
        const data = f.data as InterruptState;
        return data.workqueue.some(w => w.state === 'running');
      });
      expect(hasRunning).toBe(true);
    });
  });

  describe('renderFrame', () => {
    it('renders CPU boxes', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = interruptFlow.generateFrames('network-irq');
      interruptFlow.renderFrame(svg, frames[0], 900, 480);
      const cpuRects = svg.querySelectorAll('.anim-cpu');
      expect(cpuRects.length).toBeGreaterThan(0);
    });

    it('renders flow stage blocks', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = interruptFlow.generateFrames('network-irq');
      interruptFlow.renderFrame(svg, frames[3], 900, 480);
      const blocks = svg.querySelectorAll('.anim-block');
      expect(blocks.length).toBeGreaterThan(0);
    });

    it('renders softirq bits', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = interruptFlow.generateFrames('network-irq');
      // Pick a frame where softirqs are pending
      const softirqFrame = frames.find(f => {
        const data = f.data as InterruptState;
        return data.softirqs.some(s => s.pending || s.running);
      });
      if (softirqFrame) {
        interruptFlow.renderFrame(svg, softirqFrame, 900, 480);
        const bits = svg.querySelectorAll('.anim-softirq-bit');
        expect(bits.length).toBeGreaterThan(0);
      }
    });

    it('renders context stack', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = interruptFlow.generateFrames('network-irq');
      interruptFlow.renderFrame(svg, frames[3], 900, 480);
      const stackEntries = svg.querySelectorAll('.anim-stack-entry');
      expect(stackEntries.length).toBeGreaterThan(0);
    });

    it('renders title text', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = interruptFlow.generateFrames('network-irq');
      interruptFlow.renderFrame(svg, frames[0], 900, 480);
      const title = svg.querySelector('.anim-title');
      expect(title).not.toBeNull();
    });

    it('clears previous content on re-render', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = interruptFlow.generateFrames('network-irq');
      interruptFlow.renderFrame(svg, frames[0], 900, 480);
      const countBefore = svg.childElementCount;
      interruptFlow.renderFrame(svg, frames[1], 900, 480);
      // Should not accumulate elements
      expect(svg.childElementCount).toBeLessThanOrEqual(countBefore + 10);
    });
  });
});

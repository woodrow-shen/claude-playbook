import { describe, it, expect } from 'vitest';
import rcuGracePeriod from './rcu-grace-period.js';
import type { RcuState } from './rcu-grace-period.js';

describe('RCU Grace Period', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(rcuGracePeriod.config.id).toBe('rcu-grace-period');
      expect(rcuGracePeriod.config.skillName).toBe('rcu-fundamentals');
      expect(rcuGracePeriod.config.title).toBe('RCU Grace Period Mechanism');
    });
  });

  describe('getScenarios', () => {
    it('returns 3 scenarios', () => {
      const scenarios = rcuGracePeriod.getScenarios();
      expect(scenarios.length).toBe(3);
      expect(scenarios.map(s => s.id)).toEqual([
        'grace-period-basic',
        'reader-protection',
        'callback-batching',
      ]);
    });
  });

  describe('generateFrames - grace-period-basic', () => {
    const frames = rcuGracePeriod.generateFrames('grace-period-basic');

    it('generates at least 10 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(10);
    });

    it('first frame has step 0', () => {
      expect(frames[0].step).toBe(0);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('starts with 4 CPUs', () => {
      const data = frames[0].data as RcuState;
      expect(data.cpus.length).toBe(4);
    });

    it('has frames showing QS propagation with passedQS=true', () => {
      const hasQS = frames.some(f => {
        const data = f.data as RcuState;
        return data.cpus.some(c => c.passedQS);
      });
      expect(hasQS).toBe(true);
    });

    it('has nodeTree with hierarchical nodes', () => {
      const data = frames[0].data as RcuState;
      expect(data.nodeTree.length).toBeGreaterThan(0);
      const root = data.nodeTree.find(n => n.level === 0);
      expect(root).toBeDefined();
    });

    it('has callbacks array', () => {
      const data = frames[0].data as RcuState;
      expect(Array.isArray(data.callbacks)).toBe(true);
    });

    it('has grace period number and phase', () => {
      const data = frames[0].data as RcuState;
      expect(typeof data.gracePeriodNum).toBe('number');
      expect(data.phase).toBeDefined();
    });

    it('has dataPointer with old and new fields', () => {
      const data = frames[0].data as RcuState;
      expect(data.dataPointer).toBeDefined();
      expect(data.dataPointer.old).toBeDefined();
      expect(data.dataPointer.new).toBeDefined();
      expect(data.dataPointer.current).toBeDefined();
    });

    it('shows grace period completion at end', () => {
      const last = frames[frames.length - 1].data as RcuState;
      expect(last.phase).toBe('invoking-callbacks');
    });

    it('shows nodes propagating to complete', () => {
      const hasComplete = frames.some(f => {
        const data = f.data as RcuState;
        return data.nodeTree.some(n => n.state === 'complete');
      });
      expect(hasComplete).toBe(true);
    });
  });

  describe('generateFrames - reader-protection', () => {
    const frames = rcuGracePeriod.generateFrames('reader-protection');

    it('generates at least 10 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(10);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('has a CPU in inReadSide=true state', () => {
      const hasReader = frames.some(f => {
        const data = f.data as RcuState;
        return data.cpus.some(c => c.inReadSide);
      });
      expect(hasReader).toBe(true);
    });

    it('shows publish-subscribe pattern with pointer switch', () => {
      const hasNewPointer = frames.some(f => {
        const data = f.data as RcuState;
        return data.dataPointer.current === 'new';
      });
      expect(hasNewPointer).toBe(true);
    });

    it('has cpus, nodeTree, callbacks, and phase in data', () => {
      const data = frames[0].data as RcuState;
      expect(Array.isArray(data.cpus)).toBe(true);
      expect(Array.isArray(data.nodeTree)).toBe(true);
      expect(Array.isArray(data.callbacks)).toBe(true);
      expect(data.phase).toBeDefined();
    });
  });

  describe('generateFrames - callback-batching', () => {
    const frames = rcuGracePeriod.generateFrames('callback-batching');

    it('generates at least 10 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(10);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('has callbacks in different states', () => {
      const allStates = new Set<string>();
      frames.forEach(f => {
        const data = f.data as RcuState;
        data.callbacks.forEach(cb => allStates.add(cb.state));
      });
      expect(allStates.has('pending')).toBe(true);
      expect(allStates.has('waiting-gp')).toBe(true);
      expect(allStates.has('ready')).toBe(true);
      expect(allStates.has('invoked')).toBe(true);
    });

    it('has multiple callbacks', () => {
      const hasMultiple = frames.some(f => {
        const data = f.data as RcuState;
        return data.callbacks.length >= 3;
      });
      expect(hasMultiple).toBe(true);
    });
  });

  describe('generateFrames - default', () => {
    it('returns frames when no scenario specified', () => {
      const frames = rcuGracePeriod.generateFrames();
      expect(frames.length).toBeGreaterThan(0);
    });
  });

  describe('renderFrame', () => {
    it('renders CPU boxes', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = rcuGracePeriod.generateFrames('grace-period-basic');
      rcuGracePeriod.renderFrame(svg, frames[0], 900, 480);
      const cpuRects = svg.querySelectorAll('.anim-cpu');
      expect(cpuRects.length).toBe(4);
    });

    it('renders rcu node tree elements', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = rcuGracePeriod.generateFrames('grace-period-basic');
      rcuGracePeriod.renderFrame(svg, frames[0], 900, 480);
      const nodes = svg.querySelectorAll('.anim-rcu-node');
      expect(nodes.length).toBeGreaterThan(0);
    });

    it('renders callback queue elements', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = rcuGracePeriod.generateFrames('grace-period-basic');
      // Find a frame with callbacks
      const frameWithCb = frames.find(f => (f.data as RcuState).callbacks.length > 0);
      if (frameWithCb) {
        rcuGracePeriod.renderFrame(svg, frameWithCb, 900, 480);
        const cbs = svg.querySelectorAll('.anim-rcu-callback');
        expect(cbs.length).toBeGreaterThan(0);
      }
    });

    it('renders data pointer visualization', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = rcuGracePeriod.generateFrames('grace-period-basic');
      rcuGracePeriod.renderFrame(svg, frames[0], 900, 480);
      const ptrs = svg.querySelectorAll('.anim-rcu-pointer');
      expect(ptrs.length).toBeGreaterThan(0);
    });

    it('renders phase label', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = rcuGracePeriod.generateFrames('grace-period-basic');
      rcuGracePeriod.renderFrame(svg, frames[2], 900, 480);
      const phaseLabel = svg.querySelector('.anim-rcu-phase');
      expect(phaseLabel).not.toBeNull();
    });
  });
});

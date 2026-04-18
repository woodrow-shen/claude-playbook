import { describe, it, expect } from 'vitest';
import qspinlock from './qspinlock.js';
import type { QspinlockState } from './qspinlock.js';

describe('qspinlock MCS Queue', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(qspinlock.config.id).toBe('qspinlock');
      expect(qspinlock.config.skillName).toBe('spinlocks-and-mutexes');
      expect(qspinlock.config.title).toBe('qspinlock MCS Queue');
    });
  });

  describe('getScenarios', () => {
    it('returns 3 scenarios', () => {
      const scenarios = qspinlock.getScenarios();
      expect(scenarios.length).toBe(3);
    });

    it('includes fast-path, pending-path, and mcs-queue-contention', () => {
      const ids = qspinlock.getScenarios().map(s => s.id);
      expect(ids).toContain('fast-path');
      expect(ids).toContain('pending-path');
      expect(ids).toContain('mcs-queue-contention');
    });
  });

  describe('generateFrames - fast-path (default)', () => {
    const frames = qspinlock.generateFrames('fast-path');

    it('generates at least 6 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(6);
    });

    it('first frame has step=0', () => {
      expect(frames[0].step).toBe(0);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('lock word starts unlocked (all zeros)', () => {
      const data = frames[0].data as QspinlockState;
      expect(data.lockWord.locked).toBe(false);
      expect(data.lockWord.pending).toBe(false);
      expect(data.lockWord.tailCpu).toBeNull();
    });

    it('lock word goes from unlocked to locked in one step', () => {
      const frame0 = frames[0].data as QspinlockState;
      const frame1 = frames[1].data as QspinlockState;
      expect(frame0.lockWord.locked).toBe(false);
      expect(frame1.lockWord.locked).toBe(true);
    });

    it('has CPU data', () => {
      const data = frames[0].data as QspinlockState;
      expect(data.cpus.length).toBeGreaterThan(0);
    });

    it('mcsQueue is empty for fast path', () => {
      frames.forEach(f => {
        const data = f.data as QspinlockState;
        expect(data.mcsQueue.length).toBe(0);
      });
    });

    it('references queued_spin_lock in descriptions', () => {
      expect(frames.some(f => f.description.includes('queued_spin_lock'))).toBe(true);
    });
  });

  describe('generateFrames - default scenario returns frames', () => {
    it('returns frames when called without argument', () => {
      expect(qspinlock.generateFrames().length).toBeGreaterThan(0);
    });
  });

  describe('generateFrames - pending-path', () => {
    const frames = qspinlock.generateFrames('pending-path');

    it('generates at least 6 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(6);
    });

    it('first frame has step=0 and sequential steps', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('has a frame with pending=true in lockWord', () => {
      const hasPending = frames.some(f => {
        const data = f.data as QspinlockState;
        return data.lockWord.pending === true;
      });
      expect(hasPending).toBe(true);
    });

    it('has at least 2 CPUs', () => {
      const data = frames[0].data as QspinlockState;
      expect(data.cpus.length).toBeGreaterThanOrEqual(2);
    });

    it('mcsQueue stays empty (pending avoids MCS queue)', () => {
      frames.forEach(f => {
        const data = f.data as QspinlockState;
        expect(data.mcsQueue.length).toBe(0);
      });
    });

    it('references queued_spin_lock_slowpath in descriptions', () => {
      expect(frames.some(f => f.description.includes('queued_spin_lock_slowpath'))).toBe(true);
    });

    it('explains the 2-waiter optimization', () => {
      expect(frames.some(f =>
        f.description.toLowerCase().includes('pending') &&
        (f.description.toLowerCase().includes('avoid') || f.description.toLowerCase().includes('optimization'))
      )).toBe(true);
    });
  });

  describe('generateFrames - mcs-queue-contention', () => {
    const frames = qspinlock.generateFrames('mcs-queue-contention');

    it('generates at least 6 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(6);
    });

    it('first frame has step=0 and sequential steps', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('has at least 4 CPUs', () => {
      const data = frames[0].data as QspinlockState;
      expect(data.cpus.length).toBeGreaterThanOrEqual(4);
    });

    it('has mcsQueue with multiple nodes', () => {
      const hasMultipleNodes = frames.some(f => {
        const data = f.data as QspinlockState;
        return data.mcsQueue.length >= 2;
      });
      expect(hasMultipleNodes).toBe(true);
    });

    it('mcs nodes have next pointers linking them', () => {
      const hasNextPointers = frames.some(f => {
        const data = f.data as QspinlockState;
        return data.mcsQueue.some(node => node.next !== null);
      });
      expect(hasNextPointers).toBe(true);
    });

    it('has nodes in spinning state', () => {
      const hasSpinning = frames.some(f => {
        const data = f.data as QspinlockState;
        return data.mcsQueue.some(node => node.state === 'spinning-local' || node.state === 'head-spinning-lock');
      });
      expect(hasSpinning).toBe(true);
    });

    it('has cache line activity data', () => {
      const hasCacheActivity = frames.some(f => {
        const data = f.data as QspinlockState;
        return data.cacheLineActivity.length > 0;
      });
      expect(hasCacheActivity).toBe(true);
    });

    it('references mcs_spin_lock in descriptions', () => {
      expect(frames.some(f => f.description.includes('mcs_spin_lock'))).toBe(true);
    });

    it('explains cache-line bouncing benefit', () => {
      expect(frames.some(f =>
        f.description.toLowerCase().includes('cache') &&
        f.description.toLowerCase().includes('spin')
      )).toBe(true);
    });

    it('tail pointer in lockWord references a CPU', () => {
      const hasTail = frames.some(f => {
        const data = f.data as QspinlockState;
        return data.lockWord.tailCpu !== null;
      });
      expect(hasTail).toBe(true);
    });

    it('data includes lockWord, cpus, mcsQueue, cacheLineActivity', () => {
      frames.forEach(f => {
        const data = f.data as QspinlockState;
        expect(data).toHaveProperty('lockWord');
        expect(data).toHaveProperty('cpus');
        expect(data).toHaveProperty('mcsQueue');
        expect(data).toHaveProperty('cacheLineActivity');
      });
    });
  });

  describe('renderFrame', () => {
    it('creates SVG elements for lock word bit diagram', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = qspinlock.generateFrames('fast-path');
      qspinlock.renderFrame(svg, frames[1], 900, 480);
      expect(svg.querySelector('.anim-lockword')).not.toBeNull();
    });

    it('creates SVG elements for CPU boxes', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = qspinlock.generateFrames('mcs-queue-contention');
      qspinlock.renderFrame(svg, frames[3], 900, 480);
      const cpuElements = svg.querySelectorAll('.anim-cpu');
      expect(cpuElements.length).toBeGreaterThanOrEqual(4);
    });

    it('creates MCS queue node elements for queue scenario', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = qspinlock.generateFrames('mcs-queue-contention');
      // Find a frame that has MCS nodes
      const queueFrame = frames.find(f => {
        const data = f.data as QspinlockState;
        return data.mcsQueue.length > 0;
      });
      expect(queueFrame).toBeDefined();
      qspinlock.renderFrame(svg, queueFrame!, 900, 480);
      const mcsNodes = svg.querySelectorAll('.anim-mcs-node');
      expect(mcsNodes.length).toBeGreaterThan(0);
    });

    it('creates cache line activity elements', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = qspinlock.generateFrames('mcs-queue-contention');
      const cacheFrame = frames.find(f => {
        const data = f.data as QspinlockState;
        return data.cacheLineActivity.length > 0;
      });
      expect(cacheFrame).toBeDefined();
      qspinlock.renderFrame(svg, cacheFrame!, 900, 480);
      const cacheElements = svg.querySelectorAll('.anim-cacheline');
      expect(cacheElements.length).toBeGreaterThan(0);
    });

    it('renders without errors for all scenarios and frames', () => {
      const scenarios = ['fast-path', 'pending-path', 'mcs-queue-contention'];
      for (const scenario of scenarios) {
        const frames = qspinlock.generateFrames(scenario);
        for (const frame of frames) {
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          expect(() => {
            qspinlock.renderFrame(svg, frame, 900, 480);
          }).not.toThrow();
        }
      }
    });
  });
});

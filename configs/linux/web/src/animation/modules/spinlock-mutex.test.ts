import { describe, it, expect } from 'vitest';
import spinlockMutex from './spinlock-mutex.js';
import type { LockState } from './spinlock-mutex.js';

describe('Spinlock/Mutex', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(spinlockMutex.config.id).toBe('spinlock-mutex');
      expect(spinlockMutex.config.skillName).toBe('spinlocks-and-mutexes');
    });
  });

  describe('getScenarios', () => {
    it('returns 3 scenarios', () => {
      expect(spinlockMutex.getScenarios().length).toBe(3);
    });
  });

  describe('generateFrames - spinlock-contention', () => {
    const frames = spinlockMutex.generateFrames('spinlock-contention');

    it('generates multiple frames', () => {
      expect(frames.length).toBeGreaterThan(3);
    });

    it('starts with 4 idle CPUs', () => {
      const data = frames[0].data as LockState;
      expect(data.cpus.length).toBe(4);
      expect(data.cpus.every(c => c.state === 'idle')).toBe(true);
    });

    it('lock starts free', () => {
      const data = frames[0].data as LockState;
      expect(data.lock.owner).toBeNull();
      expect(data.lock.type).toBe('spinlock');
    });

    it('shows spinning CPUs', () => {
      const hasSpinning = frames.some(f => {
        const data = f.data as LockState;
        return data.cpus.some(c => c.state === 'spinning');
      });
      expect(hasSpinning).toBe(true);
    });

    it('accumulates wasted cycles', () => {
      const last = frames[frames.length - 1].data as LockState;
      const totalWasted = last.cpus.reduce((s, c) => s + c.cyclesWasted, 0);
      expect(totalWasted).toBeGreaterThan(0);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });
  });

  describe('generateFrames - mutex-sleep', () => {
    const frames = spinlockMutex.generateFrames('mutex-sleep');

    it('generates multiple frames', () => {
      expect(frames.length).toBeGreaterThan(3);
    });

    it('uses mutex type', () => {
      const data = frames[0].data as LockState;
      expect(data.lock.type).toBe('mutex');
    });

    it('shows sleeping CPUs instead of spinning', () => {
      const hasSleeping = frames.some(f => {
        const data = f.data as LockState;
        return data.cpus.some(c => c.state === 'sleeping');
      });
      expect(hasSleeping).toBe(true);
    });

    it('has a wait queue', () => {
      const hasWaitQueue = frames.some(f => {
        const data = f.data as LockState;
        return data.lock.waitQueue.length > 0;
      });
      expect(hasWaitQueue).toBe(true);
    });

    it('no cycles wasted (sleeping does not waste CPU)', () => {
      const last = frames[frames.length - 1].data as LockState;
      const totalWasted = last.cpus.reduce((s, c) => s + c.cyclesWasted, 0);
      expect(totalWasted).toBe(0);
    });
  });

  describe('generateFrames - priority-inversion', () => {
    const frames = spinlockMutex.generateFrames('priority-inversion');

    it('generates multiple frames', () => {
      expect(frames.length).toBeGreaterThan(3);
    });

    it('has 3 CPUs', () => {
      const data = frames[0].data as LockState;
      expect(data.cpus.length).toBe(3);
    });

    it('mentions priority inheritance', () => {
      expect(frames.some(f => f.description.includes('inheritance'))).toBe(true);
    });
  });

  describe('generateFrames - default', () => {
    it('returns frames', () => {
      expect(spinlockMutex.generateFrames().length).toBeGreaterThan(0);
    });
  });

  describe('renderFrame', () => {
    it('renders CPU boxes', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = spinlockMutex.generateFrames('spinlock-contention');
      spinlockMutex.renderFrame(svg, frames[2], 432, 300);
      const cpuRects = svg.querySelectorAll('.anim-cpu');
      expect(cpuRects.length).toBe(4);
    });

    it('renders lock element', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = spinlockMutex.generateFrames('spinlock-contention');
      spinlockMutex.renderFrame(svg, frames[1], 432, 300);
      expect(svg.querySelector('.anim-lock')).not.toBeNull();
    });

    it('renders CPU state labels', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = spinlockMutex.generateFrames('spinlock-contention');
      spinlockMutex.renderFrame(svg, frames[2], 432, 300);
      const texts = Array.from(svg.querySelectorAll('text')).map(t => t.textContent);
      expect(texts.some(t => t === 'SPINNING')).toBe(true);
    });
  });
});

import { describe, it, expect } from 'vitest';
import futexWaitWake from './futex-wait-wake.js';
import type { FutexState } from './futex-wait-wake.js';

describe('Futex Wait/Wake', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(futexWaitWake.config.id).toBe('futex-wait-wake');
      expect(futexWaitWake.config.skillName).toBe('futex-and-locking');
    });
  });

  describe('getScenarios', () => {
    it('returns 3 scenarios', () => {
      expect(futexWaitWake.getScenarios().length).toBe(3);
    });

    it('includes futex-wait-wake, futex-fast-path, and futex-pi', () => {
      const ids = futexWaitWake.getScenarios().map(s => s.id);
      expect(ids).toContain('futex-wait-wake');
      expect(ids).toContain('futex-fast-path');
      expect(ids).toContain('futex-pi');
    });
  });

  describe('generateFrames - futex-wait-wake (default)', () => {
    const frames = futexWaitWake.generateFrames('futex-wait-wake');

    it('generates 8+ frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('every frame has srcRef in data', () => {
      frames.forEach(f => {
        const data = f.data as FutexState;
        expect(data.srcRef).toBeDefined();
        expect(typeof data.srcRef).toBe('string');
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });

    it('shows hash bucket in state', () => {
      const hasHashBucket = frames.some(f => {
        const data = f.data as FutexState;
        return data.hashBucket >= 0;
      });
      expect(hasHashBucket).toBe(true);
    });

    it('shows enqueue - tid added to waitQueue', () => {
      const hasEnqueue = frames.some(f => {
        const data = f.data as FutexState;
        return data.waitQueue.length > 0;
      });
      expect(hasEnqueue).toBe(true);
    });

    it('shows wake - waitQueue empties and thread resumes', () => {
      const lastFrame = frames[frames.length - 1];
      const data = lastFrame.data as FutexState;
      expect(data.waitQueue.length).toBe(0);
      expect(data.threads.some(t => t.state === 'running')).toBe(true);
    });

    it('mentions real function names in descriptions', () => {
      const allDesc = frames.map(f => f.description).join(' ');
      expect(allDesc).toContain('futex_wait');
      expect(allDesc).toContain('futex_wake');
      expect(allDesc).toContain('get_futex_key');
    });

    it('has waiting thread state during enqueue phase', () => {
      const hasWaiting = frames.some(f => {
        const data = f.data as FutexState;
        return data.threads.some(t => t.state === 'waiting');
      });
      expect(hasWaiting).toBe(true);
    });

    it('has waking thread state during wake phase', () => {
      const hasWaking = frames.some(f => {
        const data = f.data as FutexState;
        return data.threads.some(t => t.state === 'waking');
      });
      expect(hasWaking).toBe(true);
    });
  });

  describe('generateFrames - futex-fast-path', () => {
    const frames = futexWaitWake.generateFrames('futex-fast-path');

    it('generates 8+ frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('every frame has srcRef in data', () => {
      frames.forEach(f => {
        const data = f.data as FutexState;
        expect(data.srcRef).toBeDefined();
        expect(typeof data.srcRef).toBe('string');
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });

    it('mentions fast path and CAS in descriptions', () => {
      const allDesc = frames.map(f => f.description).join(' ');
      expect(allDesc).toContain('fast path');
      expect(allDesc.toLowerCase()).toContain('atomic');
    });

    it('shows the slow path fallback to FUTEX_WAIT', () => {
      const allDesc = frames.map(f => f.description).join(' ');
      expect(allDesc).toContain('futex_wait');
    });

    it('includes fast-path phase', () => {
      const hasFastPath = frames.some(f => {
        const data = f.data as FutexState;
        return data.phase === 'fast-path';
      });
      expect(hasFastPath).toBe(true);
    });
  });

  describe('generateFrames - futex-pi', () => {
    const frames = futexWaitWake.generateFrames('futex-pi');

    it('generates 8+ frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('every frame has srcRef in data', () => {
      frames.forEach(f => {
        const data = f.data as FutexState;
        expect(data.srcRef).toBeDefined();
        expect(typeof data.srcRef).toBe('string');
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });

    it('mentions futex_lock_pi in descriptions', () => {
      const allDesc = frames.map(f => f.description).join(' ');
      expect(allDesc).toContain('futex_lock_pi');
    });

    it('mentions rt_mutex and priority inheritance', () => {
      const allDesc = frames.map(f => f.description).join(' ');
      expect(allDesc).toContain('rt_mutex');
      expect(allDesc.toLowerCase()).toContain('priority');
    });

    it('shows pi-chain phase', () => {
      const hasPiChain = frames.some(f => {
        const data = f.data as FutexState;
        return data.phase === 'pi-chain';
      });
      expect(hasPiChain).toBe(true);
    });

    it('threads have different priorities', () => {
      const data = frames[0].data as FutexState;
      const priorities = data.threads.map(t => t.priority);
      const uniquePriorities = new Set(priorities);
      expect(uniquePriorities.size).toBeGreaterThan(1);
    });
  });

  describe('generateFrames - default (no scenario)', () => {
    it('returns frames when called without argument', () => {
      const frames = futexWaitWake.generateFrames();
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });
  });

  describe('renderFrame', () => {
    it('renders thread boxes', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = futexWaitWake.generateFrames('futex-wait-wake');
      futexWaitWake.renderFrame(svg, frames[0], 500, 350);
      const threadRects = svg.querySelectorAll('.anim-thread');
      expect(threadRects.length).toBeGreaterThan(0);
    });

    it('renders hash bucket element', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = futexWaitWake.generateFrames('futex-wait-wake');
      // Use a frame where hash bucket is relevant (after get-key phase)
      const hashFrame = frames.find(f => (f.data as FutexState).phase === 'hash-lookup') || frames[3];
      futexWaitWake.renderFrame(svg, hashFrame, 500, 350);
      expect(svg.querySelector('.anim-hash-bucket')).not.toBeNull();
    });

    it('renders wait queue when non-empty', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = futexWaitWake.generateFrames('futex-wait-wake');
      const enqueueFrame = frames.find(f => (f.data as FutexState).waitQueue.length > 0);
      expect(enqueueFrame).toBeDefined();
      futexWaitWake.renderFrame(svg, enqueueFrame!, 500, 350);
      expect(svg.querySelector('.anim-wait-queue')).not.toBeNull();
    });
  });
});

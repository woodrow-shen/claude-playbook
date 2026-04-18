import { describe, it, expect } from 'vitest';
import rwsemPercpu from './rwsem-percpu.js';
import type { RwsemPercpuState } from './rwsem-percpu.js';

describe('Rwsem Percpu', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(rwsemPercpu.config.id).toBe('rwsem-percpu');
      expect(rwsemPercpu.config.skillName).toBe('rwsem-and-percpu');
      expect(rwsemPercpu.config.title).toBe('Reader-Writer Semaphores & Per-CPU Data');
    });
  });

  describe('getScenarios', () => {
    it('returns 3 scenarios', () => {
      const scenarios = rwsemPercpu.getScenarios();
      expect(scenarios.length).toBe(3);
      expect(scenarios.map(s => s.id)).toContain('rwsem-read-write');
      expect(scenarios.map(s => s.id)).toContain('rwsem-writer-starvation');
      expect(scenarios.map(s => s.id)).toContain('percpu-rwsem-flip');
    });
  });

  describe('generateFrames - rwsem-read-write (default)', () => {
    const frames = rwsemPercpu.generateFrames('rwsem-read-write');

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

    it('state includes required fields', () => {
      const data = frames[0].data as RwsemPercpuState;
      expect(data.phase).toBeDefined();
      expect(data.lockState).toBeDefined();
      expect(Array.isArray(data.readers)).toBe(true);
      expect(Array.isArray(data.writers)).toBe(true);
      expect(Array.isArray(data.waitQueue)).toBe(true);
      expect(Array.isArray(data.perCpuCounters)).toBe(true);
      expect(data.srcRef).toBeDefined();
    });

    it('data includes srcRef on all frames', () => {
      frames.forEach(f => {
        const data = f.data as RwsemPercpuState;
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });

    it('starts in init phase', () => {
      const data = frames[0].data as RwsemPercpuState;
      expect(data.phase).toBe('init');
    });

    it('includes read-acquire phase', () => {
      const hasPhase = frames.some(f => {
        const data = f.data as RwsemPercpuState;
        return data.phase === 'read-acquire';
      });
      expect(hasPhase).toBe(true);
    });

    it('includes write-acquire phase', () => {
      const hasPhase = frames.some(f => {
        const data = f.data as RwsemPercpuState;
        return data.phase === 'write-acquire';
      });
      expect(hasPhase).toBe(true);
    });

    it('references down_read in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('down_read'));
      expect(hasRef).toBe(true);
    });

    it('references down_write in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('down_write'));
      expect(hasRef).toBe(true);
    });

    it('references rwsem_read_trylock in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('rwsem_read_trylock'));
      expect(hasRef).toBe(true);
    });

    it('references rwsem_down_read_slowpath in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('rwsem_down_read_slowpath'));
      expect(hasRef).toBe(true);
    });

    it('references rwsem_down_write_slowpath in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('rwsem_down_write_slowpath'));
      expect(hasRef).toBe(true);
    });

    it('shows readers acquiring the lock', () => {
      const hasReaders = frames.some(f => {
        const data = f.data as RwsemPercpuState;
        return data.readers.length > 0;
      });
      expect(hasReaders).toBe(true);
    });

    it('shows writers acquiring the lock', () => {
      const hasWriters = frames.some(f => {
        const data = f.data as RwsemPercpuState;
        return data.writers.length > 0 && data.lockState === 'writer-locked';
      });
      expect(hasWriters).toBe(true);
    });

    it('lockState transitions through valid states', () => {
      const validStates = ['unlocked', 'reader-locked', 'writer-locked', 'contended'];
      frames.forEach(f => {
        const data = f.data as RwsemPercpuState;
        expect(validStates).toContain(data.lockState);
      });
    });
  });

  describe('generateFrames - default scenario', () => {
    it('returns frames when called without argument', () => {
      const frames = rwsemPercpu.generateFrames();
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });
  });

  describe('generateFrames - rwsem-writer-starvation', () => {
    const frames = rwsemPercpu.generateFrames('rwsem-writer-starvation');

    it('generates 8-12 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
      expect(frames.length).toBeLessThanOrEqual(12);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('includes handoff phase', () => {
      const hasHandoff = frames.some(f => {
        const data = f.data as RwsemPercpuState;
        return data.phase === 'handoff';
      });
      expect(hasHandoff).toBe(true);
    });

    it('references rwsem_try_write_lock in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('rwsem_try_write_lock'));
      expect(hasRef).toBe(true);
    });

    it('references rwsem_mark_wake in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('rwsem_mark_wake'));
      expect(hasRef).toBe(true);
    });

    it('references RWSEM_FLAG_HANDOFF in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('RWSEM_FLAG_HANDOFF'));
      expect(hasRef).toBe(true);
    });

    it('shows writer waiting in queue', () => {
      const hasWaiting = frames.some(f => {
        const data = f.data as RwsemPercpuState;
        return data.waitQueue.length > 0 && data.waitQueue.some(w => w.type === 'writer');
      });
      expect(hasWaiting).toBe(true);
    });

    it('shows handoff bit being set', () => {
      const hasHandoff = frames.some(f => {
        const data = f.data as RwsemPercpuState;
        return data.phase === 'handoff';
      });
      expect(hasHandoff).toBe(true);
    });

    it('has srcRef on all frames', () => {
      frames.forEach(f => {
        const data = f.data as RwsemPercpuState;
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });

    it('references rwsem_wake in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('rwsem_wake'));
      expect(hasRef).toBe(true);
    });
  });

  describe('generateFrames - percpu-rwsem-flip', () => {
    const frames = rwsemPercpu.generateFrames('percpu-rwsem-flip');

    it('generates 8-12 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
      expect(frames.length).toBeLessThanOrEqual(12);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('includes percpu-read phase', () => {
      const hasPhase = frames.some(f => {
        const data = f.data as RwsemPercpuState;
        return data.phase === 'percpu-read';
      });
      expect(hasPhase).toBe(true);
    });

    it('includes percpu-write phase', () => {
      const hasPhase = frames.some(f => {
        const data = f.data as RwsemPercpuState;
        return data.phase === 'percpu-write';
      });
      expect(hasPhase).toBe(true);
    });

    it('references percpu_down_read in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('percpu_down_read'));
      expect(hasRef).toBe(true);
    });

    it('references percpu_down_write in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('percpu_down_write'));
      expect(hasRef).toBe(true);
    });

    it('references rcu_sync_enter in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('rcu_sync_enter'));
      expect(hasRef).toBe(true);
    });

    it('references __percpu_down_read in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('__percpu_down_read'));
      expect(hasRef).toBe(true);
    });

    it('shows per-CPU counters being used', () => {
      const hasCounters = frames.some(f => {
        const data = f.data as RwsemPercpuState;
        return data.perCpuCounters.some(c => c > 0);
      });
      expect(hasCounters).toBe(true);
    });

    it('has srcRef on all frames', () => {
      frames.forEach(f => {
        const data = f.data as RwsemPercpuState;
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });
  });

  describe('renderFrame', () => {
    it('renders title text', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = rwsemPercpu.generateFrames('rwsem-read-write');
      rwsemPercpu.renderFrame(svg, frames[0], 900, 480);
      const title = svg.querySelector('.anim-title');
      expect(title).not.toBeNull();
    });

    it('renders lock state indicator', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = rwsemPercpu.generateFrames('rwsem-read-write');
      rwsemPercpu.renderFrame(svg, frames[0], 900, 480);
      const lockState = svg.querySelectorAll('.anim-lock-state');
      expect(lockState.length).toBeGreaterThan(0);
    });

    it('renders wait queue entries', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = rwsemPercpu.generateFrames('rwsem-writer-starvation');
      const frameWithQueue = frames.find(f => {
        const data = f.data as RwsemPercpuState;
        return data.waitQueue.length > 0;
      });
      if (frameWithQueue) {
        rwsemPercpu.renderFrame(svg, frameWithQueue, 900, 480);
        const queueEntries = svg.querySelectorAll('.anim-wait-entry');
        expect(queueEntries.length).toBeGreaterThan(0);
      }
    });

    it('renders per-CPU counters for percpu scenario', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = rwsemPercpu.generateFrames('percpu-rwsem-flip');
      const frameWithCounters = frames.find(f => {
        const data = f.data as RwsemPercpuState;
        return data.perCpuCounters.some(c => c > 0);
      });
      if (frameWithCounters) {
        rwsemPercpu.renderFrame(svg, frameWithCounters, 900, 480);
        const counters = svg.querySelectorAll('.anim-percpu-counter');
        expect(counters.length).toBeGreaterThan(0);
      }
    });

    it('clears previous content on re-render', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = rwsemPercpu.generateFrames('rwsem-read-write');
      rwsemPercpu.renderFrame(svg, frames[0], 900, 480);
      const countBefore = svg.childElementCount;
      rwsemPercpu.renderFrame(svg, frames[1], 900, 480);
      expect(svg.childElementCount).toBeLessThanOrEqual(countBefore + 10);
    });

    it('renders reader/writer indicators', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = rwsemPercpu.generateFrames('rwsem-read-write');
      const frameWithReaders = frames.find(f => {
        const data = f.data as RwsemPercpuState;
        return data.readers.length > 0;
      });
      if (frameWithReaders) {
        rwsemPercpu.renderFrame(svg, frameWithReaders, 900, 480);
        const actors = svg.querySelectorAll('.anim-actor');
        expect(actors.length).toBeGreaterThan(0);
      }
    });

    it('renders phase flow blocks', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = rwsemPercpu.generateFrames('rwsem-read-write');
      rwsemPercpu.renderFrame(svg, frames[3], 900, 480);
      const blocks = svg.querySelectorAll('.anim-block');
      expect(blocks.length).toBeGreaterThan(0);
    });
  });
});

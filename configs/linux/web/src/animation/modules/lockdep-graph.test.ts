import { describe, it, expect } from 'vitest';
import lockdepGraph from './lockdep-graph.js';
import type { LockdepState } from './lockdep-graph.js';

describe('Lockdep Graph', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(lockdepGraph.config.id).toBe('lockdep-graph');
      expect(lockdepGraph.config.skillName).toBe('lockdep-validation');
    });
  });

  describe('getScenarios', () => {
    it('returns 3 scenarios', () => {
      expect(lockdepGraph.getScenarios().length).toBe(3);
    });

    it('includes lock-acquisition-tracking scenario', () => {
      const ids = lockdepGraph.getScenarios().map(s => s.id);
      expect(ids).toContain('lock-acquisition-tracking');
    });

    it('includes deadlock-detection scenario', () => {
      const ids = lockdepGraph.getScenarios().map(s => s.id);
      expect(ids).toContain('deadlock-detection');
    });

    it('includes irq-safety-check scenario', () => {
      const ids = lockdepGraph.getScenarios().map(s => s.id);
      expect(ids).toContain('irq-safety-check');
    });
  });

  describe('generateFrames - lock-acquisition-tracking (default)', () => {
    const frames = lockdepGraph.generateFrames('lock-acquisition-tracking');

    it('generates 8 or more frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('every frame has a srcRef in data', () => {
      frames.forEach(f => {
        const data = f.data as LockdepState;
        expect(data.srcRef).toBeTruthy();
      });
    });

    it('starts with empty dependency graph', () => {
      const data = frames[0].data as LockdepState;
      expect(data.dependencyEdges.length).toBe(0);
    });

    it('builds dependency edge A->B', () => {
      const last = frames[frames.length - 1].data as LockdepState;
      expect(last.dependencyEdges.some(e => e.from === 'lock_A' && e.to === 'lock_B')).toBe(true);
    });

    it('registers lock classes', () => {
      const last = frames[frames.length - 1].data as LockdepState;
      expect(last.lockClasses.length).toBeGreaterThanOrEqual(2);
    });

    it('mentions __lock_acquire in descriptions', () => {
      expect(frames.some(f => f.description.includes('__lock_acquire'))).toBe(true);
    });

    it('mentions validate_chain in descriptions', () => {
      expect(frames.some(f => f.description.includes('validate_chain'))).toBe(true);
    });

    it('mentions check_prev_add in descriptions', () => {
      expect(frames.some(f => f.description.includes('check_prev_add'))).toBe(true);
    });

    it('no cycle detected in normal acquisition', () => {
      frames.forEach(f => {
        const data = f.data as LockdepState;
        expect(data.cycleDetected).toBe(false);
      });
    });

    it('default scenario returns same frames', () => {
      const defaultFrames = lockdepGraph.generateFrames();
      expect(defaultFrames.length).toBe(frames.length);
    });
  });

  describe('generateFrames - deadlock-detection', () => {
    const frames = lockdepGraph.generateFrames('deadlock-detection');

    it('generates 8 or more frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('every frame has a srcRef in data', () => {
      frames.forEach(f => {
        const data = f.data as LockdepState;
        expect(data.srcRef).toBeTruthy();
      });
    });

    it('shows BFS walk with non-empty bfsQueue', () => {
      const hasBfs = frames.some(f => {
        const data = f.data as LockdepState;
        return data.bfsQueue.length > 0;
      });
      expect(hasBfs).toBe(true);
    });

    it('detects cycle', () => {
      const last = frames[frames.length - 1].data as LockdepState;
      expect(last.cycleDetected).toBe(true);
    });

    it('mentions check_noncircular in descriptions', () => {
      expect(frames.some(f => f.description.includes('check_noncircular'))).toBe(true);
    });

    it('mentions __bfs in descriptions', () => {
      expect(frames.some(f => f.description.includes('__bfs'))).toBe(true);
    });

    it('mentions print_circular_bug in descriptions', () => {
      expect(frames.some(f => f.description.includes('print_circular_bug'))).toBe(true);
    });

    it('has phase cycle-found in final frame', () => {
      const last = frames[frames.length - 1].data as LockdepState;
      expect(last.phase).toBe('cycle-found');
    });
  });

  describe('generateFrames - irq-safety-check', () => {
    const frames = lockdepGraph.generateFrames('irq-safety-check');

    it('generates 8 or more frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('every frame has a srcRef in data', () => {
      frames.forEach(f => {
        const data = f.data as LockdepState;
        expect(data.srcRef).toBeTruthy();
      });
    });

    it('has irq-check phase', () => {
      const hasIrqCheck = frames.some(f => {
        const data = f.data as LockdepState;
        return data.phase === 'irq-check';
      });
      expect(hasIrqCheck).toBe(true);
    });

    it('shows IRQ context in held locks', () => {
      const hasIrqContext = frames.some(f => {
        const data = f.data as LockdepState;
        return data.heldLocks.some(h => h.irqContext === true);
      });
      expect(hasIrqContext).toBe(true);
    });

    it('mentions check_irq_usage in descriptions', () => {
      expect(frames.some(f => f.description.includes('check_irq_usage'))).toBe(true);
    });

    it('shows usage mask on lock classes', () => {
      const hasUsageMask = frames.some(f => {
        const data = f.data as LockdepState;
        return data.lockClasses.some(lc => lc.usageMask !== 0);
      });
      expect(hasUsageMask).toBe(true);
    });
  });

  describe('renderFrame', () => {
    it('renders lock class nodes', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = lockdepGraph.generateFrames('lock-acquisition-tracking');
      lockdepGraph.renderFrame(svg, frames[frames.length - 1], 500, 400);
      const nodes = svg.querySelectorAll('.anim-lock-class');
      expect(nodes.length).toBeGreaterThan(0);
    });

    it('renders dependency edges', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = lockdepGraph.generateFrames('lock-acquisition-tracking');
      lockdepGraph.renderFrame(svg, frames[frames.length - 1], 500, 400);
      const edges = svg.querySelectorAll('.anim-dep-edge');
      expect(edges.length).toBeGreaterThan(0);
    });

    it('renders BFS highlight during deadlock detection', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = lockdepGraph.generateFrames('deadlock-detection');
      const bfsFrame = frames.find(f => (f.data as LockdepState).bfsQueue.length > 0);
      expect(bfsFrame).toBeDefined();
      lockdepGraph.renderFrame(svg, bfsFrame!, 500, 400);
      const bfsNodes = svg.querySelectorAll('.anim-bfs-active');
      expect(bfsNodes.length).toBeGreaterThan(0);
    });

    it('renders cycle indicator', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = lockdepGraph.generateFrames('deadlock-detection');
      const lastFrame = frames[frames.length - 1];
      lockdepGraph.renderFrame(svg, lastFrame, 500, 400);
      const cycleIndicator = svg.querySelector('.anim-cycle-detected');
      expect(cycleIndicator).not.toBeNull();
    });
  });
});

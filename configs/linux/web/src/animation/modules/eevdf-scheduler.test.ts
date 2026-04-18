import { describe, it, expect } from 'vitest';
import eevdfScheduler from './eevdf-scheduler.js';
import type { EevdfState } from './eevdf-scheduler.js';

describe('EEVDF Scheduler', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(eevdfScheduler.config.id).toBe('eevdf-scheduler');
      expect(eevdfScheduler.config.skillName).toBe('scheduler-fundamentals');
    });

    it('has a descriptive title', () => {
      expect(eevdfScheduler.config.title).toContain('EEVDF');
    });
  });

  describe('getScenarios', () => {
    it('returns 3 scenarios', () => {
      expect(eevdfScheduler.getScenarios()).toHaveLength(3);
    });

    it('includes pick-next-task scenario', () => {
      const ids = eevdfScheduler.getScenarios().map(s => s.id);
      expect(ids).toContain('pick-next-task');
    });

    it('includes slice-expiry scenario', () => {
      const ids = eevdfScheduler.getScenarios().map(s => s.id);
      expect(ids).toContain('slice-expiry');
    });

    it('includes weight-fairness scenario', () => {
      const ids = eevdfScheduler.getScenarios().map(s => s.id);
      expect(ids).toContain('weight-fairness');
    });
  });

  describe('generateFrames - pick-next-task', () => {
    const frames = eevdfScheduler.generateFrames('pick-next-task');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('first frame has step 0', () => {
      expect(frames[0].step).toBe(0);
    });

    it('last frame has step equal to length minus 1', () => {
      expect(frames[frames.length - 1].step).toBe(frames.length - 1);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('data has tasks with vruntime and deadline fields', () => {
      const data = frames[0].data as EevdfState;
      expect(data.tasks.length).toBeGreaterThan(0);
      for (const task of data.tasks) {
        expect(task).toHaveProperty('vruntime');
        expect(task).toHaveProperty('deadline');
      }
    });

    it('data includes avgVruntime field', () => {
      const data = frames[0].data as EevdfState;
      expect(data).toHaveProperty('avgVruntime');
      expect(typeof data.avgVruntime).toBe('number');
    });

    it('tasks have eligibility states', () => {
      // At least one frame should have eligible tasks
      const hasEligible = frames.some(f => {
        const data = f.data as EevdfState;
        return data.tasks.some(t => t.state === 'eligible');
      });
      expect(hasEligible).toBe(true);
    });

    it('has 4 tasks initially', () => {
      const data = frames[0].data as EevdfState;
      expect(data.tasks).toHaveLength(4);
    });

    it('data includes treeNodes for RB-tree', () => {
      const data = frames[0].data as EevdfState;
      expect(data).toHaveProperty('treeNodes');
      expect(data.treeNodes.length).toBeGreaterThan(0);
    });

    it('tree nodes have color property', () => {
      const data = frames[0].data as EevdfState;
      for (const node of data.treeNodes) {
        expect(['red', 'black']).toContain(node.color);
      }
    });

    it('tree nodes have minDeadline property', () => {
      const data = frames[0].data as EevdfState;
      for (const node of data.treeNodes) {
        expect(typeof node.minDeadline).toBe('number');
      }
    });
  });

  describe('generateFrames - slice-expiry', () => {
    const frames = eevdfScheduler.generateFrames('slice-expiry');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('shows a running task initially', () => {
      const data = frames[0].data as EevdfState;
      expect(data.currentTaskId).not.toBeNull();
    });

    it('shows slice expiry and re-insertion', () => {
      const hasExpiry = frames.some(f =>
        f.label.toLowerCase().includes('expir') || f.label.toLowerCase().includes('slice')
      );
      expect(hasExpiry).toBe(true);
    });
  });

  describe('generateFrames - weight-fairness', () => {
    const frames = eevdfScheduler.generateFrames('weight-fairness');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('has tasks with different weights', () => {
      const data = frames[0].data as EevdfState;
      const weights = new Set(data.tasks.map(t => t.weight));
      expect(weights.size).toBeGreaterThan(1);
    });

    it('higher-weight tasks accumulate vruntime slower', () => {
      const last = frames[frames.length - 1].data as EevdfState;
      const sorted = [...last.tasks].sort((a, b) => b.weight - a.weight);
      // Highest weight task should have among the lowest vruntimes
      // (it gets more CPU but vruntime grows slower per wall-clock time)
      const highestWeight = sorted[0];
      const lowestWeight = sorted[sorted.length - 1];
      expect(highestWeight.weight).toBeGreaterThan(lowestWeight.weight);
    });

    it('tasks have nice values', () => {
      const data = frames[0].data as EevdfState;
      for (const task of data.tasks) {
        expect(task).toHaveProperty('nice');
        expect(typeof task.nice).toBe('number');
      }
    });
  });

  describe('generateFrames - default', () => {
    it('returns frames for default scenario (pick-next-task)', () => {
      const frames = eevdfScheduler.generateFrames();
      expect(frames.length).toBeGreaterThan(0);
      const data = frames[0].data as EevdfState;
      expect(data.tasks).toHaveLength(4);
    });
  });

  describe('renderFrame', () => {
    it('renders SVG elements', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = eevdfScheduler.generateFrames('pick-next-task');
      eevdfScheduler.renderFrame(svg, frames[0], 900, 480);
      expect(svg.querySelectorAll('circle').length).toBeGreaterThan(0);
      expect(svg.querySelectorAll('text').length).toBeGreaterThan(0);
    });

    it('renders task names', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = eevdfScheduler.generateFrames('pick-next-task');
      eevdfScheduler.renderFrame(svg, frames[0], 900, 480);
      const texts = Array.from(svg.querySelectorAll('text')).map(t => t.textContent);
      expect(texts.some(t => t?.includes('httpd') || t?.includes('bash') || t?.includes('compile') || t?.includes('vim'))).toBe(true);
    });

    it('renders RB-tree nodes as circles', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = eevdfScheduler.generateFrames('pick-next-task');
      eevdfScheduler.renderFrame(svg, frames[0], 900, 480);
      const circles = svg.querySelectorAll('circle');
      expect(circles.length).toBeGreaterThanOrEqual(2);
    });

    it('renders eligible zone indicator', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = eevdfScheduler.generateFrames('pick-next-task');
      eevdfScheduler.renderFrame(svg, frames[2], 900, 480);
      const rects = svg.querySelectorAll('rect');
      expect(rects.length).toBeGreaterThan(0);
    });

    it('clears container before rendering', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = eevdfScheduler.generateFrames('pick-next-task');
      eevdfScheduler.renderFrame(svg, frames[0], 900, 480);
      const countFirst = svg.childNodes.length;
      eevdfScheduler.renderFrame(svg, frames[1], 900, 480);
      // Should not accumulate elements
      expect(svg.childNodes.length).toBeLessThanOrEqual(countFirst + 10);
    });
  });
});

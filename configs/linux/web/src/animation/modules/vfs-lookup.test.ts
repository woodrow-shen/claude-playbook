import { describe, it, expect } from 'vitest';
import vfsLookup from './vfs-lookup.js';
import type { VfsWalkState } from './vfs-lookup.js';

describe('VFS Path Lookup', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(vfsLookup.config.id).toBe('vfs-lookup');
      expect(vfsLookup.config.skillName).toBe('vfs-layer');
    });

    it('has a title', () => {
      expect(vfsLookup.config.title).toBe('VFS Path Lookup');
    });
  });

  describe('getScenarios', () => {
    it('returns 3 scenarios', () => {
      expect(vfsLookup.getScenarios().length).toBe(3);
    });

    it('each scenario has id and label', () => {
      for (const s of vfsLookup.getScenarios()) {
        expect(s.id).toBeTruthy();
        expect(s.label).toBeTruthy();
      }
    });

    it('includes dcache-hit, dcache-miss-slow-path, and mount-crossing', () => {
      const ids = vfsLookup.getScenarios().map(s => s.id);
      expect(ids).toContain('dcache-hit');
      expect(ids).toContain('dcache-miss-slow-path');
      expect(ids).toContain('mount-crossing');
    });
  });

  describe('generateFrames - dcache-hit (default)', () => {
    const frames = vfsLookup.generateFrames('dcache-hit');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('first frame has step=0', () => {
      expect(frames[0].step).toBe(0);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('each frame has required fields', () => {
      for (const f of frames) {
        expect(f.step).toBeGreaterThanOrEqual(0);
        expect(f.label).toBeTruthy();
        expect(f.description).toBeTruthy();
        expect(Array.isArray(f.highlights)).toBe(true);
      }
    });

    it('data includes path and components', () => {
      const data = frames[0].data as VfsWalkState;
      expect(data.path).toBeTruthy();
      expect(Array.isArray(data.components)).toBe(true);
      expect(data.components.length).toBeGreaterThan(0);
    });

    it('data includes currentComponent index', () => {
      const data = frames[0].data as VfsWalkState;
      expect(typeof data.currentComponent).toBe('number');
    });

    it('mode stays rcu-walk throughout', () => {
      for (const f of frames) {
        const data = f.data as VfsWalkState;
        expect(data.mode).toBe('rcu-walk');
      }
    });

    it('all dcache lookups are hits (no misses)', () => {
      const lastData = frames[frames.length - 1].data as VfsWalkState;
      expect(lastData.dcacheMisses).toBe(0);
      expect(lastData.dcacheHits).toBeGreaterThan(0);
    });

    it('has dentryTree with nodes', () => {
      const data = frames[0].data as VfsWalkState;
      expect(Array.isArray(data.dentryTree)).toBe(true);
      expect(data.dentryTree.length).toBeGreaterThan(0);
    });

    it('last frame phase is complete', () => {
      const lastData = frames[frames.length - 1].data as VfsWalkState;
      expect(lastData.phase).toBe('complete');
    });
  });

  describe('generateFrames - default scenario', () => {
    it('returns frames for default (no argument)', () => {
      const frames = vfsLookup.generateFrames();
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });
  });

  describe('generateFrames - dcache-miss-slow-path', () => {
    const frames = vfsLookup.generateFrames('dcache-miss-slow-path');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('has a frame with mode=ref-walk', () => {
      const hasRefWalk = frames.some(f => {
        const data = f.data as VfsWalkState;
        return data.mode === 'ref-walk';
      });
      expect(hasRefWalk).toBe(true);
    });

    it('has at least one dcache miss', () => {
      const lastData = frames[frames.length - 1].data as VfsWalkState;
      expect(lastData.dcacheMisses).toBeGreaterThan(0);
    });

    it('has a frame with phase=lookup-slow', () => {
      const hasSlowLookup = frames.some(f => {
        const data = f.data as VfsWalkState;
        return data.phase === 'lookup-slow';
      });
      expect(hasSlowLookup).toBe(true);
    });

    it('creates a new dentry for the missed component', () => {
      const hasCreated = frames.some(f => {
        const data = f.data as VfsWalkState;
        return data.dentryTree.some(d => d.state === 'created');
      });
      expect(hasCreated).toBe(true);
    });

    it('last frame phase is complete', () => {
      const lastData = frames[frames.length - 1].data as VfsWalkState;
      expect(lastData.phase).toBe('complete');
    });
  });

  describe('generateFrames - mount-crossing', () => {
    const frames = vfsLookup.generateFrames('mount-crossing');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('has a frame with phase=mount-crossing', () => {
      const hasMountCrossing = frames.some(f => {
        const data = f.data as VfsWalkState;
        return data.phase === 'mount-crossing';
      });
      expect(hasMountCrossing).toBe(true);
    });

    it('has mountPoints defined', () => {
      const data = frames[0].data as VfsWalkState;
      expect(Array.isArray(data.mountPoints)).toBe(true);
      expect(data.mountPoints.length).toBeGreaterThan(0);
    });

    it('has a dentry marked as mountpoint', () => {
      const hasMountpoint = frames.some(f => {
        const data = f.data as VfsWalkState;
        return data.dentryTree.some(d => d.isMountpoint);
      });
      expect(hasMountpoint).toBe(true);
    });

    it('last frame phase is complete', () => {
      const lastData = frames[frames.length - 1].data as VfsWalkState;
      expect(lastData.phase).toBe('complete');
    });
  });

  describe('renderFrame', () => {
    it('renders SVG elements into container', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = vfsLookup.generateFrames('dcache-hit');
      vfsLookup.renderFrame(svg, frames[0], 900, 480);
      expect(svg.querySelectorAll('rect').length).toBeGreaterThan(0);
    });

    it('renders text elements', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = vfsLookup.generateFrames('dcache-hit');
      vfsLookup.renderFrame(svg, frames[0], 900, 480);
      expect(svg.querySelectorAll('text').length).toBeGreaterThan(0);
    });

    it('renders different content for different frames', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = vfsLookup.generateFrames('dcache-hit');
      vfsLookup.renderFrame(svg, frames[0], 900, 480);
      const html1 = svg.innerHTML;
      vfsLookup.renderFrame(svg, frames[frames.length - 1], 900, 480);
      const html2 = svg.innerHTML;
      expect(html1).not.toBe(html2);
    });

    it('applies highlight classes', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = vfsLookup.generateFrames('dcache-hit');
      const frameWithHighlights = frames.find(f => f.highlights.length > 0);
      if (frameWithHighlights) {
        vfsLookup.renderFrame(svg, frameWithHighlights, 900, 480);
        expect(svg.querySelectorAll('.anim-highlight').length).toBeGreaterThan(0);
      }
    });

    it('renders path display with text', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = vfsLookup.generateFrames('dcache-hit');
      vfsLookup.renderFrame(svg, frames[2], 900, 480);
      const texts = Array.from(svg.querySelectorAll('text')).map(t => t.textContent);
      expect(texts.some(t => t?.includes('/'))).toBe(true);
    });

    it('renders mode indicator', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = vfsLookup.generateFrames('dcache-hit');
      vfsLookup.renderFrame(svg, frames[2], 900, 480);
      const texts = Array.from(svg.querySelectorAll('text')).map(t => t.textContent);
      expect(texts.some(t => t?.includes('RCU') || t?.includes('REF'))).toBe(true);
    });
  });
});

import { describe, it, expect } from 'vitest';
import virtioVring from './virtio-vring.js';
import type { VirtioVringState } from './virtio-vring.js';

describe('VirtioVring', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(virtioVring.config.id).toBe('virtio-vring');
      expect(virtioVring.config.skillName).toBe('virtio-framework');
    });

    it('has a display title', () => {
      expect(virtioVring.config.title).toBe('Virtio Vring Transport');
    });
  });

  describe('getScenarios', () => {
    const scenarios = virtioVring.getScenarios();

    it('returns exactly 3 scenarios', () => {
      expect(scenarios.length).toBe(3);
    });

    it('includes required scenario IDs', () => {
      const ids = scenarios.map(s => s.id);
      expect(ids).toContain('virtqueue-add-and-kick');
      expect(ids).toContain('virtqueue-completion');
      expect(ids).toContain('device-negotiation');
    });

    it('each scenario has id and label', () => {
      for (const s of scenarios) {
        expect(s.id).toBeTruthy();
        expect(s.label).toBeTruthy();
      }
    });
  });

  describe('generateFrames - virtqueue-add-and-kick (default)', () => {
    const frames = virtioVring.generateFrames('virtqueue-add-and-kick');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
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

    it('each frame has typed VirtioVringState data with srcRef', () => {
      for (const f of frames) {
        const data = f.data as VirtioVringState;
        expect(data.currentFunction).toBeTruthy();
        expect(data.srcRef).toBeTruthy();
        expect(Array.isArray(data.completedSteps)).toBe(true);
        expect(Array.isArray(data.steps)).toBe(true);
      }
    });

    it('first frame starts at virtqueue_add_sgs', () => {
      const data = frames[0].data as VirtioVringState;
      expect(data.currentFunction).toBe('virtqueue_add_sgs');
      expect(data.srcRef).toContain('drivers/virtio/virtio_ring.c');
    });

    it('last frame reaches virtqueue_notify', () => {
      const data = frames[frames.length - 1].data as VirtioVringState;
      expect(data.currentFunction).toBe('virtqueue_notify');
    });

    it('completed steps accumulate over frames', () => {
      const firstData = frames[0].data as VirtioVringState;
      const lastData = frames[frames.length - 1].data as VirtioVringState;
      expect(lastData.completedSteps.length).toBeGreaterThan(firstData.completedSteps.length);
    });

    it('descriptions reference real kernel functions with file paths', () => {
      const kernelFunctions = [
        'virtqueue_add_sgs',
        'virtqueue_add_split',
        'virtqueue_kick',
        'virtqueue_kick_prepare',
        'virtqueue_notify',
      ];
      for (const fn of kernelFunctions) {
        const found = frames.some(f => f.description.includes(fn));
        expect(found, `Expected description referencing ${fn}`).toBe(true);
      }

      const filePaths = ['drivers/virtio/virtio_ring.c'];
      for (const path of filePaths) {
        const found = frames.some(f => f.description.includes(path));
        expect(found, `Expected description referencing ${path}`).toBe(true);
      }
    });
  });

  describe('generateFrames - virtqueue-completion', () => {
    const frames = virtioVring.generateFrames('virtqueue-completion');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('each frame has typed VirtioVringState data with srcRef', () => {
      for (const f of frames) {
        const data = f.data as VirtioVringState;
        expect(data.srcRef).toBeTruthy();
        expect(data.currentFunction).toBeTruthy();
      }
    });

    it('covers key completion functions', () => {
      const expectedFunctions = [
        'vring_interrupt',
        'virtqueue_get_buf',
        'detach_buf_split',
      ];
      for (const fn of expectedFunctions) {
        const found = frames.some(f => {
          const data = f.data as VirtioVringState;
          return data.currentFunction === fn || f.description.includes(fn);
        });
        expect(found, `Expected frame referencing ${fn}`).toBe(true);
      }
    });

    it('descriptions reference drivers/virtio/virtio_ring.c', () => {
      const found = frames.some(f => f.description.includes('drivers/virtio/virtio_ring.c'));
      expect(found).toBe(true);
    });
  });

  describe('generateFrames - device-negotiation', () => {
    const frames = virtioVring.generateFrames('device-negotiation');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('each frame has typed VirtioVringState data with srcRef', () => {
      for (const f of frames) {
        const data = f.data as VirtioVringState;
        expect(data.srcRef).toBeTruthy();
        expect(data.currentFunction).toBeTruthy();
      }
    });

    it('covers key negotiation functions', () => {
      const expectedFunctions = [
        'register_virtio_device',
        'virtio_dev_probe',
        'vring_create_virtqueue',
      ];
      for (const fn of expectedFunctions) {
        const found = frames.some(f => {
          const data = f.data as VirtioVringState;
          return data.currentFunction === fn || f.description.includes(fn);
        });
        expect(found, `Expected frame referencing ${fn}`).toBe(true);
      }
    });

    it('references the negotiation state transitions', () => {
      const stateTransitions = [
        'ACKNOWLEDGE',
        'DRIVER',
        'FEATURES_OK',
        'DRIVER_OK',
      ];
      for (const state of stateTransitions) {
        const found = frames.some(f => f.description.includes(state));
        expect(found, `Expected description referencing ${state}`).toBe(true);
      }
    });

    it('references drivers/virtio/virtio.c', () => {
      const found = frames.some(f => f.description.includes('drivers/virtio/virtio.c'));
      expect(found).toBe(true);
    });

    it('references drivers/virtio/virtio_pci_common.c', () => {
      const found = frames.some(f => f.description.includes('drivers/virtio/virtio_pci_common.c'));
      expect(found).toBe(true);
    });
  });

  describe('generateFrames - default', () => {
    it('returns frames for default scenario', () => {
      const frames = virtioVring.generateFrames();
      expect(frames.length).toBeGreaterThan(0);
    });

    it('default scenario matches virtqueue-add-and-kick', () => {
      const defaultFrames = virtioVring.generateFrames();
      const explicitFrames = virtioVring.generateFrames('virtqueue-add-and-kick');
      expect(defaultFrames.length).toBe(explicitFrames.length);
    });
  });

  describe('renderFrame', () => {
    it('renders SVG elements into container', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = virtioVring.generateFrames('virtqueue-add-and-kick');
      virtioVring.renderFrame(svg, frames[0], 432, 400);
      expect(svg.querySelectorAll('rect').length).toBeGreaterThan(0);
    });

    it('renders text elements with function names', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = virtioVring.generateFrames('virtqueue-add-and-kick');
      virtioVring.renderFrame(svg, frames[0], 432, 400);
      const texts = Array.from(svg.querySelectorAll('text')).map(t => t.textContent);
      expect(texts.some(t => t?.includes('virtqueue_add_sgs'))).toBe(true);
    });

    it('renders different content for different frames', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = virtioVring.generateFrames('virtqueue-add-and-kick');
      virtioVring.renderFrame(svg, frames[0], 432, 400);
      const html1 = svg.innerHTML;
      virtioVring.renderFrame(svg, frames[frames.length - 1], 432, 400);
      const html2 = svg.innerHTML;
      expect(html1).not.toBe(html2);
    });

    it('applies highlight class to active step', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = virtioVring.generateFrames('virtqueue-add-and-kick');
      const frameWithHighlights = frames.find(f => f.highlights.length > 0);
      if (frameWithHighlights) {
        virtioVring.renderFrame(svg, frameWithHighlights, 432, 400);
        expect(svg.querySelectorAll('.anim-highlight').length).toBeGreaterThan(0);
      }
    });

    it('uses semantic CSS classes', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = virtioVring.generateFrames('virtqueue-add-and-kick');
      virtioVring.renderFrame(svg, frames[0], 432, 400);
      expect(svg.querySelectorAll('.anim-phase').length).toBeGreaterThan(0);
      expect(svg.querySelectorAll('.anim-title').length).toBeGreaterThan(0);
    });
  });
});

import { describe, it, expect } from 'vitest';
import deviceSysfs from './device-sysfs.js';
import type { DeviceSysfsState } from './device-sysfs.js';

describe('Device Model & Sysfs', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(deviceSysfs.config.id).toBe('device-sysfs');
      expect(deviceSysfs.config.skillName).toBe('device-model-and-sysfs');
      expect(deviceSysfs.config.title).toBe('Unified Device Model & Sysfs');
    });
  });

  describe('getScenarios', () => {
    it('returns 3 scenarios', () => {
      const scenarios = deviceSysfs.getScenarios();
      expect(scenarios.length).toBe(3);
      expect(scenarios.map(s => s.id)).toContain('device-registration');
      expect(scenarios.map(s => s.id)).toContain('driver-binding');
      expect(scenarios.map(s => s.id)).toContain('sysfs-attribute-read');
    });
  });

  describe('generateFrames - device-registration (default)', () => {
    const frames = deviceSysfs.generateFrames('device-registration');

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
      const data = frames[0].data as DeviceSysfsState;
      expect(data.phase).toBeDefined();
      expect(Array.isArray(data.devices)).toBe(true);
      expect(Array.isArray(data.drivers)).toBe(true);
      expect(data.buses).toBeDefined();
      expect(data.kobjectTree).toBeDefined();
      expect(data.sysfsPath).toBeDefined();
      expect(data.srcRef).toBeDefined();
    });

    it('srcRef is non-empty on all frames', () => {
      frames.forEach(f => {
        const data = f.data as DeviceSysfsState;
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });

    it('references device_register', () => {
      const hasRef = frames.some(f => f.description.includes('device_register'));
      expect(hasRef).toBe(true);
    });

    it('references device_add', () => {
      const hasRef = frames.some(f => f.description.includes('device_add'));
      expect(hasRef).toBe(true);
    });

    it('references kobject_add', () => {
      const hasRef = frames.some(f => f.description.includes('kobject_add'));
      expect(hasRef).toBe(true);
    });

    it('references bus_add_device', () => {
      const hasRef = frames.some(f => f.description.includes('bus_add_device'));
      expect(hasRef).toBe(true);
    });

    it('references bus_probe_device', () => {
      const hasRef = frames.some(f => f.description.includes('bus_probe_device'));
      expect(hasRef).toBe(true);
    });

    it('devices array grows during registration', () => {
      const firstData = frames[0].data as DeviceSysfsState;
      const lastData = frames[frames.length - 1].data as DeviceSysfsState;
      expect(lastData.devices.length).toBeGreaterThan(firstData.devices.length);
    });

    it('kobjectTree grows during registration', () => {
      const firstData = frames[0].data as DeviceSysfsState;
      const lastData = frames[frames.length - 1].data as DeviceSysfsState;
      expect(lastData.kobjectTree.length).toBeGreaterThan(firstData.kobjectTree.length);
    });
  });

  describe('generateFrames - default scenario', () => {
    it('returns frames when called without argument', () => {
      const frames = deviceSysfs.generateFrames();
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });
  });

  describe('generateFrames - driver-binding', () => {
    const frames = deviceSysfs.generateFrames('driver-binding');

    it('generates 8-12 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
      expect(frames.length).toBeLessThanOrEqual(12);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('references driver_register', () => {
      const hasRef = frames.some(f => f.description.includes('driver_register'));
      expect(hasRef).toBe(true);
    });

    it('references bus_add_driver', () => {
      const hasRef = frames.some(f => f.description.includes('bus_add_driver'));
      expect(hasRef).toBe(true);
    });

    it('references driver_attach', () => {
      const hasRef = frames.some(f => f.description.includes('driver_attach'));
      expect(hasRef).toBe(true);
    });

    it('references __driver_probe_device', () => {
      const hasRef = frames.some(f => f.description.includes('__driver_probe_device'));
      expect(hasRef).toBe(true);
    });

    it('references really_probe', () => {
      const hasRef = frames.some(f => f.description.includes('really_probe'));
      expect(hasRef).toBe(true);
    });

    it('includes probe phase', () => {
      const hasProbe = frames.some(f => {
        const data = f.data as DeviceSysfsState;
        return data.phase === 'probe';
      });
      expect(hasProbe).toBe(true);
    });

    it('includes bind phase', () => {
      const hasBind = frames.some(f => {
        const data = f.data as DeviceSysfsState;
        return data.phase === 'bind';
      });
      expect(hasBind).toBe(true);
    });

    it('drivers array grows during binding', () => {
      const firstData = frames[0].data as DeviceSysfsState;
      const lastData = frames[frames.length - 1].data as DeviceSysfsState;
      expect(lastData.drivers.length).toBeGreaterThan(firstData.drivers.length);
    });

    it('srcRef is non-empty on all frames', () => {
      frames.forEach(f => {
        const data = f.data as DeviceSysfsState;
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });
  });

  describe('generateFrames - sysfs-attribute-read', () => {
    const frames = deviceSysfs.generateFrames('sysfs-attribute-read');

    it('generates 8-12 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
      expect(frames.length).toBeLessThanOrEqual(12);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('references sysfs_create_group', () => {
      const hasRef = frames.some(f => f.description.includes('sysfs_create_group'));
      expect(hasRef).toBe(true);
    });

    it('references sysfs_kf_seq_show', () => {
      const hasRef = frames.some(f => f.description.includes('sysfs_kf_seq_show'));
      expect(hasRef).toBe(true);
    });

    it('references dev_attr_show', () => {
      const hasRef = frames.some(f => f.description.includes('dev_attr_show'));
      expect(hasRef).toBe(true);
    });

    it('mentions /sys/ path', () => {
      const hasPath = frames.some(f => {
        const data = f.data as DeviceSysfsState;
        return data.sysfsPath.includes('/sys/');
      });
      expect(hasPath).toBe(true);
    });

    it('includes sysfs-read phase', () => {
      const hasPhase = frames.some(f => {
        const data = f.data as DeviceSysfsState;
        return data.phase === 'sysfs-read';
      });
      expect(hasPhase).toBe(true);
    });

    it('sysfsPath changes during read', () => {
      const firstData = frames[0].data as DeviceSysfsState;
      const lastData = frames[frames.length - 1].data as DeviceSysfsState;
      expect(lastData.sysfsPath).not.toBe(firstData.sysfsPath);
    });

    it('srcRef is non-empty on all frames', () => {
      frames.forEach(f => {
        const data = f.data as DeviceSysfsState;
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });
  });

  describe('renderFrame', () => {
    it('renders title text', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = deviceSysfs.generateFrames('device-registration');
      deviceSysfs.renderFrame(svg, frames[0], 900, 480);
      const title = svg.querySelector('.anim-title');
      expect(title).not.toBeNull();
    });

    it('renders device blocks', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = deviceSysfs.generateFrames('device-registration');
      deviceSysfs.renderFrame(svg, frames[frames.length - 1], 900, 480);
      const blocks = svg.querySelectorAll('.anim-block');
      expect(blocks.length).toBeGreaterThan(0);
    });

    it('renders kobject tree nodes', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = deviceSysfs.generateFrames('device-registration');
      deviceSysfs.renderFrame(svg, frames[frames.length - 1], 900, 480);
      const nodes = svg.querySelectorAll('.anim-kobject');
      expect(nodes.length).toBeGreaterThan(0);
    });

    it('renders phase indicator', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = deviceSysfs.generateFrames('device-registration');
      deviceSysfs.renderFrame(svg, frames[3], 900, 480);
      const phases = svg.querySelectorAll('.anim-phase');
      expect(phases.length).toBeGreaterThan(0);
    });

    it('clears previous content on re-render', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = deviceSysfs.generateFrames('device-registration');
      deviceSysfs.renderFrame(svg, frames[0], 900, 480);
      const countBefore = svg.childElementCount;
      deviceSysfs.renderFrame(svg, frames[1], 900, 480);
      expect(svg.childElementCount).toBeLessThanOrEqual(countBefore + 10);
    });

    it('renders sysfs path display', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = deviceSysfs.generateFrames('sysfs-attribute-read');
      const sysfsFrame = frames.find(f => {
        const data = f.data as DeviceSysfsState;
        return data.sysfsPath.includes('/sys/');
      });
      if (sysfsFrame) {
        deviceSysfs.renderFrame(svg, sysfsFrame, 900, 480);
        const highlights = svg.querySelectorAll('.anim-highlight');
        expect(highlights.length).toBeGreaterThan(0);
      }
    });
  });
});

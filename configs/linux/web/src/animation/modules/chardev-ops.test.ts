import { describe, it, expect } from 'vitest';
import chardevOps from './chardev-ops.js';
import type { ChardevState } from './chardev-ops.js';

describe('Character Device Operations', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(chardevOps.config.id).toBe('chardev-ops');
      expect(chardevOps.config.skillName).toBe('character-devices');
      expect(chardevOps.config.title).toBe('Character Device Operations');
    });
  });

  describe('getScenarios', () => {
    it('returns 3 scenarios', () => {
      const scenarios = chardevOps.getScenarios();
      expect(scenarios.length).toBe(3);
      expect(scenarios.map(s => s.id)).toContain('register-chardev');
      expect(scenarios.map(s => s.id)).toContain('open-read-write');
      expect(scenarios.map(s => s.id)).toContain('ioctl-flow');
    });
  });

  describe('generateFrames - register-chardev (default)', () => {
    const frames = chardevOps.generateFrames('register-chardev');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('first frame has step 0', () => {
      expect(frames[0].step).toBe(0);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('has frames with phase alloc-region', () => {
      const hasPhase = frames.some(f => {
        const data = f.data as ChardevState;
        return data.phase === 'alloc-region';
      });
      expect(hasPhase).toBe(true);
    });

    it('has frames with phase cdev-init', () => {
      const hasPhase = frames.some(f => {
        const data = f.data as ChardevState;
        return data.phase === 'cdev-init';
      });
      expect(hasPhase).toBe(true);
    });

    it('has frames with phase cdev-add', () => {
      const hasPhase = frames.some(f => {
        const data = f.data as ChardevState;
        return data.phase === 'cdev-add';
      });
      expect(hasPhase).toBe(true);
    });

    it('assigns major/minor numbers during registration', () => {
      const hasMajorMinor = frames.some(f => {
        const data = f.data as ChardevState;
        return data.majorMinor !== null && data.majorMinor.major === 240;
      });
      expect(hasMajorMinor).toBe(true);
    });

    it('marks cdev as registered after cdev_add', () => {
      const cdevAddFrame = frames.find(f => {
        const data = f.data as ChardevState;
        return data.phase === 'cdev-add';
      });
      expect(cdevAddFrame).toBeDefined();
      const data = cdevAddFrame!.data as ChardevState;
      expect(data.cdevRegistered).toBe(true);
    });

    it('creates device node during device-create phase', () => {
      const hasDeviceNode = frames.some(f => {
        const data = f.data as ChardevState;
        return data.deviceNode === '/dev/mychardev';
      });
      expect(hasDeviceNode).toBe(true);
    });

    it('populates fileOps during cdev_init', () => {
      const initFrame = frames.find(f => {
        const data = f.data as ChardevState;
        return data.phase === 'cdev-init';
      });
      expect(initFrame).toBeDefined();
      const data = initFrame!.data as ChardevState;
      expect(data.fileOps.length).toBeGreaterThan(0);
      expect(data.fileOps).toContain('.open');
      expect(data.fileOps).toContain('.read');
    });

    it('every frame has srcRef in data', () => {
      frames.forEach(f => {
        const data = f.data as ChardevState;
        expect(data.srcRef).toBeDefined();
        expect(typeof data.srcRef).toBe('string');
      });
    });

    it('descriptions reference real kernel functions', () => {
      const allDescriptions = frames.map(f => f.description).join(' ');
      expect(allDescriptions).toContain('alloc_chrdev_region');
      expect(allDescriptions).toContain('cdev_init');
      expect(allDescriptions).toContain('cdev_add');
      expect(allDescriptions).toContain('chrdev_open');
    });
  });

  describe('generateFrames - default scenario', () => {
    it('returns frames when called without argument', () => {
      const frames = chardevOps.generateFrames();
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });
  });

  describe('generateFrames - open-read-write', () => {
    const frames = chardevOps.generateFrames('open-read-write');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('has frames with phase chrdev-open', () => {
      const hasPhase = frames.some(f => {
        const data = f.data as ChardevState;
        return data.phase === 'chrdev-open';
      });
      expect(hasPhase).toBe(true);
    });

    it('has frames with phase driver-open', () => {
      const hasPhase = frames.some(f => {
        const data = f.data as ChardevState;
        return data.phase === 'driver-open';
      });
      expect(hasPhase).toBe(true);
    });

    it('has frames with phase driver-read', () => {
      const hasPhase = frames.some(f => {
        const data = f.data as ChardevState;
        return data.phase === 'driver-read';
      });
      expect(hasPhase).toBe(true);
    });

    it('references vfs_read in descriptions', () => {
      const allDescriptions = frames.map(f => f.description).join(' ');
      expect(allDescriptions).toContain('vfs_read');
      expect(allDescriptions).toContain('vfs_write');
    });

    it('references chrdev_open kobj_lookup', () => {
      const allDescriptions = frames.map(f => f.description).join(' ');
      expect(allDescriptions).toContain('kobj_lookup');
      expect(allDescriptions).toContain('cdev_map');
    });

    it('references file_operations dispatch', () => {
      const allDescriptions = frames.map(f => f.description).join(' ');
      expect(allDescriptions).toContain('file_operations');
      expect(allDescriptions).toContain('f_op->read');
    });

    it('every frame has srcRef in data', () => {
      frames.forEach(f => {
        const data = f.data as ChardevState;
        expect(data.srcRef).toBeDefined();
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });

    it('starts with cdev already registered', () => {
      const data = frames[0].data as ChardevState;
      expect(data.cdevRegistered).toBe(true);
      expect(data.majorMinor).not.toBeNull();
    });
  });

  describe('generateFrames - ioctl-flow', () => {
    const frames = chardevOps.generateFrames('ioctl-flow');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('has frames with phase do-vfs-ioctl', () => {
      const hasPhase = frames.some(f => {
        const data = f.data as ChardevState;
        return data.phase === 'do-vfs-ioctl';
      });
      expect(hasPhase).toBe(true);
    });

    it('has frames with phase vfs-ioctl', () => {
      const hasPhase = frames.some(f => {
        const data = f.data as ChardevState;
        return data.phase === 'vfs-ioctl';
      });
      expect(hasPhase).toBe(true);
    });

    it('has frames with phase driver-ioctl', () => {
      const hasPhase = frames.some(f => {
        const data = f.data as ChardevState;
        return data.phase === 'driver-ioctl';
      });
      expect(hasPhase).toBe(true);
    });

    it('references unlocked_ioctl in descriptions', () => {
      const allDescriptions = frames.map(f => f.description).join(' ');
      expect(allDescriptions).toContain('unlocked_ioctl');
      expect(allDescriptions).toContain('do_vfs_ioctl');
      expect(allDescriptions).toContain('vfs_ioctl');
    });

    it('references ENOIOCTLCMD error mapping', () => {
      const allDescriptions = frames.map(f => f.description).join(' ');
      expect(allDescriptions).toContain('ENOIOCTLCMD');
      expect(allDescriptions).toContain('ENOTTY');
    });

    it('references compat_ioctl', () => {
      const allDescriptions = frames.map(f => f.description).join(' ');
      expect(allDescriptions).toContain('compat_ioctl');
    });

    it('every frame has srcRef in data', () => {
      frames.forEach(f => {
        const data = f.data as ChardevState;
        expect(data.srcRef).toBeDefined();
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });

    it('has fileOps including .unlocked_ioctl', () => {
      const data = frames[0].data as ChardevState;
      expect(data.fileOps).toContain('.unlocked_ioctl');
    });
  });

  describe('renderFrame', () => {
    it('renders layer boxes', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = chardevOps.generateFrames('register-chardev');
      chardevOps.renderFrame(svg, frames[0], 900, 480);
      const chardevElements = svg.querySelectorAll('.anim-chardev');
      expect(chardevElements.length).toBeGreaterThan(0);
    });

    it('renders VFS layer elements', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = chardevOps.generateFrames('open-read-write');
      chardevOps.renderFrame(svg, frames[1], 900, 480);
      const vfsElements = svg.querySelectorAll('.anim-vfs');
      expect(vfsElements.length).toBeGreaterThan(0);
    });

    it('renders driver layer elements', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = chardevOps.generateFrames('open-read-write');
      // Pick a frame where driver is active
      const driverFrame = frames.find(f => {
        const data = f.data as ChardevState;
        return data.phase === 'driver-open' || data.phase === 'driver-read';
      });
      if (driverFrame) {
        chardevOps.renderFrame(svg, driverFrame, 900, 480);
        const driverElements = svg.querySelectorAll('.anim-driver');
        expect(driverElements.length).toBeGreaterThan(0);
      }
    });

    it('renders title text', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = chardevOps.generateFrames('register-chardev');
      chardevOps.renderFrame(svg, frames[0], 900, 480);
      const title = svg.querySelector('.anim-title');
      expect(title).not.toBeNull();
    });

    it('renders current operation indicator when op is active', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = chardevOps.generateFrames('register-chardev');
      // Find a frame with currentOp set
      const opFrame = frames.find(f => {
        const data = f.data as ChardevState;
        return data.currentOp !== null;
      });
      expect(opFrame).toBeDefined();
      chardevOps.renderFrame(svg, opFrame!, 900, 480);
      const highlights = svg.querySelectorAll('.anim-highlight');
      expect(highlights.length).toBeGreaterThan(0);
    });

    it('renders file_operations list for open-read-write', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = chardevOps.generateFrames('open-read-write');
      chardevOps.renderFrame(svg, frames[4], 900, 480);
      const driverElements = svg.querySelectorAll('.anim-driver');
      expect(driverElements.length).toBeGreaterThan(0);
    });

    it('clears previous content on re-render', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = chardevOps.generateFrames('register-chardev');
      chardevOps.renderFrame(svg, frames[0], 900, 480);
      const countBefore = svg.childElementCount;
      chardevOps.renderFrame(svg, frames[1], 900, 480);
      // Should not accumulate elements
      expect(svg.childElementCount).toBeLessThanOrEqual(countBefore + 10);
    });
  });
});

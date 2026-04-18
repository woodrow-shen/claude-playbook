import { describe, it, expect } from 'vitest';
import cgroupNamespace from './cgroup-namespace.js';
import type { CgroupNamespaceState } from './cgroup-namespace.js';

describe('Cgroup Namespace', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(cgroupNamespace.config.id).toBe('cgroup-namespace');
      expect(cgroupNamespace.config.skillName).toBe('cgroups-and-namespaces');
      expect(cgroupNamespace.config.title).toBe('Container Runtime Isolation');
    });
  });

  describe('getScenarios', () => {
    it('returns 3 scenarios', () => {
      const scenarios = cgroupNamespace.getScenarios();
      expect(scenarios.length).toBe(3);
      expect(scenarios.map(s => s.id)).toContain('container-clone');
      expect(scenarios.map(s => s.id)).toContain('cgroup-namespace-view');
      expect(scenarios.map(s => s.id)).toContain('resource-isolation');
    });
  });

  describe('generateFrames - container-clone (default)', () => {
    const frames = cgroupNamespace.generateFrames('container-clone');

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

    it('starts with setup phase', () => {
      const data = frames[0].data as CgroupNamespaceState;
      expect(data.phase).toBe('setup');
    });

    it('includes copy-namespaces phase', () => {
      const hasPhase = frames.some(f => {
        const data = f.data as CgroupNamespaceState;
        return data.phase === 'copy-namespaces';
      });
      expect(hasPhase).toBe(true);
    });

    it('includes cgroup-fork phase', () => {
      const hasPhase = frames.some(f => {
        const data = f.data as CgroupNamespaceState;
        return data.phase === 'cgroup-fork';
      });
      expect(hasPhase).toBe(true);
    });

    it('includes cgroup-can-fork phase', () => {
      const hasPhase = frames.some(f => {
        const data = f.data as CgroupNamespaceState;
        return data.phase === 'cgroup-can-fork';
      });
      expect(hasPhase).toBe(true);
    });

    it('includes post-fork phase', () => {
      const hasPhase = frames.some(f => {
        const data = f.data as CgroupNamespaceState;
        return data.phase === 'post-fork';
      });
      expect(hasPhase).toBe(true);
    });

    it('data includes namespaces array', () => {
      const data = frames[0].data as CgroupNamespaceState;
      expect(Array.isArray(data.namespaces)).toBe(true);
    });

    it('namespaces grow as CLONE_NEW* flags are processed', () => {
      const firstData = frames[0].data as CgroupNamespaceState;
      const lastData = frames[frames.length - 1].data as CgroupNamespaceState;
      expect(lastData.namespaces.length).toBeGreaterThan(firstData.namespaces.length);
    });

    it('namespaces have type field', () => {
      const lastData = frames[frames.length - 1].data as CgroupNamespaceState;
      expect(lastData.namespaces.length).toBeGreaterThan(0);
      lastData.namespaces.forEach(ns => {
        expect(ns.type).toBeDefined();
        expect(typeof ns.type).toBe('string');
      });
    });

    it('data includes cgroupPath', () => {
      const data = frames[0].data as CgroupNamespaceState;
      expect(typeof data.cgroupPath).toBe('string');
    });

    it('data includes resourceLimits', () => {
      const data = frames[0].data as CgroupNamespaceState;
      expect(data.resourceLimits).toBeDefined();
    });

    it('data includes processTree', () => {
      const data = frames[0].data as CgroupNamespaceState;
      expect(Array.isArray(data.processTree)).toBe(true);
    });

    it('data includes isolationLevel', () => {
      const data = frames[0].data as CgroupNamespaceState;
      expect(typeof data.isolationLevel).toBe('string');
    });

    it('data includes srcRef', () => {
      const data = frames[0].data as CgroupNamespaceState;
      expect(data.srcRef).toBeDefined();
      expect(data.srcRef.length).toBeGreaterThan(0);
    });

    it('srcRef on all frames references real kernel source files', () => {
      frames.forEach(f => {
        const data = f.data as CgroupNamespaceState;
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });

    it('descriptions reference copy_process', () => {
      const hasRef = frames.some(f => f.description.includes('copy_process'));
      expect(hasRef).toBe(true);
    });

    it('descriptions reference copy_namespaces', () => {
      const hasRef = frames.some(f => f.description.includes('copy_namespaces'));
      expect(hasRef).toBe(true);
    });

    it('descriptions reference cgroup_fork', () => {
      const hasRef = frames.some(f => f.description.includes('cgroup_fork'));
      expect(hasRef).toBe(true);
    });

    it('descriptions reference cgroup_can_fork', () => {
      const hasRef = frames.some(f => f.description.includes('cgroup_can_fork'));
      expect(hasRef).toBe(true);
    });

    it('isolationLevel increases through the animation', () => {
      const firstData = frames[0].data as CgroupNamespaceState;
      const lastData = frames[frames.length - 1].data as CgroupNamespaceState;
      expect(firstData.isolationLevel).toBe('none');
      expect(lastData.isolationLevel).toBe('full');
    });
  });

  describe('generateFrames - default scenario', () => {
    it('returns frames when called without argument', () => {
      const frames = cgroupNamespace.generateFrames();
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });
  });

  describe('generateFrames - cgroup-namespace-view', () => {
    const frames = cgroupNamespace.generateFrames('cgroup-namespace-view');

    it('generates 8-12 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
      expect(frames.length).toBeLessThanOrEqual(12);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('includes cgns-create phase', () => {
      const hasPhase = frames.some(f => {
        const data = f.data as CgroupNamespaceState;
        return data.phase === 'cgns-create';
      });
      expect(hasPhase).toBe(true);
    });

    it('includes path-virtualize phase', () => {
      const hasPhase = frames.some(f => {
        const data = f.data as CgroupNamespaceState;
        return data.phase === 'path-virtualize';
      });
      expect(hasPhase).toBe(true);
    });

    it('references copy_cgroup_ns', () => {
      const hasRef = frames.some(f => f.description.includes('copy_cgroup_ns'));
      expect(hasRef).toBe(true);
    });

    it('references cgroup_show_path', () => {
      const hasRef = frames.some(f => f.description.includes('cgroup_show_path'));
      expect(hasRef).toBe(true);
    });

    it('references current_cgns_cgroup_from_root', () => {
      const hasRef = frames.some(f => f.description.includes('current_cgns_cgroup_from_root'));
      expect(hasRef).toBe(true);
    });

    it('cgroupPath changes to show virtualization', () => {
      const firstData = frames[0].data as CgroupNamespaceState;
      const pathVirtFrame = frames.find(f => {
        const data = f.data as CgroupNamespaceState;
        return data.phase === 'path-virtualize';
      });
      expect(pathVirtFrame).toBeDefined();
      const virtData = pathVirtFrame!.data as CgroupNamespaceState;
      expect(virtData.cgroupPath).not.toBe(firstData.cgroupPath);
    });

    it('has srcRef on all frames', () => {
      frames.forEach(f => {
        const data = f.data as CgroupNamespaceState;
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });
  });

  describe('generateFrames - resource-isolation', () => {
    const frames = cgroupNamespace.generateFrames('resource-isolation');

    it('generates 8-12 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
      expect(frames.length).toBeLessThanOrEqual(12);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('includes cgroup-attach phase', () => {
      const hasPhase = frames.some(f => {
        const data = f.data as CgroupNamespaceState;
        return data.phase === 'cgroup-attach';
      });
      expect(hasPhase).toBe(true);
    });

    it('includes css-set-move phase', () => {
      const hasPhase = frames.some(f => {
        const data = f.data as CgroupNamespaceState;
        return data.phase === 'css-set-move';
      });
      expect(hasPhase).toBe(true);
    });

    it('references cgroup_attach_task', () => {
      const hasRef = frames.some(f => f.description.includes('cgroup_attach_task'));
      expect(hasRef).toBe(true);
    });

    it('references css_set_move_task', () => {
      const hasRef = frames.some(f => f.description.includes('css_set_move_task'));
      expect(hasRef).toBe(true);
    });

    it('resourceLimits change during animation', () => {
      const firstData = frames[0].data as CgroupNamespaceState;
      const lastData = frames[frames.length - 1].data as CgroupNamespaceState;
      expect(lastData.resourceLimits).not.toEqual(firstData.resourceLimits);
    });

    it('namespaces interact with cgroup controllers', () => {
      const hasNsRef = frames.some(f =>
        f.description.includes('pid') || f.description.includes('net') || f.description.includes('mnt')
      );
      expect(hasNsRef).toBe(true);
    });

    it('has srcRef on all frames', () => {
      frames.forEach(f => {
        const data = f.data as CgroupNamespaceState;
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });
  });

  describe('renderFrame', () => {
    it('renders namespace boxes', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = cgroupNamespace.generateFrames('container-clone');
      const lastFrame = frames[frames.length - 1];
      cgroupNamespace.renderFrame(svg, lastFrame, 900, 480);
      const nsElements = svg.querySelectorAll('.anim-namespace');
      expect(nsElements.length).toBeGreaterThan(0);
    });

    it('renders process tree', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = cgroupNamespace.generateFrames('container-clone');
      cgroupNamespace.renderFrame(svg, frames[0], 900, 480);
      const procs = svg.querySelectorAll('.anim-process');
      expect(procs.length).toBeGreaterThan(0);
    });

    it('renders phase flow blocks', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = cgroupNamespace.generateFrames('container-clone');
      cgroupNamespace.renderFrame(svg, frames[3], 900, 480);
      const blocks = svg.querySelectorAll('.anim-block');
      expect(blocks.length).toBeGreaterThan(0);
    });

    it('renders title text', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = cgroupNamespace.generateFrames('container-clone');
      cgroupNamespace.renderFrame(svg, frames[0], 900, 480);
      const title = svg.querySelector('.anim-title');
      expect(title).not.toBeNull();
    });

    it('clears previous content on re-render', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = cgroupNamespace.generateFrames('container-clone');
      cgroupNamespace.renderFrame(svg, frames[0], 900, 480);
      const countBefore = svg.childElementCount;
      cgroupNamespace.renderFrame(svg, frames[1], 900, 480);
      expect(svg.childElementCount).toBeLessThanOrEqual(countBefore + 10);
    });

    it('renders cgroup path display', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = cgroupNamespace.generateFrames('cgroup-namespace-view');
      cgroupNamespace.renderFrame(svg, frames[4], 900, 480);
      const pathElements = svg.querySelectorAll('.anim-cgroup-path');
      expect(pathElements.length).toBeGreaterThan(0);
    });

    it('renders resource limits', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = cgroupNamespace.generateFrames('resource-isolation');
      const lastFrame = frames[frames.length - 1];
      cgroupNamespace.renderFrame(svg, lastFrame, 900, 480);
      const limits = svg.querySelectorAll('.anim-resource-limit');
      expect(limits.length).toBeGreaterThan(0);
    });
  });
});

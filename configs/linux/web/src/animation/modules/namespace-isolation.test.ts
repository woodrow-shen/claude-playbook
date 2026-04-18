import { describe, it, expect } from 'vitest';
import namespaceIsolation from './namespace-isolation.js';
import type { NamespaceState } from './namespace-isolation.js';

describe('NamespaceIsolation', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(namespaceIsolation.config.id).toBe('namespace-isolation');
      expect(namespaceIsolation.config.skillName).toBe('namespaces');
    });

    it('has a display title', () => {
      expect(namespaceIsolation.config.title).toBeTruthy();
    });
  });

  describe('getScenarios', () => {
    const scenarios = namespaceIsolation.getScenarios();

    it('returns exactly 3 scenarios', () => {
      expect(scenarios.length).toBe(3);
    });

    it('includes required scenario IDs', () => {
      const ids = scenarios.map(s => s.id);
      expect(ids).toContain('clone-with-namespaces');
      expect(ids).toContain('pid-namespace-nesting');
      expect(ids).toContain('unshare-mount-ns');
    });

    it('each scenario has id and label', () => {
      for (const s of scenarios) {
        expect(s.id).toBeTruthy();
        expect(s.label).toBeTruthy();
      }
    });
  });

  describe('generateFrames - clone-with-namespaces (default)', () => {
    const frames = namespaceIsolation.generateFrames('clone-with-namespaces');
    const defaultFrames = namespaceIsolation.generateFrames();

    it('is the default scenario', () => {
      expect(defaultFrames.length).toBe(frames.length);
      expect(defaultFrames[0].label).toBe(frames[0].label);
    });

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

    it('each frame has typed NamespaceState data with srcRef', () => {
      for (const f of frames) {
        const data = f.data as NamespaceState;
        expect(data.currentFunction).toBeTruthy();
        expect(data.srcRef).toBeTruthy();
        expect(Array.isArray(data.processes)).toBe(true);
        expect(Array.isArray(data.namespaceLayers)).toBe(true);
        expect(data.phase).toBeTruthy();
      }
    });

    it('shows copy_namespaces in the flow', () => {
      const functions = frames.map(f => (f.data as NamespaceState).currentFunction);
      expect(functions).toContain('copy_namespaces');
    });

    it('shows create_new_namespaces in the flow', () => {
      const functions = frames.map(f => (f.data as NamespaceState).currentFunction);
      expect(functions).toContain('create_new_namespaces');
    });

    it('descriptions reference real kernel functions', () => {
      const allDescriptions = frames.map(f => f.description).join(' ');
      expect(allDescriptions).toContain('copy_namespaces');
      expect(allDescriptions).toContain('create_new_namespaces');
      expect(allDescriptions).toContain('nsproxy');
    });

    it('srcRef values reference real kernel source files', () => {
      const allSrcRefs = frames.map(f => (f.data as NamespaceState).srcRef).join(' ');
      expect(allSrcRefs).toContain('kernel/nsproxy.c');
      expect(allSrcRefs).toContain('kernel/fork.c');
    });

    it('first frame enters copy_process or clone entry', () => {
      const data = frames[0].data as NamespaceState;
      expect(data.phase).toBe('clone-entry');
    });

    it('processes array grows as namespaces are created', () => {
      const firstProcessCount = (frames[0].data as NamespaceState).processes.length;
      const lastProcessCount = (frames[frames.length - 1].data as NamespaceState).processes.length;
      expect(lastProcessCount).toBeGreaterThanOrEqual(firstProcessCount);
    });

    it('namespace layers grow as namespaces are created', () => {
      const firstLayerCount = (frames[0].data as NamespaceState).namespaceLayers.length;
      const lastLayerCount = (frames[frames.length - 1].data as NamespaceState).namespaceLayers.length;
      expect(lastLayerCount).toBeGreaterThan(firstLayerCount);
    });
  });

  describe('generateFrames - pid-namespace-nesting', () => {
    const frames = namespaceIsolation.generateFrames('pid-namespace-nesting');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('each frame has srcRef', () => {
      for (const f of frames) {
        const data = f.data as NamespaceState;
        expect(data.srcRef).toBeTruthy();
      }
    });

    it('shows nested PID allocation', () => {
      const allDescriptions = frames.map(f => f.description).join(' ');
      expect(allDescriptions).toContain('pid_nr_ns');
    });

    it('shows PID 1 inside the namespace', () => {
      const allDescriptions = frames.map(f => f.description).join(' ');
      expect(allDescriptions).toMatch(/PID\s*1/i);
    });

    it('shows processes with nsPid values', () => {
      const lastFrame = frames[frames.length - 1];
      const data = lastFrame.data as NamespaceState;
      const processesWithNsPid = data.processes.filter(p => p.nsPid !== null);
      expect(processesWithNsPid.length).toBeGreaterThan(0);
    });

    it('references real kernel source files', () => {
      const allSrcRefs = frames.map(f => (f.data as NamespaceState).srcRef).join(' ');
      expect(allSrcRefs).toContain('kernel/pid.c');
      expect(allSrcRefs).toContain('kernel/pid_namespace.c');
    });

    it('uses real function names', () => {
      const functions = frames.map(f => (f.data as NamespaceState).currentFunction);
      expect(functions).toContain('create_pid_namespace');
      expect(functions).toContain('alloc_pid');
    });
  });

  describe('generateFrames - unshare-mount-ns', () => {
    const frames = namespaceIsolation.generateFrames('unshare-mount-ns');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('each frame has srcRef', () => {
      for (const f of frames) {
        const data = f.data as NamespaceState;
        expect(data.srcRef).toBeTruthy();
      }
    });

    it('traces ksys_unshare', () => {
      const functions = frames.map(f => (f.data as NamespaceState).currentFunction);
      expect(functions).toContain('ksys_unshare');
    });

    it('traces unshare_nsproxy_namespaces', () => {
      const functions = frames.map(f => (f.data as NamespaceState).currentFunction);
      expect(functions).toContain('unshare_nsproxy_namespaces');
    });

    it('traces copy_mnt_ns', () => {
      const functions = frames.map(f => (f.data as NamespaceState).currentFunction);
      expect(functions).toContain('copy_mnt_ns');
    });

    it('mentions mount propagation', () => {
      const allDescriptions = frames.map(f => f.description).join(' ');
      expect(allDescriptions).toMatch(/propagation/i);
    });

    it('references real source files', () => {
      const allSrcRefs = frames.map(f => (f.data as NamespaceState).srcRef).join(' ');
      expect(allSrcRefs).toContain('kernel/fork.c');
      expect(allSrcRefs).toContain('fs/namespace.c');
    });
  });

  describe('renderFrame', () => {
    it('is a function', () => {
      expect(typeof namespaceIsolation.renderFrame).toBe('function');
    });
  });
});

import { describe, it, expect } from 'vitest';
import cgroupHierarchy from './cgroup-hierarchy.js';
import type { CgroupState } from './cgroup-hierarchy.js';

describe('CgroupHierarchy', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(cgroupHierarchy.config.id).toBe('cgroup-hierarchy');
      expect(cgroupHierarchy.config.skillName).toBe('cgroups-v2');
    });

    it('has a display title', () => {
      expect(cgroupHierarchy.config.title).toBeTruthy();
    });
  });

  describe('getScenarios', () => {
    const scenarios = cgroupHierarchy.getScenarios();

    it('returns exactly 3 scenarios', () => {
      expect(scenarios.length).toBe(3);
    });

    it('includes required scenario IDs', () => {
      const ids = scenarios.map(s => s.id);
      expect(ids).toContain('cgroup-creation-and-attach');
      expect(ids).toContain('memory-limit-enforcement');
      expect(ids).toContain('cpu-controller');
    });

    it('each scenario has id and label', () => {
      for (const s of scenarios) {
        expect(s.id).toBeTruthy();
        expect(s.label).toBeTruthy();
      }
    });
  });

  describe('generateFrames - cgroup-creation-and-attach (default)', () => {
    const frames = cgroupHierarchy.generateFrames('cgroup-creation-and-attach');
    const defaultFrames = cgroupHierarchy.generateFrames();

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

    it('each frame has typed CgroupState data with srcRef', () => {
      for (const f of frames) {
        const data = f.data as CgroupState;
        expect(data.currentFunction).toBeTruthy();
        expect(data.srcRef).toBeTruthy();
        expect(Array.isArray(data.hierarchy)).toBe(true);
        expect(data.phase).toBeTruthy();
        expect(data.currentCgroup).toBeDefined();
      }
    });

    it('shows cgroup_mkdir in the flow', () => {
      const functions = frames.map(f => (f.data as CgroupState).currentFunction);
      expect(functions).toContain('cgroup_mkdir');
    });

    it('shows cgroup_create in the flow', () => {
      const functions = frames.map(f => (f.data as CgroupState).currentFunction);
      expect(functions).toContain('cgroup_create');
    });

    it('shows cgroup_migrate in the flow', () => {
      const functions = frames.map(f => (f.data as CgroupState).currentFunction);
      expect(functions).toContain('cgroup_migrate');
    });

    it('descriptions reference real kernel functions', () => {
      const allDescriptions = frames.map(f => f.description).join(' ');
      expect(allDescriptions).toContain('cgroup_mkdir');
      expect(allDescriptions).toContain('cgroup_create');
      expect(allDescriptions).toContain('cgroup_apply_control_enable');
      expect(allDescriptions).toContain('cgroup_attach_task');
      expect(allDescriptions).toContain('css_set_move_task');
    });

    it('srcRef values reference real kernel source files', () => {
      const allSrcRefs = frames.map(f => (f.data as CgroupState).srcRef).join(' ');
      expect(allSrcRefs).toContain('kernel/cgroup/cgroup.c');
    });

    it('first frame enters cgroup_mkdir', () => {
      const data = frames[0].data as CgroupState;
      expect(data.phase).toBe('mkdir');
    });

    it('hierarchy grows as cgroups are created', () => {
      const firstCount = (frames[0].data as CgroupState).hierarchy.length;
      const lastCount = (frames[frames.length - 1].data as CgroupState).hierarchy.length;
      expect(lastCount).toBeGreaterThanOrEqual(firstCount);
    });
  });

  describe('generateFrames - memory-limit-enforcement', () => {
    const frames = cgroupHierarchy.generateFrames('memory-limit-enforcement');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('each frame has srcRef', () => {
      for (const f of frames) {
        const data = f.data as CgroupState;
        expect(data.srcRef).toBeTruthy();
      }
    });

    it('shows mem_cgroup_charge flow', () => {
      const functions = frames.map(f => (f.data as CgroupState).currentFunction);
      expect(functions).toContain('__mem_cgroup_charge');
    });

    it('shows try_charge_memcg', () => {
      const functions = frames.map(f => (f.data as CgroupState).currentFunction);
      expect(functions).toContain('try_charge_memcg');
    });

    it('descriptions reference real kernel functions', () => {
      const allDescriptions = frames.map(f => f.description).join(' ');
      expect(allDescriptions).toContain('mem_cgroup_charge');
      expect(allDescriptions).toContain('try_charge_memcg');
    });

    it('references real kernel source files', () => {
      const allSrcRefs = frames.map(f => (f.data as CgroupState).srcRef).join(' ');
      expect(allSrcRefs).toContain('mm/memcontrol.c');
    });

    it('uses real function names in descriptions', () => {
      const allDescriptions = frames.map(f => f.description).join(' ');
      expect(allDescriptions).toContain('page_counter');
      expect(allDescriptions).toContain('memory.max');
    });
  });

  describe('generateFrames - cpu-controller', () => {
    const frames = cgroupHierarchy.generateFrames('cpu-controller');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('each frame has srcRef', () => {
      for (const f of frames) {
        const data = f.data as CgroupState;
        expect(data.srcRef).toBeTruthy();
      }
    });

    it('shows cpu_cgroup_css_alloc', () => {
      const functions = frames.map(f => (f.data as CgroupState).currentFunction);
      expect(functions).toContain('cpu_cgroup_css_alloc');
    });

    it('shows cpu_cgroup_attach', () => {
      const functions = frames.map(f => (f.data as CgroupState).currentFunction);
      expect(functions).toContain('cpu_cgroup_attach');
    });

    it('traces sched_move_task', () => {
      const functions = frames.map(f => (f.data as CgroupState).currentFunction);
      expect(functions).toContain('sched_move_task');
    });

    it('references real source files', () => {
      const allSrcRefs = frames.map(f => (f.data as CgroupState).srcRef).join(' ');
      expect(allSrcRefs).toContain('kernel/sched/core.c');
    });

    it('mentions cpu.max and CFS bandwidth', () => {
      const allDescriptions = frames.map(f => f.description).join(' ');
      expect(allDescriptions).toContain('cpu.max');
      expect(allDescriptions).toMatch(/bandwidth/i);
    });
  });

  describe('renderFrame', () => {
    it('is a function', () => {
      expect(typeof cgroupHierarchy.renderFrame).toBe('function');
    });
  });
});

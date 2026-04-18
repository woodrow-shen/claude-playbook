import { describe, it, expect } from 'vitest';
import lsmHooks from './lsm-hooks.js';
import type { LsmState } from './lsm-hooks.js';

describe('LSM Security Hook Flow', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(lsmHooks.config.id).toBe('lsm-hooks');
      expect(lsmHooks.config.skillName).toBe('lsm-framework');
    });

    it('has a title', () => {
      expect(lsmHooks.config.title).toBe('LSM Security Hook Flow');
    });
  });

  describe('getScenarios', () => {
    it('returns 3 scenarios', () => {
      expect(lsmHooks.getScenarios().length).toBe(3);
    });

    it('each scenario has id and label', () => {
      for (const s of lsmHooks.getScenarios()) {
        expect(s.id).toBeTruthy();
        expect(s.label).toBeTruthy();
      }
    });

    it('includes file-open-check, task-creation-check, and lsm-stacking', () => {
      const ids = lsmHooks.getScenarios().map(s => s.id);
      expect(ids).toContain('file-open-check');
      expect(ids).toContain('task-creation-check');
      expect(ids).toContain('lsm-stacking');
    });
  });

  describe('generateFrames - file-open-check (default)', () => {
    const frames = lsmHooks.generateFrames('file-open-check');

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

    it('data includes operation and hookName', () => {
      const data = frames[0].data as LsmState;
      expect(data.operation).toBe('file open');
      expect(data.hookName).toBe('security_file_open');
    });

    it('data includes lsmModules array', () => {
      const data = frames[0].data as LsmState;
      expect(Array.isArray(data.lsmModules)).toBe(true);
      expect(data.lsmModules.length).toBe(3);
    });

    it('lsmModules include SELinux, AppArmor, and BPF LSM', () => {
      const data = frames[0].data as LsmState;
      const names = data.lsmModules.map(m => m.name);
      expect(names).toContain('SELinux');
      expect(names).toContain('AppArmor');
      expect(names).toContain('BPF LSM');
    });

    it('all LSMs allow in file-open-check scenario', () => {
      const lastData = frames[frames.length - 1].data as LsmState;
      expect(lastData.finalDecision).toBe('allow');
      for (const mod of lastData.lsmModules) {
        expect(mod.decision).toBe('allow');
      }
    });

    it('every frame data has srcRef', () => {
      for (const f of frames) {
        const data = f.data as LsmState;
        expect(data.srcRef).toBeTruthy();
        expect(data.srcRef).toMatch(/\w+\.\w+:\d+/);
      }
    });

    it('descriptions reference real kernel functions', () => {
      for (const f of frames) {
        // Every description should reference at least one kernel source location
        expect(f.description).toMatch(/\w+\.\w+:\d+/);
      }
    });

    it('last frame phase is complete', () => {
      const lastData = frames[frames.length - 1].data as LsmState;
      expect(lastData.phase).toBe('complete');
    });

    it('has a frame with phase lsm-check', () => {
      const hasLsmCheck = frames.some(f => {
        const data = f.data as LsmState;
        return data.phase === 'lsm-check';
      });
      expect(hasLsmCheck).toBe(true);
    });

    it('references security_file_open in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('security_file_open'));
      expect(hasRef).toBe(true);
    });

    it('references selinux_file_open in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('selinux_file_open'));
      expect(hasRef).toBe(true);
    });

    it('references apparmor_file_open in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('apparmor_file_open'));
      expect(hasRef).toBe(true);
    });
  });

  describe('generateFrames - default scenario', () => {
    it('returns frames for default (no argument)', () => {
      const frames = lsmHooks.generateFrames();
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });
  });

  describe('generateFrames - task-creation-check', () => {
    const frames = lsmHooks.generateFrames('task-creation-check');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('data includes task creation operation', () => {
      const data = frames[0].data as LsmState;
      expect(data.operation).toBe('task creation');
      expect(data.hookName).toBe('security_task_alloc');
    });

    it('has a frame with blob allocated', () => {
      const hasBlobAlloc = frames.some(f => {
        const data = f.data as LsmState;
        return data.blobAllocated === true;
      });
      expect(hasBlobAlloc).toBe(true);
    });

    it('has a frame with phase blob-alloc', () => {
      const hasBlobPhase = frames.some(f => {
        const data = f.data as LsmState;
        return data.phase === 'blob-alloc';
      });
      expect(hasBlobPhase).toBe(true);
    });

    it('AppArmor is skipped (no task_alloc hook)', () => {
      const lastData = frames[frames.length - 1].data as LsmState;
      const apparmor = lastData.lsmModules.find(m => m.name === 'AppArmor');
      expect(apparmor).toBeDefined();
      expect(apparmor!.decision).toBe('skipped');
    });

    it('references copy_process in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('copy_process'));
      expect(hasRef).toBe(true);
    });

    it('references lsm_task_alloc in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('lsm_task_alloc'));
      expect(hasRef).toBe(true);
    });

    it('references lsm_blob_alloc in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('lsm_blob_alloc'));
      expect(hasRef).toBe(true);
    });

    it('every frame data has srcRef', () => {
      for (const f of frames) {
        const data = f.data as LsmState;
        expect(data.srcRef).toBeTruthy();
      }
    });

    it('last frame phase is complete', () => {
      const lastData = frames[frames.length - 1].data as LsmState;
      expect(lastData.phase).toBe('complete');
    });
  });

  describe('generateFrames - lsm-stacking', () => {
    const frames = lsmHooks.generateFrames('lsm-stacking');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('final decision is deny', () => {
      const lastData = frames[frames.length - 1].data as LsmState;
      expect(lastData.finalDecision).toBe('deny');
    });

    it('AppArmor denies in stacking scenario', () => {
      const lastData = frames[frames.length - 1].data as LsmState;
      const apparmor = lastData.lsmModules.find(m => m.name === 'AppArmor');
      expect(apparmor).toBeDefined();
      expect(apparmor!.decision).toBe('deny');
    });

    it('BPF LSM is skipped due to short-circuit', () => {
      const lastData = frames[frames.length - 1].data as LsmState;
      const bpf = lastData.lsmModules.find(m => m.name === 'BPF LSM');
      expect(bpf).toBeDefined();
      expect(bpf!.decision).toBe('skipped');
    });

    it('SELinux allows before AppArmor denies', () => {
      const lastData = frames[frames.length - 1].data as LsmState;
      const selinux = lastData.lsmModules.find(m => m.name === 'SELinux');
      expect(selinux).toBeDefined();
      expect(selinux!.decision).toBe('allow');
    });

    it('references call_int_hook short-circuit in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('short-circuit'));
      expect(hasRef).toBe(true);
    });

    it('references struct security_hook_list in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('security_hook_list'));
      expect(hasRef).toBe(true);
    });

    it('references security_add_hooks in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('security_add_hooks'));
      expect(hasRef).toBe(true);
    });

    it('references EACCES in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('EACCES'));
      expect(hasRef).toBe(true);
    });

    it('every frame data has srcRef', () => {
      for (const f of frames) {
        const data = f.data as LsmState;
        expect(data.srcRef).toBeTruthy();
      }
    });

    it('last frame phase is complete', () => {
      const lastData = frames[frames.length - 1].data as LsmState;
      expect(lastData.phase).toBe('complete');
    });
  });

  describe('renderFrame', () => {
    it('renders SVG elements into container', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = lsmHooks.generateFrames('file-open-check');
      lsmHooks.renderFrame(svg, frames[0], 900, 480);
      expect(svg.querySelectorAll('rect').length).toBeGreaterThan(0);
    });

    it('renders text elements', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = lsmHooks.generateFrames('file-open-check');
      lsmHooks.renderFrame(svg, frames[0], 900, 480);
      expect(svg.querySelectorAll('text').length).toBeGreaterThan(0);
    });

    it('renders different content for different frames', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = lsmHooks.generateFrames('file-open-check');
      lsmHooks.renderFrame(svg, frames[0], 900, 480);
      const html1 = svg.innerHTML;
      lsmHooks.renderFrame(svg, frames[frames.length - 1], 900, 480);
      const html2 = svg.innerHTML;
      expect(html1).not.toBe(html2);
    });

    it('applies anim-lsm class to LSM module elements', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = lsmHooks.generateFrames('file-open-check');
      lsmHooks.renderFrame(svg, frames[3], 900, 480);
      expect(svg.querySelectorAll('.anim-lsm').length).toBeGreaterThan(0);
    });

    it('applies anim-hook class to hook elements', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = lsmHooks.generateFrames('file-open-check');
      lsmHooks.renderFrame(svg, frames[1], 900, 480);
      expect(svg.querySelectorAll('.anim-hook').length).toBeGreaterThan(0);
    });

    it('applies anim-decision class to decision elements', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = lsmHooks.generateFrames('file-open-check');
      lsmHooks.renderFrame(svg, frames[6], 900, 480);
      expect(svg.querySelectorAll('.anim-decision').length).toBeGreaterThan(0);
    });

    it('renders blob allocation indicator for task-creation-check', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = lsmHooks.generateFrames('task-creation-check');
      const blobFrame = frames.find(f => (f.data as LsmState).blobAllocated);
      if (blobFrame) {
        lsmHooks.renderFrame(svg, blobFrame, 900, 480);
        const texts = Array.from(svg.querySelectorAll('text')).map(t => t.textContent);
        expect(texts.some(t => t?.includes('blob'))).toBe(true);
      }
    });

    it('renders source reference text', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = lsmHooks.generateFrames('file-open-check');
      lsmHooks.renderFrame(svg, frames[0], 900, 480);
      const texts = Array.from(svg.querySelectorAll('text')).map(t => t.textContent);
      expect(texts.some(t => t?.includes('Src:'))).toBe(true);
    });

    it('renders title text', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = lsmHooks.generateFrames('file-open-check');
      lsmHooks.renderFrame(svg, frames[0], 900, 480);
      const texts = Array.from(svg.querySelectorAll('text')).map(t => t.textContent);
      expect(texts.some(t => t?.includes('LSM Security Hook Flow'))).toBe(true);
    });

    it('renders for lsm-stacking scenario with deny', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = lsmHooks.generateFrames('lsm-stacking');
      lsmHooks.renderFrame(svg, frames[6], 900, 480);
      const texts = Array.from(svg.querySelectorAll('text')).map(t => t.textContent);
      expect(texts.some(t => t?.includes('DENY'))).toBe(true);
    });
  });
});

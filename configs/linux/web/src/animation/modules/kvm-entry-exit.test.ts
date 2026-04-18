import { describe, it, expect } from 'vitest';
import kvmEntryExit from './kvm-entry-exit.js';
import type { KvmState } from './kvm-entry-exit.js';

describe('KvmEntryExit', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(kvmEntryExit.config.id).toBe('kvm-entry-exit');
      expect(kvmEntryExit.config.skillName).toBe('kvm-fundamentals');
    });

    it('has a display title', () => {
      expect(kvmEntryExit.config.title).toBeTruthy();
    });
  });

  describe('getScenarios', () => {
    const scenarios = kvmEntryExit.getScenarios();

    it('returns exactly 3 scenarios', () => {
      expect(scenarios.length).toBe(3);
    });

    it('includes required scenario IDs', () => {
      const ids = scenarios.map(s => s.id);
      expect(ids).toContain('vm-entry-exit-cycle');
      expect(ids).toContain('io-exit-handling');
      expect(ids).toContain('vcpu-creation');
    });

    it('each scenario has id and label', () => {
      for (const s of scenarios) {
        expect(s.id).toBeTruthy();
        expect(s.label).toBeTruthy();
      }
    });
  });

  describe('generateFrames - vm-entry-exit-cycle (default)', () => {
    const frames = kvmEntryExit.generateFrames('vm-entry-exit-cycle');

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

    it('each frame has typed KvmState data with srcRef', () => {
      for (const f of frames) {
        const data = f.data as KvmState;
        expect(data.currentFunction).toBeTruthy();
        expect(data.srcRef).toBeTruthy();
        expect(data.mode).toBeTruthy();
        expect(data.phase).toBeTruthy();
      }
    });

    it('descriptions reference real kernel functions', () => {
      const kernelFunctions = [
        'kvm_arch_vcpu_ioctl_run',
        'vcpu_enter_guest',
        'vmx_vcpu_run',
        'vmx_handle_exit',
      ];
      for (const fn of kernelFunctions) {
        const found = frames.some(f => f.description.includes(fn));
        expect(found, `Expected description referencing ${fn}`).toBe(true);
      }
    });

    it('descriptions reference real kernel file paths', () => {
      const filePaths = [
        'arch/x86/kvm/x86.c',
        'arch/x86/kvm/vmx/vmx.c',
        'arch/x86/kvm/vmx/vmenter.S',
      ];
      for (const path of filePaths) {
        const found = frames.some(f => f.description.includes(path));
        expect(found, `Expected description referencing ${path}`).toBe(true);
      }
    });

    it('shows VMLAUNCH/VMRESUME in at least one frame', () => {
      const found = frames.some(f =>
        f.description.includes('VMLAUNCH') || f.description.includes('VMRESUME')
      );
      expect(found).toBe(true);
    });

    it('shows an exit reason in at least one frame', () => {
      const found = frames.some(f => {
        const data = f.data as KvmState;
        return data.exitReason !== null;
      });
      expect(found).toBe(true);
    });

    it('transitions through host-kernel to guest and back', () => {
      const modes = frames.map(f => (f.data as KvmState).mode);
      expect(modes).toContain('host-kernel');
      expect(modes).toContain('guest');
    });

    it('default scenario matches vm-entry-exit-cycle', () => {
      const defaultFrames = kvmEntryExit.generateFrames();
      const explicitFrames = kvmEntryExit.generateFrames('vm-entry-exit-cycle');
      expect(defaultFrames.length).toBe(explicitFrames.length);
    });
  });

  describe('generateFrames - io-exit-handling', () => {
    const frames = kvmEntryExit.generateFrames('io-exit-handling');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('each frame has typed KvmState data with srcRef', () => {
      for (const f of frames) {
        const data = f.data as KvmState;
        expect(data.srcRef).toBeTruthy();
        expect(data.currentFunction).toBeTruthy();
      }
    });

    it('references EXIT_REASON_IO_INSTRUCTION', () => {
      const found = frames.some(f =>
        f.description.includes('EXIT_REASON_IO_INSTRUCTION') ||
        (f.data as KvmState).exitReason === 'EXIT_REASON_IO_INSTRUCTION'
      );
      expect(found).toBe(true);
    });

    it('references handle_io', () => {
      const found = frames.some(f => f.description.includes('handle_io'));
      expect(found).toBe(true);
    });

    it('references kvm_emulate_instruction or kvm_fast_pio', () => {
      const found = frames.some(f =>
        f.description.includes('kvm_emulate_instruction') ||
        f.description.includes('kvm_fast_pio')
      );
      expect(found).toBe(true);
    });

    it('returns to userspace for device emulation', () => {
      const found = frames.some(f => {
        const data = f.data as KvmState;
        return data.phase === 'return-userspace' || data.mode === 'host-user';
      });
      expect(found).toBe(true);
    });
  });

  describe('generateFrames - vcpu-creation', () => {
    const frames = kvmEntryExit.generateFrames('vcpu-creation');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('each frame has typed KvmState data with srcRef', () => {
      for (const f of frames) {
        const data = f.data as KvmState;
        expect(data.srcRef).toBeTruthy();
        expect(data.currentFunction).toBeTruthy();
      }
    });

    it('references kvm_dev_ioctl and kvm_create_vm', () => {
      const found_dev_ioctl = frames.some(f => f.description.includes('kvm_dev_ioctl'));
      const found_create_vm = frames.some(f => f.description.includes('kvm_create_vm'));
      expect(found_dev_ioctl).toBe(true);
      expect(found_create_vm).toBe(true);
    });

    it('references kvm_vm_ioctl_create_vcpu', () => {
      const found = frames.some(f => f.description.includes('kvm_vm_ioctl_create_vcpu'));
      expect(found).toBe(true);
    });

    it('references vmx_vcpu_create', () => {
      const found = frames.some(f => f.description.includes('vmx_vcpu_create'));
      expect(found).toBe(true);
    });

    it('references VMCS allocation', () => {
      const found = frames.some(f =>
        f.description.includes('VMCS') || f.description.includes('vmcs')
      );
      expect(found).toBe(true);
    });

    it('references virt/kvm/kvm_main.c', () => {
      const found = frames.some(f => f.description.includes('virt/kvm/kvm_main.c'));
      expect(found).toBe(true);
    });
  });

  describe('renderFrame', () => {
    it('renders SVG elements into container', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = kvmEntryExit.generateFrames('vm-entry-exit-cycle');
      kvmEntryExit.renderFrame(svg, frames[0], 432, 400);
      expect(svg.querySelectorAll('rect').length).toBeGreaterThan(0);
    });

    it('renders text elements with function names', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = kvmEntryExit.generateFrames('vm-entry-exit-cycle');
      kvmEntryExit.renderFrame(svg, frames[0], 432, 400);
      const texts = Array.from(svg.querySelectorAll('text')).map(t => t.textContent);
      expect(texts.some(t => t !== null && t.length > 0)).toBe(true);
    });

    it('renders different content for different frames', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = kvmEntryExit.generateFrames('vm-entry-exit-cycle');
      kvmEntryExit.renderFrame(svg, frames[0], 432, 400);
      const html1 = svg.innerHTML;
      kvmEntryExit.renderFrame(svg, frames[frames.length - 1], 432, 400);
      const html2 = svg.innerHTML;
      expect(html1).not.toBe(html2);
    });

    it('applies highlight class to active elements', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = kvmEntryExit.generateFrames('vm-entry-exit-cycle');
      const frameWithHighlights = frames.find(f => f.highlights.length > 0);
      if (frameWithHighlights) {
        kvmEntryExit.renderFrame(svg, frameWithHighlights, 432, 400);
        expect(svg.querySelectorAll('.anim-highlight').length).toBeGreaterThan(0);
      }
    });

    it('uses semantic CSS classes', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = kvmEntryExit.generateFrames('vm-entry-exit-cycle');
      kvmEntryExit.renderFrame(svg, frames[0], 432, 400);
      expect(svg.querySelectorAll('.anim-phase').length).toBeGreaterThan(0);
      expect(svg.querySelectorAll('.anim-function').length).toBeGreaterThan(0);
    });

    it('renders all scenarios without errors', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      for (const scenario of kvmEntryExit.getScenarios()) {
        const frames = kvmEntryExit.generateFrames(scenario.id);
        for (const frame of frames) {
          expect(() => {
            kvmEntryExit.renderFrame(svg, frame, 432, 400);
          }).not.toThrow();
        }
      }
    });

    it('renders source reference labels', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = kvmEntryExit.generateFrames('vm-entry-exit-cycle');
      kvmEntryExit.renderFrame(svg, frames[0], 432, 400);
      const texts = Array.from(svg.querySelectorAll('.anim-srcref')).map(t => t.textContent);
      expect(texts.some(t => t !== null && t.length > 0)).toBe(true);
    });

    it('renders mode indicator showing host-kernel/guest/host-user', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = kvmEntryExit.generateFrames('vm-entry-exit-cycle');
      kvmEntryExit.renderFrame(svg, frames[0], 432, 400);
      const texts = Array.from(svg.querySelectorAll('text')).map(t => t.textContent);
      expect(texts.some(t => t?.includes('host') || t?.includes('guest'))).toBe(true);
    });
  });
});

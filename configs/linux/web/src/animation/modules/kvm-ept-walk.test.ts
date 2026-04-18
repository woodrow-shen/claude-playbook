import { describe, it, expect } from 'vitest';
import kvmEptWalk from './kvm-ept-walk.js';
import type { EptWalkState } from './kvm-ept-walk.js';

describe('KvmEptWalk', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(kvmEptWalk.config.id).toBe('kvm-ept-walk');
      expect(kvmEptWalk.config.skillName).toBe('kvm-memory-virtualization');
    });

    it('has a display title', () => {
      expect(kvmEptWalk.config.title).toBeTruthy();
    });
  });

  describe('getScenarios', () => {
    const scenarios = kvmEptWalk.getScenarios();

    it('returns exactly 3 scenarios', () => {
      expect(scenarios.length).toBe(3);
    });

    it('includes required scenario IDs', () => {
      const ids = scenarios.map(s => s.id);
      expect(ids).toContain('ept-violation-walk');
      expect(ids).toContain('memory-slot-setup');
      expect(ids).toContain('large-page-mapping');
    });

    it('each scenario has id and label', () => {
      for (const s of scenarios) {
        expect(s.id).toBeTruthy();
        expect(s.label).toBeTruthy();
      }
    });
  });

  describe('generateFrames - ept-violation-walk (default)', () => {
    const frames = kvmEptWalk.generateFrames('ept-violation-walk');

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

    it('each frame has typed EptWalkState data with srcRef', () => {
      for (const f of frames) {
        const data = f.data as EptWalkState;
        expect(data.currentFunction).toBeTruthy();
        expect(data.srcRef).toBeTruthy();
        expect(Array.isArray(data.completedSteps)).toBe(true);
        expect(Array.isArray(data.steps)).toBe(true);
      }
    });

    it('descriptions reference real kernel functions', () => {
      const kernelFunctions = [
        'handle_ept_violation',
        'kvm_mmu_page_fault',
        'kvm_tdp_page_fault',
        'direct_page_fault',
        'kvm_mmu_faultin_pfn',
      ];
      for (const fn of kernelFunctions) {
        const found = frames.some(f => f.description.includes(fn));
        expect(found, `Expected description referencing ${fn}`).toBe(true);
      }
    });

    it('descriptions reference real kernel file paths', () => {
      const filePaths = [
        'arch/x86/kvm/vmx/vmx.c',
        'arch/x86/kvm/mmu/mmu.c',
        'arch/x86/kvm/mmu/tdp_mmu.c',
      ];
      for (const path of filePaths) {
        const found = frames.some(f => f.description.includes(path));
        expect(found, `Expected description referencing ${path}`).toBe(true);
      }
    });

    it('completed steps accumulate over frames', () => {
      const firstData = frames[0].data as EptWalkState;
      const lastData = frames[frames.length - 1].data as EptWalkState;
      expect(lastData.completedSteps.length).toBeGreaterThan(firstData.completedSteps.length);
    });
  });

  describe('generateFrames - memory-slot-setup', () => {
    const frames = kvmEptWalk.generateFrames('memory-slot-setup');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('each frame has typed EptWalkState data with srcRef', () => {
      for (const f of frames) {
        const data = f.data as EptWalkState;
        expect(data.srcRef).toBeTruthy();
        expect(data.currentFunction).toBeTruthy();
      }
    });

    it('covers key memory slot functions', () => {
      const expectedFunctions = [
        'kvm_vm_ioctl_set_memory_region',
        'kvm_set_memory_region',
        'kvm_set_memslot',
        'kvm_prepare_memory_region',
      ];
      for (const fn of expectedFunctions) {
        const found = frames.some(f => {
          const data = f.data as EptWalkState;
          return data.currentFunction === fn || f.description.includes(fn);
        });
        expect(found, `Expected frame referencing ${fn}`).toBe(true);
      }
    });

    it('descriptions reference virt/kvm/kvm_main.c', () => {
      const found = frames.some(f => f.description.includes('virt/kvm/kvm_main.c'));
      expect(found).toBe(true);
    });
  });

  describe('generateFrames - large-page-mapping', () => {
    const frames = kvmEptWalk.generateFrames('large-page-mapping');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('each frame has typed EptWalkState data with srcRef', () => {
      for (const f of frames) {
        const data = f.data as EptWalkState;
        expect(data.srcRef).toBeTruthy();
        expect(data.currentFunction).toBeTruthy();
      }
    });

    it('covers large page and hugepage adjust functions', () => {
      const expectedFunctions = [
        'kvm_mmu_hugepage_adjust',
        'tdp_mmu_map_handle_target_level',
      ];
      for (const fn of expectedFunctions) {
        const found = frames.some(f => {
          const data = f.data as EptWalkState;
          return data.currentFunction === fn || f.description.includes(fn);
        });
        expect(found, `Expected frame referencing ${fn}`).toBe(true);
      }
    });

    it('mentions 2MB or large page', () => {
      const found = frames.some(f =>
        f.description.includes('2MB') || f.description.includes('large page') || f.description.includes('huge page'));
      expect(found).toBe(true);
    });

    it('references TLB or performance benefit', () => {
      const found = frames.some(f =>
        f.description.includes('TLB') || f.description.includes('performance'));
      expect(found).toBe(true);
    });
  });

  describe('generateFrames - default', () => {
    it('returns frames for default scenario', () => {
      const frames = kvmEptWalk.generateFrames();
      expect(frames.length).toBeGreaterThan(0);
    });

    it('default scenario matches ept-violation-walk', () => {
      const defaultFrames = kvmEptWalk.generateFrames();
      const explicitFrames = kvmEptWalk.generateFrames('ept-violation-walk');
      expect(defaultFrames.length).toBe(explicitFrames.length);
    });
  });

  describe('renderFrame', () => {
    it('renders SVG elements into container', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = kvmEptWalk.generateFrames('ept-violation-walk');
      kvmEptWalk.renderFrame(svg, frames[0], 432, 400);
      expect(svg.querySelectorAll('rect').length).toBeGreaterThan(0);
    });

    it('renders text elements with function names', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = kvmEptWalk.generateFrames('ept-violation-walk');
      kvmEptWalk.renderFrame(svg, frames[0], 432, 400);
      const texts = Array.from(svg.querySelectorAll('text')).map(t => t.textContent);
      expect(texts.some(t => t?.includes('handle_ept_violation'))).toBe(true);
    });

    it('renders different content for different frames', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = kvmEptWalk.generateFrames('ept-violation-walk');
      kvmEptWalk.renderFrame(svg, frames[0], 432, 400);
      const html1 = svg.innerHTML;
      kvmEptWalk.renderFrame(svg, frames[frames.length - 1], 432, 400);
      const html2 = svg.innerHTML;
      expect(html1).not.toBe(html2);
    });

    it('applies highlight class to active step', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = kvmEptWalk.generateFrames('ept-violation-walk');
      const frameWithHighlights = frames.find(f => f.highlights.length > 0);
      if (frameWithHighlights) {
        kvmEptWalk.renderFrame(svg, frameWithHighlights, 432, 400);
        expect(svg.querySelectorAll('.anim-highlight').length).toBeGreaterThan(0);
      }
    });

    it('uses semantic CSS classes', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = kvmEptWalk.generateFrames('ept-violation-walk');
      kvmEptWalk.renderFrame(svg, frames[0], 432, 400);
      expect(svg.querySelectorAll('.anim-phase').length).toBeGreaterThan(0);
      expect(svg.querySelectorAll('.anim-function').length).toBeGreaterThan(0);
    });

    it('renders connector lines between steps', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = kvmEptWalk.generateFrames('ept-violation-walk');
      kvmEptWalk.renderFrame(svg, frames[0], 432, 400);
      expect(svg.querySelectorAll('line').length).toBeGreaterThan(0);
    });

    it('renders all scenarios without errors', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      for (const scenario of kvmEptWalk.getScenarios()) {
        const frames = kvmEptWalk.generateFrames(scenario.id);
        for (const frame of frames) {
          expect(() => {
            kvmEptWalk.renderFrame(svg, frame, 432, 400);
          }).not.toThrow();
        }
      }
    });

    it('renders source reference labels', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = kvmEptWalk.generateFrames('ept-violation-walk');
      kvmEptWalk.renderFrame(svg, frames[0], 432, 400);
      const texts = Array.from(svg.querySelectorAll('.anim-srcref')).map(t => t.textContent);
      expect(texts.some(t => t?.includes('vmx.c'))).toBe(true);
    });
  });
});

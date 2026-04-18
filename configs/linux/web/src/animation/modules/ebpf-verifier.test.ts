import { describe, it, expect } from 'vitest';
import ebpfVerifier from './ebpf-verifier.js';
import type { EbpfVerifierState } from './ebpf-verifier.js';

describe('eBPF Verifier Animation', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(ebpfVerifier.config.id).toBe('ebpf-verifier');
      expect(ebpfVerifier.config.skillName).toBe('ebpf-programs');
    });

    it('has a title', () => {
      expect(ebpfVerifier.config.title).toBe('eBPF Verifier and Execution');
    });
  });

  describe('getScenarios', () => {
    it('returns 4 scenarios', () => {
      expect(ebpfVerifier.getScenarios().length).toBe(4);
    });

    it('each scenario has id and label', () => {
      for (const s of ebpfVerifier.getScenarios()) {
        expect(s.id).toBeTruthy();
        expect(s.label).toBeTruthy();
      }
    });

    it('includes verifier-walk, jit-compilation, program-execution, and kf-trusted-args-default', () => {
      const ids = ebpfVerifier.getScenarios().map(s => s.id);
      expect(ids).toContain('verifier-walk');
      expect(ids).toContain('jit-compilation');
      expect(ids).toContain('program-execution');
      expect(ids).toContain('kf-trusted-args-default');
    });

    it('kf-trusted-args-default scenario has v7.0 label', () => {
      const s = ebpfVerifier.getScenarios().find(x => x.id === 'kf-trusted-args-default');
      expect(s).toBeDefined();
      expect(s!.label).toContain('v7.0');
      expect(s!.label).toContain('KF_TRUSTED_ARGS');
    });
  });

  describe('generateFrames - verifier-walk (default)', () => {
    const frames = ebpfVerifier.generateFrames('verifier-walk');

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

    it('every frame data has srcRef', () => {
      for (const f of frames) {
        const data = f.data as EbpfVerifierState;
        expect(data.srcRef).toBeTruthy();
        expect(data.srcRef).toMatch(/\w+\.\w+:\d+/);
      }
    });

    it('descriptions reference real kernel functions', () => {
      for (const f of frames) {
        expect(f.description).toMatch(/\w+\.\w+:\d+/);
      }
    });

    it('references bpf_prog_load in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('bpf_prog_load'));
      expect(hasRef).toBe(true);
    });

    it('references bpf_check in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('bpf_check'));
      expect(hasRef).toBe(true);
    });

    it('references check_cfg in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('check_cfg'));
      expect(hasRef).toBe(true);
    });

    it('references do_check_common in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('do_check_common'));
      expect(hasRef).toBe(true);
    });

    it('references do_check in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('do_check'));
      expect(hasRef).toBe(true);
    });

    it('references check_mem_access in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('check_mem_access'));
      expect(hasRef).toBe(true);
    });

    it('references check_helper_call in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('check_helper_call'));
      expect(hasRef).toBe(true);
    });

    it('references is_state_visited in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('is_state_visited'));
      expect(hasRef).toBe(true);
    });

    it('data includes phase field', () => {
      const data = frames[0].data as EbpfVerifierState;
      expect(data.phase).toBeTruthy();
    });

    it('last frame phase is complete', () => {
      const lastData = frames[frames.length - 1].data as EbpfVerifierState;
      expect(lastData.phase).toBe('complete');
    });

    it('has a frame with phase cfg-check', () => {
      const hasCfg = frames.some(f => {
        const data = f.data as EbpfVerifierState;
        return data.phase === 'cfg-check';
      });
      expect(hasCfg).toBe(true);
    });

    it('has a frame with phase insn-walk', () => {
      const hasWalk = frames.some(f => {
        const data = f.data as EbpfVerifierState;
        return data.phase === 'insn-walk';
      });
      expect(hasWalk).toBe(true);
    });
  });

  describe('generateFrames - default scenario', () => {
    it('returns frames for default (no argument)', () => {
      const frames = ebpfVerifier.generateFrames();
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });
  });

  describe('generateFrames - jit-compilation', () => {
    const frames = ebpfVerifier.generateFrames('jit-compilation');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('every frame data has srcRef', () => {
      for (const f of frames) {
        const data = f.data as EbpfVerifierState;
        expect(data.srcRef).toBeTruthy();
        expect(data.srcRef).toMatch(/\w+\.\w+:\d+/);
      }
    });

    it('references bpf_prog_select_runtime in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('bpf_prog_select_runtime'));
      expect(hasRef).toBe(true);
    });

    it('references bpf_int_jit_compile in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('bpf_int_jit_compile'));
      expect(hasRef).toBe(true);
    });

    it('references bpf_jit_blind_constants in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('bpf_jit_blind_constants'));
      expect(hasRef).toBe(true);
    });

    it('has a frame with phase jit', () => {
      const hasJit = frames.some(f => {
        const data = f.data as EbpfVerifierState;
        return data.phase === 'jit';
      });
      expect(hasJit).toBe(true);
    });

    it('last frame phase is complete', () => {
      const lastData = frames[frames.length - 1].data as EbpfVerifierState;
      expect(lastData.phase).toBe('complete');
    });

    it('descriptions reference real kernel functions', () => {
      for (const f of frames) {
        expect(f.description).toMatch(/\w+\.\w+:\d+/);
      }
    });
  });

  describe('generateFrames - program-execution', () => {
    const frames = ebpfVerifier.generateFrames('program-execution');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('every frame data has srcRef', () => {
      for (const f of frames) {
        const data = f.data as EbpfVerifierState;
        expect(data.srcRef).toBeTruthy();
        expect(data.srcRef).toMatch(/\w+\.\w+:\d+/);
      }
    });

    it('references ___bpf_prog_run in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('___bpf_prog_run'));
      expect(hasRef).toBe(true);
    });

    it('has a frame with phase execution', () => {
      const hasExec = frames.some(f => {
        const data = f.data as EbpfVerifierState;
        return data.phase === 'execution';
      });
      expect(hasExec).toBe(true);
    });

    it('data includes registers field', () => {
      const execFrame = frames.find(f => {
        const data = f.data as EbpfVerifierState;
        return data.phase === 'execution';
      });
      expect(execFrame).toBeDefined();
      const data = execFrame!.data as EbpfVerifierState;
      expect(data.registers).toBeDefined();
    });

    it('last frame phase is complete', () => {
      const lastData = frames[frames.length - 1].data as EbpfVerifierState;
      expect(lastData.phase).toBe('complete');
    });

    it('descriptions reference real kernel functions', () => {
      for (const f of frames) {
        expect(f.description).toMatch(/\w+\.\w+:\d+/);
      }
    });

    it('references jumptable in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('jumptable'));
      expect(hasRef).toBe(true);
    });
  });

  describe('generateFrames - kf-trusted-args-default (v7.0)', () => {
    const frames = ebpfVerifier.generateFrames('kf-trusted-args-default');

    it('generates between 15 and 20 frames (expanded v7.0 scenario)', () => {
      expect(frames.length).toBeGreaterThanOrEqual(15);
      expect(frames.length).toBeLessThanOrEqual(20);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('every frame data has srcRef', () => {
      for (const f of frames) {
        const data = f.data as EbpfVerifierState;
        expect(data.srcRef).toBeTruthy();
        expect(data.srcRef).toMatch(/\w+\.\w+:\d+/);
      }
    });

    it('descriptions reference real kernel functions', () => {
      for (const f of frames) {
        expect(f.description).toMatch(/\w+\.\w+:\d+/);
      }
    });

    it('references check_kfunc_call in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('check_kfunc_call'));
      expect(hasRef).toBe(true);
    });

    it('references check_kfunc_args in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('check_kfunc_args'));
      expect(hasRef).toBe(true);
    });

    it('references is_trusted_reg in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('is_trusted_reg'));
      expect(hasRef).toBe(true);
    });

    it('references PTR_TRUSTED in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('PTR_TRUSTED'));
      expect(hasRef).toBe(true);
    });

    it('references KF_TRUSTED_ARGS in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('KF_TRUSTED_ARGS'));
      expect(hasRef).toBe(true);
    });

    it('distinguishes kfunc from helper somewhere', () => {
      const hasRef = frames.some(f => f.description.includes('kfunc') && f.description.includes('helper'));
      expect(hasRef).toBe(true);
    });

    it('contrasts pre-v7.0 vs v7.0 default behavior', () => {
      const hasContrast = frames.some(f => /pre-v7\.0|before v7\.0|previously/i.test(f.description));
      expect(hasContrast).toBe(true);
    });

    it('mentions bpf_task_release as the example kfunc', () => {
      const hasRef = frames.some(f => f.description.includes('bpf_task_release'));
      expect(hasRef).toBe(true);
    });

    it('has an accept outcome and a reject outcome across frames', () => {
      const hasAccept = frames.some(f => {
        const d = f.data as EbpfVerifierState;
        return d.verifierResult === 'accept';
      });
      const hasReject = frames.some(f => {
        const d = f.data as EbpfVerifierState;
        return d.verifierResult === 'reject';
      });
      expect(hasAccept).toBe(true);
      expect(hasReject).toBe(true);
    });

    it('uses kfuncTrusted flag in some frame', () => {
      const hasTrusted = frames.some(f => {
        const d = f.data as EbpfVerifierState;
        return d.kfuncTrusted === true;
      });
      const hasUntrusted = frames.some(f => {
        const d = f.data as EbpfVerifierState;
        return d.kfuncTrusted === false;
      });
      expect(hasTrusted).toBe(true);
      expect(hasUntrusted).toBe(true);
    });

    it('last frame phase is complete', () => {
      const lastData = frames[frames.length - 1].data as EbpfVerifierState;
      expect(lastData.phase).toBe('complete');
    });

    it('has a frame with helper-check phase (kfunc-arg check lives there)', () => {
      const has = frames.some(f => {
        const data = f.data as EbpfVerifierState;
        return data.phase === 'helper-check';
      });
      expect(has).toBe(true);
    });

    it('each frame has required fields', () => {
      for (const f of frames) {
        expect(f.step).toBeGreaterThanOrEqual(0);
        expect(f.label).toBeTruthy();
        expect(f.description).toBeTruthy();
        expect(Array.isArray(f.highlights)).toBe(true);
      }
    });

    it('models all three BTF annotation paths: default, nullable, ign', () => {
      const annotations = new Set<string>();
      for (const f of frames) {
        const d = f.data as EbpfVerifierState;
        if (d.btfAnnotation) annotations.add(d.btfAnnotation);
      }
      expect(annotations.has('default')).toBe(true);
      expect(annotations.has('nullable')).toBe(true);
      expect(annotations.has('ign')).toBe(true);
    });

    it('has a KF_RCU accept frame with rcuSection=true and verdict=accepted', () => {
      const kfRcuAccept = frames.find(f => {
        const d = f.data as EbpfVerifierState;
        return d.rcuSection === true && d.verdict === 'accepted';
      });
      expect(kfRcuAccept).toBeDefined();
      const combined = `${kfRcuAccept!.label} ${kfRcuAccept!.description}`;
      expect(combined).toMatch(/KF_RCU/);
    });

    it('populates verifierLog on at least 3 frames', () => {
      const withLog = frames.filter(f => {
        const d = f.data as EbpfVerifierState;
        return Array.isArray(d.verifierLog) && d.verifierLog.length > 0;
      });
      expect(withLog.length).toBeGreaterThanOrEqual(3);
    });

    it('has at least one verdict=accepted and one verdict=rejected frame', () => {
      const hasAccepted = frames.some(f => (f.data as EbpfVerifierState).verdict === 'accepted');
      const hasRejected = frames.some(f => (f.data as EbpfVerifierState).verdict === 'rejected');
      expect(hasAccepted).toBe(true);
      expect(hasRejected).toBe(true);
    });

    it('references is_rcu_reg in descriptions (KF_RCU escape hatch)', () => {
      const hasRef = frames.some(f => f.description.includes('is_rcu_reg'));
      expect(hasRef).toBe(true);
    });

    it('references process_kf_arg_ptr_to_btf_id in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('process_kf_arg_ptr_to_btf_id'));
      expect(hasRef).toBe(true);
    });

    it('emits the real verifier diagnostic "must be referenced or trusted"', () => {
      const found = frames.some(f => {
        const d = f.data as EbpfVerifierState;
        return (d.verifierLog ?? []).some(line => /must be referenced or trusted/.test(line));
      });
      expect(found).toBe(true);
    });

    it('emits the real verifier diagnostic "must be a rcu pointer"', () => {
      const found = frames.some(f => {
        const d = f.data as EbpfVerifierState;
        return (d.verifierLog ?? []).some(line => /must be a rcu pointer/.test(line));
      });
      expect(found).toBe(true);
    });
  });

  describe('renderFrame', () => {
    it('renders SVG elements into container', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = ebpfVerifier.generateFrames('verifier-walk');
      ebpfVerifier.renderFrame(svg, frames[0], 900, 480);
      expect(svg.querySelectorAll('rect').length).toBeGreaterThan(0);
    });

    it('renders text elements', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = ebpfVerifier.generateFrames('verifier-walk');
      ebpfVerifier.renderFrame(svg, frames[0], 900, 480);
      expect(svg.querySelectorAll('text').length).toBeGreaterThan(0);
    });

    it('renders different content for different frames', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = ebpfVerifier.generateFrames('verifier-walk');
      ebpfVerifier.renderFrame(svg, frames[0], 900, 480);
      const html1 = svg.innerHTML;
      ebpfVerifier.renderFrame(svg, frames[frames.length - 1], 900, 480);
      const html2 = svg.innerHTML;
      expect(html1).not.toBe(html2);
    });

    it('applies anim-insn class to instruction elements', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = ebpfVerifier.generateFrames('verifier-walk');
      const insnFrame = frames.find(f => (f.data as EbpfVerifierState).phase === 'insn-walk');
      if (insnFrame) {
        ebpfVerifier.renderFrame(svg, insnFrame, 900, 480);
        expect(svg.querySelectorAll('.anim-insn').length).toBeGreaterThan(0);
      }
    });

    it('applies anim-phase class to phase elements', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = ebpfVerifier.generateFrames('verifier-walk');
      ebpfVerifier.renderFrame(svg, frames[1], 900, 480);
      expect(svg.querySelectorAll('.anim-phase').length).toBeGreaterThan(0);
    });

    it('renders source reference text', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = ebpfVerifier.generateFrames('verifier-walk');
      ebpfVerifier.renderFrame(svg, frames[0], 900, 480);
      const texts = Array.from(svg.querySelectorAll('text')).map(t => t.textContent);
      expect(texts.some(t => t?.includes('Src:'))).toBe(true);
    });

    it('renders title text', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = ebpfVerifier.generateFrames('verifier-walk');
      ebpfVerifier.renderFrame(svg, frames[0], 900, 480);
      const texts = Array.from(svg.querySelectorAll('text')).map(t => t.textContent);
      expect(texts.some(t => t?.includes('eBPF Verifier'))).toBe(true);
    });

    it('renders register display for program-execution scenario', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = ebpfVerifier.generateFrames('program-execution');
      const execFrame = frames.find(f => (f.data as EbpfVerifierState).phase === 'execution');
      if (execFrame) {
        ebpfVerifier.renderFrame(svg, execFrame, 900, 480);
        const texts = Array.from(svg.querySelectorAll('text')).map(t => t.textContent);
        expect(texts.some(t => t?.includes('r0'))).toBe(true);
      }
    });

    it('renders for jit-compilation scenario', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = ebpfVerifier.generateFrames('jit-compilation');
      ebpfVerifier.renderFrame(svg, frames[3], 900, 480);
      expect(svg.querySelectorAll('rect').length).toBeGreaterThan(0);
    });

    it('renders for kf-trusted-args-default scenario', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = ebpfVerifier.generateFrames('kf-trusted-args-default');
      for (const f of frames) {
        ebpfVerifier.renderFrame(svg, f, 900, 480);
        expect(svg.querySelectorAll('text').length).toBeGreaterThan(0);
      }
    });
  });
});

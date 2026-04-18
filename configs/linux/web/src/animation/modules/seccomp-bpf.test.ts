import { describe, it, expect } from 'vitest';
import seccompBpf from './seccomp-bpf.js';
import type { SeccompState } from './seccomp-bpf.js';

describe('Seccomp-BPF Syscall Filtering', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(seccompBpf.config.id).toBe('seccomp-bpf');
      expect(seccompBpf.config.skillName).toBe('seccomp-filters');
    });

    it('has a title', () => {
      expect(seccompBpf.config.title).toBe('Seccomp-BPF Syscall Filtering');
    });
  });

  describe('getScenarios', () => {
    it('returns 3 scenarios', () => {
      expect(seccompBpf.getScenarios().length).toBe(3);
    });

    it('each scenario has id and label', () => {
      for (const s of seccompBpf.getScenarios()) {
        expect(s.id).toBeTruthy();
        expect(s.label).toBeTruthy();
      }
    });

    it('includes filter-installation, syscall-filtering, and filter-inheritance', () => {
      const ids = seccompBpf.getScenarios().map(s => s.id);
      expect(ids).toContain('filter-installation');
      expect(ids).toContain('syscall-filtering');
      expect(ids).toContain('filter-inheritance');
    });
  });

  describe('generateFrames - filter-installation (default)', () => {
    const frames = seccompBpf.generateFrames('filter-installation');

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
        const data = f.data as SeccompState;
        expect(data.srcRef).toBeTruthy();
        expect(data.srcRef).toMatch(/\w+\.\w+:\d+/);
      }
    });

    it('descriptions reference real kernel functions', () => {
      for (const f of frames) {
        expect(f.description).toMatch(/\w+\.\w+:\d+/);
      }
    });

    it('references do_seccomp in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('do_seccomp'));
      expect(hasRef).toBe(true);
    });

    it('references seccomp_set_mode_filter in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('seccomp_set_mode_filter'));
      expect(hasRef).toBe(true);
    });

    it('references seccomp_prepare_filter in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('seccomp_prepare_filter'));
      expect(hasRef).toBe(true);
    });

    it('references seccomp_check_filter in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('seccomp_check_filter'));
      expect(hasRef).toBe(true);
    });

    it('references seccomp_attach_filter in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('seccomp_attach_filter'));
      expect(hasRef).toBe(true);
    });

    it('last frame phase is complete', () => {
      const lastData = frames[frames.length - 1].data as SeccompState;
      expect(lastData.phase).toBe('complete');
    });

    it('filter chain is populated by the end', () => {
      const lastData = frames[frames.length - 1].data as SeccompState;
      expect(lastData.filterChain.length).toBeGreaterThan(0);
    });
  });

  describe('generateFrames - default scenario', () => {
    it('returns frames for default (no argument)', () => {
      const frames = seccompBpf.generateFrames();
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });
  });

  describe('generateFrames - syscall-filtering', () => {
    const frames = seccompBpf.generateFrames('syscall-filtering');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('references __secure_computing in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('__secure_computing'));
      expect(hasRef).toBe(true);
    });

    it('references __seccomp_filter in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('__seccomp_filter'));
      expect(hasRef).toBe(true);
    });

    it('references seccomp_run_filters in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('seccomp_run_filters'));
      expect(hasRef).toBe(true);
    });

    it('references populate_seccomp_data in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('populate_seccomp_data'));
      expect(hasRef).toBe(true);
    });

    it('references SECCOMP_RET_ERRNO in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('SECCOMP_RET_ERRNO'));
      expect(hasRef).toBe(true);
    });

    it('references SECCOMP_RET_ALLOW in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('SECCOMP_RET_ALLOW'));
      expect(hasRef).toBe(true);
    });

    it('references SECCOMP_RET_KILL_PROCESS in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('SECCOMP_RET_KILL_PROCESS'));
      expect(hasRef).toBe(true);
    });

    it('seccomp_data is populated during evaluation', () => {
      const hasData = frames.some(f => {
        const data = f.data as SeccompState;
        return data.seccompData !== null;
      });
      expect(hasData).toBe(true);
    });

    it('final action is SECCOMP_RET_ERRNO', () => {
      const lastData = frames[frames.length - 1].data as SeccompState;
      expect(lastData.finalAction).toBe('SECCOMP_RET_ERRNO');
    });

    it('every frame data has srcRef', () => {
      for (const f of frames) {
        const data = f.data as SeccompState;
        expect(data.srcRef).toBeTruthy();
        expect(data.srcRef).toMatch(/\w+\.\w+:\d+/);
      }
    });

    it('last frame phase is complete', () => {
      const lastData = frames[frames.length - 1].data as SeccompState;
      expect(lastData.phase).toBe('complete');
    });
  });

  describe('generateFrames - filter-inheritance', () => {
    const frames = seccompBpf.generateFrames('filter-inheritance');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('references copy_seccomp in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('copy_seccomp'));
      expect(hasRef).toBe(true);
    });

    it('references get_seccomp_filter in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('get_seccomp_filter'));
      expect(hasRef).toBe(true);
    });

    it('references copy_process in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('copy_process'));
      expect(hasRef).toBe(true);
    });

    it('references seccomp_sync_threads in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('seccomp_sync_threads'));
      expect(hasRef).toBe(true);
    });

    it('references SECCOMP_FILTER_FLAG_TSYNC in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('SECCOMP_FILTER_FLAG_TSYNC'));
      expect(hasRef).toBe(true);
    });

    it('references no_new_privs in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('no_new_privs'));
      expect(hasRef).toBe(true);
    });

    it('refcount increases during inheritance', () => {
      const refcounts = frames.map(f => (f.data as SeccompState).refcount);
      expect(refcounts.some(r => r >= 2)).toBe(true);
    });

    it('thread count increases with TSYNC', () => {
      const threadCounts = frames.map(f => (f.data as SeccompState).threadCount);
      expect(threadCounts.some(t => t >= 2)).toBe(true);
    });

    it('has a fork phase', () => {
      const hasForkPhase = frames.some(f => {
        const data = f.data as SeccompState;
        return data.phase === 'fork';
      });
      expect(hasForkPhase).toBe(true);
    });

    it('has a tsync phase', () => {
      const hasTsyncPhase = frames.some(f => {
        const data = f.data as SeccompState;
        return data.phase === 'tsync';
      });
      expect(hasTsyncPhase).toBe(true);
    });

    it('every frame data has srcRef', () => {
      for (const f of frames) {
        const data = f.data as SeccompState;
        expect(data.srcRef).toBeTruthy();
        expect(data.srcRef).toMatch(/\w+\.\w+:\d+/);
      }
    });

    it('last frame phase is complete', () => {
      const lastData = frames[frames.length - 1].data as SeccompState;
      expect(lastData.phase).toBe('complete');
    });
  });

  describe('renderFrame', () => {
    it('renders SVG elements into container', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = seccompBpf.generateFrames('filter-installation');
      seccompBpf.renderFrame(svg, frames[0], 900, 480);
      expect(svg.querySelectorAll('rect').length).toBeGreaterThan(0);
    });

    it('renders text elements', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = seccompBpf.generateFrames('filter-installation');
      seccompBpf.renderFrame(svg, frames[0], 900, 480);
      expect(svg.querySelectorAll('text').length).toBeGreaterThan(0);
    });

    it('renders different content for different frames', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = seccompBpf.generateFrames('filter-installation');
      seccompBpf.renderFrame(svg, frames[0], 900, 480);
      const html1 = svg.innerHTML;
      seccompBpf.renderFrame(svg, frames[frames.length - 1], 900, 480);
      const html2 = svg.innerHTML;
      expect(html1).not.toBe(html2);
    });

    it('renders filter chain elements for syscall-filtering', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = seccompBpf.generateFrames('syscall-filtering');
      seccompBpf.renderFrame(svg, frames[4], 900, 480);
      const texts = Array.from(svg.querySelectorAll('text')).map(t => t.textContent);
      expect(texts.some(t => t?.includes('Filter'))).toBe(true);
    });

    it('renders seccomp_data panel when populated', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = seccompBpf.generateFrames('syscall-filtering');
      const dataFrame = frames.find(f => (f.data as SeccompState).seccompData !== null);
      if (dataFrame) {
        seccompBpf.renderFrame(svg, dataFrame, 900, 480);
        const texts = Array.from(svg.querySelectorAll('text')).map(t => t.textContent);
        expect(texts.some(t => t?.includes('seccomp_data'))).toBe(true);
      }
    });

    it('renders source reference text', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = seccompBpf.generateFrames('filter-installation');
      seccompBpf.renderFrame(svg, frames[0], 900, 480);
      const texts = Array.from(svg.querySelectorAll('text')).map(t => t.textContent);
      expect(texts.some(t => t?.includes('Src:'))).toBe(true);
    });

    it('renders title text', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = seccompBpf.generateFrames('filter-installation');
      seccompBpf.renderFrame(svg, frames[0], 900, 480);
      const texts = Array.from(svg.querySelectorAll('text')).map(t => t.textContent);
      expect(texts.some(t => t?.includes('Seccomp-BPF Syscall Filtering'))).toBe(true);
    });

    it('renders for filter-inheritance scenario', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = seccompBpf.generateFrames('filter-inheritance');
      seccompBpf.renderFrame(svg, frames[1], 900, 480);
      expect(svg.querySelectorAll('rect').length).toBeGreaterThan(0);
    });

    it('renders verdict text for evaluated filters', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = seccompBpf.generateFrames('syscall-filtering');
      seccompBpf.renderFrame(svg, frames[5], 900, 480);
      const texts = Array.from(svg.querySelectorAll('text')).map(t => t.textContent);
      expect(texts.some(t => t?.includes('SECCOMP_RET_ERRNO'))).toBe(true);
    });
  });
});

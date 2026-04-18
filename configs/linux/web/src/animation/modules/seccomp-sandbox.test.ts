import { describe, it, expect } from 'vitest';
import seccompSandbox from './seccomp-sandbox.js';
import type { SeccompSandboxState } from './seccomp-sandbox.js';

describe('Seccomp Sandbox', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(seccompSandbox.config.id).toBe('seccomp-sandbox');
      expect(seccompSandbox.config.skillName).toBe('seccomp-and-sandboxing');
      expect(seccompSandbox.config.title).toBe('Complete Sandbox with Seccomp + Namespaces + Cgroups');
    });
  });

  describe('getScenarios', () => {
    it('returns 3 scenarios', () => {
      const scenarios = seccompSandbox.getScenarios();
      expect(scenarios.length).toBe(3);
      expect(scenarios.map(s => s.id)).toContain('sandbox-setup');
      expect(scenarios.map(s => s.id)).toContain('syscall-filtering');
      expect(scenarios.map(s => s.id)).toContain('sandbox-escape-prevention');
    });
  });

  describe('generateFrames - sandbox-setup (default)', () => {
    const frames = seccompSandbox.generateFrames('sandbox-setup');

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

    it('starts in setup phase', () => {
      const data = frames[0].data as SeccompSandboxState;
      expect(data.phase).toBe('setup');
    });

    it('includes unshare phase', () => {
      const hasUnshare = frames.some(f => {
        const data = f.data as SeccompSandboxState;
        return data.phase === 'unshare';
      });
      expect(hasUnshare).toBe(true);
    });

    it('includes seccomp-install phase', () => {
      const hasSeccomp = frames.some(f => {
        const data = f.data as SeccompSandboxState;
        return data.phase === 'seccomp-install';
      });
      expect(hasSeccomp).toBe(true);
    });

    it('includes sandbox-active phase', () => {
      const hasActive = frames.some(f => {
        const data = f.data as SeccompSandboxState;
        return data.phase === 'sandbox-active';
      });
      expect(hasActive).toBe(true);
    });

    it('data includes sandboxLayers array', () => {
      const data = frames[0].data as SeccompSandboxState;
      expect(Array.isArray(data.sandboxLayers)).toBe(true);
    });

    it('sandboxLayers grows as sandbox is built', () => {
      const firstData = frames[0].data as SeccompSandboxState;
      const lastData = frames[frames.length - 1].data as SeccompSandboxState;
      expect(lastData.sandboxLayers.length).toBeGreaterThan(firstData.sandboxLayers.length);
    });

    it('data includes seccompFilters', () => {
      const lastData = frames[frames.length - 1].data as SeccompSandboxState;
      expect(lastData.seccompFilters.length).toBeGreaterThan(0);
    });

    it('data includes namespaceSet', () => {
      const lastData = frames[frames.length - 1].data as SeccompSandboxState;
      expect(lastData.namespaceSet.length).toBeGreaterThan(0);
    });

    it('data includes cgroupLimits', () => {
      const lastData = frames[frames.length - 1].data as SeccompSandboxState;
      expect(lastData.cgroupLimits.length).toBeGreaterThan(0);
    });

    it('data includes blockedSyscalls', () => {
      const lastData = frames[frames.length - 1].data as SeccompSandboxState;
      expect(lastData.blockedSyscalls.length).toBeGreaterThan(0);
    });

    it('data includes srcRef on all frames', () => {
      frames.forEach(f => {
        const data = f.data as SeccompSandboxState;
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });

    it('references unshare in description', () => {
      const hasRef = frames.some(f => f.description.includes('unshare'));
      expect(hasRef).toBe(true);
    });

    it('references create_new_namespaces in description', () => {
      const hasRef = frames.some(f => f.description.includes('create_new_namespaces'));
      expect(hasRef).toBe(true);
    });

    it('references seccomp_set_mode_filter in description', () => {
      const hasRef = frames.some(f => f.description.includes('seccomp_set_mode_filter'));
      expect(hasRef).toBe(true);
    });

    it('references PR_SET_NO_NEW_PRIVS in description', () => {
      const hasRef = frames.some(f => f.description.includes('PR_SET_NO_NEW_PRIVS'));
      expect(hasRef).toBe(true);
    });
  });

  describe('generateFrames - default scenario', () => {
    it('returns frames when called without argument', () => {
      const frames = seccompSandbox.generateFrames();
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });
  });

  describe('generateFrames - syscall-filtering', () => {
    const frames = seccompSandbox.generateFrames('syscall-filtering');

    it('generates 8-12 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
      expect(frames.length).toBeLessThanOrEqual(12);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('includes filter-eval phase', () => {
      const hasFilterEval = frames.some(f => {
        const data = f.data as SeccompSandboxState;
        return data.phase === 'filter-eval';
      });
      expect(hasFilterEval).toBe(true);
    });

    it('references __seccomp_filter in description', () => {
      const hasRef = frames.some(f => f.description.includes('__seccomp_filter'));
      expect(hasRef).toBe(true);
    });

    it('references seccomp_run_filters in description', () => {
      const hasRef = frames.some(f => f.description.includes('seccomp_run_filters'));
      expect(hasRef).toBe(true);
    });

    it('mentions SECCOMP_RET_ALLOW in description', () => {
      const hasRef = frames.some(f => f.description.includes('SECCOMP_RET_ALLOW'));
      expect(hasRef).toBe(true);
    });

    it('mentions SECCOMP_RET_KILL in description', () => {
      const hasRef = frames.some(f =>
        f.description.includes('SECCOMP_RET_KILL_PROCESS') ||
        f.description.includes('SECCOMP_RET_KILL_THREAD')
      );
      expect(hasRef).toBe(true);
    });

    it('mentions SECCOMP_RET_ERRNO in description', () => {
      const hasRef = frames.some(f => f.description.includes('SECCOMP_RET_ERRNO'));
      expect(hasRef).toBe(true);
    });

    it('has srcRef on all frames', () => {
      frames.forEach(f => {
        const data = f.data as SeccompSandboxState;
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });
  });

  describe('generateFrames - sandbox-escape-prevention', () => {
    const frames = seccompSandbox.generateFrames('sandbox-escape-prevention');

    it('generates 8-12 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
      expect(frames.length).toBeLessThanOrEqual(12);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('includes defense phase', () => {
      const hasDefense = frames.some(f => {
        const data = f.data as SeccompSandboxState;
        return data.phase === 'defense';
      });
      expect(hasDefense).toBe(true);
    });

    it('references capable() in description', () => {
      const hasRef = frames.some(f => f.description.includes('capable'));
      expect(hasRef).toBe(true);
    });

    it('mentions CAP_SYS_ADMIN in description', () => {
      const hasRef = frames.some(f => f.description.includes('CAP_SYS_ADMIN'));
      expect(hasRef).toBe(true);
    });

    it('mentions mount or ptrace blocking', () => {
      const hasRef = frames.some(f =>
        f.description.includes('mount') || f.description.includes('ptrace')
      );
      expect(hasRef).toBe(true);
    });

    it('mentions user namespace in description', () => {
      const hasRef = frames.some(f => f.description.includes('user namespace'));
      expect(hasRef).toBe(true);
    });

    it('has srcRef on all frames', () => {
      frames.forEach(f => {
        const data = f.data as SeccompSandboxState;
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });

    it('blockedSyscalls grows during escape prevention', () => {
      const firstData = frames[0].data as SeccompSandboxState;
      const lastData = frames[frames.length - 1].data as SeccompSandboxState;
      expect(lastData.blockedSyscalls.length).toBeGreaterThan(firstData.blockedSyscalls.length);
    });
  });

  describe('renderFrame', () => {
    it('renders title text', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = seccompSandbox.generateFrames('sandbox-setup');
      seccompSandbox.renderFrame(svg, frames[0], 900, 480);
      const title = svg.querySelector('.anim-title');
      expect(title).not.toBeNull();
    });

    it('renders sandbox layer blocks', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = seccompSandbox.generateFrames('sandbox-setup');
      seccompSandbox.renderFrame(svg, frames[frames.length - 1], 900, 480);
      const blocks = svg.querySelectorAll('.anim-block');
      expect(blocks.length).toBeGreaterThan(0);
    });

    it('renders phase indicator', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = seccompSandbox.generateFrames('sandbox-setup');
      seccompSandbox.renderFrame(svg, frames[0], 900, 480);
      const mode = svg.querySelectorAll('.anim-mode');
      expect(mode.length).toBeGreaterThan(0);
    });

    it('renders layer items', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = seccompSandbox.generateFrames('sandbox-setup');
      seccompSandbox.renderFrame(svg, frames[frames.length - 1], 900, 480);
      const items = svg.querySelectorAll('.anim-stack-frame');
      expect(items.length).toBeGreaterThan(0);
    });

    it('clears previous content on re-render', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = seccompSandbox.generateFrames('sandbox-setup');
      seccompSandbox.renderFrame(svg, frames[0], 900, 480);
      const countBefore = svg.childElementCount;
      seccompSandbox.renderFrame(svg, frames[1], 900, 480);
      expect(svg.childElementCount).toBeLessThanOrEqual(countBefore + 10);
    });

    it('renders highlight on active defense', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = seccompSandbox.generateFrames('sandbox-escape-prevention');
      const defenseFrame = frames.find(f => {
        const data = f.data as SeccompSandboxState;
        return data.phase === 'defense';
      });
      if (defenseFrame) {
        seccompSandbox.renderFrame(svg, defenseFrame, 900, 480);
        const highlights = svg.querySelectorAll('.anim-highlight');
        expect(highlights.length).toBeGreaterThan(0);
      }
    });
  });
});

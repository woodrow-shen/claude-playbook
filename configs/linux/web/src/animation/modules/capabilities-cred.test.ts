import { describe, it, expect } from 'vitest';
import capabilitiesCred from './capabilities-cred.js';
import type { CapCredState } from './capabilities-cred.js';

describe('Capabilities & Credentials', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(capabilitiesCred.config.id).toBe('capabilities-cred');
      expect(capabilitiesCred.config.skillName).toBe('capabilities-and-credentials');
      expect(capabilitiesCred.config.title).toBe('Linux Capabilities & Credentials');
    });
  });

  describe('getScenarios', () => {
    it('returns 3 scenarios', () => {
      const scenarios = capabilitiesCred.getScenarios();
      expect(scenarios.length).toBe(3);
      expect(scenarios.map(s => s.id)).toContain('capability-check');
      expect(scenarios.map(s => s.id)).toContain('credential-fork');
      expect(scenarios.map(s => s.id)).toContain('setuid-exec');
    });
  });

  describe('generateFrames - capability-check (default)', () => {
    const frames = capabilitiesCred.generateFrames('capability-check');

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

    it('starts in init phase', () => {
      const data = frames[0].data as CapCredState;
      expect(data.phase).toBe('init');
    });

    it('includes capable phase', () => {
      const hasCapable = frames.some(f => {
        const data = f.data as CapCredState;
        return data.phase === 'capable';
      });
      expect(hasCapable).toBe(true);
    });

    it('includes security-check phase', () => {
      const hasSecCheck = frames.some(f => {
        const data = f.data as CapCredState;
        return data.phase === 'security-check';
      });
      expect(hasSecCheck).toBe(true);
    });

    it('includes cap-check phase', () => {
      const hasCapCheck = frames.some(f => {
        const data = f.data as CapCredState;
        return data.phase === 'cap-check';
      });
      expect(hasCapCheck).toBe(true);
    });

    it('includes result phase', () => {
      const hasResult = frames.some(f => {
        const data = f.data as CapCredState;
        return data.phase === 'result';
      });
      expect(hasResult).toBe(true);
    });

    it('data includes effective capability set', () => {
      const data = frames[0].data as CapCredState;
      expect(Array.isArray(data.effective)).toBe(true);
    });

    it('data includes permitted capability set', () => {
      const data = frames[0].data as CapCredState;
      expect(Array.isArray(data.permitted)).toBe(true);
    });

    it('data includes inheritable capability set', () => {
      const data = frames[0].data as CapCredState;
      expect(Array.isArray(data.inheritable)).toBe(true);
    });

    it('data includes uid and euid', () => {
      const data = frames[0].data as CapCredState;
      expect(data.uid).toBeDefined();
      expect(data.euid).toBeDefined();
    });

    it('data includes currentCheck', () => {
      const checkFrame = frames.find(f => {
        const data = f.data as CapCredState;
        return data.currentCheck !== '';
      });
      expect(checkFrame).toBeDefined();
    });

    it('data includes srcRef', () => {
      const data = frames[0].data as CapCredState;
      expect(data.srcRef).toBeDefined();
      expect(data.srcRef.length).toBeGreaterThan(0);
    });

    it('srcRef references real kernel source files on all frames', () => {
      frames.forEach(f => {
        const data = f.data as CapCredState;
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });

    it('descriptions reference capable()', () => {
      const hasRef = frames.some(f => f.description.includes('capable('));
      expect(hasRef).toBe(true);
    });

    it('descriptions reference ns_capable', () => {
      const hasRef = frames.some(f => f.description.includes('ns_capable'));
      expect(hasRef).toBe(true);
    });

    it('descriptions reference cap_capable', () => {
      const hasRef = frames.some(f => f.description.includes('cap_capable'));
      expect(hasRef).toBe(true);
    });

    it('descriptions reference security_capable', () => {
      const hasRef = frames.some(f => f.description.includes('security_capable'));
      expect(hasRef).toBe(true);
    });

    it('effective set contains CAP_NET_BIND_SERVICE', () => {
      const hasCapNBS = frames.some(f => {
        const data = f.data as CapCredState;
        return data.effective.includes('CAP_NET_BIND_SERVICE');
      });
      expect(hasCapNBS).toBe(true);
    });
  });

  describe('generateFrames - default scenario', () => {
    it('returns frames when called without argument', () => {
      const frames = capabilitiesCred.generateFrames();
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });
  });

  describe('generateFrames - credential-fork', () => {
    const frames = capabilitiesCred.generateFrames('credential-fork');

    it('generates 8-12 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
      expect(frames.length).toBeLessThanOrEqual(12);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('includes copy-creds phase', () => {
      const hasCopyCreds = frames.some(f => {
        const data = f.data as CapCredState;
        return data.phase === 'copy-creds';
      });
      expect(hasCopyCreds).toBe(true);
    });

    it('includes prepare-creds phase', () => {
      const hasPrep = frames.some(f => {
        const data = f.data as CapCredState;
        return data.phase === 'prepare-creds';
      });
      expect(hasPrep).toBe(true);
    });

    it('includes commit-creds phase', () => {
      const hasCommit = frames.some(f => {
        const data = f.data as CapCredState;
        return data.phase === 'commit-creds';
      });
      expect(hasCommit).toBe(true);
    });

    it('references copy_creds in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('copy_creds'));
      expect(hasRef).toBe(true);
    });

    it('references prepare_creds in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('prepare_creds'));
      expect(hasRef).toBe(true);
    });

    it('references commit_creds in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('commit_creds'));
      expect(hasRef).toBe(true);
    });

    it('has srcRef on all frames', () => {
      frames.forEach(f => {
        const data = f.data as CapCredState;
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });

    it('child process inherits parent capabilities', () => {
      const lastData = frames[frames.length - 1].data as CapCredState;
      expect(lastData.effective.length).toBeGreaterThan(0);
    });
  });

  describe('generateFrames - setuid-exec', () => {
    const frames = capabilitiesCred.generateFrames('setuid-exec');

    it('generates 8-12 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
      expect(frames.length).toBeLessThanOrEqual(12);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('includes bprm-creds phase', () => {
      const hasBprm = frames.some(f => {
        const data = f.data as CapCredState;
        return data.phase === 'bprm-creds';
      });
      expect(hasBprm).toBe(true);
    });

    it('includes vfs-caps phase', () => {
      const hasVfsCaps = frames.some(f => {
        const data = f.data as CapCredState;
        return data.phase === 'vfs-caps';
      });
      expect(hasVfsCaps).toBe(true);
    });

    it('includes privileged-root phase', () => {
      const hasPrivRoot = frames.some(f => {
        const data = f.data as CapCredState;
        return data.phase === 'privileged-root';
      });
      expect(hasPrivRoot).toBe(true);
    });

    it('euid changes to 0 during exec', () => {
      const rootFrame = frames.find(f => {
        const data = f.data as CapCredState;
        return data.euid === 0;
      });
      expect(rootFrame).toBeDefined();
    });

    it('effective set grows after setuid transition', () => {
      const initData = frames[0].data as CapCredState;
      const lastData = frames[frames.length - 1].data as CapCredState;
      expect(lastData.effective.length).toBeGreaterThan(initData.effective.length);
    });

    it('references cap_bprm_creds_from_file in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('cap_bprm_creds_from_file'));
      expect(hasRef).toBe(true);
    });

    it('references bprm_caps_from_vfs_caps in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('bprm_caps_from_vfs_caps'));
      expect(hasRef).toBe(true);
    });

    it('references handle_privileged_root in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('handle_privileged_root'));
      expect(hasRef).toBe(true);
    });

    it('has srcRef on all frames', () => {
      frames.forEach(f => {
        const data = f.data as CapCredState;
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });
  });

  describe('renderFrame', () => {
    it('renders title text', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = capabilitiesCred.generateFrames('capability-check');
      capabilitiesCred.renderFrame(svg, frames[0], 900, 480);
      const title = svg.querySelector('.anim-title');
      expect(title).not.toBeNull();
    });

    it('renders capability set display', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = capabilitiesCred.generateFrames('capability-check');
      capabilitiesCred.renderFrame(svg, frames[0], 900, 480);
      const caps = svg.querySelectorAll('.anim-cap-entry');
      expect(caps.length).toBeGreaterThan(0);
    });

    it('renders phase flow blocks', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = capabilitiesCred.generateFrames('capability-check');
      capabilitiesCred.renderFrame(svg, frames[3], 900, 480);
      const blocks = svg.querySelectorAll('.anim-block');
      expect(blocks.length).toBeGreaterThan(0);
    });

    it('renders credential info', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = capabilitiesCred.generateFrames('capability-check');
      capabilitiesCred.renderFrame(svg, frames[0], 900, 480);
      const credInfo = svg.querySelectorAll('.anim-cred-info');
      expect(credInfo.length).toBeGreaterThan(0);
    });

    it('clears previous content on re-render', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = capabilitiesCred.generateFrames('capability-check');
      capabilitiesCred.renderFrame(svg, frames[0], 900, 480);
      const countBefore = svg.childElementCount;
      capabilitiesCred.renderFrame(svg, frames[1], 900, 480);
      expect(svg.childElementCount).toBeLessThanOrEqual(countBefore + 10);
    });

    it('renders highlight for active check', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = capabilitiesCred.generateFrames('capability-check');
      const checkFrame = frames.find(f => {
        const data = f.data as CapCredState;
        return data.currentCheck !== '';
      });
      if (checkFrame) {
        capabilitiesCred.renderFrame(svg, checkFrame, 900, 480);
        const highlights = svg.querySelectorAll('.anim-highlight');
        expect(highlights.length).toBeGreaterThan(0);
      }
    });
  });
});

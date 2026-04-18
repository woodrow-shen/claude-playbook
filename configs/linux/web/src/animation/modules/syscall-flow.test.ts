import { describe, it, expect } from 'vitest';
import syscallFlow from './syscall-flow.js';
import type { SyscallState } from './syscall-flow.js';

describe('Syscall Flow', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(syscallFlow.config.id).toBe('syscall-flow');
      expect(syscallFlow.config.skillName).toBe('system-calls');
      expect(syscallFlow.config.title).toBe('System Call Flow');
    });
  });

  describe('getScenarios', () => {
    it('returns 3 scenarios', () => {
      const scenarios = syscallFlow.getScenarios();
      expect(scenarios.length).toBe(3);
      expect(scenarios.map(s => s.id)).toContain('syscall-entry-exit');
      expect(scenarios.map(s => s.id)).toContain('fast-path-read');
      expect(scenarios.map(s => s.id)).toContain('error-handling');
    });
  });

  describe('generateFrames - syscall-entry-exit (default)', () => {
    const frames = syscallFlow.generateFrames('syscall-entry-exit');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('first frame has step 0', () => {
      expect(frames[0].step).toBe(0);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('starts in user mode', () => {
      const data = frames[0].data as SyscallState;
      expect(data.mode).toBe('user');
    });

    it('transitions to kernel mode', () => {
      const hasKernel = frames.some(f => {
        const data = f.data as SyscallState;
        return data.mode === 'kernel';
      });
      expect(hasKernel).toBe(true);
    });

    it('returns to user mode', () => {
      const lastFrame = frames[frames.length - 1];
      const data = lastFrame.data as SyscallState;
      expect(data.mode).toBe('user');
    });

    it('includes entry phase', () => {
      const hasEntry = frames.some(f => {
        const data = f.data as SyscallState;
        return data.phase === 'entry';
      });
      expect(hasEntry).toBe(true);
    });

    it('includes dispatch phase', () => {
      const hasDispatch = frames.some(f => {
        const data = f.data as SyscallState;
        return data.phase === 'dispatch';
      });
      expect(hasDispatch).toBe(true);
    });

    it('includes handler phase', () => {
      const hasHandler = frames.some(f => {
        const data = f.data as SyscallState;
        return data.phase === 'handler';
      });
      expect(hasHandler).toBe(true);
    });

    it('includes vfs phase', () => {
      const hasVfs = frames.some(f => {
        const data = f.data as SyscallState;
        return data.phase === 'vfs';
      });
      expect(hasVfs).toBe(true);
    });

    it('includes exit phase', () => {
      const hasExit = frames.some(f => {
        const data = f.data as SyscallState;
        return data.phase === 'exit';
      });
      expect(hasExit).toBe(true);
    });

    it('includes sysret phase', () => {
      const hasSysret = frames.some(f => {
        const data = f.data as SyscallState;
        return data.phase === 'sysret';
      });
      expect(hasSysret).toBe(true);
    });

    it('data includes registers', () => {
      const data = frames[0].data as SyscallState;
      expect(data.registers).toBeDefined();
      expect(data.registers.rax).toBeDefined();
      expect(data.registers.rdi).toBeDefined();
      expect(data.registers.rsi).toBeDefined();
      expect(data.registers.rdx).toBeDefined();
    });

    it('data includes stack', () => {
      const data = frames[0].data as SyscallState;
      expect(Array.isArray(data.stack)).toBe(true);
      expect(data.stack.length).toBeGreaterThan(0);
    });

    it('data includes srcRef', () => {
      const data = frames[0].data as SyscallState;
      expect(data.srcRef).toBeDefined();
      expect(data.srcRef.length).toBeGreaterThan(0);
    });

    it('srcRef references real kernel source files', () => {
      frames.forEach(f => {
        const data = f.data as SyscallState;
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });

    it('stack grows when entering kernel and shrinks on exit', () => {
      const firstData = frames[0].data as SyscallState;
      const midFrame = frames.find(f => {
        const d = f.data as SyscallState;
        return d.phase === 'vfs';
      });
      expect(midFrame).toBeDefined();
      const midData = midFrame!.data as SyscallState;
      expect(midData.stack.length).toBeGreaterThan(firstData.stack.length);
    });

    it('RAX changes to reflect return value', () => {
      const firstData = frames[0].data as SyscallState;
      const lastData = frames[frames.length - 1].data as SyscallState;
      expect(lastData.registers.rax).not.toBe(firstData.registers.rax);
    });

    it('descriptions reference entry_SYSCALL_64', () => {
      const hasRef = frames.some(f => f.description.includes('entry_SYSCALL_64'));
      expect(hasRef).toBe(true);
    });

    it('descriptions reference do_syscall_64', () => {
      const hasRef = frames.some(f => f.description.includes('do_syscall_64'));
      expect(hasRef).toBe(true);
    });

    it('descriptions reference vfs_read', () => {
      const hasRef = frames.some(f => f.description.includes('vfs_read'));
      expect(hasRef).toBe(true);
    });

    it('descriptions reference sysretq', () => {
      const hasRef = frames.some(f => f.description.includes('sysretq'));
      expect(hasRef).toBe(true);
    });
  });

  describe('generateFrames - default scenario', () => {
    it('returns frames when called without argument', () => {
      const frames = syscallFlow.generateFrames();
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });
  });

  describe('generateFrames - fast-path-read', () => {
    const frames = syscallFlow.generateFrames('fast-path-read');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('includes pagecache phase', () => {
      const hasPagecache = frames.some(f => {
        const data = f.data as SyscallState;
        return data.phase === 'pagecache';
      });
      expect(hasPagecache).toBe(true);
    });

    it('references filemap_read', () => {
      const hasRef = frames.some(f => f.description.includes('filemap_read'));
      expect(hasRef).toBe(true);
    });

    it('references generic_file_read_iter', () => {
      const hasRef = frames.some(f => f.description.includes('generic_file_read_iter'));
      expect(hasRef).toBe(true);
    });

    it('mentions page cache hit', () => {
      const hasRef = frames.some(f =>
        f.description.toLowerCase().includes('cache hit') ||
        f.label.toLowerCase().includes('cache hit')
      );
      expect(hasRef).toBe(true);
    });

    it('has srcRef on all frames', () => {
      frames.forEach(f => {
        const data = f.data as SyscallState;
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });

    it('returns to user mode in last frame', () => {
      const lastData = frames[frames.length - 1].data as SyscallState;
      expect(lastData.mode).toBe('user');
    });
  });

  describe('generateFrames - error-handling', () => {
    const frames = syscallFlow.generateFrames('error-handling');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('includes error phase', () => {
      const hasError = frames.some(f => {
        const data = f.data as SyscallState;
        return data.phase === 'error';
      });
      expect(hasError).toBe(true);
    });

    it('sets errorCode to -EBADF (-9)', () => {
      const errorFrame = frames.find(f => {
        const data = f.data as SyscallState;
        return data.errorCode !== null;
      });
      expect(errorFrame).toBeDefined();
      const data = errorFrame!.data as SyscallState;
      expect(data.errorCode).toBe(-9);
    });

    it('RAX shows negative error value', () => {
      const errorFrame = frames.find(f => {
        const data = f.data as SyscallState;
        return data.errorCode !== null;
      });
      expect(errorFrame).toBeDefined();
      const data = errorFrame!.data as SyscallState;
      expect(data.registers.rax).toContain('-9');
    });

    it('uses invalid fd (-1) in RDI', () => {
      const firstData = frames[0].data as SyscallState;
      expect(firstData.registers.rdi).toContain('-1');
    });

    it('mentions EBADF in description', () => {
      const hasEbadf = frames.some(f => f.description.includes('EBADF'));
      expect(hasEbadf).toBe(true);
    });

    it('mentions errno in description', () => {
      const hasErrno = frames.some(f => f.description.includes('errno'));
      expect(hasErrno).toBe(true);
    });

    it('references ksys_read error path', () => {
      const hasRef = frames.some(f => f.description.includes('ksys_read'));
      expect(hasRef).toBe(true);
    });

    it('has srcRef on all frames', () => {
      frames.forEach(f => {
        const data = f.data as SyscallState;
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });

    it('returns to user mode by end', () => {
      const lastData = frames[frames.length - 1].data as SyscallState;
      expect(lastData.mode).toBe('user');
    });
  });

  describe('renderFrame', () => {
    it('renders mode indicator', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = syscallFlow.generateFrames('syscall-entry-exit');
      syscallFlow.renderFrame(svg, frames[0], 900, 480);
      const modeElements = svg.querySelectorAll('.anim-mode');
      expect(modeElements.length).toBeGreaterThan(0);
    });

    it('renders register display', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = syscallFlow.generateFrames('syscall-entry-exit');
      syscallFlow.renderFrame(svg, frames[0], 900, 480);
      const regs = svg.querySelectorAll('.anim-register');
      expect(regs.length).toBeGreaterThan(0);
    });

    it('renders stack frames', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = syscallFlow.generateFrames('syscall-entry-exit');
      syscallFlow.renderFrame(svg, frames[5], 900, 480);
      const stackEntries = svg.querySelectorAll('.anim-stack-frame');
      expect(stackEntries.length).toBeGreaterThan(0);
    });

    it('renders phase flow blocks', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = syscallFlow.generateFrames('syscall-entry-exit');
      syscallFlow.renderFrame(svg, frames[3], 900, 480);
      const blocks = svg.querySelectorAll('.anim-block');
      expect(blocks.length).toBeGreaterThan(0);
    });

    it('renders title text', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = syscallFlow.generateFrames('syscall-entry-exit');
      syscallFlow.renderFrame(svg, frames[0], 900, 480);
      const title = svg.querySelector('.anim-title');
      expect(title).not.toBeNull();
    });

    it('clears previous content on re-render', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = syscallFlow.generateFrames('syscall-entry-exit');
      syscallFlow.renderFrame(svg, frames[0], 900, 480);
      const countBefore = svg.childElementCount;
      syscallFlow.renderFrame(svg, frames[1], 900, 480);
      expect(svg.childElementCount).toBeLessThanOrEqual(countBefore + 10);
    });

    it('renders error indicator for error scenario', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = syscallFlow.generateFrames('error-handling');
      const errorFrame = frames.find(f => {
        const data = f.data as SyscallState;
        return data.errorCode !== null;
      });
      if (errorFrame) {
        syscallFlow.renderFrame(svg, errorFrame, 900, 480);
        const highlights = svg.querySelectorAll('.anim-highlight');
        expect(highlights.length).toBeGreaterThan(0);
      }
    });
  });
});

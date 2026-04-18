import { describe, it, expect } from 'vitest';
import ioUring from './io-uring.js';
import type { IoUringState } from './io-uring.js';

describe('io_uring Animation Module', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(ioUring.config.id).toBe('io-uring');
      expect(ioUring.config.skillName).toBe('io-uring');
      expect(ioUring.config.title).toBe('io_uring Submission/Completion Rings');
    });
  });

  describe('getScenarios', () => {
    it('returns 3 scenarios', () => {
      const scenarios = ioUring.getScenarios();
      expect(scenarios.length).toBe(3);
      expect(scenarios.map(s => s.id)).toContain('setup-and-submit');
      expect(scenarios.map(s => s.id)).toContain('completion-path');
      expect(scenarios.map(s => s.id)).toContain('sqpoll-mode');
    });
  });

  describe('generateFrames - setup-and-submit (default)', () => {
    const frames = ioUring.generateFrames('setup-and-submit');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('first frame has step 0', () => {
      expect(frames[0].step).toBe(0);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('includes setup phase', () => {
      const hasSetup = frames.some(f => {
        const data = f.data as IoUringState;
        return data.phase === 'setup';
      });
      expect(hasSetup).toBe(true);
    });

    it('includes fill-sqe phase', () => {
      const hasFillSqe = frames.some(f => {
        const data = f.data as IoUringState;
        return data.phase === 'fill-sqe';
      });
      expect(hasFillSqe).toBe(true);
    });

    it('includes submit phase', () => {
      const hasSubmit = frames.some(f => {
        const data = f.data as IoUringState;
        return data.phase === 'submit';
      });
      expect(hasSubmit).toBe(true);
    });

    it('includes issue phase', () => {
      const hasIssue = frames.some(f => {
        const data = f.data as IoUringState;
        return data.phase === 'issue';
      });
      expect(hasIssue).toBe(true);
    });

    it('SQ tail advances when SQE is filled', () => {
      const fillFrame = frames.find(f => {
        const data = f.data as IoUringState;
        return data.phase === 'fill-sqe';
      });
      expect(fillFrame).toBeDefined();
      const data = fillFrame!.data as IoUringState;
      expect(data.sqTail).toBeGreaterThan(0);
    });

    it('sqEntries are populated when SQE is filled', () => {
      const fillFrame = frames.find(f => {
        const data = f.data as IoUringState;
        return data.phase === 'fill-sqe';
      });
      expect(fillFrame).toBeDefined();
      const data = fillFrame!.data as IoUringState;
      expect(data.sqEntries.length).toBeGreaterThan(0);
      expect(data.sqEntries[0].opcode).toBeDefined();
    });

    it('data includes srcRef on every frame', () => {
      frames.forEach(f => {
        const data = f.data as IoUringState;
        expect(data.srcRef).toBeDefined();
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });

    it('references io_uring_setup in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('io_uring_setup'));
      expect(hasRef).toBe(true);
    });

    it('references io_ring_ctx_alloc in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('io_ring_ctx_alloc'));
      expect(hasRef).toBe(true);
    });

    it('references io_allocate_scq_urings in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('io_allocate_scq_urings'));
      expect(hasRef).toBe(true);
    });

    it('references io_submit_sqes in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('io_submit_sqes'));
      expect(hasRef).toBe(true);
    });

    it('references io_issue_sqe in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('io_issue_sqe'));
      expect(hasRef).toBe(true);
    });

    it('sqpollActive is false for default scenario', () => {
      frames.forEach(f => {
        const data = f.data as IoUringState;
        expect(data.sqpollActive).toBe(false);
      });
    });
  });

  describe('generateFrames - default scenario', () => {
    it('returns frames when called without argument', () => {
      const frames = ioUring.generateFrames();
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });
  });

  describe('generateFrames - completion-path', () => {
    const frames = ioUring.generateFrames('completion-path');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('includes complete phase', () => {
      const hasComplete = frames.some(f => {
        const data = f.data as IoUringState;
        return data.phase === 'complete';
      });
      expect(hasComplete).toBe(true);
    });

    it('includes fill-cqe phase', () => {
      const hasFillCqe = frames.some(f => {
        const data = f.data as IoUringState;
        return data.phase === 'fill-cqe';
      });
      expect(hasFillCqe).toBe(true);
    });

    it('includes reap phase', () => {
      const hasReap = frames.some(f => {
        const data = f.data as IoUringState;
        return data.phase === 'reap';
      });
      expect(hasReap).toBe(true);
    });

    it('CQ tail advances when CQE is posted', () => {
      const cqeFrame = frames.find(f => {
        const data = f.data as IoUringState;
        return data.phase === 'fill-cqe';
      });
      expect(cqeFrame).toBeDefined();
      const data = cqeFrame!.data as IoUringState;
      expect(data.cqTail).toBeGreaterThan(0);
    });

    it('cqEntries are populated when CQE is posted', () => {
      const cqeFrame = frames.find(f => {
        const data = f.data as IoUringState;
        return data.phase === 'fill-cqe';
      });
      expect(cqeFrame).toBeDefined();
      const data = cqeFrame!.data as IoUringState;
      expect(data.cqEntries.length).toBeGreaterThan(0);
      expect(data.cqEntries[0].result).toBeDefined();
    });

    it('references io_req_complete_post in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('io_req_complete_post'));
      expect(hasRef).toBe(true);
    });

    it('references io_fill_cqe_req in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('io_fill_cqe_req'));
      expect(hasRef).toBe(true);
    });

    it('references io_cq_unlock_post in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('io_cq_unlock_post'));
      expect(hasRef).toBe(true);
    });

    it('references io_commit_cqring in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('io_commit_cqring'));
      expect(hasRef).toBe(true);
    });

    it('references io_cqring_wake in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('io_cqring_wake'));
      expect(hasRef).toBe(true);
    });

    it('has srcRef on all frames', () => {
      frames.forEach(f => {
        const data = f.data as IoUringState;
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });
  });

  describe('generateFrames - sqpoll-mode', () => {
    const frames = ioUring.generateFrames('sqpoll-mode');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('sqpollActive is true during polling', () => {
      const hasSqpoll = frames.some(f => {
        const data = f.data as IoUringState;
        return data.sqpollActive === true;
      });
      expect(hasSqpoll).toBe(true);
    });

    it('references io_sq_thread in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('io_sq_thread'));
      expect(hasRef).toBe(true);
    });

    it('references __io_sq_thread in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('__io_sq_thread'));
      expect(hasRef).toBe(true);
    });

    it('references io_sq_offload_create in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('io_sq_offload_create'));
      expect(hasRef).toBe(true);
    });

    it('references io_submit_sqes in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('io_submit_sqes'));
      expect(hasRef).toBe(true);
    });

    it('references IORING_SQ_NEED_WAKEUP in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('IORING_SQ_NEED_WAKEUP'));
      expect(hasRef).toBe(true);
    });

    it('has srcRef on all frames', () => {
      frames.forEach(f => {
        const data = f.data as IoUringState;
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });

    it('includes submit phase via sqpoll', () => {
      const hasSubmit = frames.some(f => {
        const data = f.data as IoUringState;
        return data.phase === 'submit';
      });
      expect(hasSubmit).toBe(true);
    });
  });

  describe('renderFrame', () => {
    it('renders title text', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = ioUring.generateFrames('setup-and-submit');
      ioUring.renderFrame(svg, frames[0], 900, 480);
      const title = svg.querySelector('.anim-title');
      expect(title).not.toBeNull();
    });

    it('renders ring visualization', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = ioUring.generateFrames('setup-and-submit');
      ioUring.renderFrame(svg, frames[3], 900, 480);
      const rings = svg.querySelectorAll('.anim-ring');
      expect(rings.length).toBeGreaterThan(0);
    });

    it('renders phase indicator', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = ioUring.generateFrames('setup-and-submit');
      ioUring.renderFrame(svg, frames[0], 900, 480);
      const phase = svg.querySelectorAll('.anim-phase');
      expect(phase.length).toBeGreaterThan(0);
    });

    it('renders function label', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = ioUring.generateFrames('setup-and-submit');
      ioUring.renderFrame(svg, frames[1], 900, 480);
      const fn = svg.querySelector('.anim-function');
      expect(fn).not.toBeNull();
    });

    it('clears previous content on re-render', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = ioUring.generateFrames('setup-and-submit');
      ioUring.renderFrame(svg, frames[0], 900, 480);
      const countBefore = svg.childElementCount;
      ioUring.renderFrame(svg, frames[1], 900, 480);
      expect(svg.childElementCount).toBeLessThanOrEqual(countBefore + 10);
    });

    it('renders SQ entries when present', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = ioUring.generateFrames('setup-and-submit');
      const fillFrame = frames.find(f => {
        const data = f.data as IoUringState;
        return data.sqEntries.length > 0;
      });
      if (fillFrame) {
        ioUring.renderFrame(svg, fillFrame, 900, 480);
        const entries = svg.querySelectorAll('.anim-sqe');
        expect(entries.length).toBeGreaterThan(0);
      }
    });

    it('renders CQ entries for completion scenario', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = ioUring.generateFrames('completion-path');
      const cqeFrame = frames.find(f => {
        const data = f.data as IoUringState;
        return data.cqEntries.length > 0;
      });
      if (cqeFrame) {
        ioUring.renderFrame(svg, cqeFrame, 900, 480);
        const entries = svg.querySelectorAll('.anim-cqe');
        expect(entries.length).toBeGreaterThan(0);
      }
    });
  });
});

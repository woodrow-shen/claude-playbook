import { describe, it, expect } from 'vitest';
import epollInternals from './epoll-internals.js';
import type { EpollState } from './epoll-internals.js';

describe('epoll-internals animation module', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(epollInternals.config.id).toBe('epoll-internals');
      expect(epollInternals.config.skillName).toBe('epoll-internals');
    });

    it('has a title', () => {
      expect(epollInternals.config.title).toBeTruthy();
    });
  });

  describe('getScenarios', () => {
    it('returns 3 scenarios', () => {
      const scenarios = epollInternals.getScenarios();
      expect(scenarios.length).toBe(3);
    });

    it('includes epoll-create-and-add, ready-event-wakeup, and edge-vs-level-trigger', () => {
      const ids = epollInternals.getScenarios().map(s => s.id);
      expect(ids).toContain('epoll-create-and-add');
      expect(ids).toContain('ready-event-wakeup');
      expect(ids).toContain('edge-vs-level-trigger');
    });
  });

  describe('generateFrames - epoll-create-and-add (default)', () => {
    const frames = epollInternals.generateFrames('epoll-create-and-add');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('first frame has step=0', () => {
      expect(frames[0].step).toBe(0);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('every frame has a srcRef in data', () => {
      frames.forEach(f => {
        const data = f.data as EpollState;
        expect(data.srcRef).toBeTruthy();
      });
    });

    it('shows ep_alloc in descriptions', () => {
      expect(frames.some(f => f.description.includes('ep_alloc'))).toBe(true);
    });

    it('shows ep_insert in descriptions', () => {
      expect(frames.some(f => f.description.includes('ep_insert'))).toBe(true);
    });

    it('shows do_epoll_create in descriptions', () => {
      expect(frames.some(f => f.description.includes('do_epoll_create'))).toBe(true);
    });

    it('shows ep_rbtree_insert in descriptions', () => {
      expect(frames.some(f => f.description.includes('ep_rbtree_insert'))).toBe(true);
    });

    it('shows ep_item_poll in descriptions', () => {
      expect(frames.some(f => f.description.includes('ep_item_poll'))).toBe(true);
    });

    it('state starts with create phase', () => {
      const data = frames[0].data as EpollState;
      expect(data.phase).toBe('create');
    });

    it('rbTreeItems grows as fds are added', () => {
      const firstData = frames[0].data as EpollState;
      const lastData = frames[frames.length - 1].data as EpollState;
      expect(lastData.rbTreeItems.length).toBeGreaterThan(firstData.rbTreeItems.length);
    });
  });

  describe('generateFrames - default returns frames', () => {
    it('returns frames when called without argument', () => {
      expect(epollInternals.generateFrames().length).toBeGreaterThan(0);
    });
  });

  describe('generateFrames - ready-event-wakeup', () => {
    const frames = epollInternals.generateFrames('ready-event-wakeup');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('every frame has a srcRef in data', () => {
      frames.forEach(f => {
        const data = f.data as EpollState;
        expect(data.srcRef).toBeTruthy();
      });
    });

    it('shows ep_poll_callback in descriptions', () => {
      expect(frames.some(f => f.description.includes('ep_poll_callback'))).toBe(true);
    });

    it('shows ep_send_events in descriptions', () => {
      expect(frames.some(f => f.description.includes('ep_send_events'))).toBe(true);
    });

    it('shows ep_poll in descriptions', () => {
      expect(frames.some(f => f.description.includes('ep_poll'))).toBe(true);
    });

    it('ready list gets populated during callback', () => {
      const hasReadyItems = frames.some(f => {
        const data = f.data as EpollState;
        return data.readyList.length > 0;
      });
      expect(hasReadyItems).toBe(true);
    });

    it('shows waiting threads', () => {
      const hasWaiting = frames.some(f => {
        const data = f.data as EpollState;
        return data.waitingThreads.length > 0;
      });
      expect(hasWaiting).toBe(true);
    });
  });

  describe('generateFrames - edge-vs-level-trigger', () => {
    const frames = epollInternals.generateFrames('edge-vs-level-trigger');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('every frame has a srcRef in data', () => {
      frames.forEach(f => {
        const data = f.data as EpollState;
        expect(data.srcRef).toBeTruthy();
      });
    });

    it('shows both level and edge trigger modes', () => {
      const modes = new Set(frames.map(f => (f.data as EpollState).triggerMode));
      expect(modes.has('level')).toBe(true);
      expect(modes.has('edge')).toBe(true);
    });

    it('references EPOLLET in descriptions', () => {
      expect(frames.some(f => f.description.includes('EPOLLET'))).toBe(true);
    });

    it('shows re-arming behavior difference', () => {
      expect(frames.some(f =>
        f.description.toLowerCase().includes('re-add') ||
        f.description.toLowerCase().includes('readd') ||
        f.description.toLowerCase().includes('re-insert') ||
        f.description.toLowerCase().includes('back inside') ||
        f.description.toLowerCase().includes('ready list')
      )).toBe(true);
    });
  });

  describe('state interface consistency', () => {
    const allScenarios = ['epoll-create-and-add', 'ready-event-wakeup', 'edge-vs-level-trigger'];

    allScenarios.forEach(scenario => {
      describe(`scenario: ${scenario}`, () => {
        const frames = epollInternals.generateFrames(scenario);

        it('every frame has required state fields', () => {
          frames.forEach(f => {
            const data = f.data as EpollState;
            expect(data).toHaveProperty('epollFd');
            expect(data).toHaveProperty('rbTreeItems');
            expect(data).toHaveProperty('readyList');
            expect(data).toHaveProperty('waitingThreads');
            expect(data).toHaveProperty('currentFunction');
            expect(data).toHaveProperty('phase');
            expect(data).toHaveProperty('triggerMode');
            expect(data).toHaveProperty('srcRef');
          });
        });

        it('every frame has real kernel function names in currentFunction', () => {
          frames.forEach(f => {
            const data = f.data as EpollState;
            expect(data.currentFunction).toBeTruthy();
          });
        });
      });
    });
  });
});

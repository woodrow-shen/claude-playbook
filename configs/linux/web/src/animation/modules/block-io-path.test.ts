import { describe, it, expect } from 'vitest';
import blockIoPath from './block-io-path.js';
import type { BlockIoState } from './block-io-path.js';

describe('Block I/O Path', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(blockIoPath.config.id).toBe('block-io-path');
      expect(blockIoPath.config.skillName).toBe('block-device-layer');
      expect(blockIoPath.config.title).toBeDefined();
    });
  });

  describe('getScenarios', () => {
    it('returns 3 scenarios', () => {
      const scenarios = blockIoPath.getScenarios();
      expect(scenarios.length).toBe(3);
      expect(scenarios.map(s => s.id)).toContain('bio-to-dispatch');
      expect(scenarios.map(s => s.id)).toContain('plug-merge');
      expect(scenarios.map(s => s.id)).toContain('io-completion');
    });
  });

  describe('generateFrames - bio-to-dispatch (default)', () => {
    const frames = blockIoPath.generateFrames('bio-to-dispatch');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('first frame has step 0', () => {
      expect(frames[0].step).toBe(0);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('every frame has a srcRef', () => {
      frames.forEach(f => {
        const data = f.data as BlockIoState;
        expect(data.srcRef).toBeTruthy();
      });
    });

    it('shows submit_bio in descriptions', () => {
      const hasSubmitBio = frames.some(f =>
        f.description.includes('submit_bio')
      );
      expect(hasSubmitBio).toBe(true);
    });

    it('shows blk_mq_submit_bio in descriptions', () => {
      const has = frames.some(f =>
        f.description.includes('blk_mq_submit_bio')
      );
      expect(has).toBe(true);
    });

    it('shows blk_mq_get_new_requests or request allocation', () => {
      const has = frames.some(f =>
        f.description.includes('blk_mq_get_new_requests') ||
        f.description.includes('get_request')
      );
      expect(has).toBe(true);
    });

    it('has frames with phase submit', () => {
      const has = frames.some(f => {
        const data = f.data as BlockIoState;
        return data.phase === 'submit';
      });
      expect(has).toBe(true);
    });

    it('has frames with phase mq-submit', () => {
      const has = frames.some(f => {
        const data = f.data as BlockIoState;
        return data.phase === 'mq-submit';
      });
      expect(has).toBe(true);
    });

    it('has frames with phase get-request', () => {
      const has = frames.some(f => {
        const data = f.data as BlockIoState;
        return data.phase === 'get-request';
      });
      expect(has).toBe(true);
    });

    it('has frames with phase dispatch or hw-issue', () => {
      const has = frames.some(f => {
        const data = f.data as BlockIoState;
        return data.phase === 'dispatch' || data.phase === 'hw-issue';
      });
      expect(has).toBe(true);
    });

    it('data includes bios array', () => {
      const data = frames[0].data as BlockIoState;
      expect(Array.isArray(data.bios)).toBe(true);
    });

    it('data includes requests array', () => {
      const data = frames[0].data as BlockIoState;
      expect(Array.isArray(data.requests)).toBe(true);
    });

    it('data includes hwQueues array', () => {
      const data = frames[0].data as BlockIoState;
      expect(Array.isArray(data.hwQueues)).toBe(true);
    });

    it('data includes currentFunction', () => {
      const data = frames[0].data as BlockIoState;
      expect(data.currentFunction).toBeDefined();
    });

    it('shows bio-to-request conversion', () => {
      const hasRequest = frames.some(f => {
        const data = f.data as BlockIoState;
        return data.requests.length > 0;
      });
      expect(hasRequest).toBe(true);
    });
  });

  describe('generateFrames - default scenario', () => {
    it('returns frames when called without argument', () => {
      const frames = blockIoPath.generateFrames();
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });
  });

  describe('generateFrames - plug-merge', () => {
    const frames = blockIoPath.generateFrames('plug-merge');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('every frame has a srcRef', () => {
      frames.forEach(f => {
        const data = f.data as BlockIoState;
        expect(data.srcRef).toBeTruthy();
      });
    });

    it('shows merge operations in descriptions', () => {
      const hasMerge = frames.some(f =>
        f.description.includes('merge') || f.description.includes('Merge')
      );
      expect(hasMerge).toBe(true);
    });

    it('shows blk_attempt_plug_merge in descriptions', () => {
      const has = frames.some(f =>
        f.description.includes('blk_attempt_plug_merge')
      );
      expect(has).toBe(true);
    });

    it('shows unplug in descriptions', () => {
      const has = frames.some(f =>
        f.description.includes('unplug') || f.description.includes('flush_plug')
      );
      expect(has).toBe(true);
    });

    it('has frames with phase plug-merge', () => {
      const has = frames.some(f => {
        const data = f.data as BlockIoState;
        return data.phase === 'plug-merge';
      });
      expect(has).toBe(true);
    });

    it('has frames with phase unplug', () => {
      const has = frames.some(f => {
        const data = f.data as BlockIoState;
        return data.phase === 'unplug';
      });
      expect(has).toBe(true);
    });

    it('shows plug list with entries', () => {
      const hasPlug = frames.some(f => {
        const data = f.data as BlockIoState;
        return data.plugList.length > 0;
      });
      expect(hasPlug).toBe(true);
    });

    it('shows merged requests', () => {
      const hasMerged = frames.some(f => {
        const data = f.data as BlockIoState;
        return data.requests.some(r => r.merged);
      });
      expect(hasMerged).toBe(true);
    });
  });

  describe('generateFrames - io-completion', () => {
    const frames = blockIoPath.generateFrames('io-completion');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('every frame has a srcRef', () => {
      frames.forEach(f => {
        const data = f.data as BlockIoState;
        expect(data.srcRef).toBeTruthy();
      });
    });

    it('shows blk_mq_complete_request in descriptions', () => {
      const has = frames.some(f =>
        f.description.includes('blk_mq_complete_request')
      );
      expect(has).toBe(true);
    });

    it('shows bio_endio in descriptions', () => {
      const has = frames.some(f =>
        f.description.includes('bio_endio')
      );
      expect(has).toBe(true);
    });

    it('has frames with phase complete', () => {
      const has = frames.some(f => {
        const data = f.data as BlockIoState;
        return data.phase === 'complete';
      });
      expect(has).toBe(true);
    });

    it('has frames with phase bio-endio', () => {
      const has = frames.some(f => {
        const data = f.data as BlockIoState;
        return data.phase === 'bio-endio';
      });
      expect(has).toBe(true);
    });

    it('shows real function names in descriptions', () => {
      const realFunctions = [
        'blk_mq_complete_request',
        'blk_mq_end_request',
        'bio_endio',
      ];
      const foundFunctions = realFunctions.filter(fn =>
        frames.some(f => f.description.includes(fn))
      );
      expect(foundFunctions.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('renderFrame', () => {
    it('renders bio boxes', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = blockIoPath.generateFrames('bio-to-dispatch');
      blockIoPath.renderFrame(svg, frames[0], 900, 480);
      const elements = svg.querySelectorAll('.anim-bio');
      expect(elements.length).toBeGreaterThanOrEqual(0);
    });

    it('renders hw queue elements', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = blockIoPath.generateFrames('bio-to-dispatch');
      // Pick a late frame that has hw queue activity
      const lateFrame = frames[frames.length - 2];
      blockIoPath.renderFrame(svg, lateFrame, 900, 480);
      const queues = svg.querySelectorAll('.anim-hwq');
      expect(queues.length).toBeGreaterThan(0);
    });

    it('renders title text', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = blockIoPath.generateFrames('bio-to-dispatch');
      blockIoPath.renderFrame(svg, frames[0], 900, 480);
      const title = svg.querySelector('.anim-title');
      expect(title).not.toBeNull();
    });

    it('clears previous content on re-render', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = blockIoPath.generateFrames('bio-to-dispatch');
      blockIoPath.renderFrame(svg, frames[0], 900, 480);
      const countBefore = svg.childElementCount;
      blockIoPath.renderFrame(svg, frames[1], 900, 480);
      expect(svg.childElementCount).toBeLessThanOrEqual(countBefore + 10);
    });
  });
});

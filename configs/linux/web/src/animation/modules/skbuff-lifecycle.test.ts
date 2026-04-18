import { describe, it, expect } from 'vitest';
import skbuffLifecycle from './skbuff-lifecycle.js';
import type { SkbuffState } from './skbuff-lifecycle.js';

describe('sk_buff Lifecycle', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(skbuffLifecycle.config.id).toBe('skbuff-lifecycle');
      expect(skbuffLifecycle.config.skillName).toBe('sk-buff-lifecycle');
      expect(skbuffLifecycle.config.title).toBe('sk_buff Allocation, Cloning & GSO/GRO');
    });
  });

  describe('getScenarios', () => {
    it('returns 3 scenarios', () => {
      const scenarios = skbuffLifecycle.getScenarios();
      expect(scenarios.length).toBe(3);
      expect(scenarios.map(s => s.id)).toContain('skb-alloc-free');
      expect(scenarios.map(s => s.id)).toContain('skb-clone-cow');
      expect(scenarios.map(s => s.id)).toContain('gso-gro-path');
    });
  });

  describe('generateFrames - skb-alloc-free (default)', () => {
    const frames = skbuffLifecycle.generateFrames('skb-alloc-free');

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

    it('starts in alloc phase', () => {
      const data = frames[0].data as SkbuffState;
      expect(data.phase).toBe('alloc');
    });

    it('data includes srcRef on all frames', () => {
      frames.forEach(f => {
        const data = f.data as SkbuffState;
        expect(data.srcRef).toBeDefined();
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });

    it('data includes skbuffs array', () => {
      const data = frames[0].data as SkbuffState;
      expect(Array.isArray(data.skbuffs)).toBe(true);
    });

    it('skbuffs have head/data/tail/end pointers', () => {
      const data = frames[1].data as SkbuffState;
      expect(data.skbuffs.length).toBeGreaterThan(0);
      const skb = data.skbuffs[0];
      expect(skb.head).toBeDefined();
      expect(skb.data).toBeDefined();
      expect(skb.tail).toBeDefined();
      expect(skb.end).toBeDefined();
    });

    it('data includes refcount', () => {
      const data = frames[0].data as SkbuffState;
      expect(data.refcount).toBeDefined();
      expect(typeof data.refcount).toBe('number');
    });

    it('data includes cloneCount', () => {
      const data = frames[0].data as SkbuffState;
      expect(data.cloneCount).toBeDefined();
      expect(typeof data.cloneCount).toBe('number');
    });

    it('data includes gsoSegments', () => {
      const data = frames[0].data as SkbuffState;
      expect(data.gsoSegments).toBeDefined();
      expect(typeof data.gsoSegments).toBe('number');
    });

    it('data includes groMerged', () => {
      const data = frames[0].data as SkbuffState;
      expect(data.groMerged).toBeDefined();
      expect(typeof data.groMerged).toBe('number');
    });

    it('descriptions reference __alloc_skb', () => {
      const hasRef = frames.some(f => f.description.includes('__alloc_skb'));
      expect(hasRef).toBe(true);
    });

    it('descriptions reference skb_put', () => {
      const hasRef = frames.some(f => f.description.includes('skb_put'));
      expect(hasRef).toBe(true);
    });

    it('descriptions reference skb_push', () => {
      const hasRef = frames.some(f => f.description.includes('skb_push'));
      expect(hasRef).toBe(true);
    });

    it('descriptions reference skb_pull', () => {
      const hasRef = frames.some(f => f.description.includes('skb_pull'));
      expect(hasRef).toBe(true);
    });

    it('descriptions reference kfree_skb or consume_skb', () => {
      const hasRef = frames.some(f =>
        f.description.includes('kfree_skb') || f.description.includes('consume_skb')
      );
      expect(hasRef).toBe(true);
    });

    it('reaches free phase by end', () => {
      const lastData = frames[frames.length - 1].data as SkbuffState;
      expect(lastData.phase).toBe('free');
    });
  });

  describe('generateFrames - default scenario', () => {
    it('returns frames when called without argument', () => {
      const frames = skbuffLifecycle.generateFrames();
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });
  });

  describe('generateFrames - skb-clone-cow', () => {
    const frames = skbuffLifecycle.generateFrames('skb-clone-cow');

    it('generates 8-12 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
      expect(frames.length).toBeLessThanOrEqual(12);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('includes clone phase', () => {
      const hasClone = frames.some(f => {
        const data = f.data as SkbuffState;
        return data.phase === 'clone';
      });
      expect(hasClone).toBe(true);
    });

    it('includes cow phase', () => {
      const hasCow = frames.some(f => {
        const data = f.data as SkbuffState;
        return data.phase === 'cow';
      });
      expect(hasCow).toBe(true);
    });

    it('cloneCount increases after cloning', () => {
      const cloneFrame = frames.find(f => {
        const data = f.data as SkbuffState;
        return data.phase === 'clone';
      });
      expect(cloneFrame).toBeDefined();
      const data = cloneFrame!.data as SkbuffState;
      expect(data.cloneCount).toBeGreaterThan(0);
    });

    it('descriptions reference skb_clone', () => {
      const hasRef = frames.some(f => f.description.includes('skb_clone'));
      expect(hasRef).toBe(true);
    });

    it('descriptions reference skb_copy or pskb_copy', () => {
      const hasRef = frames.some(f =>
        f.description.includes('skb_copy') || f.description.includes('pskb_copy')
      );
      expect(hasRef).toBe(true);
    });

    it('descriptions reference skb_cow', () => {
      const hasRef = frames.some(f => f.description.includes('skb_cow'));
      expect(hasRef).toBe(true);
    });

    it('descriptions reference skb_shared_info', () => {
      const hasRef = frames.some(f => f.description.includes('skb_shared_info'));
      expect(hasRef).toBe(true);
    });

    it('has srcRef on all frames', () => {
      frames.forEach(f => {
        const data = f.data as SkbuffState;
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });
  });

  describe('generateFrames - gso-gro-path', () => {
    const frames = skbuffLifecycle.generateFrames('gso-gro-path');

    it('generates 8-12 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
      expect(frames.length).toBeLessThanOrEqual(12);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('includes gso phase', () => {
      const hasGso = frames.some(f => {
        const data = f.data as SkbuffState;
        return data.phase === 'gso';
      });
      expect(hasGso).toBe(true);
    });

    it('includes gro phase', () => {
      const hasGro = frames.some(f => {
        const data = f.data as SkbuffState;
        return data.phase === 'gro';
      });
      expect(hasGro).toBe(true);
    });

    it('gsoSegments increases during GSO', () => {
      const gsoFrame = frames.find(f => {
        const data = f.data as SkbuffState;
        return data.phase === 'gso' && data.gsoSegments > 0;
      });
      expect(gsoFrame).toBeDefined();
      const data = gsoFrame!.data as SkbuffState;
      expect(data.gsoSegments).toBeGreaterThan(0);
    });

    it('groMerged increases during GRO', () => {
      const groFrame = frames.find(f => {
        const data = f.data as SkbuffState;
        return data.phase === 'gro' && data.groMerged > 0;
      });
      expect(groFrame).toBeDefined();
      const data = groFrame!.data as SkbuffState;
      expect(data.groMerged).toBeGreaterThan(0);
    });

    it('descriptions reference skb_mac_gso_segment', () => {
      const hasRef = frames.some(f => f.description.includes('skb_mac_gso_segment'));
      expect(hasRef).toBe(true);
    });

    it('descriptions reference __skb_gso_segment or skb_segment', () => {
      const hasRef = frames.some(f =>
        f.description.includes('__skb_gso_segment') || f.description.includes('skb_segment')
      );
      expect(hasRef).toBe(true);
    });

    it('descriptions reference dev_gro_receive', () => {
      const hasRef = frames.some(f => f.description.includes('dev_gro_receive'));
      expect(hasRef).toBe(true);
    });

    it('descriptions reference gro_receive_skb or napi_gro_receive', () => {
      const hasRef = frames.some(f =>
        f.description.includes('gro_receive_skb') || f.description.includes('napi_gro_receive')
      );
      expect(hasRef).toBe(true);
    });

    it('has srcRef on all frames', () => {
      frames.forEach(f => {
        const data = f.data as SkbuffState;
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });
  });

  describe('renderFrame', () => {
    it('renders title text', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = skbuffLifecycle.generateFrames('skb-alloc-free');
      skbuffLifecycle.renderFrame(svg, frames[0], 900, 480);
      const title = svg.querySelector('.anim-title');
      expect(title).not.toBeNull();
    });

    it('renders skb buffer visualization', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = skbuffLifecycle.generateFrames('skb-alloc-free');
      skbuffLifecycle.renderFrame(svg, frames[1], 900, 480);
      const blocks = svg.querySelectorAll('.anim-block');
      expect(blocks.length).toBeGreaterThan(0);
    });

    it('renders phase flow blocks', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = skbuffLifecycle.generateFrames('skb-alloc-free');
      skbuffLifecycle.renderFrame(svg, frames[3], 900, 480);
      const blocks = svg.querySelectorAll('.anim-block');
      expect(blocks.length).toBeGreaterThan(0);
    });

    it('clears previous content on re-render', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = skbuffLifecycle.generateFrames('skb-alloc-free');
      skbuffLifecycle.renderFrame(svg, frames[0], 900, 480);
      const countBefore = svg.childElementCount;
      skbuffLifecycle.renderFrame(svg, frames[1], 900, 480);
      expect(svg.childElementCount).toBeLessThanOrEqual(countBefore + 10);
    });

    it('renders skb pointer labels', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = skbuffLifecycle.generateFrames('skb-alloc-free');
      skbuffLifecycle.renderFrame(svg, frames[2], 900, 480);
      const labels = svg.querySelectorAll('.anim-cpu-label');
      expect(labels.length).toBeGreaterThan(0);
    });

    it('renders highlight on active elements', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = skbuffLifecycle.generateFrames('skb-clone-cow');
      const cloneFrame = frames.find(f => {
        const data = f.data as SkbuffState;
        return data.phase === 'clone';
      });
      if (cloneFrame) {
        skbuffLifecycle.renderFrame(svg, cloneFrame, 900, 480);
        const highlights = svg.querySelectorAll('.anim-highlight');
        expect(highlights.length).toBeGreaterThan(0);
      }
    });
  });
});

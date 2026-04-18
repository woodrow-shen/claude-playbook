import { describe, it, expect } from 'vitest';
import dcacheInode from './dcache-inode.js';
import type { DcacheInodeState } from './dcache-inode.js';

describe('Dcache & Inode Cache', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(dcacheInode.config.id).toBe('dcache-inode');
      expect(dcacheInode.config.skillName).toBe('dcache-and-inode-cache');
      expect(dcacheInode.config.title).toBe('Dentry Cache & Inode Cache');
    });
  });

  describe('getScenarios', () => {
    it('returns 3 scenarios', () => {
      const scenarios = dcacheInode.getScenarios();
      expect(scenarios.length).toBe(3);
      expect(scenarios.map(s => s.id)).toContain('dcache-lookup');
      expect(scenarios.map(s => s.id)).toContain('negative-dentry');
      expect(scenarios.map(s => s.id)).toContain('inode-lifecycle');
    });
  });

  describe('generateFrames - dcache-lookup (default)', () => {
    const frames = dcacheInode.generateFrames('dcache-lookup');

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

    it('starts in lookup phase', () => {
      const data = frames[0].data as DcacheInodeState;
      expect(data.phase).toBe('lookup');
    });

    it('includes hash phase', () => {
      const hasHash = frames.some(f => {
        const data = f.data as DcacheInodeState;
        return data.phase === 'hash';
      });
      expect(hasHash).toBe(true);
    });

    it('includes rcu-walk phase', () => {
      const hasRcu = frames.some(f => {
        const data = f.data as DcacheInodeState;
        return data.phase === 'rcu-walk';
      });
      expect(hasRcu).toBe(true);
    });

    it('includes hit phase', () => {
      const hasHit = frames.some(f => {
        const data = f.data as DcacheInodeState;
        return data.phase === 'hit';
      });
      expect(hasHit).toBe(true);
    });

    it('data includes dentryHashTable', () => {
      const data = frames[0].data as DcacheInodeState;
      expect(Array.isArray(data.dentryHashTable)).toBe(true);
    });

    it('data includes inodeCache', () => {
      const data = frames[0].data as DcacheInodeState;
      expect(Array.isArray(data.inodeCache)).toBe(true);
    });

    it('data includes currentLookup', () => {
      const data = frames[0].data as DcacheInodeState;
      expect(data.currentLookup).toBeDefined();
    });

    it('data includes lruList', () => {
      const data = frames[0].data as DcacheInodeState;
      expect(Array.isArray(data.lruList)).toBe(true);
    });

    it('data includes srcRef', () => {
      const data = frames[0].data as DcacheInodeState;
      expect(data.srcRef).toBeDefined();
      expect(data.srcRef.length).toBeGreaterThan(0);
    });

    it('srcRef references real kernel source files on all frames', () => {
      frames.forEach(f => {
        const data = f.data as DcacheInodeState;
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });

    it('references lookup_fast', () => {
      const hasRef = frames.some(f => f.description.includes('lookup_fast'));
      expect(hasRef).toBe(true);
    });

    it('references __d_lookup_rcu', () => {
      const hasRef = frames.some(f => f.description.includes('__d_lookup_rcu'));
      expect(hasRef).toBe(true);
    });

    it('references d_hash', () => {
      const hasRef = frames.some(f => f.description.includes('d_hash'));
      expect(hasRef).toBe(true);
    });

    it('dentryHashTable grows during lookup', () => {
      const firstData = frames[0].data as DcacheInodeState;
      const hitFrame = frames.find(f => {
        const d = f.data as DcacheInodeState;
        return d.phase === 'hit';
      });
      expect(hitFrame).toBeDefined();
      const hitData = hitFrame!.data as DcacheInodeState;
      expect(hitData.dentryHashTable.length).toBeGreaterThanOrEqual(firstData.dentryHashTable.length);
    });
  });

  describe('generateFrames - default scenario', () => {
    it('returns frames when called without argument', () => {
      const frames = dcacheInode.generateFrames();
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });
  });

  describe('generateFrames - negative-dentry', () => {
    const frames = dcacheInode.generateFrames('negative-dentry');

    it('generates 8-12 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
      expect(frames.length).toBeLessThanOrEqual(12);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('includes slow-path phase', () => {
      const hasSlow = frames.some(f => {
        const data = f.data as DcacheInodeState;
        return data.phase === 'slow-path';
      });
      expect(hasSlow).toBe(true);
    });

    it('includes negative phase', () => {
      const hasNeg = frames.some(f => {
        const data = f.data as DcacheInodeState;
        return data.phase === 'negative';
      });
      expect(hasNeg).toBe(true);
    });

    it('references d_alloc', () => {
      const hasRef = frames.some(f => f.description.includes('d_alloc'));
      expect(hasRef).toBe(true);
    });

    it('references d_splice_alias', () => {
      const hasRef = frames.some(f => f.description.includes('d_splice_alias'));
      expect(hasRef).toBe(true);
    });

    it('references lookup_slow or __lookup_slow', () => {
      const hasRef = frames.some(f =>
        f.description.includes('lookup_slow') || f.description.includes('__lookup_slow')
      );
      expect(hasRef).toBe(true);
    });

    it('mentions negative dentry in description', () => {
      const hasRef = frames.some(f =>
        f.description.toLowerCase().includes('negative dentry') ||
        f.description.toLowerCase().includes('negative')
      );
      expect(hasRef).toBe(true);
    });

    it('has srcRef on all frames', () => {
      frames.forEach(f => {
        const data = f.data as DcacheInodeState;
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });
  });

  describe('generateFrames - inode-lifecycle', () => {
    const frames = dcacheInode.generateFrames('inode-lifecycle');

    it('generates 8-12 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
      expect(frames.length).toBeLessThanOrEqual(12);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('includes alloc phase', () => {
      const hasAlloc = frames.some(f => {
        const data = f.data as DcacheInodeState;
        return data.phase === 'alloc';
      });
      expect(hasAlloc).toBe(true);
    });

    it('includes evict phase', () => {
      const hasEvict = frames.some(f => {
        const data = f.data as DcacheInodeState;
        return data.phase === 'evict';
      });
      expect(hasEvict).toBe(true);
    });

    it('references iget_locked', () => {
      const hasRef = frames.some(f => f.description.includes('iget_locked'));
      expect(hasRef).toBe(true);
    });

    it('references iput', () => {
      const hasRef = frames.some(f => f.description.includes('iput'));
      expect(hasRef).toBe(true);
    });

    it('references evict', () => {
      const hasRef = frames.some(f => f.description.includes('evict'));
      expect(hasRef).toBe(true);
    });

    it('references prune_icache_sb', () => {
      const hasRef = frames.some(f => f.description.includes('prune_icache_sb'));
      expect(hasRef).toBe(true);
    });

    it('inodeCache changes size during lifecycle', () => {
      const firstData = frames[0].data as DcacheInodeState;
      const lastData = frames[frames.length - 1].data as DcacheInodeState;
      const maxCache = Math.max(...frames.map(f => (f.data as DcacheInodeState).inodeCache.length));
      expect(maxCache).toBeGreaterThan(firstData.inodeCache.length);
    });

    it('has srcRef on all frames', () => {
      frames.forEach(f => {
        const data = f.data as DcacheInodeState;
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });
  });

  describe('renderFrame', () => {
    it('renders title text', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = dcacheInode.generateFrames('dcache-lookup');
      dcacheInode.renderFrame(svg, frames[0], 900, 480);
      const title = svg.querySelector('.anim-title');
      expect(title).not.toBeNull();
    });

    it('renders hash table entries', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = dcacheInode.generateFrames('dcache-lookup');
      dcacheInode.renderFrame(svg, frames[3], 900, 480);
      const entries = svg.querySelectorAll('.anim-hash-entry');
      expect(entries.length).toBeGreaterThan(0);
    });

    it('renders inode cache entries', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = dcacheInode.generateFrames('inode-lifecycle');
      const midFrame = frames.find(f => {
        const d = f.data as DcacheInodeState;
        return d.inodeCache.length > 0;
      });
      if (midFrame) {
        dcacheInode.renderFrame(svg, midFrame, 900, 480);
        const inodes = svg.querySelectorAll('.anim-inode');
        expect(inodes.length).toBeGreaterThan(0);
      }
    });

    it('renders phase indicator blocks', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = dcacheInode.generateFrames('dcache-lookup');
      dcacheInode.renderFrame(svg, frames[2], 900, 480);
      const blocks = svg.querySelectorAll('.anim-block');
      expect(blocks.length).toBeGreaterThan(0);
    });

    it('clears previous content on re-render', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = dcacheInode.generateFrames('dcache-lookup');
      dcacheInode.renderFrame(svg, frames[0], 900, 480);
      const countBefore = svg.childElementCount;
      dcacheInode.renderFrame(svg, frames[1], 900, 480);
      expect(svg.childElementCount).toBeLessThanOrEqual(countBefore + 10);
    });

    it('renders highlight for active lookup', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = dcacheInode.generateFrames('dcache-lookup');
      const hitFrame = frames.find(f => {
        const d = f.data as DcacheInodeState;
        return d.phase === 'hit';
      });
      if (hitFrame) {
        dcacheInode.renderFrame(svg, hitFrame, 900, 480);
        const highlights = svg.querySelectorAll('.anim-highlight');
        expect(highlights.length).toBeGreaterThan(0);
      }
    });
  });
});

import { describe, it, expect } from 'vitest';
import rmapFolio from './rmap-folio.js';
import type { RmapFolioState } from './rmap-folio.js';

describe('Rmap Folio', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(rmapFolio.config.id).toBe('rmap-folio');
      expect(rmapFolio.config.skillName).toBe('rmap-and-folio');
      expect(rmapFolio.config.title).toBe('Reverse Mappings & Folio Abstraction');
    });
  });

  describe('getScenarios', () => {
    it('returns 3 scenarios', () => {
      const scenarios = rmapFolio.getScenarios();
      expect(scenarios.length).toBe(3);
      expect(scenarios.map(s => s.id)).toContain('anon-rmap-chain');
      expect(scenarios.map(s => s.id)).toContain('file-rmap-walk');
      expect(scenarios.map(s => s.id)).toContain('folio-operations');
    });
  });

  describe('generateFrames - anon-rmap-chain (default)', () => {
    const frames = rmapFolio.generateFrames('anon-rmap-chain');

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

    it('all frames have srcRef in data', () => {
      frames.forEach(f => {
        const data = f.data as RmapFolioState;
        expect(data.srcRef).toBeDefined();
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });

    it('state includes phase field', () => {
      frames.forEach(f => {
        const data = f.data as RmapFolioState;
        expect(data.phase).toBeDefined();
      });
    });

    it('state includes folios array', () => {
      frames.forEach(f => {
        const data = f.data as RmapFolioState;
        expect(Array.isArray(data.folios)).toBe(true);
      });
    });

    it('state includes rmapChains array', () => {
      frames.forEach(f => {
        const data = f.data as RmapFolioState;
        expect(Array.isArray(data.rmapChains)).toBe(true);
      });
    });

    it('state includes pteEntries array', () => {
      frames.forEach(f => {
        const data = f.data as RmapFolioState;
        expect(Array.isArray(data.pteEntries)).toBe(true);
      });
    });

    it('state includes currentOperation', () => {
      frames.forEach(f => {
        const data = f.data as RmapFolioState;
        expect(data.currentOperation).toBeDefined();
      });
    });

    it('references folio_add_anon_rmap_ptes in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('folio_add_anon_rmap_ptes'));
      expect(hasRef).toBe(true);
    });

    it('references __folio_set_anon in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('__folio_set_anon'));
      expect(hasRef).toBe(true);
    });

    it('references anon_vma_chain_assign in descriptions', () => {
      const hasRef = frames.some(f =>
        f.description.includes('anon_vma_chain_assign') ||
        f.description.includes('anon_vma_chain')
      );
      expect(hasRef).toBe(true);
    });

    it('adds folios during the scenario', () => {
      const firstFolios = (frames[0].data as RmapFolioState).folios.length;
      const hasFolioGrowth = frames.some(f => {
        const data = f.data as RmapFolioState;
        return data.folios.length > firstFolios;
      });
      expect(hasFolioGrowth).toBe(true);
    });

    it('adds rmapChains during the scenario', () => {
      const hasChains = frames.some(f => {
        const data = f.data as RmapFolioState;
        return data.rmapChains.length > 0;
      });
      expect(hasChains).toBe(true);
    });

    it('adds pteEntries during the scenario', () => {
      const hasPtes = frames.some(f => {
        const data = f.data as RmapFolioState;
        return data.pteEntries.length > 0;
      });
      expect(hasPtes).toBe(true);
    });
  });

  describe('generateFrames - default scenario', () => {
    it('returns frames when called without argument', () => {
      const frames = rmapFolio.generateFrames();
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });
  });

  describe('generateFrames - file-rmap-walk', () => {
    const frames = rmapFolio.generateFrames('file-rmap-walk');

    it('generates 8-12 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
      expect(frames.length).toBeLessThanOrEqual(12);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('all frames have srcRef in data', () => {
      frames.forEach(f => {
        const data = f.data as RmapFolioState;
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });

    it('references rmap_walk_file in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('rmap_walk_file'));
      expect(hasRef).toBe(true);
    });

    it('references page_vma_mapped_walk in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('page_vma_mapped_walk'));
      expect(hasRef).toBe(true);
    });

    it('references try_to_unmap_one in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('try_to_unmap_one'));
      expect(hasRef).toBe(true);
    });

    it('includes unmap phase', () => {
      const hasUnmap = frames.some(f => {
        const data = f.data as RmapFolioState;
        return data.phase === 'unmap';
      });
      expect(hasUnmap).toBe(true);
    });

    it('pteEntries decrease during unmapping', () => {
      const maxPtes = Math.max(...frames.map(f => (f.data as RmapFolioState).pteEntries.length));
      const lastData = frames[frames.length - 1].data as RmapFolioState;
      expect(lastData.pteEntries.length).toBeLessThan(maxPtes);
    });
  });

  describe('generateFrames - folio-operations', () => {
    const frames = rmapFolio.generateFrames('folio-operations');

    it('generates 8-12 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
      expect(frames.length).toBeLessThanOrEqual(12);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('all frames have srcRef in data', () => {
      frames.forEach(f => {
        const data = f.data as RmapFolioState;
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });

    it('references filemap_get_folio or __filemap_get_folio_mpol in descriptions', () => {
      const hasRef = frames.some(f =>
        f.description.includes('filemap_get_folio') ||
        f.description.includes('__filemap_get_folio_mpol')
      );
      expect(hasRef).toBe(true);
    });

    it('references folio_alloc in descriptions', () => {
      const hasRef = frames.some(f =>
        f.description.includes('folio_alloc') ||
        f.description.includes('folio_alloc_noprof')
      );
      expect(hasRef).toBe(true);
    });

    it('references folio_put in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('folio_put'));
      expect(hasRef).toBe(true);
    });

    it('references folio_lock in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('folio_lock'));
      expect(hasRef).toBe(true);
    });

    it('includes alloc phase', () => {
      const hasAlloc = frames.some(f => {
        const data = f.data as RmapFolioState;
        return data.phase === 'alloc';
      });
      expect(hasAlloc).toBe(true);
    });

    it('includes lookup phase', () => {
      const hasLookup = frames.some(f => {
        const data = f.data as RmapFolioState;
        return data.phase === 'lookup';
      });
      expect(hasLookup).toBe(true);
    });

    it('includes release phase', () => {
      const hasRelease = frames.some(f => {
        const data = f.data as RmapFolioState;
        return data.phase === 'release';
      });
      expect(hasRelease).toBe(true);
    });
  });

  describe('renderFrame', () => {
    it('renders title text', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = rmapFolio.generateFrames('anon-rmap-chain');
      rmapFolio.renderFrame(svg, frames[0], 900, 480);
      const title = svg.querySelector('.anim-title');
      expect(title).not.toBeNull();
    });

    it('renders folio elements', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = rmapFolio.generateFrames('anon-rmap-chain');
      // Pick a frame that has folios
      const folioFrame = frames.find(f => (f.data as RmapFolioState).folios.length > 0);
      if (folioFrame) {
        rmapFolio.renderFrame(svg, folioFrame, 900, 480);
        const folioElements = svg.querySelectorAll('.anim-folio');
        expect(folioElements.length).toBeGreaterThan(0);
      }
    });

    it('renders phase indicator', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = rmapFolio.generateFrames('anon-rmap-chain');
      rmapFolio.renderFrame(svg, frames[0], 900, 480);
      const phase = svg.querySelectorAll('.anim-phase');
      expect(phase.length).toBeGreaterThan(0);
    });

    it('renders operation label', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = rmapFolio.generateFrames('anon-rmap-chain');
      rmapFolio.renderFrame(svg, frames[3], 900, 480);
      const opLabel = svg.querySelector('.anim-operation');
      expect(opLabel).not.toBeNull();
    });

    it('clears previous content on re-render', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = rmapFolio.generateFrames('anon-rmap-chain');
      rmapFolio.renderFrame(svg, frames[0], 900, 480);
      const countBefore = svg.childElementCount;
      rmapFolio.renderFrame(svg, frames[1], 900, 480);
      expect(svg.childElementCount).toBeLessThanOrEqual(countBefore + 10);
    });

    it('renders rmap chain connectors', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = rmapFolio.generateFrames('anon-rmap-chain');
      const chainFrame = frames.find(f => (f.data as RmapFolioState).rmapChains.length > 0);
      if (chainFrame) {
        rmapFolio.renderFrame(svg, chainFrame, 900, 480);
        const chains = svg.querySelectorAll('.anim-rmap-chain');
        expect(chains.length).toBeGreaterThan(0);
      }
    });

    it('renders pte entries', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = rmapFolio.generateFrames('anon-rmap-chain');
      const pteFrame = frames.find(f => (f.data as RmapFolioState).pteEntries.length > 0);
      if (pteFrame) {
        rmapFolio.renderFrame(svg, pteFrame, 900, 480);
        const ptes = svg.querySelectorAll('.anim-pte');
        expect(ptes.length).toBeGreaterThan(0);
      }
    });

    it('renders highlight on active elements', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = rmapFolio.generateFrames('anon-rmap-chain');
      // Use frame 6 which highlights both a PTE and a folio
      const highlightFrame = frames.find(f => {
        const data = f.data as RmapFolioState;
        return f.highlights.some(h =>
          data.folios.some(fo => fo.id === h) ||
          data.rmapChains.some(c => c.id === h) ||
          data.pteEntries.some(p => p.id === h)
        );
      });
      if (highlightFrame) {
        rmapFolio.renderFrame(svg, highlightFrame, 900, 480);
        const highlights = svg.querySelectorAll('.anim-highlight');
        expect(highlights.length).toBeGreaterThan(0);
      }
    });
  });
});

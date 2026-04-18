import { describe, it, expect } from 'vitest';
import pciDma from './pci-dma.js';
import type { PciDmaState } from './pci-dma.js';

describe('PCI DMA', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(pciDma.config.id).toBe('pci-dma');
      expect(pciDma.config.skillName).toBe('pci-and-dma');
      expect(pciDma.config.title).toBe('PCI Enumeration & DMA Mapping');
    });
  });

  describe('getScenarios', () => {
    it('returns 3 scenarios', () => {
      const scenarios = pciDma.getScenarios();
      expect(scenarios.length).toBe(3);
      expect(scenarios.map(s => s.id)).toContain('pci-enumeration');
      expect(scenarios.map(s => s.id)).toContain('dma-streaming-map');
      expect(scenarios.map(s => s.id)).toContain('dma-coherent-alloc');
    });
  });

  describe('generateFrames - pci-enumeration (default)', () => {
    const frames = pciDma.generateFrames('pci-enumeration');

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

    it('starts in scan phase', () => {
      const data = frames[0].data as PciDmaState;
      expect(data.phase).toBe('scan');
    });

    it('includes detect phase', () => {
      const hasDetect = frames.some(f => {
        const data = f.data as PciDmaState;
        return data.phase === 'detect';
      });
      expect(hasDetect).toBe(true);
    });

    it('includes bar-read phase', () => {
      const hasBarRead = frames.some(f => {
        const data = f.data as PciDmaState;
        return data.phase === 'bar-read';
      });
      expect(hasBarRead).toBe(true);
    });

    it('includes setup phase', () => {
      const hasSetup = frames.some(f => {
        const data = f.data as PciDmaState;
        return data.phase === 'setup';
      });
      expect(hasSetup).toBe(true);
    });

    it('data includes pciDevices array', () => {
      const data = frames[0].data as PciDmaState;
      expect(Array.isArray(data.pciDevices)).toBe(true);
    });

    it('data includes barMappings array', () => {
      const data = frames[0].data as PciDmaState;
      expect(Array.isArray(data.barMappings)).toBe(true);
    });

    it('data includes dmaRegions array', () => {
      const data = frames[0].data as PciDmaState;
      expect(Array.isArray(data.dmaRegions)).toBe(true);
    });

    it('data includes iommuState', () => {
      const data = frames[0].data as PciDmaState;
      expect(data.iommuState).toBeDefined();
    });

    it('data includes busHierarchy', () => {
      const data = frames[0].data as PciDmaState;
      expect(data.busHierarchy).toBeDefined();
    });

    it('data includes srcRef on all frames', () => {
      frames.forEach(f => {
        const data = f.data as PciDmaState;
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });

    it('pciDevices grows during enumeration', () => {
      const firstData = frames[0].data as PciDmaState;
      const laterFrame = frames.find(f => {
        const d = f.data as PciDmaState;
        return d.pciDevices.length > firstData.pciDevices.length;
      });
      expect(laterFrame).toBeDefined();
    });

    it('barMappings populated after BAR read', () => {
      const barFrame = frames.find(f => {
        const d = f.data as PciDmaState;
        return d.barMappings.length > 0;
      });
      expect(barFrame).toBeDefined();
    });

    it('descriptions reference pci_scan_slot', () => {
      const hasRef = frames.some(f => f.description.includes('pci_scan_slot'));
      expect(hasRef).toBe(true);
    });

    it('descriptions reference pci_scan_single_device', () => {
      const hasRef = frames.some(f => f.description.includes('pci_scan_single_device'));
      expect(hasRef).toBe(true);
    });

    it('descriptions reference pci_setup_device', () => {
      const hasRef = frames.some(f => f.description.includes('pci_setup_device'));
      expect(hasRef).toBe(true);
    });

    it('descriptions reference __pci_read_base', () => {
      const hasRef = frames.some(f => f.description.includes('__pci_read_base'));
      expect(hasRef).toBe(true);
    });

    it('descriptions reference pci_read_bases', () => {
      const hasRef = frames.some(f => f.description.includes('pci_read_bases'));
      expect(hasRef).toBe(true);
    });
  });

  describe('generateFrames - default scenario', () => {
    it('returns frames when called without argument', () => {
      const frames = pciDma.generateFrames();
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });
  });

  describe('generateFrames - dma-streaming-map', () => {
    const frames = pciDma.generateFrames('dma-streaming-map');

    it('generates 8-12 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
      expect(frames.length).toBeLessThanOrEqual(12);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('includes map phase', () => {
      const hasMap = frames.some(f => {
        const data = f.data as PciDmaState;
        return data.phase === 'map';
      });
      expect(hasMap).toBe(true);
    });

    it('includes dma-direct phase', () => {
      const hasDirect = frames.some(f => {
        const data = f.data as PciDmaState;
        return data.phase === 'dma-direct';
      });
      expect(hasDirect).toBe(true);
    });

    it('includes unmap phase', () => {
      const hasUnmap = frames.some(f => {
        const data = f.data as PciDmaState;
        return data.phase === 'unmap';
      });
      expect(hasUnmap).toBe(true);
    });

    it('dmaRegions populated after mapping', () => {
      const dmaFrame = frames.find(f => {
        const d = f.data as PciDmaState;
        return d.dmaRegions.length > 0;
      });
      expect(dmaFrame).toBeDefined();
    });

    it('references dma_map_single', () => {
      const hasRef = frames.some(f => f.description.includes('dma_map_single'));
      expect(hasRef).toBe(true);
    });

    it('references dma_map_page_attrs', () => {
      const hasRef = frames.some(f => f.description.includes('dma_map_page_attrs'));
      expect(hasRef).toBe(true);
    });

    it('references dma_direct_map_phys', () => {
      const hasRef = frames.some(f => f.description.includes('dma_direct_map_phys'));
      expect(hasRef).toBe(true);
    });

    it('references swiotlb_map', () => {
      const hasRef = frames.some(f => f.description.includes('swiotlb_map'));
      expect(hasRef).toBe(true);
    });

    it('references dma_unmap_single', () => {
      const hasRef = frames.some(f => f.description.includes('dma_unmap_single'));
      expect(hasRef).toBe(true);
    });

    it('has srcRef on all frames', () => {
      frames.forEach(f => {
        const data = f.data as PciDmaState;
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });
  });

  describe('generateFrames - dma-coherent-alloc', () => {
    const frames = pciDma.generateFrames('dma-coherent-alloc');

    it('generates 8-12 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
      expect(frames.length).toBeLessThanOrEqual(12);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('includes alloc phase', () => {
      const hasAlloc = frames.some(f => {
        const data = f.data as PciDmaState;
        return data.phase === 'alloc';
      });
      expect(hasAlloc).toBe(true);
    });

    it('includes alloc-direct phase', () => {
      const hasDirect = frames.some(f => {
        const data = f.data as PciDmaState;
        return data.phase === 'alloc-direct';
      });
      expect(hasDirect).toBe(true);
    });

    it('references dma_alloc_coherent', () => {
      const hasRef = frames.some(f => f.description.includes('dma_alloc_coherent'));
      expect(hasRef).toBe(true);
    });

    it('references dma_alloc_attrs', () => {
      const hasRef = frames.some(f => f.description.includes('dma_alloc_attrs'));
      expect(hasRef).toBe(true);
    });

    it('references dma_direct_alloc', () => {
      const hasRef = frames.some(f => f.description.includes('dma_direct_alloc'));
      expect(hasRef).toBe(true);
    });

    it('references iommu_dma_alloc', () => {
      const hasRef = frames.some(f => f.description.includes('iommu_dma_alloc'));
      expect(hasRef).toBe(true);
    });

    it('dmaRegions populated after allocation', () => {
      const dmaFrame = frames.find(f => {
        const d = f.data as PciDmaState;
        return d.dmaRegions.length > 0;
      });
      expect(dmaFrame).toBeDefined();
    });

    it('has srcRef on all frames', () => {
      frames.forEach(f => {
        const data = f.data as PciDmaState;
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });
  });

  describe('renderFrame', () => {
    it('renders title text', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = pciDma.generateFrames('pci-enumeration');
      pciDma.renderFrame(svg, frames[0], 900, 480);
      const title = svg.querySelector('.anim-title');
      expect(title).not.toBeNull();
    });

    it('renders phase blocks', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = pciDma.generateFrames('pci-enumeration');
      pciDma.renderFrame(svg, frames[3], 900, 480);
      const blocks = svg.querySelectorAll('.anim-block');
      expect(blocks.length).toBeGreaterThan(0);
    });

    it('renders bus hierarchy elements', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = pciDma.generateFrames('pci-enumeration');
      pciDma.renderFrame(svg, frames[4], 900, 480);
      const busElements = svg.querySelectorAll('.anim-bus');
      expect(busElements.length).toBeGreaterThan(0);
    });

    it('renders device entries', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = pciDma.generateFrames('pci-enumeration');
      const devFrame = frames.find(f => {
        const d = f.data as PciDmaState;
        return d.pciDevices.length > 0;
      });
      if (devFrame) {
        pciDma.renderFrame(svg, devFrame, 900, 480);
        const devEntries = svg.querySelectorAll('.anim-device');
        expect(devEntries.length).toBeGreaterThan(0);
      }
    });

    it('renders BAR mapping indicators', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = pciDma.generateFrames('pci-enumeration');
      const barFrame = frames.find(f => {
        const d = f.data as PciDmaState;
        return d.barMappings.length > 0;
      });
      if (barFrame) {
        pciDma.renderFrame(svg, barFrame, 900, 480);
        const barEntries = svg.querySelectorAll('.anim-bar');
        expect(barEntries.length).toBeGreaterThan(0);
      }
    });

    it('renders DMA region indicators for streaming scenario', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = pciDma.generateFrames('dma-streaming-map');
      const dmaFrame = frames.find(f => {
        const d = f.data as PciDmaState;
        return d.dmaRegions.length > 0;
      });
      if (dmaFrame) {
        pciDma.renderFrame(svg, dmaFrame, 900, 480);
        const dmaEntries = svg.querySelectorAll('.anim-dma');
        expect(dmaEntries.length).toBeGreaterThan(0);
      }
    });

    it('clears previous content on re-render', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = pciDma.generateFrames('pci-enumeration');
      pciDma.renderFrame(svg, frames[0], 900, 480);
      const countBefore = svg.childElementCount;
      pciDma.renderFrame(svg, frames[1], 900, 480);
      expect(svg.childElementCount).toBeLessThanOrEqual(countBefore + 10);
    });
  });
});

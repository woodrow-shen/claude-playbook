import { describe, it, expect } from 'vitest';
import cryptoApi from './crypto-api.js';
import type { CryptoApiState } from './crypto-api.js';

describe('Crypto API', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(cryptoApi.config.id).toBe('crypto-api');
      expect(cryptoApi.config.skillName).toBe('crypto-api');
      expect(cryptoApi.config.title).toBe('Kernel Crypto API');
    });
  });

  describe('getScenarios', () => {
    it('returns 3 scenarios', () => {
      const scenarios = cryptoApi.getScenarios();
      expect(scenarios.length).toBe(3);
      expect(scenarios.map(s => s.id)).toContain('algorithm-lookup');
      expect(scenarios.map(s => s.id)).toContain('skcipher-encrypt');
      expect(scenarios.map(s => s.id)).toContain('template-instantiation');
    });
  });

  describe('generateFrames - algorithm-lookup (default)', () => {
    const frames = cryptoApi.generateFrames('algorithm-lookup');

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
      const data = frames[0].data as CryptoApiState;
      expect(data.phase).toBe('lookup');
    });

    it('includes allocate phase', () => {
      const hasAllocate = frames.some(f => {
        const data = f.data as CryptoApiState;
        return data.phase === 'allocate';
      });
      expect(hasAllocate).toBe(true);
    });

    it('includes init phase', () => {
      const hasInit = frames.some(f => {
        const data = f.data as CryptoApiState;
        return data.phase === 'init';
      });
      expect(hasInit).toBe(true);
    });

    it('data includes algorithm name', () => {
      const data = frames[0].data as CryptoApiState;
      expect(data.algorithm).toBeDefined();
      expect(data.algorithm.length).toBeGreaterThan(0);
    });

    it('data includes tfm state', () => {
      const data = frames[0].data as CryptoApiState;
      expect(data.tfm).toBeDefined();
    });

    it('data includes scatterlist array', () => {
      const data = frames[0].data as CryptoApiState;
      expect(Array.isArray(data.scatterlist)).toBe(true);
    });

    it('data includes blockSize', () => {
      const data = frames[0].data as CryptoApiState;
      expect(data.blockSize).toBeDefined();
    });

    it('data includes keySize', () => {
      const data = frames[0].data as CryptoApiState;
      expect(data.keySize).toBeDefined();
    });

    it('data includes cipherMode', () => {
      const data = frames[0].data as CryptoApiState;
      expect(data.cipherMode).toBeDefined();
    });

    it('data includes srcRef', () => {
      const data = frames[0].data as CryptoApiState;
      expect(data.srcRef).toBeDefined();
      expect(data.srcRef.length).toBeGreaterThan(0);
    });

    it('srcRef references real kernel source files on all frames', () => {
      frames.forEach(f => {
        const data = f.data as CryptoApiState;
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });

    it('references crypto_alg_lookup', () => {
      const hasRef = frames.some(f => f.description.includes('crypto_alg_lookup'));
      expect(hasRef).toBe(true);
    });

    it('references crypto_find_alg', () => {
      const hasRef = frames.some(f => f.description.includes('crypto_find_alg'));
      expect(hasRef).toBe(true);
    });

    it('references crypto_alloc_tfm', () => {
      const hasRef = frames.some(f =>
        f.description.includes('crypto_alloc_tfm') ||
        f.description.includes('crypto_alloc_tfm_node')
      );
      expect(hasRef).toBe(true);
    });

    it('references crypto_create_tfm_node', () => {
      const hasRef = frames.some(f => f.description.includes('crypto_create_tfm_node'));
      expect(hasRef).toBe(true);
    });

    it('sets tfm to allocated by end', () => {
      const lastData = frames[frames.length - 1].data as CryptoApiState;
      expect(lastData.tfm).not.toBe('none');
    });
  });

  describe('generateFrames - default scenario', () => {
    it('returns frames when called without argument', () => {
      const frames = cryptoApi.generateFrames();
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });
  });

  describe('generateFrames - skcipher-encrypt', () => {
    const frames = cryptoApi.generateFrames('skcipher-encrypt');

    it('generates 8-12 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
      expect(frames.length).toBeLessThanOrEqual(12);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('includes encrypt phase', () => {
      const hasEncrypt = frames.some(f => {
        const data = f.data as CryptoApiState;
        return data.phase === 'encrypt';
      });
      expect(hasEncrypt).toBe(true);
    });

    it('includes walk phase', () => {
      const hasWalk = frames.some(f => {
        const data = f.data as CryptoApiState;
        return data.phase === 'walk';
      });
      expect(hasWalk).toBe(true);
    });

    it('references crypto_skcipher_encrypt', () => {
      const hasRef = frames.some(f => f.description.includes('crypto_skcipher_encrypt'));
      expect(hasRef).toBe(true);
    });

    it('references skcipher_walk_first', () => {
      const hasRef = frames.some(f => f.description.includes('skcipher_walk_first'));
      expect(hasRef).toBe(true);
    });

    it('references skcipher_walk_done', () => {
      const hasRef = frames.some(f => f.description.includes('skcipher_walk_done'));
      expect(hasRef).toBe(true);
    });

    it('mentions scatterlist', () => {
      const hasRef = frames.some(f =>
        f.description.toLowerCase().includes('scatterlist') ||
        f.description.toLowerCase().includes('scatter')
      );
      expect(hasRef).toBe(true);
    });

    it('scatterlist has entries during walk', () => {
      const walkFrame = frames.find(f => {
        const data = f.data as CryptoApiState;
        return data.phase === 'walk';
      });
      expect(walkFrame).toBeDefined();
      const data = walkFrame!.data as CryptoApiState;
      expect(data.scatterlist.length).toBeGreaterThan(0);
    });

    it('has srcRef on all frames', () => {
      frames.forEach(f => {
        const data = f.data as CryptoApiState;
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });

    it('reaches complete phase by end', () => {
      const lastData = frames[frames.length - 1].data as CryptoApiState;
      expect(lastData.phase).toBe('complete');
    });
  });

  describe('generateFrames - template-instantiation', () => {
    const frames = cryptoApi.generateFrames('template-instantiation');

    it('generates 8-12 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
      expect(frames.length).toBeLessThanOrEqual(12);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('includes template phase', () => {
      const hasTemplate = frames.some(f => {
        const data = f.data as CryptoApiState;
        return data.phase === 'template';
      });
      expect(hasTemplate).toBe(true);
    });

    it('includes instantiate phase', () => {
      const hasInstantiate = frames.some(f => {
        const data = f.data as CryptoApiState;
        return data.phase === 'instantiate';
      });
      expect(hasInstantiate).toBe(true);
    });

    it('references crypto_lookup_template', () => {
      const hasRef = frames.some(f => f.description.includes('crypto_lookup_template'));
      expect(hasRef).toBe(true);
    });

    it('references tmpl->create', () => {
      const hasRef = frames.some(f => f.description.includes('tmpl->create'));
      expect(hasRef).toBe(true);
    });

    it('references crypto_register_instance', () => {
      const hasRef = frames.some(f => f.description.includes('crypto_register_instance'));
      expect(hasRef).toBe(true);
    });

    it('mentions cbc(aes) composition', () => {
      const hasRef = frames.some(f =>
        f.description.includes('cbc(aes)') ||
        f.label.includes('cbc(aes)')
      );
      expect(hasRef).toBe(true);
    });

    it('cipherMode reflects template composition', () => {
      const templateFrame = frames.find(f => {
        const data = f.data as CryptoApiState;
        return data.phase === 'template';
      });
      expect(templateFrame).toBeDefined();
      const data = templateFrame!.data as CryptoApiState;
      expect(data.cipherMode).toContain('cbc');
    });

    it('has srcRef on all frames', () => {
      frames.forEach(f => {
        const data = f.data as CryptoApiState;
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });

    it('reaches register phase by end', () => {
      const lastData = frames[frames.length - 1].data as CryptoApiState;
      expect(lastData.phase).toBe('register');
    });
  });

  describe('renderFrame', () => {
    it('renders title text', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = cryptoApi.generateFrames('algorithm-lookup');
      cryptoApi.renderFrame(svg, frames[0], 900, 480);
      const title = svg.querySelector('.anim-title');
      expect(title).not.toBeNull();
    });

    it('renders phase blocks', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = cryptoApi.generateFrames('algorithm-lookup');
      cryptoApi.renderFrame(svg, frames[3], 900, 480);
      const blocks = svg.querySelectorAll('.anim-block');
      expect(blocks.length).toBeGreaterThan(0);
    });

    it('renders algorithm display', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = cryptoApi.generateFrames('algorithm-lookup');
      cryptoApi.renderFrame(svg, frames[0], 900, 480);
      const algElems = svg.querySelectorAll('.anim-register');
      expect(algElems.length).toBeGreaterThan(0);
    });

    it('renders scatterlist entries for skcipher-encrypt', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = cryptoApi.generateFrames('skcipher-encrypt');
      const walkFrame = frames.find(f => {
        const data = f.data as CryptoApiState;
        return data.phase === 'walk';
      });
      if (walkFrame) {
        cryptoApi.renderFrame(svg, walkFrame, 900, 480);
        const stackEntries = svg.querySelectorAll('.anim-stack-frame');
        expect(stackEntries.length).toBeGreaterThan(0);
      }
    });

    it('clears previous content on re-render', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = cryptoApi.generateFrames('algorithm-lookup');
      cryptoApi.renderFrame(svg, frames[0], 900, 480);
      const countBefore = svg.childElementCount;
      cryptoApi.renderFrame(svg, frames[1], 900, 480);
      expect(svg.childElementCount).toBeLessThanOrEqual(countBefore + 10);
    });

    it('renders highlight for active phase', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = cryptoApi.generateFrames('algorithm-lookup');
      cryptoApi.renderFrame(svg, frames[3], 900, 480);
      const highlights = svg.querySelectorAll('.anim-highlight');
      expect(highlights.length).toBeGreaterThan(0);
    });
  });
});

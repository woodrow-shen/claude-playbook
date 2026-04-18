import { describe, it, expect } from 'vitest';
import networkPacket from './network-packet.js';

interface SkbPointers {
  head: number;
  data: number;
  tail: number;
  end: number;
}

interface ProtocolHeader {
  name: string;
  size: number;
  fields: Array<{ name: string; value: string }>;
  state: 'absent' | 'building' | 'present' | 'processing' | 'removed';
}

interface NetworkLayer {
  name: string;
  function: string;
  state: 'idle' | 'active' | 'done';
}

interface PacketState {
  direction: 'send' | 'receive';
  skb: SkbPointers;
  headers: ProtocolHeader[];
  payload: string;
  layers: NetworkLayer[];
  currentLayer: number;
  phase: string;
}

describe('NetworkPacket', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(networkPacket.config.id).toBe('network-packet');
      expect(networkPacket.config.skillName).toBe('socket-layer');
    });

    it('has a title', () => {
      expect(networkPacket.config.title).toBeTruthy();
    });
  });

  describe('getScenarios', () => {
    it('returns 3 scenarios', () => {
      expect(networkPacket.getScenarios().length).toBe(3);
    });

    it('each scenario has id and label', () => {
      for (const s of networkPacket.getScenarios()) {
        expect(s.id).toBeTruthy();
        expect(s.label).toBeTruthy();
      }
    });

    it('includes tcp-send, tcp-receive, and skb-lifecycle scenarios', () => {
      const ids = networkPacket.getScenarios().map(s => s.id);
      expect(ids).toContain('tcp-send');
      expect(ids).toContain('tcp-receive');
      expect(ids).toContain('skb-lifecycle');
    });
  });

  describe('generateFrames - common', () => {
    it('returns frames for default scenario', () => {
      const frames = networkPacket.generateFrames();
      expect(frames.length).toBeGreaterThan(0);
    });

    for (const scenarioId of ['tcp-send', 'tcp-receive', 'skb-lifecycle']) {
      it(`${scenarioId}: returns non-empty array`, () => {
        const frames = networkPacket.generateFrames(scenarioId);
        expect(frames.length).toBeGreaterThan(0);
      });

      it(`${scenarioId}: first frame step=0`, () => {
        const frames = networkPacket.generateFrames(scenarioId);
        expect(frames[0].step).toBe(0);
      });

      it(`${scenarioId}: sequential steps`, () => {
        const frames = networkPacket.generateFrames(scenarioId);
        frames.forEach((f, i) => expect(f.step).toBe(i));
      });

      it(`${scenarioId}: at least 10 frames`, () => {
        const frames = networkPacket.generateFrames(scenarioId);
        expect(frames.length).toBeGreaterThanOrEqual(10);
      });

      it(`${scenarioId}: each frame has required fields`, () => {
        const frames = networkPacket.generateFrames(scenarioId);
        for (const f of frames) {
          expect(f.step).toBeGreaterThanOrEqual(0);
          expect(f.label).toBeTruthy();
          expect(f.description).toBeTruthy();
          expect(Array.isArray(f.highlights)).toBe(true);
        }
      });

      it(`${scenarioId}: data includes skb pointers`, () => {
        const frames = networkPacket.generateFrames(scenarioId);
        for (const f of frames) {
          const data = f.data as PacketState;
          expect(data.skb).toBeDefined();
          expect(typeof data.skb.head).toBe('number');
          expect(typeof data.skb.data).toBe('number');
          expect(typeof data.skb.tail).toBe('number');
          expect(typeof data.skb.end).toBe('number');
        }
      });

      it(`${scenarioId}: data includes headers array`, () => {
        const frames = networkPacket.generateFrames(scenarioId);
        for (const f of frames) {
          const data = f.data as PacketState;
          expect(Array.isArray(data.headers)).toBe(true);
        }
      });

      it(`${scenarioId}: data includes layers array`, () => {
        const frames = networkPacket.generateFrames(scenarioId);
        for (const f of frames) {
          const data = f.data as PacketState;
          expect(Array.isArray(data.layers)).toBe(true);
          expect(data.layers.length).toBeGreaterThan(0);
        }
      });
    }
  });

  describe('generateFrames - tcp-send', () => {
    const frames = networkPacket.generateFrames('tcp-send');

    it('direction is send', () => {
      for (const f of frames) {
        const data = f.data as PacketState;
        expect(data.direction).toBe('send');
      }
    });

    it('layers include TCP, IP, and Device', () => {
      const allLayerNames = new Set<string>();
      for (const f of frames) {
        const data = f.data as PacketState;
        for (const layer of data.layers) {
          allLayerNames.add(layer.name);
        }
      }
      expect(allLayerNames.has('TCP')).toBe(true);
      expect(allLayerNames.has('IP')).toBe(true);
      expect(allLayerNames.has('Device')).toBe(true);
    });

    it('headers are progressively added', () => {
      const firstData = frames[0].data as PacketState;
      const lastData = frames[frames.length - 1].data as PacketState;
      const firstPresent = firstData.headers.filter(h => h.state === 'present').length;
      const lastPresent = lastData.headers.filter(
        h => h.state === 'present' || h.state === 'building'
      ).length;
      expect(lastPresent).toBeGreaterThan(firstPresent);
    });

    it('skb data pointer moves as headers are pushed', () => {
      const firstData = frames[0].data as PacketState;
      const lastData = frames[frames.length - 1].data as PacketState;
      // For send, data pointer moves left (smaller) as headers are pushed
      expect(lastData.skb.data).toBeLessThanOrEqual(firstData.skb.data);
    });
  });

  describe('generateFrames - tcp-receive', () => {
    const frames = networkPacket.generateFrames('tcp-receive');

    it('direction is receive', () => {
      for (const f of frames) {
        const data = f.data as PacketState;
        expect(data.direction).toBe('receive');
      }
    });

    it('has NIC layer active at some point', () => {
      const hasActiveNIC = frames.some(f => {
        const data = f.data as PacketState;
        return data.layers.some(l => l.name === 'NIC' && l.state === 'active');
      });
      expect(hasActiveNIC).toBe(true);
    });

    it('headers are progressively removed', () => {
      // At some point headers should transition to removed state
      const hasRemovedHeaders = frames.some(f => {
        const data = f.data as PacketState;
        return data.headers.some(h => h.state === 'removed');
      });
      expect(hasRemovedHeaders).toBe(true);
    });
  });

  describe('generateFrames - skb-lifecycle', () => {
    const frames = networkPacket.generateFrames('skb-lifecycle');

    it('has frames showing skb pointer changes', () => {
      const pointerValues = frames.map(f => {
        const data = f.data as PacketState;
        return `${data.skb.head}-${data.skb.data}-${data.skb.tail}-${data.skb.end}`;
      });
      const uniqueValues = new Set(pointerValues);
      // Should have multiple distinct pointer states
      expect(uniqueValues.size).toBeGreaterThan(3);
    });

    it('includes alloc and free phases', () => {
      const phases = frames.map(f => (f.data as PacketState).phase);
      const hasAlloc = phases.some(p => p.toLowerCase().includes('alloc'));
      const hasFree = phases.some(p => p.toLowerCase().includes('free'));
      expect(hasAlloc).toBe(true);
      expect(hasFree).toBe(true);
    });
  });

  describe('renderFrame', () => {
    it('renders SVG elements into container', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = networkPacket.generateFrames('tcp-send');
      networkPacket.renderFrame(svg, frames[0], 900, 480);
      expect(svg.querySelectorAll('rect').length).toBeGreaterThan(0);
    });

    it('renders different content for different frames', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = networkPacket.generateFrames('tcp-send');
      networkPacket.renderFrame(svg, frames[0], 900, 480);
      const html1 = svg.innerHTML;
      networkPacket.renderFrame(svg, frames[frames.length - 1], 900, 480);
      const html2 = svg.innerHTML;
      expect(html1).not.toBe(html2);
    });

    it('applies highlight classes to active elements', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = networkPacket.generateFrames('tcp-send');
      const frameWithHighlights = frames.find(f => f.highlights.length > 0);
      if (frameWithHighlights) {
        networkPacket.renderFrame(svg, frameWithHighlights, 900, 480);
        expect(svg.querySelectorAll('.anim-highlight').length).toBeGreaterThan(0);
      }
    });

    it('renders protocol stack layer labels', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = networkPacket.generateFrames('tcp-send');
      networkPacket.renderFrame(svg, frames[0], 900, 480);
      const texts = Array.from(svg.querySelectorAll('text')).map(t => t.textContent);
      expect(texts.some(t => t?.includes('TCP'))).toBe(true);
    });

    it('renders skb buffer visualization', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = networkPacket.generateFrames('tcp-send');
      networkPacket.renderFrame(svg, frames[3], 900, 480);
      const texts = Array.from(svg.querySelectorAll('text')).map(t => t.textContent);
      // Should have pointer labels
      expect(texts.some(t => t?.includes('head') || t?.includes('data') || t?.includes('tail'))).toBe(true);
    });

    it('clears container before rendering', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = networkPacket.generateFrames('tcp-send');
      networkPacket.renderFrame(svg, frames[0], 900, 480);
      const countBefore = svg.childNodes.length;
      networkPacket.renderFrame(svg, frames[0], 900, 480);
      const countAfter = svg.childNodes.length;
      expect(countAfter).toBe(countBefore);
    });
  });
});

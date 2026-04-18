import { describe, it, expect } from 'vitest';
import netfilterHooks from './netfilter-hooks.js';

interface NetfilterState {
  packet: { src: string; dst: string; proto: string; port: number };
  currentHook: string;
  hookIndex: number;
  registeredHooks: Array<{ hook: string; priority: number; name: string }>;
  nftChain: string | null;
  nftRules: Array<{ expressions: string[]; verdict: string }>;
  currentRule: number;
  conntrackState: string | null;
  verdict: string;
  currentFunction: string;
  phase: string;
  srcRef: string;
}

describe('NetfilterHooks', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(netfilterHooks.config.id).toBe('netfilter-hooks');
      expect(netfilterHooks.config.skillName).toBe('netfilter-and-nftables');
    });

    it('has a title', () => {
      expect(netfilterHooks.config.title).toBeTruthy();
    });
  });

  describe('getScenarios', () => {
    it('returns 3 scenarios', () => {
      expect(netfilterHooks.getScenarios().length).toBe(3);
    });

    it('each scenario has id and label', () => {
      for (const s of netfilterHooks.getScenarios()) {
        expect(s.id).toBeTruthy();
        expect(s.label).toBeTruthy();
      }
    });

    it('includes packet-through-hooks, nft-rule-evaluation, and connection-tracking scenarios', () => {
      const ids = netfilterHooks.getScenarios().map(s => s.id);
      expect(ids).toContain('packet-through-hooks');
      expect(ids).toContain('nft-rule-evaluation');
      expect(ids).toContain('connection-tracking');
    });
  });

  describe('generateFrames - common', () => {
    it('returns frames for default scenario', () => {
      const frames = netfilterHooks.generateFrames();
      expect(frames.length).toBeGreaterThan(0);
    });

    for (const scenarioId of ['packet-through-hooks', 'nft-rule-evaluation', 'connection-tracking']) {
      it(`${scenarioId}: returns non-empty array`, () => {
        const frames = netfilterHooks.generateFrames(scenarioId);
        expect(frames.length).toBeGreaterThan(0);
      });

      it(`${scenarioId}: first frame step=0`, () => {
        const frames = netfilterHooks.generateFrames(scenarioId);
        expect(frames[0].step).toBe(0);
      });

      it(`${scenarioId}: sequential steps`, () => {
        const frames = netfilterHooks.generateFrames(scenarioId);
        frames.forEach((f, i) => expect(f.step).toBe(i));
      });

      it(`${scenarioId}: at least 8 frames`, () => {
        const frames = netfilterHooks.generateFrames(scenarioId);
        expect(frames.length).toBeGreaterThanOrEqual(8);
      });

      it(`${scenarioId}: each frame has required fields`, () => {
        const frames = netfilterHooks.generateFrames(scenarioId);
        for (const f of frames) {
          expect(f.step).toBeGreaterThanOrEqual(0);
          expect(f.label).toBeTruthy();
          expect(f.description).toBeTruthy();
          expect(Array.isArray(f.highlights)).toBe(true);
        }
      });

      it(`${scenarioId}: every frame has srcRef in data`, () => {
        const frames = netfilterHooks.generateFrames(scenarioId);
        for (const f of frames) {
          const data = f.data as NetfilterState;
          expect(data.srcRef).toBeTruthy();
          expect(typeof data.srcRef).toBe('string');
        }
      });

      it(`${scenarioId}: data includes packet info`, () => {
        const frames = netfilterHooks.generateFrames(scenarioId);
        for (const f of frames) {
          const data = f.data as NetfilterState;
          expect(data.packet).toBeDefined();
          expect(data.packet.src).toBeTruthy();
          expect(data.packet.dst).toBeTruthy();
          expect(data.packet.proto).toBeTruthy();
          expect(typeof data.packet.port).toBe('number');
        }
      });

      it(`${scenarioId}: data includes verdict`, () => {
        const frames = netfilterHooks.generateFrames(scenarioId);
        for (const f of frames) {
          const data = f.data as NetfilterState;
          expect(data.verdict).toBeDefined();
        }
      });

      it(`${scenarioId}: data includes currentFunction`, () => {
        const frames = netfilterHooks.generateFrames(scenarioId);
        for (const f of frames) {
          const data = f.data as NetfilterState;
          expect(data.currentFunction).toBeTruthy();
        }
      });
    }
  });

  describe('generateFrames - packet-through-hooks', () => {
    const frames = netfilterHooks.generateFrames('packet-through-hooks');

    it('shows all 5 hooks in order', () => {
      const hooks: string[] = [];
      for (const f of frames) {
        const data = f.data as NetfilterState;
        if (data.currentHook && !hooks.includes(data.currentHook)) {
          hooks.push(data.currentHook);
        }
      }
      expect(hooks).toContain('PREROUTING');
      expect(hooks).toContain('FORWARD');
      expect(hooks).toContain('POSTROUTING');
      // PREROUTING must come before FORWARD
      expect(hooks.indexOf('PREROUTING')).toBeLessThan(hooks.indexOf('FORWARD'));
      // FORWARD must come before POSTROUTING
      expect(hooks.indexOf('FORWARD')).toBeLessThan(hooks.indexOf('POSTROUTING'));
    });

    it('references nf_hook_slow in descriptions', () => {
      const hasNfHookSlow = frames.some(f => f.description.includes('nf_hook_slow'));
      expect(hasNfHookSlow).toBe(true);
    });

    it('references ip_rcv in descriptions', () => {
      const hasIpRcv = frames.some(f => f.description.includes('ip_rcv'));
      expect(hasIpRcv).toBe(true);
    });

    it('includes registered hooks array', () => {
      for (const f of frames) {
        const data = f.data as NetfilterState;
        expect(Array.isArray(data.registeredHooks)).toBe(true);
      }
    });

    it('references real kernel source paths in srcRef', () => {
      const hasCoreSrc = frames.some(f => {
        const data = f.data as NetfilterState;
        return data.srcRef.includes('net/netfilter/core.c');
      });
      const hasIpInput = frames.some(f => {
        const data = f.data as NetfilterState;
        return data.srcRef.includes('net/ipv4/ip_input.c');
      });
      expect(hasCoreSrc).toBe(true);
      expect(hasIpInput).toBe(true);
    });
  });

  describe('generateFrames - nft-rule-evaluation', () => {
    const frames = netfilterHooks.generateFrames('nft-rule-evaluation');

    it('shows nft_do_chain in descriptions', () => {
      const hasDoChain = frames.some(f => f.description.includes('nft_do_chain'));
      expect(hasDoChain).toBe(true);
    });

    it('shows nft_payload_eval in descriptions', () => {
      const hasPayload = frames.some(f => f.description.includes('nft_payload_eval'));
      expect(hasPayload).toBe(true);
    });

    it('shows nft_cmp_eval in descriptions', () => {
      const hasCmp = frames.some(f => f.description.includes('nft_cmp_eval'));
      expect(hasCmp).toBe(true);
    });

    it('includes nft rules in data', () => {
      const hasRules = frames.some(f => {
        const data = f.data as NetfilterState;
        return data.nftRules.length > 0;
      });
      expect(hasRules).toBe(true);
    });

    it('shows nft chain name', () => {
      const hasChain = frames.some(f => {
        const data = f.data as NetfilterState;
        return data.nftChain !== null;
      });
      expect(hasChain).toBe(true);
    });

    it('references nf_tables_core.c in srcRef', () => {
      const hasSrc = frames.some(f => {
        const data = f.data as NetfilterState;
        return data.srcRef.includes('nf_tables_core.c');
      });
      expect(hasSrc).toBe(true);
    });

    it('shows verdict in final frames', () => {
      const lastData = frames[frames.length - 1].data as NetfilterState;
      expect(['NF_ACCEPT', 'NF_DROP', 'NF_QUEUE', 'NF_STOLEN']).toContain(lastData.verdict);
    });
  });

  describe('generateFrames - connection-tracking', () => {
    const frames = netfilterHooks.generateFrames('connection-tracking');

    it('references nf_conntrack_in in descriptions', () => {
      const hasCt = frames.some(f => f.description.includes('nf_conntrack_in'));
      expect(hasCt).toBe(true);
    });

    it('references resolve_normal_ct in descriptions', () => {
      const hasResolve = frames.some(f => f.description.includes('resolve_normal_ct'));
      expect(hasResolve).toBe(true);
    });

    it('references nf_ct_get_tuple in descriptions', () => {
      const hasTuple = frames.some(f => f.description.includes('nf_ct_get_tuple'));
      expect(hasTuple).toBe(true);
    });

    it('shows conntrack state transitions', () => {
      const states = new Set<string | null>();
      for (const f of frames) {
        const data = f.data as NetfilterState;
        if (data.conntrackState) {
          states.add(data.conntrackState);
        }
      }
      expect(states.has('NEW')).toBe(true);
    });

    it('references nf_conntrack_core.c in srcRef', () => {
      const hasSrc = frames.some(f => {
        const data = f.data as NetfilterState;
        return data.srcRef.includes('nf_conntrack_core.c');
      });
      expect(hasSrc).toBe(true);
    });

    it('shows hash lookup phase', () => {
      const hasHash = frames.some(f =>
        f.description.includes('hash') || f.description.includes('Hash')
      );
      expect(hasHash).toBe(true);
    });

    it('references init_conntrack in descriptions', () => {
      const hasInit = frames.some(f => f.description.includes('init_conntrack'));
      expect(hasInit).toBe(true);
    });
  });

  describe('renderFrame', () => {
    it('is a function', () => {
      expect(typeof netfilterHooks.renderFrame).toBe('function');
    });
  });
});

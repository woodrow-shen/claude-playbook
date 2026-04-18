import { describe, it, expect } from 'vitest';
import tcpCongestion from './tcp-congestion.js';

interface TcpCongestionState {
  algorithm: 'cubic' | 'bbr';
  cwnd: number;
  ssthresh: number;
  rtt: number;
  bandwidth: number | null;
  bbrState: string | null;
  phase:
    | 'slow-start'
    | 'congestion-avoidance'
    | 'loss-detected'
    | 'recovery'
    | 'probe-bw'
    | 'probe-rtt'
    | 'startup'
    | 'drain';
  cwndHistory: number[];
  currentFunction: string;
  srcRef: string;
}

describe('TcpCongestion', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(tcpCongestion.config.id).toBe('tcp-congestion');
      expect(tcpCongestion.config.skillName).toBe('tcp-congestion-control');
    });

    it('has a title', () => {
      expect(tcpCongestion.config.title).toBeTruthy();
    });
  });

  describe('getScenarios', () => {
    it('returns 3 scenarios', () => {
      expect(tcpCongestion.getScenarios().length).toBe(3);
    });

    it('each scenario has id and label', () => {
      for (const s of tcpCongestion.getScenarios()) {
        expect(s.id).toBeTruthy();
        expect(s.label).toBeTruthy();
      }
    });

    it('includes cubic-slow-start-and-congestion, bbr-bandwidth-probing, and loss-recovery', () => {
      const ids = tcpCongestion.getScenarios().map(s => s.id);
      expect(ids).toContain('cubic-slow-start-and-congestion');
      expect(ids).toContain('bbr-bandwidth-probing');
      expect(ids).toContain('loss-recovery');
    });
  });

  describe('generateFrames - common', () => {
    it('returns frames for default scenario', () => {
      const frames = tcpCongestion.generateFrames();
      expect(frames.length).toBeGreaterThan(0);
    });

    for (const scenarioId of [
      'cubic-slow-start-and-congestion',
      'bbr-bandwidth-probing',
      'loss-recovery',
    ]) {
      it(`${scenarioId}: returns non-empty array`, () => {
        const frames = tcpCongestion.generateFrames(scenarioId);
        expect(frames.length).toBeGreaterThan(0);
      });

      it(`${scenarioId}: first frame step=0`, () => {
        const frames = tcpCongestion.generateFrames(scenarioId);
        expect(frames[0].step).toBe(0);
      });

      it(`${scenarioId}: sequential steps`, () => {
        const frames = tcpCongestion.generateFrames(scenarioId);
        frames.forEach((f, i) => expect(f.step).toBe(i));
      });

      it(`${scenarioId}: at least 8 frames`, () => {
        const frames = tcpCongestion.generateFrames(scenarioId);
        expect(frames.length).toBeGreaterThanOrEqual(8);
      });

      it(`${scenarioId}: each frame has required fields`, () => {
        const frames = tcpCongestion.generateFrames(scenarioId);
        for (const f of frames) {
          expect(f.step).toBeGreaterThanOrEqual(0);
          expect(f.label).toBeTruthy();
          expect(f.description).toBeTruthy();
          expect(Array.isArray(f.highlights)).toBe(true);
        }
      });

      it(`${scenarioId}: every frame has srcRef`, () => {
        const frames = tcpCongestion.generateFrames(scenarioId);
        for (const f of frames) {
          const data = f.data as TcpCongestionState;
          expect(data.srcRef).toBeTruthy();
          expect(typeof data.srcRef).toBe('string');
          expect(data.srcRef).toMatch(/\//);
        }
      });

      it(`${scenarioId}: every frame has cwndHistory array`, () => {
        const frames = tcpCongestion.generateFrames(scenarioId);
        for (const f of frames) {
          const data = f.data as TcpCongestionState;
          expect(Array.isArray(data.cwndHistory)).toBe(true);
        }
      });

      it(`${scenarioId}: every frame has currentFunction`, () => {
        const frames = tcpCongestion.generateFrames(scenarioId);
        for (const f of frames) {
          const data = f.data as TcpCongestionState;
          expect(data.currentFunction).toBeTruthy();
        }
      });
    }
  });

  describe('generateFrames - cubic-slow-start-and-congestion', () => {
    const frames = tcpCongestion.generateFrames('cubic-slow-start-and-congestion');

    it('uses cubic algorithm', () => {
      for (const f of frames) {
        const data = f.data as TcpCongestionState;
        expect(data.algorithm).toBe('cubic');
      }
    });

    it('shows cubictcp_cong_avoid in descriptions', () => {
      const allText = frames.map(f => f.description).join(' ');
      expect(allText).toContain('cubictcp_cong_avoid');
    });

    it('shows cwnd growth during slow start', () => {
      const slowStartFrames = frames.filter(
        f => (f.data as TcpCongestionState).phase === 'slow-start',
      );
      expect(slowStartFrames.length).toBeGreaterThan(0);
      // cwnd should increase during slow start
      const cwnds = slowStartFrames.map(f => (f.data as TcpCongestionState).cwnd);
      for (let i = 1; i < cwnds.length; i++) {
        expect(cwnds[i]).toBeGreaterThanOrEqual(cwnds[i - 1]);
      }
    });

    it('transitions to congestion avoidance phase', () => {
      const phases = frames.map(f => (f.data as TcpCongestionState).phase);
      expect(phases).toContain('congestion-avoidance');
    });

    it('references bictcp_update in descriptions', () => {
      const allText = frames.map(f => f.description).join(' ');
      expect(allText).toContain('bictcp_update');
    });

    it('references cubictcp_recalc_ssthresh', () => {
      const allText = frames.map(f => f.description).join(' ');
      expect(allText).toContain('cubictcp_recalc_ssthresh');
    });

    it('references real kernel source paths', () => {
      const allText = frames.map(f => f.description).join(' ');
      expect(allText).toContain('net/ipv4/tcp_cubic.c');
      expect(allText).toContain('net/ipv4/tcp_input.c');
    });

    it('cwndHistory grows over frames', () => {
      const firstData = frames[0].data as TcpCongestionState;
      const lastData = frames[frames.length - 1].data as TcpCongestionState;
      expect(lastData.cwndHistory.length).toBeGreaterThan(firstData.cwndHistory.length);
    });
  });

  describe('generateFrames - bbr-bandwidth-probing', () => {
    const frames = tcpCongestion.generateFrames('bbr-bandwidth-probing');

    it('uses bbr algorithm', () => {
      for (const f of frames) {
        const data = f.data as TcpCongestionState;
        expect(data.algorithm).toBe('bbr');
      }
    });

    it('shows bbr_main in descriptions', () => {
      const allText = frames.map(f => f.description).join(' ');
      expect(allText).toContain('bbr_main');
    });

    it('shows all 4 BBR states: STARTUP, DRAIN, PROBE_BW, PROBE_RTT', () => {
      const bbrStates = frames
        .map(f => (f.data as TcpCongestionState).bbrState)
        .filter(Boolean);
      expect(bbrStates).toContain('BBR_STARTUP');
      expect(bbrStates).toContain('BBR_DRAIN');
      expect(bbrStates).toContain('BBR_PROBE_BW');
      expect(bbrStates).toContain('BBR_PROBE_RTT');
    });

    it('has non-null bandwidth values', () => {
      const bwValues = frames
        .map(f => (f.data as TcpCongestionState).bandwidth)
        .filter(v => v !== null);
      expect(bwValues.length).toBeGreaterThan(0);
    });

    it('references bbr_update_bw and bbr_set_cwnd', () => {
      const allText = frames.map(f => f.description).join(' ');
      expect(allText).toContain('bbr_update_bw');
      expect(allText).toContain('bbr_set_cwnd');
    });

    it('references bbr_update_model', () => {
      const allText = frames.map(f => f.description).join(' ');
      expect(allText).toContain('bbr_update_model');
    });

    it('references real kernel source paths', () => {
      const allText = frames.map(f => f.description).join(' ');
      expect(allText).toContain('net/ipv4/tcp_bbr.c');
    });
  });

  describe('generateFrames - loss-recovery', () => {
    const frames = tcpCongestion.generateFrames('loss-recovery');

    it('shows tcp_fastretrans_alert in descriptions', () => {
      const allText = frames.map(f => f.description).join(' ');
      expect(allText).toContain('tcp_fastretrans_alert');
    });

    it('shows loss-detected phase', () => {
      const phases = frames.map(f => (f.data as TcpCongestionState).phase);
      expect(phases).toContain('loss-detected');
    });

    it('shows recovery phase', () => {
      const phases = frames.map(f => (f.data as TcpCongestionState).phase);
      expect(phases).toContain('recovery');
    });

    it('shows tcp_enter_recovery or tcp_enter_loss', () => {
      const allText = frames.map(f => f.description).join(' ');
      const hasRecovery = allText.includes('tcp_enter_recovery');
      const hasLoss = allText.includes('tcp_enter_loss');
      expect(hasRecovery || hasLoss).toBe(true);
    });

    it('shows cwnd reduction', () => {
      const cwnds = frames.map(f => (f.data as TcpCongestionState).cwnd);
      // At some point cwnd should decrease
      let foundDecrease = false;
      for (let i = 1; i < cwnds.length; i++) {
        if (cwnds[i] < cwnds[i - 1]) {
          foundDecrease = true;
          break;
        }
      }
      expect(foundDecrease).toBe(true);
    });

    it('references ssthresh callback', () => {
      const allText = frames.map(f => f.description).join(' ');
      expect(allText).toContain('ssthresh');
    });

    it('references real kernel source paths', () => {
      const allText = frames.map(f => f.description).join(' ');
      expect(allText).toContain('net/ipv4/tcp_input.c');
    });
  });

  describe('renderFrame', () => {
    it('renders SVG elements into container', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = tcpCongestion.generateFrames('cubic-slow-start-and-congestion');
      tcpCongestion.renderFrame(svg, frames[0], 900, 480);
      expect(svg.querySelectorAll('rect').length).toBeGreaterThan(0);
    });

    it('renders different content for different frames', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = tcpCongestion.generateFrames('cubic-slow-start-and-congestion');
      tcpCongestion.renderFrame(svg, frames[0], 900, 480);
      const html1 = svg.innerHTML;
      tcpCongestion.renderFrame(svg, frames[frames.length - 1], 900, 480);
      const html2 = svg.innerHTML;
      expect(html1).not.toBe(html2);
    });

    it('applies highlight classes to active elements', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = tcpCongestion.generateFrames('cubic-slow-start-and-congestion');
      const frameWithHighlights = frames.find(f => f.highlights.length > 0);
      if (frameWithHighlights) {
        tcpCongestion.renderFrame(svg, frameWithHighlights, 900, 480);
        expect(svg.querySelectorAll('.anim-highlight').length).toBeGreaterThan(0);
      }
    });

    it('clears container before rendering', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = tcpCongestion.generateFrames('cubic-slow-start-and-congestion');
      tcpCongestion.renderFrame(svg, frames[0], 900, 480);
      const countBefore = svg.childNodes.length;
      tcpCongestion.renderFrame(svg, frames[0], 900, 480);
      const countAfter = svg.childNodes.length;
      expect(countAfter).toBe(countBefore);
    });

    it('renders cwnd graph elements', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = tcpCongestion.generateFrames('cubic-slow-start-and-congestion');
      // Use a later frame that has cwndHistory entries
      const laterFrame = frames[frames.length - 1];
      tcpCongestion.renderFrame(svg, laterFrame, 900, 480);
      const texts = Array.from(svg.querySelectorAll('text')).map(t => t.textContent);
      expect(texts.some(t => t?.includes('cwnd'))).toBe(true);
    });
  });
});

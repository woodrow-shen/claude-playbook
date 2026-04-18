import { describe, it, expect } from 'vitest';
import tcpStateMachine from './tcp-state-machine.js';

interface TcpStateMachineState {
  clientState: string;
  serverState: string;
  currentFunction: string;
  packetInFlight: string | null;
  packetDirection: 'client-to-server' | 'server-to-client' | null;
  srcRef: string;
  phase: 'idle' | 'handshake' | 'established' | 'teardown' | 'time-wait' | 'closed';
}

describe('TcpStateMachine', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(tcpStateMachine.config.id).toBe('tcp-state-machine');
      expect(tcpStateMachine.config.skillName).toBe('tcp-state-machine');
    });

    it('has a title', () => {
      expect(tcpStateMachine.config.title).toBeTruthy();
    });
  });

  describe('getScenarios', () => {
    it('returns 3 scenarios', () => {
      expect(tcpStateMachine.getScenarios().length).toBe(3);
    });

    it('each scenario has id and label', () => {
      for (const s of tcpStateMachine.getScenarios()) {
        expect(s.id).toBeTruthy();
        expect(s.label).toBeTruthy();
      }
    });

    it('includes three-way-handshake, connection-teardown, and simultaneous-close', () => {
      const ids = tcpStateMachine.getScenarios().map(s => s.id);
      expect(ids).toContain('three-way-handshake');
      expect(ids).toContain('connection-teardown');
      expect(ids).toContain('simultaneous-close');
    });
  });

  describe('generateFrames - common', () => {
    it('returns frames for default scenario', () => {
      const frames = tcpStateMachine.generateFrames();
      expect(frames.length).toBeGreaterThan(0);
    });

    for (const scenarioId of ['three-way-handshake', 'connection-teardown', 'simultaneous-close']) {
      it(`${scenarioId}: returns non-empty array`, () => {
        const frames = tcpStateMachine.generateFrames(scenarioId);
        expect(frames.length).toBeGreaterThan(0);
      });

      it(`${scenarioId}: first frame step=0`, () => {
        const frames = tcpStateMachine.generateFrames(scenarioId);
        expect(frames[0].step).toBe(0);
      });

      it(`${scenarioId}: sequential steps`, () => {
        const frames = tcpStateMachine.generateFrames(scenarioId);
        frames.forEach((f, i) => expect(f.step).toBe(i));
      });

      it(`${scenarioId}: at least 8 frames`, () => {
        const frames = tcpStateMachine.generateFrames(scenarioId);
        expect(frames.length).toBeGreaterThanOrEqual(8);
      });

      it(`${scenarioId}: each frame has required fields`, () => {
        const frames = tcpStateMachine.generateFrames(scenarioId);
        for (const f of frames) {
          expect(f.step).toBeGreaterThanOrEqual(0);
          expect(f.label).toBeTruthy();
          expect(f.description).toBeTruthy();
          expect(Array.isArray(f.highlights)).toBe(true);
        }
      });

      it(`${scenarioId}: every frame has srcRef`, () => {
        const frames = tcpStateMachine.generateFrames(scenarioId);
        for (const f of frames) {
          const data = f.data as TcpStateMachineState;
          expect(data.srcRef).toBeTruthy();
          expect(typeof data.srcRef).toBe('string');
          // srcRef should reference a kernel file path
          expect(data.srcRef).toMatch(/\//);
        }
      });

      it(`${scenarioId}: every frame has clientState and serverState`, () => {
        const frames = tcpStateMachine.generateFrames(scenarioId);
        for (const f of frames) {
          const data = f.data as TcpStateMachineState;
          expect(data.clientState).toBeTruthy();
          expect(data.serverState).toBeTruthy();
          expect(data.clientState).toMatch(/^TCP_/);
          expect(data.serverState).toMatch(/^TCP_/);
        }
      });

      it(`${scenarioId}: every frame has a phase`, () => {
        const frames = tcpStateMachine.generateFrames(scenarioId);
        for (const f of frames) {
          const data = f.data as TcpStateMachineState;
          expect(['idle', 'handshake', 'established', 'teardown', 'time-wait', 'closed']).toContain(
            data.phase,
          );
        }
      });

      it(`${scenarioId}: packet fields are consistent`, () => {
        const frames = tcpStateMachine.generateFrames(scenarioId);
        for (const f of frames) {
          const data = f.data as TcpStateMachineState;
          if (data.packetInFlight) {
            expect(data.packetDirection).toBeTruthy();
            expect(['client-to-server', 'server-to-client']).toContain(data.packetDirection);
          }
        }
      });
    }
  });

  describe('generateFrames - three-way-handshake', () => {
    const frames = tcpStateMachine.generateFrames('three-way-handshake');

    it('client transitions CLOSED -> SYN_SENT -> ESTABLISHED', () => {
      const clientStates = frames.map(f => (f.data as TcpStateMachineState).clientState);
      expect(clientStates[0]).toBe('TCP_CLOSE');
      expect(clientStates).toContain('TCP_SYN_SENT');
      expect(clientStates).toContain('TCP_ESTABLISHED');

      // Order: CLOSE before SYN_SENT before ESTABLISHED
      const closeIdx = clientStates.indexOf('TCP_CLOSE');
      const synSentIdx = clientStates.indexOf('TCP_SYN_SENT');
      const estIdx = clientStates.indexOf('TCP_ESTABLISHED');
      expect(closeIdx).toBeLessThan(synSentIdx);
      expect(synSentIdx).toBeLessThan(estIdx);
    });

    it('server transitions LISTEN -> SYN_RECV -> ESTABLISHED', () => {
      const serverStates = frames.map(f => (f.data as TcpStateMachineState).serverState);
      expect(serverStates[0]).toBe('TCP_LISTEN');
      expect(serverStates).toContain('TCP_SYN_RECV');
      expect(serverStates).toContain('TCP_ESTABLISHED');

      const listenIdx = serverStates.indexOf('TCP_LISTEN');
      const synRecvIdx = serverStates.indexOf('TCP_SYN_RECV');
      const estIdx = serverStates.indexOf('TCP_ESTABLISHED');
      expect(listenIdx).toBeLessThan(synRecvIdx);
      expect(synRecvIdx).toBeLessThan(estIdx);
    });

    it('shows SYN, SYN-ACK, and ACK packets', () => {
      const packets = frames
        .map(f => (f.data as TcpStateMachineState).packetInFlight)
        .filter(Boolean);
      expect(packets).toContain('SYN');
      expect(packets).toContain('SYN-ACK');
      expect(packets).toContain('ACK');
    });

    it('descriptions reference real kernel functions', () => {
      const allText = frames.map(f => f.description).join(' ');
      expect(allText).toContain('tcp_v4_connect');
      expect(allText).toContain('tcp_set_state');
      expect(allText).toContain('tcp_finish_connect');
      expect(allText).toContain('tcp_rcv_state_process');
      expect(allText).toContain('tcp_rcv_established');
    });

    it('references real kernel source paths', () => {
      const allText = frames.map(f => f.description).join(' ');
      expect(allText).toContain('net/ipv4/tcp_ipv4.c');
      expect(allText).toContain('net/ipv4/tcp_input.c');
      expect(allText).toContain('net/ipv4/tcp_output.c');
      expect(allText).toContain('include/net/tcp_states.h');
    });
  });

  describe('generateFrames - connection-teardown', () => {
    const frames = tcpStateMachine.generateFrames('connection-teardown');

    it('starts with both ESTABLISHED', () => {
      const data = frames[0].data as TcpStateMachineState;
      expect(data.clientState).toBe('TCP_ESTABLISHED');
      expect(data.serverState).toBe('TCP_ESTABLISHED');
    });

    it('shows FIN_WAIT1, FIN_WAIT2, and TIME_WAIT on active closer', () => {
      const clientStates = frames.map(f => (f.data as TcpStateMachineState).clientState);
      expect(clientStates).toContain('TCP_FIN_WAIT1');
      expect(clientStates).toContain('TCP_FIN_WAIT2');
      expect(clientStates).toContain('TCP_TIME_WAIT');
    });

    it('shows CLOSE_WAIT and LAST_ACK on passive closer', () => {
      const serverStates = frames.map(f => (f.data as TcpStateMachineState).serverState);
      expect(serverStates).toContain('TCP_CLOSE_WAIT');
      expect(serverStates).toContain('TCP_LAST_ACK');
    });

    it('both sides reach CLOSED', () => {
      const lastFrame = frames[frames.length - 1].data as TcpStateMachineState;
      expect(lastFrame.clientState).toBe('TCP_CLOSE');
      const serverStates = frames.map(f => (f.data as TcpStateMachineState).serverState);
      expect(serverStates).toContain('TCP_CLOSE');
    });

    it('shows FIN packets', () => {
      const packets = frames
        .map(f => (f.data as TcpStateMachineState).packetInFlight)
        .filter(Boolean);
      expect(packets).toContain('FIN');
    });

    it('descriptions reference teardown functions', () => {
      const allText = frames.map(f => f.description).join(' ');
      expect(allText).toContain('tcp_close');
      expect(allText).toContain('tcp_send_fin');
      expect(allText).toContain('tcp_fin');
      expect(allText).toContain('tcp_done');
      expect(allText).toContain('tcp_close_state');
    });
  });

  describe('generateFrames - simultaneous-close', () => {
    const frames = tcpStateMachine.generateFrames('simultaneous-close');

    it('both sides go through CLOSING state', () => {
      const clientStates = frames.map(f => (f.data as TcpStateMachineState).clientState);
      const serverStates = frames.map(f => (f.data as TcpStateMachineState).serverState);
      expect(clientStates).toContain('TCP_CLOSING');
      expect(serverStates).toContain('TCP_CLOSING');
    });

    it('both sides enter TIME_WAIT', () => {
      const clientStates = frames.map(f => (f.data as TcpStateMachineState).clientState);
      const serverStates = frames.map(f => (f.data as TcpStateMachineState).serverState);
      expect(clientStates).toContain('TCP_TIME_WAIT');
      expect(serverStates).toContain('TCP_TIME_WAIT');
    });

    it('both sides reach CLOSED', () => {
      const lastFrame = frames[frames.length - 1].data as TcpStateMachineState;
      expect(lastFrame.clientState).toBe('TCP_CLOSE');
      expect(lastFrame.serverState).toBe('TCP_CLOSE');
    });

    it('both sides go through FIN_WAIT1', () => {
      const clientStates = frames.map(f => (f.data as TcpStateMachineState).clientState);
      const serverStates = frames.map(f => (f.data as TcpStateMachineState).serverState);
      expect(clientStates).toContain('TCP_FIN_WAIT1');
      expect(serverStates).toContain('TCP_FIN_WAIT1');
    });

    it('descriptions reference simultaneous close handling', () => {
      const allText = frames.map(f => f.description).join(' ');
      expect(allText).toContain('simultaneous close');
      expect(allText).toContain('TCP_CLOSING');
      expect(allText).toContain('tcp_fin');
    });
  });

  describe('renderFrame', () => {
    it('renders SVG elements into container', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = tcpStateMachine.generateFrames('three-way-handshake');
      tcpStateMachine.renderFrame(svg, frames[0], 900, 480);
      expect(svg.querySelectorAll('rect').length).toBeGreaterThan(0);
    });

    it('renders different content for different frames', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = tcpStateMachine.generateFrames('three-way-handshake');
      tcpStateMachine.renderFrame(svg, frames[0], 900, 480);
      const html1 = svg.innerHTML;
      tcpStateMachine.renderFrame(svg, frames[frames.length - 1], 900, 480);
      const html2 = svg.innerHTML;
      expect(html1).not.toBe(html2);
    });

    it('applies highlight classes to active elements', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = tcpStateMachine.generateFrames('three-way-handshake');
      const frameWithHighlights = frames.find(f => f.highlights.length > 0);
      if (frameWithHighlights) {
        tcpStateMachine.renderFrame(svg, frameWithHighlights, 900, 480);
        expect(svg.querySelectorAll('.anim-highlight').length).toBeGreaterThan(0);
      }
    });

    it('renders client and server labels', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = tcpStateMachine.generateFrames('three-way-handshake');
      tcpStateMachine.renderFrame(svg, frames[0], 900, 480);
      const texts = Array.from(svg.querySelectorAll('text')).map(t => t.textContent);
      expect(texts.some(t => t?.includes('Client'))).toBe(true);
      expect(texts.some(t => t?.includes('Server'))).toBe(true);
    });

    it('renders TCP state names', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = tcpStateMachine.generateFrames('three-way-handshake');
      tcpStateMachine.renderFrame(svg, frames[0], 900, 480);
      const texts = Array.from(svg.querySelectorAll('text')).map(t => t.textContent);
      expect(texts.some(t => t?.includes('TCP_'))).toBe(true);
    });

    it('renders packet arrow for frames with packets', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = tcpStateMachine.generateFrames('three-way-handshake');
      const packetFrame = frames.find(
        f => (f.data as TcpStateMachineState).packetInFlight !== null,
      );
      if (packetFrame) {
        tcpStateMachine.renderFrame(svg, packetFrame, 900, 480);
        expect(svg.querySelectorAll('line').length).toBeGreaterThan(0);
      }
    });

    it('clears container before rendering', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = tcpStateMachine.generateFrames('three-way-handshake');
      tcpStateMachine.renderFrame(svg, frames[0], 900, 480);
      const countBefore = svg.childNodes.length;
      tcpStateMachine.renderFrame(svg, frames[0], 900, 480);
      const countAfter = svg.childNodes.length;
      expect(countAfter).toBe(countBefore);
    });
  });
});

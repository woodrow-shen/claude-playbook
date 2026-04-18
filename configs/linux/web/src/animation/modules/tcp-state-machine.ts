import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

export interface TcpStateMachineState {
  clientState: string;
  serverState: string;
  currentFunction: string;
  packetInFlight: string | null;
  packetDirection: 'client-to-server' | 'server-to-client' | null;
  srcRef: string;
  phase: 'idle' | 'handshake' | 'established' | 'teardown' | 'time-wait' | 'closed';
}

function cloneState(state: TcpStateMachineState): TcpStateMachineState {
  return {
    clientState: state.clientState,
    serverState: state.serverState,
    currentFunction: state.currentFunction,
    packetInFlight: state.packetInFlight,
    packetDirection: state.packetDirection,
    srcRef: state.srcRef,
    phase: state.phase,
  };
}

function generateThreeWayHandshake(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: TcpStateMachineState = {
    clientState: 'TCP_CLOSE',
    serverState: 'TCP_LISTEN',
    currentFunction: '',
    packetInFlight: null,
    packetDirection: null,
    srcRef: 'include/net/tcp_states.h:12',
    phase: 'idle',
  };

  // Frame 0: Initial state
  frames.push({
    step: 0,
    label: 'Initial TCP states',
    description:
      'TCP states are defined in the enum at include/net/tcp_states.h:12-28. ' +
      'The client socket starts in TCP_CLOSE (value 7) and the server socket is in ' +
      'TCP_LISTEN (value 10) after bind() and listen(). All state transitions go through ' +
      'tcp_set_state() at net/ipv4/tcp.c:2997 which updates sk->sk_state and fires tracepoints.',
    highlights: ['client-state', 'server-state'],
    data: cloneState(state),
  });

  // Frame 1: Client calls connect(), enters SYN_SENT
  state.clientState = 'TCP_SYN_SENT';
  state.currentFunction = 'tcp_v4_connect()';
  state.packetInFlight = null;
  state.packetDirection = null;
  state.srcRef = 'net/ipv4/tcp_ipv4.c:306';
  state.phase = 'handshake';
  frames.push({
    step: 1,
    label: 'tcp_v4_connect() sets SYN_SENT',
    description:
      'The client calls connect() which enters tcp_v4_connect() at net/ipv4/tcp_ipv4.c:222. ' +
      'At line 306, tcp_set_state(sk, TCP_SYN_SENT) transitions the client socket to SYN_SENT ' +
      'before the SYN packet is actually sent. The socket is then hashed via inet_hash_connect() ' +
      'at line 307 to bind a source port.',
    highlights: ['client-state'],
    data: cloneState(state),
  });

  // Frame 2: tcp_connect() builds and sends SYN
  state.currentFunction = 'tcp_connect()';
  state.packetInFlight = 'SYN';
  state.packetDirection = 'client-to-server';
  state.srcRef = 'net/ipv4/tcp_output.c:4296';
  frames.push({
    step: 2,
    label: 'tcp_connect() sends SYN segment',
    description:
      'tcp_connect() at net/ipv4/tcp_output.c:4296 builds the SYN segment. ' +
      'tcp_connect_init() at line 4354 initializes connection parameters (MSS, window). ' +
      'tcp_init_nondata_skb() at line 4368 marks the skb with TCPHDR_SYN flag. ' +
      'The SYN is transmitted via tcp_transmit_skb() at line 4377. The retransmit timer is ' +
      'armed via inet_csk_reset_xmit_timer() at line 4390.',
    highlights: ['packet-syn'],
    data: cloneState(state),
  });

  // Frame 3: Server receives SYN, creates request socket in SYN_RECV
  state.serverState = 'TCP_SYN_RECV';
  state.currentFunction = 'tcp_rcv_state_process()';
  state.packetInFlight = null;
  state.packetDirection = null;
  state.srcRef = 'net/ipv4/tcp_input.c:7170';
  frames.push({
    step: 3,
    label: 'Server processes SYN in tcp_rcv_state_process()',
    description:
      'The server receives the SYN and enters tcp_rcv_state_process() at net/ipv4/tcp_input.c:7170. ' +
      'In the TCP_LISTEN case, the kernel creates a request socket (mini-sock) via ' +
      'tcp_v4_conn_request(). The request socket enters TCP_NEW_SYN_RECV state (value 12 in ' +
      'include/net/tcp_states.h:24). The child socket will be in TCP_SYN_RECV until the ' +
      'handshake completes.',
    highlights: ['server-state'],
    data: cloneState(state),
  });

  // Frame 4: Server sends SYN-ACK
  state.currentFunction = 'tcp_v4_send_synack()';
  state.packetInFlight = 'SYN-ACK';
  state.packetDirection = 'server-to-client';
  state.srcRef = 'net/ipv4/tcp_ipv4.c:222';
  frames.push({
    step: 4,
    label: 'Server sends SYN-ACK',
    description:
      'The server responds with a SYN-ACK segment. The SYN cookie or request socket mechanism ' +
      'generates the SYN-ACK via tcp_make_synack(). The segment carries the server\'s ISN ' +
      '(initial sequence number) and acknowledges the client\'s SYN by setting ack_seq = ' +
      'client_ISN + 1. The server retransmit timer is armed for SYN-ACK retransmission.',
    highlights: ['packet-syn-ack'],
    data: cloneState(state),
  });

  // Frame 5: Client receives SYN-ACK, calls tcp_finish_connect()
  state.clientState = 'TCP_ESTABLISHED';
  state.currentFunction = 'tcp_finish_connect()';
  state.packetInFlight = null;
  state.packetDirection = null;
  state.srcRef = 'net/ipv4/tcp_input.c:6759';
  frames.push({
    step: 5,
    label: 'tcp_finish_connect() sets client ESTABLISHED',
    description:
      'The client receives the SYN-ACK in tcp_rcv_state_process() which calls ' +
      'tcp_finish_connect() at net/ipv4/tcp_input.c:6753. At line 6759, ' +
      'tcp_set_state(sk, TCP_ESTABLISHED) transitions the client to ESTABLISHED. ' +
      'This is called from the SYN_SENT processing path at line 6994. The client\'s ' +
      'sk->sk_state_change() callback wakes any process blocked in connect().',
    highlights: ['client-state'],
    data: cloneState(state),
  });

  // Frame 6: Client sends ACK to complete handshake
  state.currentFunction = 'tcp_send_ack()';
  state.packetInFlight = 'ACK';
  state.packetDirection = 'client-to-server';
  state.srcRef = 'net/ipv4/tcp_input.c:6994';
  frames.push({
    step: 6,
    label: 'Client sends final ACK',
    description:
      'After tcp_finish_connect() at net/ipv4/tcp_input.c:6994, the client sends the final ' +
      'ACK of the three-way handshake via tcp_send_ack(). This ACK acknowledges the server\'s ' +
      'SYN (ack_seq = server_ISN + 1). The packet carries no data unless TCP Fast Open is in use. ' +
      'The client is now fully ESTABLISHED and ready to send data.',
    highlights: ['packet-ack'],
    data: cloneState(state),
  });

  // Frame 7: Server receives ACK, transitions to ESTABLISHED
  state.serverState = 'TCP_ESTABLISHED';
  state.currentFunction = 'tcp_rcv_state_process()';
  state.packetInFlight = null;
  state.packetDirection = null;
  state.srcRef = 'net/ipv4/tcp_input.c:7288';
  frames.push({
    step: 7,
    label: 'Server completes handshake, enters ESTABLISHED',
    description:
      'The server receives the ACK in tcp_rcv_state_process() at net/ipv4/tcp_input.c:7170. ' +
      'In the TCP_SYN_RECV case, the kernel verifies the ACK sequence number, then calls ' +
      'tcp_set_state(sk, TCP_ESTABLISHED) at line 7288. The connection is now fully established. ' +
      'Subsequent data packets will be handled by the fast path in tcp_rcv_established() at ' +
      'net/ipv4/tcp_input.c:6519.',
    highlights: ['server-state'],
    data: cloneState(state),
  });

  // Frame 8: Both sides established
  state.currentFunction = 'tcp_rcv_established()';
  state.phase = 'established';
  state.srcRef = 'net/ipv4/tcp_input.c:6519';
  frames.push({
    step: 8,
    label: 'Connection established, fast path active',
    description:
      'Both sides are now in TCP_ESTABLISHED. All subsequent data transfer uses the fast path ' +
      'in tcp_rcv_established() at net/ipv4/tcp_input.c:6519, which is optimized for the ' +
      'common case of in-order data on an established connection. It bypasses the full ' +
      'tcp_rcv_state_process() state machine, providing significantly lower per-packet overhead.',
    highlights: ['client-state', 'server-state'],
    data: cloneState(state),
  });

  return frames;
}

function generateConnectionTeardown(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: TcpStateMachineState = {
    clientState: 'TCP_ESTABLISHED',
    serverState: 'TCP_ESTABLISHED',
    currentFunction: '',
    packetInFlight: null,
    packetDirection: null,
    srcRef: 'net/ipv4/tcp_input.c:6519',
    phase: 'established',
  };

  // Frame 0: Both established
  frames.push({
    step: 0,
    label: 'Both sides ESTABLISHED',
    description:
      'Both endpoints are in TCP_ESTABLISHED, handling data through the fast path ' +
      'tcp_rcv_established() at net/ipv4/tcp_input.c:6519. The active closer (client) ' +
      'will initiate teardown by calling close() on the socket, which enters ' +
      '__tcp_close() at net/ipv4/tcp.c:3175.',
    highlights: ['client-state', 'server-state'],
    data: cloneState(state),
  });

  // Frame 1: Client calls close(), tcp_close_state() transitions to FIN_WAIT1
  state.clientState = 'TCP_FIN_WAIT1';
  state.currentFunction = '__tcp_close()';
  state.phase = 'teardown';
  state.srcRef = 'net/ipv4/tcp.c:3092';
  frames.push({
    step: 1,
    label: '__tcp_close() transitions to FIN_WAIT1',
    description:
      'The client calls close(), entering tcp_close() at net/ipv4/tcp.c:3347 which calls ' +
      '__tcp_close() at line 3175. At line 3229, tcp_close_state() at line 3092 consults the ' +
      'new_state[] table (line 3075): new_state[TCP_ESTABLISHED] = TCP_FIN_WAIT1 | TCP_ACTION_FIN. ' +
      'tcp_set_state() moves the client to FIN_WAIT1 and tcp_close_state() returns true, ' +
      'indicating a FIN must be sent.',
    highlights: ['client-state'],
    data: cloneState(state),
  });

  // Frame 2: Client sends FIN
  state.currentFunction = 'tcp_send_fin()';
  state.packetInFlight = 'FIN';
  state.packetDirection = 'client-to-server';
  state.srcRef = 'net/ipv4/tcp_output.c:3803';
  frames.push({
    step: 2,
    label: 'tcp_send_fin() sends FIN segment',
    description:
      'Since tcp_close_state() returned TCP_ACTION_FIN, __tcp_close() calls tcp_send_fin() ' +
      'at net/ipv4/tcp_output.c:3803 (called from net/ipv4/tcp.c:3259). tcp_send_fin() tries to ' +
      'coalesce the FIN flag onto the last queued data segment. If no data is queued, it ' +
      'allocates a new skb with TCPHDR_FIN | TCPHDR_ACK flags and transmits it.',
    highlights: ['packet-fin'],
    data: cloneState(state),
  });

  // Frame 3: Server receives FIN, tcp_fin() transitions to CLOSE_WAIT
  state.serverState = 'TCP_CLOSE_WAIT';
  state.currentFunction = 'tcp_fin()';
  state.packetInFlight = null;
  state.packetDirection = null;
  state.srcRef = 'net/ipv4/tcp_input.c:4960';
  frames.push({
    step: 3,
    label: 'tcp_fin() moves server to CLOSE_WAIT',
    description:
      'The server receives the FIN segment. tcp_fin() at net/ipv4/tcp_input.c:4947 handles ' +
      'the FIN flag. In the TCP_ESTABLISHED case (line 4958), it calls ' +
      'tcp_set_state(sk, TCP_CLOSE_WAIT) at line 4960. The server sends an ACK for the FIN. ' +
      'CLOSE_WAIT means the server has received the remote FIN but the local application has ' +
      'not yet closed its side.',
    highlights: ['server-state'],
    data: cloneState(state),
  });

  // Frame 4: Server ACKs the FIN, client moves to FIN_WAIT2
  state.clientState = 'TCP_FIN_WAIT2';
  state.currentFunction = 'tcp_rcv_state_process()';
  state.packetInFlight = null;
  state.packetDirection = null;
  state.srcRef = 'net/ipv4/tcp_input.c:7364';
  frames.push({
    step: 4,
    label: 'Client receives ACK, enters FIN_WAIT2',
    description:
      'The client receives the ACK for its FIN in tcp_rcv_state_process() at ' +
      'net/ipv4/tcp_input.c:7170. In the TCP_FIN_WAIT1 case, when tp->snd_una matches ' +
      'tp->write_seq (all data including FIN acknowledged), the state transitions to ' +
      'TCP_FIN_WAIT2. A timer is set via tcp_time_wait(sk, TCP_FIN_WAIT2, tmo) at line 7364 ' +
      'to prevent lingering indefinitely in FIN_WAIT2.',
    highlights: ['client-state'],
    data: cloneState(state),
  });

  // Frame 5: Server calls close(), sends FIN, enters LAST_ACK
  state.serverState = 'TCP_LAST_ACK';
  state.currentFunction = 'tcp_close_state()';
  state.packetInFlight = 'FIN';
  state.packetDirection = 'server-to-client';
  state.srcRef = 'net/ipv4/tcp.c:3085';
  frames.push({
    step: 5,
    label: 'Server closes, sends FIN, enters LAST_ACK',
    description:
      'The server application calls close(). tcp_close_state() at net/ipv4/tcp.c:3092 consults ' +
      'new_state[TCP_CLOSE_WAIT] = TCP_LAST_ACK | TCP_ACTION_FIN (line 3085). ' +
      'tcp_set_state() transitions to LAST_ACK. tcp_send_fin() at net/ipv4/tcp_output.c:3803 ' +
      'sends the server\'s FIN segment. LAST_ACK means waiting for the final ACK from the peer.',
    highlights: ['server-state', 'packet-fin'],
    data: cloneState(state),
  });

  // Frame 6: Client receives FIN, enters TIME_WAIT
  state.clientState = 'TCP_TIME_WAIT';
  state.currentFunction = 'tcp_fin()';
  state.packetInFlight = null;
  state.packetDirection = null;
  state.srcRef = 'net/ipv4/tcp_input.c:4985';
  state.phase = 'time-wait';
  frames.push({
    step: 6,
    label: 'Client receives FIN, enters TIME_WAIT',
    description:
      'The client receives the server\'s FIN. tcp_fin() at net/ipv4/tcp_input.c:4947 handles ' +
      'the TCP_FIN_WAIT2 case (line 4982): it sends an ACK via tcp_send_ack() at line 4984, ' +
      'then calls tcp_time_wait(sk, TCP_TIME_WAIT, 0) at line 4985. The socket transitions ' +
      'to a lightweight inet_timewait_sock managed by tcp_time_wait() at ' +
      'net/ipv4/tcp_minisocks.c:327. TIME_WAIT lasts 2*MSL (60 seconds).',
    highlights: ['client-state'],
    data: cloneState(state),
  });

  // Frame 7: Server receives ACK, enters CLOSED via tcp_done()
  state.serverState = 'TCP_CLOSE';
  state.currentFunction = 'tcp_done()';
  state.packetInFlight = null;
  state.packetDirection = null;
  state.srcRef = 'net/ipv4/tcp.c:5073';
  frames.push({
    step: 7,
    label: 'Server receives final ACK, tcp_done() to CLOSED',
    description:
      'The server receives the ACK for its FIN in tcp_rcv_state_process() at ' +
      'net/ipv4/tcp_input.c:7170. In the TCP_LAST_ACK case (line 7377), when ' +
      'tp->snd_una == tp->write_seq, it calls tcp_done() at line 7380. tcp_done() at ' +
      'net/ipv4/tcp.c:5060 calls tcp_set_state(sk, TCP_CLOSE) at line 5073, clears ' +
      'all timers, and destroys the socket.',
    highlights: ['server-state'],
    data: cloneState(state),
  });

  // Frame 8: TIME_WAIT expires, client enters CLOSED
  state.clientState = 'TCP_CLOSE';
  state.currentFunction = 'inet_twsk_kill()';
  state.srcRef = 'net/ipv4/tcp_minisocks.c:327';
  state.phase = 'closed';
  frames.push({
    step: 8,
    label: 'TIME_WAIT expires, client socket destroyed',
    description:
      'After 2*MSL (60 seconds), the TIME_WAIT timer expires. The inet_timewait_sock is ' +
      'cleaned up by inet_twsk_kill(). TIME_WAIT exists for two reasons: (1) to reliably ' +
      'retransmit the final ACK if the peer\'s FIN is retransmitted, and (2) to allow old ' +
      'duplicate segments to expire so they do not corrupt a new connection on the same ' +
      '4-tuple. The socket resources are now fully released.',
    highlights: ['client-state'],
    data: cloneState(state),
  });

  return frames;
}

function generateSimultaneousClose(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: TcpStateMachineState = {
    clientState: 'TCP_ESTABLISHED',
    serverState: 'TCP_ESTABLISHED',
    currentFunction: '',
    packetInFlight: null,
    packetDirection: null,
    srcRef: 'net/ipv4/tcp_input.c:6519',
    phase: 'established',
  };

  // Frame 0: Both established
  frames.push({
    step: 0,
    label: 'Both sides ESTABLISHED',
    description:
      'Both endpoints are in TCP_ESTABLISHED. In a simultaneous close, both sides call ' +
      'close() at roughly the same time, each sending a FIN before receiving the other\'s FIN. ' +
      'This triggers the CLOSING state path in tcp_fin() at net/ipv4/tcp_input.c:4974.',
    highlights: ['client-state', 'server-state'],
    data: cloneState(state),
  });

  // Frame 1: Both call close(), both enter FIN_WAIT1
  state.clientState = 'TCP_FIN_WAIT1';
  state.serverState = 'TCP_FIN_WAIT1';
  state.currentFunction = 'tcp_close_state()';
  state.phase = 'teardown';
  state.srcRef = 'net/ipv4/tcp.c:3078';
  frames.push({
    step: 1,
    label: 'Both sides close, enter FIN_WAIT1',
    description:
      'Both sides call close() simultaneously. tcp_close_state() at net/ipv4/tcp.c:3092 ' +
      'consults new_state[TCP_ESTABLISHED] = TCP_FIN_WAIT1 | TCP_ACTION_FIN (line 3078). ' +
      'Both sockets transition to TCP_FIN_WAIT1 via tcp_set_state() at line 3097. ' +
      'The TCP_ACTION_FIN flag causes tcp_send_fin() to be called on each side.',
    highlights: ['client-state', 'server-state'],
    data: cloneState(state),
  });

  // Frame 2: Both send FIN simultaneously
  state.currentFunction = 'tcp_send_fin()';
  state.packetInFlight = 'FIN';
  state.packetDirection = 'client-to-server';
  state.srcRef = 'net/ipv4/tcp_output.c:3803';
  frames.push({
    step: 2,
    label: 'Both sides send FIN segments',
    description:
      'Both sides call tcp_send_fin() at net/ipv4/tcp_output.c:3803 from __tcp_close() ' +
      '(net/ipv4/tcp.c:3259). Each FIN crosses the other on the wire. Both sides are in ' +
      'FIN_WAIT1 and will receive a FIN before receiving an ACK for their own FIN. ' +
      'This is the defining characteristic of a simultaneous close.',
    highlights: ['packet-fin'],
    data: cloneState(state),
  });

  // Frame 3: Client receives server's FIN in FIN_WAIT1 -> CLOSING
  state.clientState = 'TCP_CLOSING';
  state.currentFunction = 'tcp_fin()';
  state.packetInFlight = null;
  state.packetDirection = null;
  state.srcRef = 'net/ipv4/tcp_input.c:4980';
  frames.push({
    step: 3,
    label: 'Client receives FIN in FIN_WAIT1, enters CLOSING',
    description:
      'The client receives the server\'s FIN while still in FIN_WAIT1. tcp_fin() at ' +
      'net/ipv4/tcp_input.c:4947 handles this in the TCP_FIN_WAIT1 case (line 4974): ' +
      '"This case occurs when a simultaneous close happens, we must ack the received FIN ' +
      'and enter the CLOSING state." It calls tcp_send_ack() at line 4979 and ' +
      'tcp_set_state(sk, TCP_CLOSING) at line 4980.',
    highlights: ['client-state'],
    data: cloneState(state),
  });

  // Frame 4: Server receives client's FIN in FIN_WAIT1 -> CLOSING
  state.serverState = 'TCP_CLOSING';
  state.currentFunction = 'tcp_fin()';
  state.srcRef = 'net/ipv4/tcp_input.c:4980';
  frames.push({
    step: 4,
    label: 'Server receives FIN in FIN_WAIT1, enters CLOSING',
    description:
      'Symmetrically, the server receives the client\'s FIN while in FIN_WAIT1. ' +
      'tcp_fin() at net/ipv4/tcp_input.c:4947 again hits the TCP_FIN_WAIT1 case (line 4974). ' +
      'tcp_set_state(sk, TCP_CLOSING) at line 4980 transitions the server to CLOSING. ' +
      'TCP_CLOSING (value 11 in include/net/tcp_states.h:23) is the only state unique to ' +
      'simultaneous close.',
    highlights: ['server-state'],
    data: cloneState(state),
  });

  // Frame 5: Client receives ACK for its FIN -> TIME_WAIT
  state.clientState = 'TCP_TIME_WAIT';
  state.currentFunction = 'tcp_rcv_state_process()';
  state.phase = 'time-wait';
  state.srcRef = 'net/ipv4/tcp_input.c:7372';
  frames.push({
    step: 5,
    label: 'Client receives ACK in CLOSING, enters TIME_WAIT',
    description:
      'The client receives the ACK for its FIN in tcp_rcv_state_process() at ' +
      'net/ipv4/tcp_input.c:7170. In the TCP_CLOSING case (line 7370), when ' +
      'tp->snd_una == tp->write_seq (FIN acknowledged), it calls ' +
      'tcp_time_wait(sk, TCP_TIME_WAIT, 0) at line 7372. The socket transitions to the ' +
      'lightweight inet_timewait_sock at net/ipv4/tcp_minisocks.c:327.',
    highlights: ['client-state'],
    data: cloneState(state),
  });

  // Frame 6: Server receives ACK for its FIN -> TIME_WAIT
  state.serverState = 'TCP_TIME_WAIT';
  state.currentFunction = 'tcp_rcv_state_process()';
  state.srcRef = 'net/ipv4/tcp_input.c:7372';
  frames.push({
    step: 6,
    label: 'Server receives ACK in CLOSING, enters TIME_WAIT',
    description:
      'The server also receives the ACK for its FIN. tcp_rcv_state_process() at ' +
      'net/ipv4/tcp_input.c:7170 hits the TCP_CLOSING case (line 7370) again, calling ' +
      'tcp_time_wait(sk, TCP_TIME_WAIT, 0) at line 7372. Both sides are now in TIME_WAIT. ' +
      'This is different from normal close where only the active closer enters TIME_WAIT.',
    highlights: ['server-state'],
    data: cloneState(state),
  });

  // Frame 7: TIME_WAIT expires on both sides
  state.clientState = 'TCP_CLOSE';
  state.serverState = 'TCP_CLOSE';
  state.currentFunction = 'inet_twsk_kill()';
  state.phase = 'closed';
  state.srcRef = 'net/ipv4/tcp_minisocks.c:327';
  frames.push({
    step: 7,
    label: 'TIME_WAIT expires, both sides CLOSED',
    description:
      'After 2*MSL (60 seconds), TIME_WAIT expires on both sides. The inet_timewait_sock ' +
      'structures are cleaned up by inet_twsk_kill(). In simultaneous close, both sides ' +
      'go through ESTABLISHED -> FIN_WAIT1 -> CLOSING -> TIME_WAIT -> CLOSED. The CLOSING ' +
      'state is handled by the new_state[] table at net/ipv4/tcp.c:3088 which maps ' +
      'TCP_CLOSING -> TCP_CLOSING (no additional action needed, just wait for ACK).',
    highlights: ['client-state', 'server-state'],
    data: cloneState(state),
  });

  return frames;
}

const TCP_STATE_COLORS: Record<string, string> = {
  TCP_CLOSE: '#6b7280',
  TCP_LISTEN: '#3b82f6',
  TCP_SYN_SENT: '#f59e0b',
  TCP_SYN_RECV: '#f59e0b',
  TCP_ESTABLISHED: '#10b981',
  TCP_FIN_WAIT1: '#ef4444',
  TCP_FIN_WAIT2: '#ef4444',
  TCP_CLOSE_WAIT: '#ef4444',
  TCP_LAST_ACK: '#ef4444',
  TCP_TIME_WAIT: '#8b5cf6',
  TCP_CLOSING: '#ef4444',
};

function renderFrame(
  container: SVGGElement,
  frame: AnimationFrame,
  width: number,
  height: number,
): void {
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  const ns = 'http://www.w3.org/2000/svg';
  const data = frame.data as TcpStateMachineState;
  const isHighlighted = (id: string) => frame.highlights.includes(id);

  const midX = width / 2;
  const clientX = width * 0.2;
  const serverX = width * 0.8;
  const topY = 40;
  const stateY = 80;
  const packetY = height * 0.5;
  const funcY = height - 60;

  // Title labels
  const clientLabel = document.createElementNS(ns, 'text');
  clientLabel.setAttribute('x', String(clientX));
  clientLabel.setAttribute('y', String(topY));
  clientLabel.setAttribute('text-anchor', 'middle');
  clientLabel.setAttribute('fill', '#d1d5db');
  clientLabel.setAttribute('font-size', '14');
  clientLabel.setAttribute('font-weight', 'bold');
  clientLabel.textContent = 'Client';
  container.appendChild(clientLabel);

  const serverLabel = document.createElementNS(ns, 'text');
  serverLabel.setAttribute('x', String(serverX));
  serverLabel.setAttribute('y', String(topY));
  serverLabel.setAttribute('text-anchor', 'middle');
  serverLabel.setAttribute('fill', '#d1d5db');
  serverLabel.setAttribute('font-size', '14');
  serverLabel.setAttribute('font-weight', 'bold');
  serverLabel.textContent = 'Server';
  container.appendChild(serverLabel);

  // Client state box
  const clientColor = TCP_STATE_COLORS[data.clientState] || '#6b7280';
  const clientRect = document.createElementNS(ns, 'rect');
  clientRect.setAttribute('x', String(clientX - 70));
  clientRect.setAttribute('y', String(stateY));
  clientRect.setAttribute('width', '140');
  clientRect.setAttribute('height', '36');
  clientRect.setAttribute('rx', '6');
  clientRect.setAttribute('fill', clientColor);
  clientRect.setAttribute('opacity', isHighlighted('client-state') ? '1' : '0.7');
  if (isHighlighted('client-state')) {
    clientRect.setAttribute('class', 'anim-highlight');
  }
  container.appendChild(clientRect);

  const clientStateText = document.createElementNS(ns, 'text');
  clientStateText.setAttribute('x', String(clientX));
  clientStateText.setAttribute('y', String(stateY + 23));
  clientStateText.setAttribute('text-anchor', 'middle');
  clientStateText.setAttribute('fill', '#ffffff');
  clientStateText.setAttribute('font-size', '12');
  clientStateText.setAttribute('font-weight', 'bold');
  clientStateText.textContent = data.clientState;
  container.appendChild(clientStateText);

  // Server state box
  const serverColor = TCP_STATE_COLORS[data.serverState] || '#6b7280';
  const serverRect = document.createElementNS(ns, 'rect');
  serverRect.setAttribute('x', String(serverX - 70));
  serverRect.setAttribute('y', String(stateY));
  serverRect.setAttribute('width', '140');
  serverRect.setAttribute('height', '36');
  serverRect.setAttribute('rx', '6');
  serverRect.setAttribute('fill', serverColor);
  serverRect.setAttribute('opacity', isHighlighted('server-state') ? '1' : '0.7');
  if (isHighlighted('server-state')) {
    serverRect.setAttribute('class', 'anim-highlight');
  }
  container.appendChild(serverRect);

  const serverStateText = document.createElementNS(ns, 'text');
  serverStateText.setAttribute('x', String(serverX));
  serverStateText.setAttribute('y', String(stateY + 23));
  serverStateText.setAttribute('text-anchor', 'middle');
  serverStateText.setAttribute('fill', '#ffffff');
  serverStateText.setAttribute('font-size', '12');
  serverStateText.setAttribute('font-weight', 'bold');
  serverStateText.textContent = data.serverState;
  container.appendChild(serverStateText);

  // Vertical lines for client and server
  const clientLine = document.createElementNS(ns, 'line');
  clientLine.setAttribute('x1', String(clientX));
  clientLine.setAttribute('y1', String(stateY + 40));
  clientLine.setAttribute('x2', String(clientX));
  clientLine.setAttribute('y2', String(height - 80));
  clientLine.setAttribute('stroke', '#4b5563');
  clientLine.setAttribute('stroke-width', '2');
  clientLine.setAttribute('stroke-dasharray', '4,4');
  container.appendChild(clientLine);

  const serverLine = document.createElementNS(ns, 'line');
  serverLine.setAttribute('x1', String(serverX));
  serverLine.setAttribute('y1', String(stateY + 40));
  serverLine.setAttribute('x2', String(serverX));
  serverLine.setAttribute('y2', String(height - 80));
  serverLine.setAttribute('stroke', '#4b5563');
  serverLine.setAttribute('stroke-width', '2');
  serverLine.setAttribute('stroke-dasharray', '4,4');
  container.appendChild(serverLine);

  // Packet in flight arrow
  if (data.packetInFlight && data.packetDirection) {
    const fromX = data.packetDirection === 'client-to-server' ? clientX : serverX;
    const toX = data.packetDirection === 'client-to-server' ? serverX : clientX;

    const arrow = document.createElementNS(ns, 'line');
    arrow.setAttribute('x1', String(fromX));
    arrow.setAttribute('y1', String(packetY));
    arrow.setAttribute('x2', String(toX));
    arrow.setAttribute('y2', String(packetY));
    arrow.setAttribute('stroke', '#fbbf24');
    arrow.setAttribute('stroke-width', '2');
    arrow.setAttribute('marker-end', 'url(#arrowhead)');
    const packetHighlightId = `packet-${data.packetInFlight.toLowerCase().replace('-', '-')}`;
    if (isHighlighted(packetHighlightId)) {
      arrow.setAttribute('class', 'anim-highlight');
    }
    container.appendChild(arrow);

    // Arrowhead marker
    const defs = document.createElementNS(ns, 'defs');
    const marker = document.createElementNS(ns, 'marker');
    marker.setAttribute('id', 'arrowhead');
    marker.setAttribute('markerWidth', '10');
    marker.setAttribute('markerHeight', '7');
    marker.setAttribute('refX', '10');
    marker.setAttribute('refY', '3.5');
    marker.setAttribute('orient', 'auto');
    const polygon = document.createElementNS(ns, 'polygon');
    polygon.setAttribute('points', '0 0, 10 3.5, 0 7');
    polygon.setAttribute('fill', '#fbbf24');
    marker.appendChild(polygon);
    defs.appendChild(marker);
    container.insertBefore(defs, container.firstChild);

    // Packet label
    const packetLabel = document.createElementNS(ns, 'text');
    packetLabel.setAttribute('x', String(midX));
    packetLabel.setAttribute('y', String(packetY - 10));
    packetLabel.setAttribute('text-anchor', 'middle');
    packetLabel.setAttribute('fill', '#fbbf24');
    packetLabel.setAttribute('font-size', '13');
    packetLabel.setAttribute('font-weight', 'bold');
    packetLabel.textContent = data.packetInFlight;
    container.appendChild(packetLabel);
  }

  // Current function label
  if (data.currentFunction) {
    const funcText = document.createElementNS(ns, 'text');
    funcText.setAttribute('x', String(midX));
    funcText.setAttribute('y', String(funcY));
    funcText.setAttribute('text-anchor', 'middle');
    funcText.setAttribute('fill', '#9ca3af');
    funcText.setAttribute('font-size', '12');
    funcText.setAttribute('font-family', 'monospace');
    funcText.textContent = data.currentFunction;
    container.appendChild(funcText);
  }

  // Source reference
  const srcRefText = document.createElementNS(ns, 'text');
  srcRefText.setAttribute('x', String(midX));
  srcRefText.setAttribute('y', String(funcY + 18));
  srcRefText.setAttribute('text-anchor', 'middle');
  srcRefText.setAttribute('fill', '#6b7280');
  srcRefText.setAttribute('font-size', '10');
  srcRefText.setAttribute('font-family', 'monospace');
  srcRefText.textContent = data.srcRef;
  container.appendChild(srcRefText);

  // Phase indicator
  const phaseRect = document.createElementNS(ns, 'rect');
  phaseRect.setAttribute('x', String(midX - 40));
  phaseRect.setAttribute('y', String(topY - 15));
  phaseRect.setAttribute('width', '80');
  phaseRect.setAttribute('height', '22');
  phaseRect.setAttribute('rx', '4');
  phaseRect.setAttribute('fill', '#1f2937');
  phaseRect.setAttribute('stroke', '#374151');
  container.appendChild(phaseRect);

  const phaseText = document.createElementNS(ns, 'text');
  phaseText.setAttribute('x', String(midX));
  phaseText.setAttribute('y', String(topY));
  phaseText.setAttribute('text-anchor', 'middle');
  phaseText.setAttribute('fill', '#9ca3af');
  phaseText.setAttribute('font-size', '11');
  phaseText.textContent = data.phase;
  container.appendChild(phaseText);
}

const tcpStateMachineModule: AnimationModule = {
  config: {
    id: 'tcp-state-machine',
    title: 'TCP State Machine Transitions',
    skillName: 'tcp-state-machine',
  },

  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario) {
      case 'connection-teardown':
        return generateConnectionTeardown();
      case 'simultaneous-close':
        return generateSimultaneousClose();
      case 'three-way-handshake':
      default:
        return generateThreeWayHandshake();
    }
  },

  renderFrame: renderFrame,

  getScenarios(): AnimationScenario[] {
    return [
      { id: 'three-way-handshake', label: 'Three-Way Handshake' },
      { id: 'connection-teardown', label: 'Connection Teardown' },
      { id: 'simultaneous-close', label: 'Simultaneous Close' },
    ];
  },
};

export default tcpStateMachineModule;

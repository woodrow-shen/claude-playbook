import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

export interface TcpCongestionState {
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

function cloneState(state: TcpCongestionState): TcpCongestionState {
  return {
    algorithm: state.algorithm,
    cwnd: state.cwnd,
    ssthresh: state.ssthresh,
    rtt: state.rtt,
    bandwidth: state.bandwidth,
    bbrState: state.bbrState,
    phase: state.phase,
    cwndHistory: [...state.cwndHistory],
    currentFunction: state.currentFunction,
    srcRef: state.srcRef,
  };
}

function generateCubicSlowStartAndCongestion(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: TcpCongestionState = {
    algorithm: 'cubic',
    cwnd: 10,
    ssthresh: 65535,
    rtt: 20,
    bandwidth: null,
    bbrState: null,
    phase: 'slow-start',
    cwndHistory: [],
    currentFunction: 'tcp_init_congestion_control',
    srcRef: 'net/ipv4/tcp_cong.c:236',
  };

  // Frame 0: Congestion control initialization
  state.cwndHistory.push(state.cwnd);
  frames.push({
    step: 0,
    label: 'Initialize CUBIC congestion control',
    description:
      'tcp_init_congestion_control() at net/ipv4/tcp_cong.c:236 initializes the congestion ' +
      'control module for a new connection. It calls icsk->icsk_ca_ops->init(sk) at line 242 ' +
      'which invokes the CUBIC init function. The initial cwnd is set to 10 segments (IW10). ' +
      'CUBIC is registered via tcp_register_congestion_control() at net/ipv4/tcp_cong.c:93.',
    highlights: ['cwnd-display', 'algorithm-label'],
    data: cloneState(state),
  });

  // Frame 1: First ACK in slow start
  state.cwnd = 20;
  state.currentFunction = 'tcp_ack';
  state.srcRef = 'net/ipv4/tcp_input.c:4246';
  state.cwndHistory.push(state.cwnd);
  frames.push({
    step: 1,
    label: 'tcp_ack() processes first ACK batch',
    description:
      'tcp_ack() at net/ipv4/tcp_input.c:4246 processes incoming ACKs. When ACKs advance ' +
      'snd_una, the function calls tcp_cong_control() at line 3858 which dispatches to ' +
      'tcp_cong_avoid() at net/ipv4/tcp_input.c:3513. tcp_cong_avoid() calls ' +
      'icsk->icsk_ca_ops->cong_avoid(sk, ack, acked) at line 3517, invoking cubictcp_cong_avoid().',
    highlights: ['cwnd-display'],
    data: cloneState(state),
  });

  // Frame 2: cubictcp_cong_avoid in slow start
  state.cwnd = 40;
  state.currentFunction = 'cubictcp_cong_avoid';
  state.srcRef = 'net/ipv4/tcp_cubic.c:324';
  state.cwndHistory.push(state.cwnd);
  frames.push({
    step: 2,
    label: 'cubictcp_cong_avoid() in slow start',
    description:
      'cubictcp_cong_avoid() at net/ipv4/tcp_cubic.c:324 checks tcp_in_slow_start(tp) at ' +
      'line 332. In slow start (cwnd < ssthresh), it calls tcp_slow_start(tp, acked) at line 333 ' +
      'which doubles cwnd each RTT by adding one segment per ACK. The cwnd grows exponentially ' +
      'from 10 to 20 to 40 segments.',
    highlights: ['cwnd-display', 'cwnd-graph'],
    data: cloneState(state),
  });

  // Frame 3: Continued slow start growth
  state.cwnd = 80;
  state.currentFunction = 'tcp_slow_start';
  state.srcRef = 'net/ipv4/tcp_cubic.c:333';
  state.cwndHistory.push(state.cwnd);
  frames.push({
    step: 3,
    label: 'Exponential cwnd growth in slow start',
    description:
      'tcp_slow_start() continues doubling cwnd each RTT. cubictcp_cong_avoid() at ' +
      'net/ipv4/tcp_cubic.c:324 returns early at line 335 when all acked packets are consumed ' +
      'by slow start. The cwnd reaches 80 segments. Hystart++ (if enabled) monitors RTT ' +
      'samples to detect the end of slow start before loss occurs.',
    highlights: ['cwnd-display', 'cwnd-graph'],
    data: cloneState(state),
  });

  // Frame 4: Loss detected, ssthresh reduced
  state.phase = 'loss-detected';
  state.ssthresh = 56;
  state.currentFunction = 'cubictcp_recalc_ssthresh';
  state.srcRef = 'net/ipv4/tcp_cubic.c:341';
  state.cwndHistory.push(state.cwnd);
  frames.push({
    step: 4,
    label: 'Loss triggers cubictcp_recalc_ssthresh()',
    description:
      'Packet loss is detected. The kernel calls icsk->icsk_ca_ops->ssthresh(sk) at ' +
      'net/ipv4/tcp_input.c:2569 inside tcp_enter_loss(). This invokes cubictcp_recalc_ssthresh() ' +
      'at net/ipv4/tcp_cubic.c:341. It records last_max_cwnd = cwnd at line 353, then computes ' +
      'new ssthresh = max(cwnd * beta / BICTCP_BETA_SCALE, 2) at line 355 where beta=717 ' +
      '(~70% of cwnd). The epoch is reset at line 346.',
    highlights: ['ssthresh-line', 'cwnd-display'],
    data: cloneState(state),
  });

  // Frame 5: Enter congestion avoidance
  state.phase = 'congestion-avoidance';
  state.cwnd = 56;
  state.currentFunction = 'bictcp_update';
  state.srcRef = 'net/ipv4/tcp_cubic.c:214';
  state.cwndHistory.push(state.cwnd);
  frames.push({
    step: 5,
    label: 'bictcp_update() computes cubic function',
    description:
      'After loss recovery, cwnd is set to ssthresh. cubictcp_cong_avoid() at ' +
      'net/ipv4/tcp_cubic.c:324 now enters the congestion avoidance branch (cwnd >= ssthresh) ' +
      'and calls bictcp_update(ca, cwnd, acked) at line 337. bictcp_update() at line 214 ' +
      'computes the cubic function C*(t-K)^3 + Wmax. At line 235, if epoch_start == 0, ' +
      'a new epoch begins. K is computed at line 247 as cubic_root(cube_factor * (Wmax - cwnd)).',
    highlights: ['cwnd-display', 'cwnd-graph'],
    data: cloneState(state),
  });

  // Frame 6: Cubic function computation
  state.cwnd = 58;
  state.currentFunction = 'bictcp_update';
  state.srcRef = 'net/ipv4/tcp_cubic.c:279';
  state.cwndHistory.push(state.cwnd);
  frames.push({
    step: 6,
    label: 'Cubic curve: C*(t-K)^3 growth',
    description:
      'bictcp_update() at net/ipv4/tcp_cubic.c:214 computes the cubic target. At line 267, ' +
      't = tcp_jiffies32 - epoch_start measures time since last loss. At line 279, ' +
      'delta = (cube_rtt_scale * offs^3) >> (10+3*BICTCP_HZ) computes the cubic increment. ' +
      'If t < K (line 280), bic_target = origin_point - delta (concave region). ' +
      'If t >= K (line 283), bic_target = origin_point + delta (convex region). ' +
      'tcp_cong_avoid_ai() at line 338 applies the increment to cwnd.',
    highlights: ['cwnd-graph'],
    data: cloneState(state),
  });

  // Frame 7: Continued cubic growth
  state.cwnd = 62;
  state.currentFunction = 'tcp_cong_avoid_ai';
  state.srcRef = 'net/ipv4/tcp_cubic.c:338';
  state.cwndHistory.push(state.cwnd);
  frames.push({
    step: 7,
    label: 'Congestion avoidance: cwnd grows toward Wmax',
    description:
      'tcp_cong_avoid_ai() is called at net/ipv4/tcp_cubic.c:338 with ca->cnt controlling ' +
      'the growth rate. When bic_target > cwnd (line 286), cnt = cwnd / (bic_target - cwnd) ' +
      'at line 287, meaning cwnd grows faster when far from the target. As cwnd approaches ' +
      'last_max_cwnd, growth slows (concave phase). Past Wmax, growth accelerates (convex phase). ' +
      'This produces the characteristic S-shaped cubic curve.',
    highlights: ['cwnd-display', 'cwnd-graph'],
    data: cloneState(state),
  });

  // Frame 8: Cubic steady state
  state.cwnd = 68;
  state.currentFunction = 'cubictcp_cong_avoid';
  state.srcRef = 'net/ipv4/tcp_cubic.c:324';
  state.cwndHistory.push(state.cwnd);
  frames.push({
    step: 8,
    label: 'CUBIC steady state congestion avoidance',
    description:
      'cubictcp_cong_avoid() at net/ipv4/tcp_cubic.c:324 continues the cycle. Each ACK ' +
      'triggers tcp_ack() -> tcp_cong_control() at net/ipv4/tcp_input.c:3858 -> tcp_cong_avoid() ' +
      'at line 3513 -> cubictcp_cong_avoid(). The cwnd follows the cubic function, growing ' +
      'slowly near Wmax and faster away from it. The TCP friendliness check at line 292 in ' +
      'bictcp_update() ensures CUBIC is at least as aggressive as standard TCP (Reno).',
    highlights: ['cwnd-display', 'cwnd-graph'],
    data: cloneState(state),
  });

  return frames;
}

function generateBbrBandwidthProbing(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: TcpCongestionState = {
    algorithm: 'bbr',
    cwnd: 10,
    ssthresh: 65535,
    rtt: 20,
    bandwidth: null,
    bbrState: 'BBR_STARTUP',
    phase: 'startup',
    cwndHistory: [],
    currentFunction: 'bbr_init',
    srcRef: 'net/ipv4/tcp_bbr.c:1039',
  };

  // Frame 0: BBR initialization
  state.cwndHistory.push(state.cwnd);
  frames.push({
    step: 0,
    label: 'BBR congestion control initialization',
    description:
      'bbr_init() at net/ipv4/tcp_bbr.c:1039 initializes BBR state. Unlike CUBIC, BBR uses ' +
      'a model-based approach registered via .cong_control = bbr_main at line 1148. ' +
      'tcp_cong_control() at net/ipv4/tcp_input.c:3858 dispatches to icsk->icsk_ca_ops->cong_control ' +
      'at line 3863 instead of tcp_cong_avoid(). BBR starts in BBR_STARTUP mode (defined at ' +
      'net/ipv4/tcp_bbr.c:82) with high pacing gain to probe bandwidth.',
    highlights: ['algorithm-label', 'bbr-state'],
    data: cloneState(state),
  });

  // Frame 1: bbr_main processes first ACKs
  state.cwnd = 20;
  state.bandwidth = 500;
  state.currentFunction = 'bbr_main';
  state.srcRef = 'net/ipv4/tcp_bbr.c:1027';
  state.cwndHistory.push(state.cwnd);
  frames.push({
    step: 1,
    label: 'bbr_main() processes ACK in STARTUP',
    description:
      'bbr_main() at net/ipv4/tcp_bbr.c:1027 is the entry point for BBR on each ACK. ' +
      'It calls bbr_update_model(sk, rs) at line 1032, then computes bw = bbr_bw(sk) at ' +
      'line 1034, sets pacing rate via bbr_set_pacing_rate() at line 1035, and sets cwnd ' +
      'via bbr_set_cwnd() at line 1036. During STARTUP, the pacing_gain is high (2885/1024 ' +
      '~= 2.89x) to quickly fill the pipe.',
    highlights: ['cwnd-display', 'bbr-state'],
    data: cloneState(state),
  });

  // Frame 2: bbr_update_bw estimates bottleneck bandwidth
  state.cwnd = 40;
  state.bandwidth = 1200;
  state.currentFunction = 'bbr_update_bw';
  state.srcRef = 'net/ipv4/tcp_bbr.c:761';
  state.cwndHistory.push(state.cwnd);
  frames.push({
    step: 2,
    label: 'bbr_update_bw() estimates bottleneck bandwidth',
    description:
      'bbr_update_bw() at net/ipv4/tcp_bbr.c:761 estimates the bottleneck bandwidth. At line 785, ' +
      'bw = delivered * BW_UNIT / interval_us computes a bandwidth sample from delivery rate. ' +
      'At line 798, if the sample is not app-limited or exceeds current max, it is incorporated ' +
      'into the max filter via minmax_running_max() at line 800. The windowed max filter tracks ' +
      'the highest bandwidth seen over the last bbr_bw_rtts rounds.',
    highlights: ['bandwidth-display', 'cwnd-graph'],
    data: cloneState(state),
  });

  // Frame 3: STARTUP - check full bw reached
  state.cwnd = 80;
  state.bandwidth = 2000;
  state.currentFunction = 'bbr_check_full_bw_reached';
  state.srcRef = 'net/ipv4/tcp_bbr.c:873';
  state.cwndHistory.push(state.cwnd);
  frames.push({
    step: 3,
    label: 'bbr_check_full_bw_reached() monitors growth',
    description:
      'bbr_check_full_bw_reached() at net/ipv4/tcp_bbr.c:873 checks if bandwidth has plateaued. ' +
      'At line 882, bw_thresh = full_bw * bbr_full_bw_thresh >> BBR_SCALE (25% growth needed). ' +
      'If max_bw >= bw_thresh at line 883, full_bw is updated and counter resets. If bandwidth ' +
      'fails to grow 25% for 3 consecutive rounds (line 889), full_bw_reached is set to true, ' +
      'signaling the transition out of STARTUP.',
    highlights: ['bandwidth-display', 'bbr-state'],
    data: cloneState(state),
  });

  // Frame 4: Transition to DRAIN
  state.phase = 'drain';
  state.bbrState = 'BBR_DRAIN';
  state.cwnd = 60;
  state.bandwidth = 2000;
  state.currentFunction = 'bbr_check_drain';
  state.srcRef = 'net/ipv4/tcp_bbr.c:893';
  state.cwndHistory.push(state.cwnd);
  frames.push({
    step: 4,
    label: 'Transition to BBR_DRAIN state',
    description:
      'bbr_check_drain() at net/ipv4/tcp_bbr.c:893 transitions from STARTUP to DRAIN. ' +
      'At line 897, when mode == BBR_STARTUP and full_bw_reached, mode is set to BBR_DRAIN ' +
      'at line 898. The pacing gain is reduced to 1/high_gain (~0.35x, computed at line 155) ' +
      'to drain the queue created during STARTUP. snd_ssthresh is set to the BDP estimate ' +
      'at line 899-900.',
    highlights: ['bbr-state', 'cwnd-display'],
    data: cloneState(state),
  });

  // Frame 5: DRAIN completes, enter PROBE_BW
  state.phase = 'probe-bw';
  state.bbrState = 'BBR_PROBE_BW';
  state.cwnd = 50;
  state.bandwidth = 2000;
  state.currentFunction = 'bbr_reset_probe_bw_mode';
  state.srcRef = 'net/ipv4/tcp_bbr.c:621';
  state.cwndHistory.push(state.cwnd);
  frames.push({
    step: 5,
    label: 'Enter BBR_PROBE_BW steady state',
    description:
      'At net/ipv4/tcp_bbr.c:902, when inflight drops to BDP, bbr_reset_probe_bw_mode() ' +
      'at line 621 transitions to BBR_PROBE_BW. This is the steady state where BBR cycles ' +
      'through 8 phases with varying pacing gains [1.25, 0.75, 1, 1, 1, 1, 1, 1] to probe ' +
      'for more bandwidth. bbr_update_cycle_phase() at line 606 advances the cycle on each ' +
      'RTT. bbr_set_cwnd() at net/ipv4/tcp_bbr.c:519 sets cwnd based on BDP * cwnd_gain.',
    highlights: ['bbr-state', 'cwnd-graph'],
    data: cloneState(state),
  });

  // Frame 6: bbr_set_cwnd based on BDP
  state.cwnd = 52;
  state.bandwidth = 2100;
  state.currentFunction = 'bbr_set_cwnd';
  state.srcRef = 'net/ipv4/tcp_bbr.c:519';
  state.cwndHistory.push(state.cwnd);
  frames.push({
    step: 6,
    label: 'bbr_set_cwnd() sets cwnd from BDP',
    description:
      'bbr_set_cwnd() at net/ipv4/tcp_bbr.c:519 sets cwnd based on the bandwidth-delay product. ' +
      'At line 532, target_cwnd = bbr_bdp(sk, bw, gain) computes BDP. Line 537 adds ' +
      'ack aggregation headroom. At line 541, if full_bw_reached, cwnd = min(cwnd + acked, ' +
      'target_cwnd). Line 548 applies the global cap via tcp_snd_cwnd_set(). At line 549, ' +
      'in BBR_PROBE_RTT mode, cwnd is further capped to bbr_cwnd_min_target (4 packets).',
    highlights: ['cwnd-display', 'bandwidth-display'],
    data: cloneState(state),
  });

  // Frame 7: bbr_update_model orchestration
  state.cwnd = 50;
  state.bandwidth = 2100;
  state.currentFunction = 'bbr_update_model';
  state.srcRef = 'net/ipv4/tcp_bbr.c:1016';
  state.cwndHistory.push(state.cwnd);
  frames.push({
    step: 7,
    label: 'bbr_update_model() orchestrates state updates',
    description:
      'bbr_update_model() at net/ipv4/tcp_bbr.c:1016 is the central model update called by ' +
      'bbr_main(). It calls in sequence: bbr_update_bw() at line 1018, bbr_update_ack_aggregation() ' +
      'at line 1019, bbr_update_cycle_phase() at line 1020, bbr_check_full_bw_reached() at ' +
      'line 1021, bbr_check_drain() at line 1022, bbr_update_min_rtt() at line 1023, and ' +
      'bbr_update_gains() at line 1024. This sequence runs on every ACK.',
    highlights: ['bbr-state'],
    data: cloneState(state),
  });

  // Frame 8: PROBE_RTT
  state.phase = 'probe-rtt';
  state.bbrState = 'BBR_PROBE_RTT';
  state.cwnd = 4;
  state.bandwidth = 2100;
  state.currentFunction = 'bbr_update_min_rtt';
  state.srcRef = 'net/ipv4/tcp_bbr.c:941';
  state.cwndHistory.push(state.cwnd);
  frames.push({
    step: 8,
    label: 'BBR_PROBE_RTT: drain queue to measure min RTT',
    description:
      'bbr_update_min_rtt() at net/ipv4/tcp_bbr.c:941 checks if the min RTT filter has expired ' +
      '(line 948, after bbr_min_rtt_win_sec = 10 seconds). At line 957-959, if filter expired ' +
      'and not idle, mode transitions to BBR_PROBE_RTT. cwnd is capped to bbr_cwnd_min_target ' +
      '(4 packets) at line 549 in bbr_set_cwnd(). At line 969, once inflight <= 4, a 200ms ' +
      'timer starts (line 971). After the timer and one RTT round, bbr_check_probe_rtt_done() ' +
      'at line 908 restores cwnd and returns to PROBE_BW.',
    highlights: ['bbr-state', 'cwnd-display'],
    data: cloneState(state),
  });

  // Frame 9: Return to PROBE_BW
  state.phase = 'probe-bw';
  state.bbrState = 'BBR_PROBE_BW';
  state.cwnd = 50;
  state.currentFunction = 'bbr_check_probe_rtt_done';
  state.srcRef = 'net/ipv4/tcp_bbr.c:908';
  state.cwndHistory.push(state.cwnd);
  frames.push({
    step: 9,
    label: 'Return to BBR_PROBE_BW after RTT probe',
    description:
      'bbr_check_probe_rtt_done() at net/ipv4/tcp_bbr.c:908 fires when the 200ms probe_rtt ' +
      'timer expires (line 914) and at least one full RTT round has passed (line 978). ' +
      'It refreshes min_rtt_stamp at line 917 and restores the saved cwnd. The mode returns ' +
      'to BBR_PROBE_BW via bbr_reset_probe_bw_mode(). BBR continues cycling pacing gains to ' +
      'efficiently share bandwidth while maintaining low latency.',
    highlights: ['bbr-state', 'cwnd-graph'],
    data: cloneState(state),
  });

  return frames;
}

function generateLossRecovery(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: TcpCongestionState = {
    algorithm: 'cubic',
    cwnd: 80,
    ssthresh: 65535,
    rtt: 20,
    bandwidth: null,
    bbrState: null,
    phase: 'congestion-avoidance',
    cwndHistory: [],
    currentFunction: 'tcp_ack',
    srcRef: 'net/ipv4/tcp_input.c:4246',
  };

  // Frame 0: Normal operation before loss
  state.cwndHistory.push(state.cwnd);
  frames.push({
    step: 0,
    label: 'Normal congestion avoidance before loss',
    description:
      'tcp_ack() at net/ipv4/tcp_input.c:4246 processes ACKs during normal operation. ' +
      'The connection is in TCP_CA_Open state with cwnd=80. Each ACK triggers ' +
      'tcp_cong_control() at line 3858, which calls tcp_cong_avoid() at line 3873 to ' +
      'grow cwnd via CUBIC. cwnd grows slowly in the convex region of the cubic function.',
    highlights: ['cwnd-display'],
    data: cloneState(state),
  });

  // Frame 1: Duplicate ACKs arrive
  state.cwnd = 80;
  state.currentFunction = 'tcp_ack_is_dubious';
  state.srcRef = 'net/ipv4/tcp_input.c:3831';
  state.cwndHistory.push(state.cwnd);
  frames.push({
    step: 1,
    label: 'Duplicate ACKs detected',
    description:
      'tcp_ack() detects duplicate ACKs. At net/ipv4/tcp_input.c:4382, tcp_ack_is_dubious() ' +
      'at line 3831 returns true when there are SACKed or lost packets, or duplicate ACKs ' +
      'arrive. This triggers the loss detection path at line 4390, calling ' +
      'tcp_fastretrans_alert(sk, prior_snd_una, num_dupack, &flag, &rexmit).',
    highlights: ['cwnd-display'],
    data: cloneState(state),
  });

  // Frame 2: tcp_fastretrans_alert enters
  state.phase = 'loss-detected';
  state.currentFunction = 'tcp_fastretrans_alert';
  state.srcRef = 'net/ipv4/tcp_input.c:3328';
  state.cwndHistory.push(state.cwnd);
  frames.push({
    step: 2,
    label: 'tcp_fastretrans_alert() state machine',
    description:
      'tcp_fastretrans_alert() at net/ipv4/tcp_input.c:3328 is the central loss detection ' +
      'state machine. It checks for ECE at line 3341, SACK reneging at line 3345, and ' +
      'verifies left_out consistency at line 3349. Section D (line 3351) checks state exit ' +
      'conditions. Section E (line 3377) processes current state. In TCP_CA_Open or ' +
      'TCP_CA_Disorder, it calls tcp_time_to_recover() at line 3420 to determine if ' +
      'enough evidence of loss exists.',
    highlights: ['cwnd-display'],
    data: cloneState(state),
  });

  // Frame 3: Enter recovery
  state.currentFunction = 'tcp_enter_recovery';
  state.srcRef = 'net/ipv4/tcp_input.c:3177';
  state.cwndHistory.push(state.cwnd);
  frames.push({
    step: 3,
    label: 'tcp_enter_recovery() initiates fast recovery',
    description:
      'tcp_enter_recovery() at net/ipv4/tcp_input.c:3177 initiates SACK-based fast recovery. ' +
      'At line 3195, if not already in cwnd reduction, tcp_init_cwnd_reduction() halves cwnd ' +
      'via the ssthresh callback at line 3198. tcp_set_ca_state(sk, TCP_CA_Recovery) at ' +
      'line 3200 transitions the congestion state. For SACK recovery (line 3188), the ' +
      'LINUX_MIB_TCPSACKRECOVERY counter is incremented.',
    highlights: ['cwnd-display'],
    data: cloneState(state),
  });

  // Frame 4: ssthresh callback reduces cwnd
  state.phase = 'recovery';
  state.ssthresh = 56;
  state.cwnd = 56;
  state.currentFunction = 'cubictcp_recalc_ssthresh';
  state.srcRef = 'net/ipv4/tcp_cubic.c:341';
  state.cwndHistory.push(state.cwnd);
  frames.push({
    step: 4,
    label: 'cubictcp_recalc_ssthresh() reduces ssthresh',
    description:
      'The congestion control ssthresh callback is invoked. cubictcp_recalc_ssthresh() at ' +
      'net/ipv4/tcp_cubic.c:341 resets epoch_start to 0 at line 346 (end of epoch). ' +
      'Fast convergence at line 349: if cwnd < last_max_cwnd, last_max_cwnd is reduced ' +
      'further. Otherwise last_max_cwnd = cwnd at line 353. New ssthresh = ' +
      'max(cwnd * beta / BICTCP_BETA_SCALE, 2) at line 355, with beta=717 (~70%).',
    highlights: ['ssthresh-line', 'cwnd-display'],
    data: cloneState(state),
  });

  // Frame 5: Fast retransmit
  state.currentFunction = 'tcp_fastretrans_alert';
  state.srcRef = 'net/ipv4/tcp_input.c:3440';
  state.cwndHistory.push(state.cwnd);
  frames.push({
    step: 5,
    label: 'Fast retransmit: REXMIT_LOST',
    description:
      'At the end of tcp_fastretrans_alert(), line 3440 sets *rexmit = REXMIT_LOST, signaling ' +
      'tcp_ack() to retransmit lost segments. In TCP_CA_Recovery state (line 3379), ' +
      'tcp_identify_packet_loss() at line 3389 uses SACK information to mark specific ' +
      'segments as lost. The retransmission queue is walked to find and retransmit only ' +
      'the segments confirmed lost by SACK blocks.',
    highlights: ['cwnd-display'],
    data: cloneState(state),
  });

  // Frame 6: Recovery processing with partial ACKs
  state.cwnd = 52;
  state.currentFunction = 'tcp_process_loss';
  state.srcRef = 'net/ipv4/tcp_input.c:3379';
  state.cwndHistory.push(state.cwnd);
  frames.push({
    step: 6,
    label: 'Recovery: partial ACKs and SACK processing',
    description:
      'In TCP_CA_Recovery (net/ipv4/tcp_input.c:3379), each new ACK is processed. ' +
      'If snd_una advances (FLAG_SND_UNA_ADVANCED at line 3380), tcp_try_undo_partial() ' +
      'at line 3383 checks for spurious retransmits using D-SACK. tcp_try_undo_dsack() ' +
      'at line 3386 may undo the cwnd reduction. tcp_cwnd_reduction() at line 3870 ' +
      'gradually reduces cwnd during recovery via PRR (Proportional Rate Reduction).',
    highlights: ['cwnd-display', 'cwnd-graph'],
    data: cloneState(state),
  });

  // Frame 7: tcp_enter_loss (timeout case)
  state.cwnd = 40;
  state.ssthresh = 40;
  state.currentFunction = 'tcp_enter_loss';
  state.srcRef = 'net/ipv4/tcp_input.c:2553';
  state.cwndHistory.push(state.cwnd);
  frames.push({
    step: 7,
    label: 'tcp_enter_loss(): RTO timeout fallback',
    description:
      'If recovery fails (RTO fires), tcp_enter_loss() at net/ipv4/tcp_input.c:2553 enters ' +
      'TCP_CA_Loss state. At line 2569, ssthresh = icsk->icsk_ca_ops->ssthresh(sk) calls the ' +
      'congestion control callback. At line 2573, cwnd is set to packets_in_flight + 1. ' +
      'tcp_set_ca_state(sk, TCP_CA_Loss) at line 2586 transitions state. cubictcp_state() at ' +
      'net/ipv4/tcp_cubic.c:358 resets CUBIC state via bictcp_reset() at line 361 on CA_Loss.',
    highlights: ['ssthresh-line', 'cwnd-display'],
    data: cloneState(state),
  });

  // Frame 8: Recovery complete, return to open
  state.phase = 'congestion-avoidance';
  state.cwnd = 42;
  state.currentFunction = 'tcp_try_undo_recovery';
  state.srcRef = 'net/ipv4/tcp_input.c:3370';
  state.cwndHistory.push(state.cwnd);
  frames.push({
    step: 8,
    label: 'Recovery complete: return to TCP_CA_Open',
    description:
      'When all lost data is acknowledged (snd_una >= high_seq), tcp_fastretrans_alert() at ' +
      'net/ipv4/tcp_input.c:3356 checks state exit conditions. For TCP_CA_Recovery at line 3367, ' +
      'tcp_try_undo_recovery() at line 3370 checks for false retransmits. tcp_end_cwnd_reduction() ' +
      'at line 3372 finalizes the cwnd reduction. The state returns to TCP_CA_Open. CUBIC ' +
      'begins a new epoch with bictcp_update() computing the cubic function from the new Wmax.',
    highlights: ['cwnd-display', 'cwnd-graph'],
    data: cloneState(state),
  });

  return frames;
}

const tcpCongestion: AnimationModule = {
  config: {
    id: 'tcp-congestion',
    title: 'TCP Congestion Control: CUBIC and BBR',
    skillName: 'tcp-congestion-control',
  },

  getScenarios(): AnimationScenario[] {
    return [
      {
        id: 'cubic-slow-start-and-congestion',
        label: 'CUBIC: Slow Start and Congestion Avoidance',
      },
      {
        id: 'bbr-bandwidth-probing',
        label: 'BBR: Model-Based Bandwidth Probing',
      },
      {
        id: 'loss-recovery',
        label: 'Packet Loss Detection and Recovery',
      },
    ];
  },

  generateFrames(scenario?: string): AnimationFrame[] {
    const id = scenario ?? 'cubic-slow-start-and-congestion';
    switch (id) {
      case 'cubic-slow-start-and-congestion':
        return generateCubicSlowStartAndCongestion();
      case 'bbr-bandwidth-probing':
        return generateBbrBandwidthProbing();
      case 'loss-recovery':
        return generateLossRecovery();
      default:
        return generateCubicSlowStartAndCongestion();
    }
  },

  renderFrame(
    container: SVGGElement,
    frame: AnimationFrame,
    width: number,
    height: number,
  ): void {
    container.innerHTML = '';
    const ns = 'http://www.w3.org/2000/svg';
    const data = frame.data as TcpCongestionState;

    // Background panel
    const bg = document.createElementNS(ns, 'rect');
    bg.setAttribute('x', '0');
    bg.setAttribute('y', '0');
    bg.setAttribute('width', String(width));
    bg.setAttribute('height', String(height));
    bg.setAttribute('fill', '#1a1a2e');
    bg.setAttribute('rx', '8');
    container.appendChild(bg);

    // Algorithm label
    const algoText = document.createElementNS(ns, 'text');
    algoText.setAttribute('x', '20');
    algoText.setAttribute('y', '30');
    algoText.setAttribute('fill', '#e0e0e0');
    algoText.setAttribute('font-size', '16');
    algoText.setAttribute('font-weight', 'bold');
    algoText.textContent = `Algorithm: ${data.algorithm.toUpperCase()}`;
    if (frame.highlights.includes('algorithm-label')) {
      algoText.setAttribute('class', 'anim-highlight');
    }
    container.appendChild(algoText);

    // Current function
    const fnText = document.createElementNS(ns, 'text');
    fnText.setAttribute('x', '20');
    fnText.setAttribute('y', '55');
    fnText.setAttribute('fill', '#80cbc4');
    fnText.setAttribute('font-size', '13');
    fnText.textContent = `Function: ${data.currentFunction}()`;
    container.appendChild(fnText);

    // Source reference
    const srcText = document.createElementNS(ns, 'text');
    srcText.setAttribute('x', '20');
    srcText.setAttribute('y', '75');
    srcText.setAttribute('fill', '#888');
    srcText.setAttribute('font-size', '11');
    srcText.textContent = data.srcRef;
    container.appendChild(srcText);

    // Stats panel
    const statsX = width - 250;
    const statsY = 15;

    // cwnd display
    const cwndRect = document.createElementNS(ns, 'rect');
    cwndRect.setAttribute('x', String(statsX));
    cwndRect.setAttribute('y', String(statsY));
    cwndRect.setAttribute('width', '230');
    cwndRect.setAttribute('height', '80');
    cwndRect.setAttribute('fill', '#16213e');
    cwndRect.setAttribute('rx', '4');
    if (frame.highlights.includes('cwnd-display')) {
      cwndRect.setAttribute('class', 'anim-highlight');
      cwndRect.setAttribute('stroke', '#ffd54f');
      cwndRect.setAttribute('stroke-width', '2');
    }
    container.appendChild(cwndRect);

    const cwndLabel = document.createElementNS(ns, 'text');
    cwndLabel.setAttribute('x', String(statsX + 10));
    cwndLabel.setAttribute('y', String(statsY + 22));
    cwndLabel.setAttribute('fill', '#aaa');
    cwndLabel.setAttribute('font-size', '12');
    cwndLabel.textContent = 'cwnd / ssthresh';
    container.appendChild(cwndLabel);

    const cwndValue = document.createElementNS(ns, 'text');
    cwndValue.setAttribute('x', String(statsX + 10));
    cwndValue.setAttribute('y', String(statsY + 48));
    cwndValue.setAttribute('fill', '#4fc3f7');
    cwndValue.setAttribute('font-size', '20');
    cwndValue.setAttribute('font-weight', 'bold');
    cwndValue.textContent = `${data.cwnd} / ${data.ssthresh}`;
    container.appendChild(cwndValue);

    const phaseText = document.createElementNS(ns, 'text');
    phaseText.setAttribute('x', String(statsX + 10));
    phaseText.setAttribute('y', String(statsY + 70));
    phaseText.setAttribute('fill', '#ce93d8');
    phaseText.setAttribute('font-size', '12');
    phaseText.textContent = `Phase: ${data.phase}`;
    container.appendChild(phaseText);

    // BBR state display
    if (data.bbrState) {
      const bbrLabel = document.createElementNS(ns, 'text');
      bbrLabel.setAttribute('x', String(statsX + 10));
      bbrLabel.setAttribute('y', String(statsY + 110));
      bbrLabel.setAttribute('fill', '#ffab40');
      bbrLabel.setAttribute('font-size', '14');
      bbrLabel.setAttribute('font-weight', 'bold');
      bbrLabel.textContent = data.bbrState;
      if (frame.highlights.includes('bbr-state')) {
        bbrLabel.setAttribute('class', 'anim-highlight');
      }
      container.appendChild(bbrLabel);
    }

    // Bandwidth display (BBR)
    if (data.bandwidth !== null) {
      const bwText = document.createElementNS(ns, 'text');
      bwText.setAttribute('x', String(statsX + 10));
      bwText.setAttribute('y', String(statsY + 130));
      bwText.setAttribute('fill', '#a5d6a7');
      bwText.setAttribute('font-size', '12');
      bwText.textContent = `Bandwidth: ${data.bandwidth} Kbps`;
      if (frame.highlights.includes('bandwidth-display')) {
        bwText.setAttribute('class', 'anim-highlight');
      }
      container.appendChild(bwText);
    }

    // cwnd history graph
    const graphX = 20;
    const graphY = 100;
    const graphW = width - 300;
    const graphH = height - 140;

    // Graph background
    const graphBg = document.createElementNS(ns, 'rect');
    graphBg.setAttribute('x', String(graphX));
    graphBg.setAttribute('y', String(graphY));
    graphBg.setAttribute('width', String(graphW));
    graphBg.setAttribute('height', String(graphH));
    graphBg.setAttribute('fill', '#0f0f23');
    graphBg.setAttribute('rx', '4');
    if (frame.highlights.includes('cwnd-graph')) {
      graphBg.setAttribute('class', 'anim-highlight');
      graphBg.setAttribute('stroke', '#ffd54f');
      graphBg.setAttribute('stroke-width', '1');
    }
    container.appendChild(graphBg);

    // Graph title
    const graphTitle = document.createElementNS(ns, 'text');
    graphTitle.setAttribute('x', String(graphX + 10));
    graphTitle.setAttribute('y', String(graphY + 20));
    graphTitle.setAttribute('fill', '#888');
    graphTitle.setAttribute('font-size', '12');
    graphTitle.textContent = 'cwnd over time';
    container.appendChild(graphTitle);

    // ssthresh line
    if (data.ssthresh < 65535 && data.cwndHistory.length > 0) {
      const maxCwnd = Math.max(...data.cwndHistory, data.ssthresh) * 1.1;
      const ssY = graphY + graphH - (data.ssthresh / maxCwnd) * (graphH - 30);
      const ssLine = document.createElementNS(ns, 'line');
      ssLine.setAttribute('x1', String(graphX + 5));
      ssLine.setAttribute('y1', String(ssY));
      ssLine.setAttribute('x2', String(graphX + graphW - 5));
      ssLine.setAttribute('y2', String(ssY));
      ssLine.setAttribute('stroke', '#ef5350');
      ssLine.setAttribute('stroke-width', '1');
      ssLine.setAttribute('stroke-dasharray', '4,4');
      if (frame.highlights.includes('ssthresh-line')) {
        ssLine.setAttribute('class', 'anim-highlight');
      }
      container.appendChild(ssLine);

      const ssLabel = document.createElementNS(ns, 'text');
      ssLabel.setAttribute('x', String(graphX + graphW - 60));
      ssLabel.setAttribute('y', String(ssY - 5));
      ssLabel.setAttribute('fill', '#ef5350');
      ssLabel.setAttribute('font-size', '10');
      ssLabel.textContent = `ssthresh=${data.ssthresh}`;
      container.appendChild(ssLabel);
    }

    // Plot cwnd history
    if (data.cwndHistory.length > 1) {
      const maxCwnd = Math.max(...data.cwndHistory) * 1.2;
      const points = data.cwndHistory
        .map((c, i) => {
          const px = graphX + 10 + (i / (data.cwndHistory.length - 1)) * (graphW - 20);
          const py = graphY + graphH - 10 - (c / maxCwnd) * (graphH - 40);
          return `${px},${py}`;
        })
        .join(' ');

      const polyline = document.createElementNS(ns, 'polyline');
      polyline.setAttribute('points', points);
      polyline.setAttribute('fill', 'none');
      polyline.setAttribute('stroke', '#4fc3f7');
      polyline.setAttribute('stroke-width', '2');
      container.appendChild(polyline);

      // Current point
      const lastIdx = data.cwndHistory.length - 1;
      const lastPx =
        graphX + 10 + (lastIdx / (data.cwndHistory.length - 1)) * (graphW - 20);
      const lastPy =
        graphY + graphH - 10 - (data.cwndHistory[lastIdx] / maxCwnd) * (graphH - 40);
      const dot = document.createElementNS(ns, 'circle');
      dot.setAttribute('cx', String(lastPx));
      dot.setAttribute('cy', String(lastPy));
      dot.setAttribute('r', '4');
      dot.setAttribute('fill', '#ffd54f');
      container.appendChild(dot);
    }
  },
};

export default tcpCongestion;

---
name: tcp-congestion-control
description: Understand TCP congestion control algorithms including CUBIC and BBR in the kernel
realm: network
category: transport
difficulty: advanced
xp: 300
estimated_minutes: 120
prerequisites:
  - tcp-state-machine
unlocks: []
kernel_files:
  - net/ipv4/tcp_cong.c
  - net/ipv4/tcp_cubic.c
  - net/ipv4/tcp_bbr.c
doc_files:
  - Documentation/networking/tcp.rst
badge: Congestion Commander
tags:
  - tcp
  - cubic
  - bbr
  - congestion
---

# TCP Congestion Control

## Quest Briefing

Without congestion control, TCP would flood the network until packets are
dropped, causing congestion collapse -- a catastrophic condition where the
network carries almost no useful data despite being fully loaded. Congestion
control algorithms are the kernel's mechanism for sharing network capacity
fairly and efficiently, adapting the sending rate to available bandwidth
without explicit feedback from the network.

Linux implements a pluggable congestion control framework that allows
different algorithms to be loaded as modules and selected per-socket. The
default algorithm, CUBIC, uses a cubic function to grow the congestion window
aggressively when far from the last congestion event and cautiously when
near it. BBR (Bottleneck Bandwidth and Round-trip propagation time) takes a
fundamentally different approach, building a model of the network path and
pacing packets based on estimated bandwidth and RTT.

This is an advanced skill because congestion control sits at the intersection
of networking, control theory, and systems engineering. Understanding these
algorithms is essential for anyone diagnosing network performance issues,
deploying servers at scale, or contributing to the kernel's networking stack.

## Learning Objectives

- Describe the pluggable congestion control framework in tcp_cong.c
- Explain the CUBIC algorithm's cubic window growth function
- Understand BBR's bandwidth and RTT estimation model
- Trace how congestion events trigger window adjustments
- Compare loss-based (CUBIC) vs model-based (BBR) approaches

## Core Concepts

### The Pluggable Framework: tcp_cong.c

The congestion control framework in net/ipv4/tcp_cong.c provides a clean
interface for registering algorithms. Key structures and functions:

- tcp_cong_list -- a global linked list of registered algorithms (line 23)
- struct tcp_congestion_ops -- the operations table each algorithm implements
- tcp_ca_find() at line 26 -- looks up an algorithm by name
- tcp_ca_find_key() at line 66 -- looks up by hash key
- tcp_validate_congestion_control() at line 78 -- verifies required callbacks
- tcp_set_ca_state() at line 38 -- changes congestion avoidance state with tracing

Each algorithm must implement at minimum:

- ssthresh -- calculate slow start threshold after loss
- undo_cwnd -- restore cwnd after false loss detection
- cong_control or cong_avoid -- the main window update function

The CA states defined in the kernel:

- TCP_CA_Open -- normal operation, no loss detected
- TCP_CA_Disorder -- dupacks received, potential loss
- TCP_CA_CWR -- congestion window reduction in progress
- TCP_CA_Recovery -- fast recovery after loss
- TCP_CA_Loss -- timeout-based loss, severe congestion

### CUBIC: The Default Algorithm

CUBIC (net/ipv4/tcp_cubic.c) is the default congestion control in Linux. Its
key insight is using a cubic function centered on the window size where the
last congestion event occurred (W_max):

  W(t) = C * (t - K)^3 + W_max

where K = cubic_root(W_max * beta / C), C is a scaling factor, and beta
is the multiplicative decrease factor (0.7 for CUBIC).

Key functions:

- hystart_update() at line 386 -- implements Hybrid Slow Start to detect
  the end of slow start before losses occur, using RTT increase as a signal
- The module registers via tcp_congestion_ops with name "cubic"

CUBIC's behavior:
1. After a loss, cwnd is reduced to W_max * beta (70% of the max)
2. Window grows slowly near W_max (the concave region)
3. Window grows aggressively past W_max (the convex region)
4. This creates a cubic curve that is conservative near known limits
   and aggressive in exploring new bandwidth

### BBR: Model-Based Congestion Control

BBR (net/ipv4/tcp_bbr.c) takes a fundamentally different approach from
loss-based algorithms. Instead of interpreting loss as congestion, BBR
builds an explicit model of the network path:

- BtlBw (Bottleneck Bandwidth) -- the maximum delivery rate observed
- RTprop (Round-trip propagation time) -- the minimum RTT observed

BBR cycles through phases to probe for bandwidth and drain queues:

Key functions in tcp_bbr.c:

- bbr_init_pacing_rate_from_rtt() at line 266 -- sets initial pacing rate
- bbr_set_pacing_rate() at line 286 -- adjusts pacing based on estimated BW
- bbr_set_cwnd() at line 519 -- sets congestion window from BW-delay product
- bbr_update_bw() at line 761 -- updates bandwidth estimate from ACK rate
- bbr_check_full_bw_reached() at line 873 -- detects end of STARTUP phase
- bbr_update_cycle_phase() at line 601 -- advances the probe bandwidth cycle
- bbr_check_probe_rtt_done() at line 204 -- manages the RTT probing phase
- bbr_save_cwnd() at line 321 -- saves cwnd before entering loss recovery
- bbr_full_bw_reached() at line 207 -- checks if startup bandwidth plateau hit
- bbr_is_next_cycle_phase() at line 554 -- determines cycle phase transitions

BBR's four phases:
1. STARTUP -- exponential growth to find BtlBw (like slow start)
2. DRAIN -- reduce inflight to match BDP after startup overshoot
3. PROBE_BW -- steady state, cycling gain to probe for more bandwidth
4. PROBE_RTT -- periodically reduces cwnd to measure true RTprop

### Long-term Bandwidth Sampling

BBR includes a long-term bandwidth sampling mechanism to detect policers
and token bucket shapers:

- bbr_lt_bw_sampling() at line 688 -- samples bandwidth over longer intervals
- bbr_lt_bw_interval_done() at line 658 -- checks if a sampling interval ended
- bbr_reset_lt_bw_sampling() at line 647 -- resets the sampling state

This helps BBR avoid over-sending when a policer limits throughput to a rate
below the bottleneck link capacity.

## Code Walkthrough

Trace what happens when a CUBIC connection experiences packet loss:

1. tcp_rcv_established() receives dupacks indicating a lost packet
2. The TCP stack enters TCP_CA_Recovery state via tcp_set_ca_state()
3. CUBIC's ssthresh callback is called to calculate the new threshold:
   - Records the current cwnd as W_max
   - Sets ssthresh = cwnd * beta_cubic (70% of cwnd)
4. Fast recovery begins: cwnd is reduced to ssthresh
5. As ACKs arrive during recovery, CUBIC's cong_avoid callback updates cwnd
6. The cubic function W(t) = C*(t-K)^3 + W_max governs the growth rate
7. Near W_max: slow growth (concave region, cautious probing)
8. Past W_max: accelerating growth (convex region, bandwidth discovery)
9. If another loss occurs, the process repeats with the new W_max
10. Hystart may detect congestion during slow start via RTT signals, exiting
    slow start before losses occur

## Hands-On Challenges

### Challenge 1: Compare CUBIC and BBR Throughput (100 XP)

Set up a test environment with tc netem to add 50ms RTT and 1% packet loss.
Use iperf3 to measure throughput with CUBIC (default) and BBR (set via
sysctl net.ipv4.tcp_congestion_control=bbr). Record throughput, RTT, and
retransmissions for each. Explain why BBR may perform better under loss.

### Challenge 2: Trace Congestion Window Evolution (100 XP)

Use the tcp_probe tracepoint or "ss -ti" to log cwnd, ssthresh, and RTT
over time during a long transfer. Plot the congestion window evolution and
identify slow start, congestion avoidance, and loss recovery phases.
Compare the cubic growth curve with BBR's steady-state cycling.

### Challenge 3: Write a Custom Congestion Control Module (100 XP)

Create a kernel module that implements a simple AIMD (Additive Increase,
Multiplicative Decrease) congestion control algorithm. Register it via
tcp_register_congestion_control(). Implement ssthresh (halve the window)
and cong_avoid (increase by 1 per RTT). Test it with iperf3 and compare
throughput with CUBIC.

## Verification Criteria

- [ ] Can describe the tcp_congestion_ops interface and required callbacks
- [ ] Can explain CUBIC's cubic growth function and W_max-centered behavior
- [ ] Can explain BBR's four phases (STARTUP, DRAIN, PROBE_BW, PROBE_RTT)
- [ ] Can trace a loss event through ssthresh calculation and recovery
- [ ] Can compare loss-based (CUBIC) vs model-based (BBR) design tradeoffs
- [ ] Can use ss -ti and tcp tracepoints to observe congestion control state
- [ ] Can select and configure congestion control per-socket or system-wide

---
name: tcp-state-machine
description: Master the TCP state machine and connection lifecycle in the Linux kernel
realm: network
category: transport
difficulty: intermediate
xp: 200
estimated_minutes: 100
prerequisites:
  - socket-layer
unlocks:
  - tcp-congestion-control
kernel_files:
  - net/ipv4/tcp.c
  - net/ipv4/tcp_input.c
  - net/ipv4/tcp_output.c
  - include/net/tcp_states.h
doc_files:
  - Documentation/networking/tcp.rst
badge: TCP Navigator
tags:
  - tcp
  - state-machine
  - handshake
---

# TCP State Machine

## Quest Briefing

TCP is the backbone of reliable Internet communication. Every web page load,
SSH session, and database query depends on TCP to deliver data in order and
without loss. At the heart of TCP lies a state machine that governs connection
establishment, data transfer, and teardown -- and in the Linux kernel, this
state machine is implemented across thousands of lines of carefully optimized
code.

The Linux TCP implementation is one of the most battle-tested networking stacks
in existence. It handles everything from the three-way handshake to graceful
shutdown, from retransmission timers to window scaling. The state machine
defined in include/net/tcp_states.h drives all of these behaviors, with state
transitions triggered by incoming packets processed in tcp_input.c and outgoing
packets constructed in tcp_output.c.

Understanding the TCP state machine is essential for network debugging,
performance tuning, and security analysis. When you see TIME_WAIT sockets
accumulating, SYN floods consuming resources, or connections stuck in
CLOSE_WAIT, the state machine tells you exactly what went wrong and why.

## Learning Objectives

- Enumerate all TCP states and describe the valid transitions between them
- Trace the three-way handshake through tcp_connect() and tcp_rcv_state_process()
- Explain how tcp_set_state() manages state transitions with proper accounting
- Understand connection teardown including FIN, TIME_WAIT, and tcp_done()
- Navigate the TCP source files and identify the key processing functions

## Core Concepts

### TCP States

The TCP states are defined in include/net/tcp_states.h as an enum:

- TCP_ESTABLISHED (1) -- connection is active and data can flow
- TCP_SYN_SENT (2) -- SYN sent, waiting for SYN-ACK
- TCP_SYN_RECV (3) -- SYN received, SYN-ACK sent, waiting for ACK
- TCP_FIN_WAIT1 (4) -- FIN sent, waiting for ACK or FIN
- TCP_FIN_WAIT2 (5) -- our FIN acknowledged, waiting for peer's FIN
- TCP_TIME_WAIT (6) -- waiting for enough time to pass to ensure peer received ACK
- TCP_CLOSE (7) -- connection is fully closed
- TCP_CLOSE_WAIT (8) -- peer sent FIN, waiting for local close
- TCP_LAST_ACK (9) -- FIN sent after CLOSE_WAIT, waiting for ACK
- TCP_LISTEN (10) -- listening for incoming connections
- TCP_CLOSING (11) -- both sides sent FIN simultaneously
- TCP_NEW_SYN_RECV (12) -- optimized state for SYN cookies

The TCPF_ flags (bitmask versions) allow efficient state testing.

### Connection Establishment: The Three-Way Handshake

The client-side handshake in net/ipv4/tcp_output.c:

1. Application calls connect() which reaches tcp_v4_connect() in net/ipv4/tcp_ipv4.c
2. tcp_v4_connect() calls tcp_set_state(sk, TCP_SYN_SENT) at line 1093
3. tcp_connect() at line 4296 builds the SYN segment:
   - Allocates an skb and fills TCP options (window scale, timestamps, SACK)
   - Calls tcp_transmit_skb() at line 1512 to send the SYN
   - Optionally uses tcp_send_syn_data() at line 4199 for TCP Fast Open
4. When the SYN-ACK arrives, tcp_rcv_state_process() at line 7170 in
   tcp_input.c processes it in the TCP_SYN_SENT state
5. tcp_finish_connect() at line 6753 transitions to TCP_ESTABLISHED

The server-side handshake:

1. Server calls listen(), setting the socket to TCP_LISTEN
2. Incoming SYN creates a request_sock (TCP_NEW_SYN_RECV state)
3. Server sends SYN-ACK; when ACK arrives, a full socket is created
4. The new socket starts in TCP_SYN_RECV and transitions to TCP_ESTABLISHED

### State Transitions: tcp_set_state()

The tcp_set_state() function at line 2997 in net/ipv4/tcp.c is the central
state transition function. It:

1. Records the old and new states for tracing
2. Updates per-network-namespace socket counters
3. Handles special transitions (entering/leaving ESTABLISHED or TIME_WAIT)
4. Calls inet_sk_set_state() to update sk->sk_state
5. Integrates with BPF hooks for observability

Every state transition in TCP goes through this function, making it the
single point of truth for connection state changes.

### Connection Teardown

The graceful close sequence:

1. Application calls close() which reaches tcp_close() in net/ipv4/tcp.c
2. If data remains in the receive queue, sends RST (connection reset)
3. Otherwise, sends FIN via tcp_send_fin() and enters TCP_FIN_WAIT1
4. When the peer's ACK arrives, transitions to TCP_FIN_WAIT2
5. When the peer's FIN arrives, tcp_fin() at line 4947 in tcp_input.c
   transitions to TCP_TIME_WAIT
6. The TIME_WAIT state lasts for 2*MSL (typically 60 seconds) to handle
   delayed packets

The tcp_done() function at line 5060 in tcp/tcp.c is the final cleanup:
it transitions to TCP_CLOSE, stops all timers, and releases resources.

### Data Processing: tcp_rcv_established()

For established connections, tcp_rcv_established() at line 6519 in
tcp_input.c is the fast-path packet processor. It:

1. Validates sequence numbers and ACKs
2. Processes TCP timestamps for RTT estimation
3. Handles the "fast path" for in-order data (header prediction)
4. Falls through to the "slow path" for out-of-order segments, SACK, etc.
5. Delivers data to the socket receive buffer
6. Triggers ACK generation via delayed ACK or quick ACK mechanisms

## Code Walkthrough

Trace a complete TCP connection lifecycle:

1. Server: socket() -> bind() -> listen() sets sk_state to TCP_LISTEN
2. Client: connect() -> tcp_v4_connect() -> tcp_connect() sends SYN
3. tcp_set_state(sk, TCP_SYN_SENT) updates the client socket state
4. Server receives SYN: creates request_sock in TCP_NEW_SYN_RECV
5. Server sends SYN-ACK via tcp_transmit_skb()
6. Client receives SYN-ACK: tcp_rcv_state_process() in TCP_SYN_SENT state
7. tcp_finish_connect() sets client to TCP_ESTABLISHED
8. Client sends ACK, server receives it: server socket -> TCP_ESTABLISHED
9. Data flows: tcp_rcv_established() handles packets on the fast path
10. Client calls close(): tcp_close() sends FIN -> TCP_FIN_WAIT1
11. Server ACKs FIN: client -> TCP_FIN_WAIT2
12. Server calls close(): sends FIN -> TCP_LAST_ACK
13. Client receives FIN: tcp_fin() -> TCP_TIME_WAIT (60 second timer)
14. Server receives final ACK: tcp_done() -> TCP_CLOSE
15. Client's TIME_WAIT timer expires: tcp_done() -> TCP_CLOSE

## Hands-On Challenges

### Challenge 1: Observe TCP States with ss (75 XP)

Write a client-server program that establishes a connection, transfers data,
and closes gracefully. Use "ss -tnao" at each stage to observe the TCP
state transitions. Capture the ESTABLISHED, FIN_WAIT1, FIN_WAIT2, TIME_WAIT,
and CLOSE_WAIT states. Verify TIME_WAIT duration with timestamps.

### Challenge 2: Trace the Three-Way Handshake (75 XP)

Use ftrace to trace tcp_set_state, tcp_connect, tcp_rcv_state_process, and
tcp_finish_connect during a connection establishment. Correlate the function
calls with tcpdump output showing SYN, SYN-ACK, and ACK packets. Verify
the state transitions match the TCP state diagram.

### Challenge 3: Investigate a SYN Flood (50 XP)

Use hping3 or scapy to send SYN packets without completing the handshake.
Monitor /proc/net/tcp to observe sockets accumulating in SYN_RECV state.
Check the SYN backlog with "ss -tnl" and observe how SYN cookies
(tcp_syncookies) provide protection by avoiding request_sock allocation.

## Verification Criteria

- [ ] Can enumerate all 12 TCP states and draw the state transition diagram
- [ ] Can trace tcp_connect() through SYN transmission to ESTABLISHED
- [ ] Can explain how tcp_set_state() manages state transitions and accounting
- [ ] Can describe the TIME_WAIT state purpose and duration
- [ ] Can explain tcp_rcv_established() fast path vs slow path processing
- [ ] Can use ss, /proc/net/tcp, and ftrace to observe TCP states
- [ ] Can describe TCP Fast Open and its interaction with the state machine

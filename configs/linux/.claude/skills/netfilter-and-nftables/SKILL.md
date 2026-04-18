---
name: netfilter-and-nftables
description: Explore the netfilter hook framework and nftables packet filtering engine
realm: network
category: filtering
difficulty: intermediate
xp: 200
estimated_minutes: 90
prerequisites:
  - socket-layer
unlocks: []
kernel_files:
  - net/netfilter/core.c
  - net/netfilter/nf_tables_api.c
  - include/linux/netfilter.h
doc_files:
  - Documentation/networking/netfilter.rst
  - Documentation/networking/nf_conntrack-sysctl.rst
badge: Packet Guardian
tags:
  - netfilter
  - nftables
  - hooks
---

# Netfilter and nftables

## Quest Briefing

Every packet that enters, leaves, or traverses a Linux system passes through
a series of hook points in the network stack. Netfilter is the framework that
defines these hook points and allows kernel modules to inspect, modify, drop,
or redirect packets at each stage. It is the foundation on which all Linux
firewalling, NAT, and packet mangling is built.

nftables is the modern packet classification engine that replaced iptables.
While iptables used a fixed set of tables and chains with match-and-target
semantics, nftables provides a virtual machine that evaluates expressions
against packets, offering better performance and more flexible rule
composition. The nf_tables_api.c file alone is one of the largest in the
kernel networking stack, implementing the netlink-based API that userspace
tools use to manage rules.

Understanding netfilter and nftables is essential for anyone working on
Linux security, container networking, or load balancing. When you configure
a firewall, set up Docker networking, or debug why packets are being dropped,
you are interacting with the code described in this skill.

## Learning Objectives

- Describe the five netfilter hook points and their positions in the network stack
- Trace a packet through the netfilter hook evaluation in nf_hook_slow()
- Explain how nftables registers chains at hook points via nf_tables_api.c
- Understand the hook registration mechanism and priority ordering
- Describe the netfilter verdict system (ACCEPT, DROP, STOLEN, QUEUE, REPEAT)

## Core Concepts

### Netfilter Hook Points

Netfilter defines five hook points for IPv4 (and analogous points for IPv6):

- NF_INET_PRE_ROUTING -- after packet reception, before routing decision
- NF_INET_LOCAL_IN -- for packets destined to the local machine
- NF_INET_FORWARD -- for packets being routed through the machine
- NF_INET_LOCAL_OUT -- for locally generated outbound packets
- NF_INET_POST_ROUTING -- just before packet transmission

Each hook point can have multiple hooks registered at different priorities.
In net/netfilter/core.c:

- nf_hooks_needed[] at line 35 -- static keys that enable/disable hook processing
- MAX_HOOK_COUNT at line 42 -- maximum hooks per family/hooknum (1024)
- nf_hook_mutex at line 39 -- protects hook registration/deregistration

### Hook Registration and Evaluation

Hooks are registered via nf_register_net_hook() at line 554 in core.c. The
internal __nf_register_net_hook() at line 393 handles the actual registration:

1. Allocates a new nf_hook_entries array with space for the new hook
2. Copies existing hooks and inserts the new one sorted by priority
3. Uses RCU to swap the new array in place of the old one
4. Enables the static key so the fast path checks for hooks

Hook evaluation happens in nf_hook_slow() at line 616:

1. Called from the NF_HOOK() macro in the network stack
2. Iterates through the hook entries array in priority order
3. Calls each hook function with the skb and hook state
4. If a hook returns NF_ACCEPT, continues to the next hook
5. If NF_DROP, the packet is freed and processing stops
6. If NF_STOLEN, the hook has taken ownership of the packet
7. If NF_QUEUE, the packet is sent to userspace via nf_queue

The nf_hook_slow_list() variant processes a list of packets for batch
efficiency.

### nftables: The Packet Classification Engine

nftables implements its functionality through the nf_tables_api.c file in
net/netfilter/. Key structures:

- struct nft_table -- a named container for chains and sets
- struct nft_chain -- a sequence of rules attached to a hook point
- struct nft_rule -- a list of expressions to evaluate
- struct nft_expr -- a single operation (compare, payload load, verdict, etc.)

Registration functions in nf_tables_api.c:

- nf_tables_register_hook() at line 394 -- registers a chain's hook
- nf_tables_unregister_hook() at line 441 -- removes a chain's hook
- nf_tables_bind_chain() at line 293 -- binds a chain to a table
- nf_tables_unbind_chain() at line 313 -- unbinds a chain
- nft_ctx_init() at line 155 -- initializes the context for rule evaluation

Transaction management:

- nft_trans_list_del() at line 210 -- removes a pending transaction
- nft_trans_destroy() at line 221 -- frees a completed transaction
- nf_tables_trans_destroy_work() at line 150 -- background cleanup worker
- nft_trans_gc_work() at line 152 -- garbage collection for set elements

### The Verdict System

When a hook function evaluates a packet, it returns a verdict:

- NF_ACCEPT (1) -- continue processing, call next hook
- NF_DROP (0) -- drop the packet and free the skb
- NF_STOLEN (2) -- hook has consumed the packet; caller must not touch it
- NF_QUEUE (3) -- queue to userspace via nfnetlink_queue
- NF_REPEAT (4) -- call this hook again

nftables extends this with chain verdicts (jump, goto) that allow complex
rule chains to be composed together.

## Code Walkthrough

Trace an incoming packet through netfilter:

1. A packet arrives at the network interface and is processed by the driver
2. The IP layer calls NF_HOOK(NFPROTO_IPV4, NF_INET_PRE_ROUTING, ...)
3. If nf_hooks_needed[NFPROTO_IPV4][NF_INET_PRE_ROUTING] is set, the
   static key branches to the hook evaluation path
4. nf_hook_slow() is called with the skb and the hook state
5. It iterates through nf_hook_entries in priority order
6. For an nftables chain registered at this hook point:
   - The nft evaluation loop processes each rule's expressions
   - Expressions load packet fields, compare values, track connections
   - The final expression in a matching rule provides the verdict
7. If all hooks return NF_ACCEPT, the packet continues to the routing layer
8. The routing decision determines LOCAL_IN (for this host) or FORWARD
9. Another NF_HOOK call at the next hook point repeats the process
10. The packet eventually reaches POST_ROUTING before transmission

## Hands-On Challenges

### Challenge 1: Trace Packet Through Hooks (75 XP)

Use ftrace to trace nf_hook_slow while pinging the machine from another host.
Observe which hook points are traversed (PRE_ROUTING, LOCAL_IN). Then set up
IP forwarding and trace a forwarded packet to see PRE_ROUTING, FORWARD, and
POST_ROUTING. Compare the hook sequences.

### Challenge 2: Build an nftables Ruleset (50 XP)

Use the nft command to create a table, add an input chain with a filter hook,
and add rules to accept SSH traffic and drop everything else. Verify with
"nft list ruleset". Then use "cat /proc/net/netfilter/nf_tables" to inspect
the kernel-side state and match it to your ruleset.

### Challenge 3: Measure Hook Overhead (75 XP)

Measure baseline network latency with ping. Then add 100 nftables rules and
measure again. Use perf to profile nf_hook_slow and the nft evaluation loop.
Calculate the per-packet overhead of rule evaluation and determine at what
rule count the overhead becomes significant.

## Verification Criteria

- [ ] Can name and order the five netfilter hook points for IPv4
- [ ] Can explain how nf_register_net_hook() inserts hooks sorted by priority
- [ ] Can trace nf_hook_slow() iteration through the hook entries array
- [ ] Can describe the NF_ACCEPT/DROP/STOLEN/QUEUE verdict semantics
- [ ] Can explain how nftables registers chains at hook points
- [ ] Can use nft and /proc/net/netfilter to inspect active rules
- [ ] Can describe the role of RCU in enabling lockless hook evaluation

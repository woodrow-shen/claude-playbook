---
name: sk-buff-lifecycle
description: Master the sk_buff structure lifecycle from allocation through transmission and GRO
realm: network
category: core-networking
difficulty: intermediate
xp: 200
estimated_minutes: 90
prerequisites:
  - socket-layer
unlocks: []
kernel_files:
  - net/core/skbuff.c
  - include/linux/skbuff.h
  - net/core/gro.c
doc_files:
  - Documentation/networking/skbuff.rst
badge: Buffer Alchemist
tags:
  - skb
  - sk-buff
  - gro
  - gso
---

# sk_buff Lifecycle

## Quest Briefing

The sk_buff (socket buffer) is the single most important data structure in
Linux networking. Every packet that enters, traverses, or leaves the system
is represented as an sk_buff. It carries not just the packet data but also
metadata about the packet's journey through the network stack: which device
it arrived on, which socket it belongs to, what protocol headers have been
parsed, and what transformations have been applied.

Understanding the sk_buff lifecycle -- from allocation through processing to
freeing -- is essential for anyone working on network drivers, protocol
implementations, or packet processing. The sk_buff is designed for speed:
it avoids copying data wherever possible, using pointers to navigate through
protocol headers and supporting scatter-gather I/O through page fragments.

Modern high-performance networking adds two key optimizations built on
sk_buff: GRO (Generic Receive Offload) aggregates small incoming packets
into larger ones to reduce per-packet overhead, while GSO (Generic
Segmentation Offload) delays segmentation of large outgoing packets until
the last possible moment. Together, they can improve throughput by 10x or
more on busy servers.

## Learning Objectives

- Describe the sk_buff structure and its key fields (head, data, tail, end)
- Trace an sk_buff from allocation through protocol processing to freeing
- Explain the sk_buff data area layout and how headers are pushed/pulled
- Understand cloning, sharing, and reference counting of sk_buffs
- Describe GRO aggregation and GSO segmentation mechanisms

## Core Concepts

### The sk_buff Structure

The struct sk_buff (defined in include/linux/skbuff.h) has a linear data
area and optional paged fragments. The linear data area is bounded by four
pointers:

- head -- start of the allocated buffer
- data -- start of the current packet data
- tail -- end of the current packet data
- end -- end of the allocated buffer

Space between head and data is "headroom" for prepending headers (e.g., when
forwarding). Space between tail and end is "tailroom" for appending data.
The skb_push() and skb_pull() functions adjust the data pointer to add or
remove protocol headers without copying.

Key metadata fields:

- sk -- the owning socket (may be NULL for forwarded packets)
- dev -- the network device
- protocol -- the L3 protocol (ETH_P_IP, etc.)
- transport_header, network_header, mac_header -- offsets to parsed headers
- len -- total data length including paged fragments
- data_len -- length of data in paged fragments only

### Allocation and Freeing

The sk_buff allocation functions in net/core/skbuff.c:

- __build_skb_around() at line 454 -- initializes an skb around existing data
- skb_over_panic() at line 217 -- called when skb bounds are violated
- skb_under_panic() at line 222 -- called when headroom is exhausted

Freeing functions form a hierarchy:

- __kfree_skb() at line 1215 -- frees an skb unconditionally
- __sk_skb_reason_drop() at line 1223 -- drops with a recorded reason
- consume_skb() at line 1444 -- frees a successfully processed skb
- kfree_skbmem() at line 1145 -- frees the skb structure itself
- skb_release_data() at line 1105 -- releases the data area and fragments
- skb_release_head_state() at line 1175 -- releases socket and destructor refs
- skb_release_all() at line 1199 -- combines head state and data release

The NAPI (New API) fast path uses per-CPU caches:

- napi_skb_cache_put() at line 1469 -- returns skb to per-CPU cache
- __napi_kfree_skb() at line 1494 -- fast free for NAPI context
- __consume_stateless_skb() at line 1462 -- frees without socket accounting

### Cloning and Sharing

sk_buffs support efficient sharing through cloning:

- skb_clone() creates a new sk_buff that shares the same data buffer
- Both the original and clone point to the same data pages
- Reference counts (skb_shared_info) track sharing
- skb_pp_frag_ref() at line 1063 handles page pool fragment references
- Modifications require skb_cow_data() to copy-on-write the shared data

Page fragments (skb_shared_info->frags[]) allow zero-copy I/O:

- skb_add_rx_frag_netmem() at line 894 -- adds a received page fragment
- skb_coalesce_rx_frag() at line 906 -- merges adjacent fragments
- skb_clone_fraglist() at line 931 -- clones the fragment list

### GRO: Generic Receive Offload

GRO in net/core/gro.c aggregates multiple small packets into larger ones
before they enter the protocol stack, reducing per-packet processing overhead:

- gro_init() at line 803 -- initializes the GRO state for a NAPI instance
- gro_cleanup() at line 817 -- tears down GRO state
- gro_list_prepare() at line 343 -- prepares the GRO list for matching
- skb_gro_receive() at line 92 -- merges a new packet into an existing GRO flow
- skb_gro_receive_list() at line 225 -- list-based variant for tunnel protocols
- gro_complete() at line 252 -- finalizes a GRO packet and sends it up the stack
- __gro_flush() at line 312 -- flushes all pending GRO packets
- gro_flush_oldest() at line 443 -- prevents holding packets too long
- gro_try_pull_from_frag0() at line 435 -- pulls headers into the linear area

GRO works by holding recently received packets in a per-NAPI GRO list.
When a new packet arrives that matches an existing flow (same 5-tuple and
protocol), it is merged into the existing skb by extending the fragment
list. When the packet cannot be merged (different flow, maximum size
reached, or timeout), the accumulated packet is flushed up the stack.

### GSO: Generic Segmentation Offload

GSO works in the opposite direction from GRO. Large packets (up to 64KB)
are passed through the protocol stack as a single sk_buff and only segmented
into MTU-sized packets at the device driver level. If the NIC supports TSO
(TCP Segmentation Offload), the hardware performs the segmentation. Otherwise,
the kernel performs software GSO just before transmission.

Key fields: gso_size (segment size), gso_segs (segment count), and
gso_type (protocol type) in skb_shared_info.

## Code Walkthrough

Trace an incoming TCP packet through the sk_buff lifecycle:

1. The NIC driver allocates an skb (or reuses one from the NAPI cache)
2. DMA fills the data buffer; the driver sets skb->data, skb->len
3. The driver calls napi_gro_receive() to submit the skb for GRO processing
4. gro_list_prepare() checks if the packet matches an existing GRO flow
5. If matched: skb_gro_receive() appends the new packet's data as fragments
6. If not matched or GRO limit reached: gro_complete() sends the merged skb up
7. The IP layer processes the packet: skb_pull() removes the IP header
8. The TCP layer processes the segment: data is queued to the socket
9. When the application reads with recv(), data is copied to userspace
10. consume_skb() frees the skb: skb_release_data() releases page fragments,
    kfree_skbmem() returns the skb structure to the slab cache

## Hands-On Challenges

### Challenge 1: Inspect sk_buff Layout (75 XP)

Write a kernel module that registers a netfilter hook. In the hook function,
print the skb's key fields: head, data, tail, end, len, data_len,
mac_header, network_header, transport_header. Send packets of different sizes
and observe how the layout changes. Verify headroom and tailroom calculations.

### Challenge 2: Measure GRO Aggregation (75 XP)

Use ethtool to disable and enable GRO on an interface. Run iperf3 and
compare throughput and CPU usage. Use /proc/net/softnet_stat to observe
per-CPU packet rates and verify that GRO reduces the per-packet rate
while maintaining throughput. Check the GRO coalescing ratio with
ethtool -S statistics.

### Challenge 3: Trace skb Allocation and Freeing (50 XP)

Use ftrace to trace __kfree_skb, consume_skb, and the skb allocation
functions during a network transfer. Verify that every allocation has a
corresponding free. Use the skb:kfree_skb tracepoint to see drop reasons
for packets that are dropped rather than consumed.

## Verification Criteria

- [ ] Can describe the sk_buff head/data/tail/end pointer layout
- [ ] Can explain skb_push and skb_pull for navigating protocol headers
- [ ] Can trace an skb from driver allocation through protocol processing to free
- [ ] Can explain sk_buff cloning and shared data reference counting
- [ ] Can describe GRO flow matching and packet merging in gro.c
- [ ] Can explain the difference between GRO (receive) and GSO (transmit)
- [ ] Can use ethtool and /proc/net/softnet_stat to observe GRO behavior

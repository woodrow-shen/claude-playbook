---
name: ebpf-maps-and-helpers
description: Deep-dive into BPF maps, helper functions, and kfuncs
realm: tracing
category: ebpf
difficulty: advanced
xp: 300
estimated_minutes: 120
prerequisites:
  - ebpf-programs
unlocks: []
kernel_files:
  - kernel/bpf/hashtab.c
  - kernel/bpf/arraymap.c
  - kernel/bpf/ringbuf.c
  - kernel/bpf/helpers.c
doc_files:
  - Documentation/bpf/maps.rst
  - Documentation/bpf/kfuncs.rst
badge: BPF Cartographer
tags:
  - bpf-maps
  - helpers
  - kfuncs
---

# eBPF Maps and Helpers

## Quest Briefing

BPF programs run in a sandboxed environment with no direct access to kernel
data structures. Maps and helpers are the bridge. BPF maps provide shared
data structures (hash tables, arrays, ring buffers, queues) that both BPF
programs and userspace can read and write. Helper functions are the kernel's
API to BPF programs -- they provide controlled access to kernel state,
allowing programs to read process info, manipulate packets, acquire locks,
and output events.

The modern kernel has over 200 BPF helpers and dozens of map types. Beyond
helpers, kfuncs (kernel functions) provide a newer, more flexible mechanism
for BPF programs to call into the kernel. Understanding maps and helpers is
essential for writing real BPF programs.


## Learning Objectives

- Describe the BPF map abstraction and lifecycle (create, update, lookup, delete).
- Trace the hash map implementation in kernel/bpf/hashtab.c.
- Explain the BPF ring buffer design in kernel/bpf/ringbuf.c.
- List major BPF helper categories and how they are registered.
- Understand kfuncs as the modern extension mechanism for BPF.


## Core Concepts

### BPF Map Types

All maps implement struct bpf_map_ops (include/linux/bpf.h) with
operations: map_alloc, map_free, map_lookup_elem, map_update_elem,
map_delete_elem. The bpf() syscall's BPF_MAP_CREATE command calls
map_create() in kernel/bpf/syscall.c, which dispatches to the specific
map type's alloc function.

Key map types:
- BPF_MAP_TYPE_HASH: general-purpose hash table (kernel/bpf/hashtab.c)
- BPF_MAP_TYPE_ARRAY: fixed-size array (kernel/bpf/arraymap.c)
- BPF_MAP_TYPE_RINGBUF: single-producer multi-consumer ring (kernel/bpf/ringbuf.c)
- BPF_MAP_TYPE_PERCPU_HASH: per-CPU hash for lock-free updates
- BPF_MAP_TYPE_LRU_HASH: hash with LRU eviction
- BPF_MAP_TYPE_PROG_ARRAY: array of BPF program fds for tail calls

### Hash Map Implementation

The BPF hash map in kernel/bpf/hashtab.c uses a bucket-based hash table
with RCU for lock-free lookups. Key operations:

- htab_map_alloc() allocates the bucket array and preallocates elements
  if the map is preallocated (no runtime allocation in BPF context).
- __htab_map_lookup_elem() hashes the key, walks the bucket's hlist,
  and compares keys. Returns a pointer to the value.
- htab_map_update_elem() acquires the bucket lock (raw_spin_lock),
  checks for existing entry, allocates or reuses an element, and
  inserts it. Uses RCU to publish the new element.

Preallocation is critical: BPF programs run in NMI/interrupt context
where memory allocation is forbidden. Preallocated maps maintain a
freelist of elements to avoid kmalloc in the hot path.

### Ring Buffer

The BPF ring buffer (kernel/bpf/ringbuf.c) is designed for high-throughput
event streaming from BPF to userspace. Unlike perf buffers, it is a single
shared ring buffer (not per-CPU), which simplifies ordering and reduces
memory waste.

The ring uses a producer/consumer model with memory-mapped pages shared
between kernel and userspace. bpf_ringbuf_reserve() reserves space in the
ring, the BPF program writes data, then bpf_ringbuf_submit() makes it
visible to the consumer. The consumer polls or uses epoll on the ring
buffer's file descriptor.

### Helper Functions

BPF helpers are registered in kernel/bpf/helpers.c and subsystem-specific
files. Each helper is a C function with a prototype described by
struct bpf_func_proto. The verifier uses these prototypes to validate
argument types and return values at load time.

Categories of helpers:
- Map operations: bpf_map_lookup_elem, bpf_map_update_elem
- Output: bpf_trace_printk, bpf_perf_event_output, bpf_ringbuf_output
- Process info: bpf_get_current_pid_tgid, bpf_get_current_comm
- Time: bpf_ktime_get_ns, bpf_ktime_get_boot_ns
- Networking: bpf_skb_store_bytes, bpf_redirect, bpf_xdp_adjust_head

### Kfuncs

Kfuncs are a newer mechanism (replacing some helpers) that allows BPF
programs to call regular kernel functions annotated with BTF. Unlike
helpers, kfuncs do not need a fixed ABI -- the verifier uses BTF type
information to validate arguments. Kfuncs are registered with
register_btf_kfunc_id_set() and can be module-scoped.


## Code Walkthrough

Trace a BPF program doing a hash map lookup:

1. **BPF instruction: BPF_CALL bpf_map_lookup_elem** -- The verifier
   resolved this at load time to the actual helper function pointer.
   At runtime, ___bpf_prog_run() in core.c dispatches the CALL, setting
   r1 = map pointer, r2 = key pointer.

2. **bpf_map_lookup_elem()** in kernel/bpf/helpers.c is a thin wrapper
   that calls map->ops->map_lookup_elem().

3. **__htab_map_lookup_elem()** in hashtab.c hashes the key using
   htab_map_hash(), finds the bucket, walks the hlist_nulls chain under
   RCU, compares keys with htab_map_equal(). Returns pointer to value
   or NULL.

4. **Back in BPF** -- r0 contains the return value (pointer or NULL).
   The BPF program checks r0 before dereferencing -- the verifier
   enforced this NULL check at load time.


## Hands-On Challenges

### Challenge 1: Hash Map Internals (75 XP)

Read kernel/bpf/hashtab.c and answer:
1. How does htab_map_alloc() decide between preallocated and
   non-preallocated modes?
2. What lock protects bucket updates? How does RCU enable lock-free reads?
3. How does the LRU hash (BPF_MAP_TYPE_LRU_HASH) evict entries?

Verification: Explain the preallocation freelist with function names.

### Challenge 2: Ring Buffer Deep Dive (100 XP)

Read kernel/bpf/ringbuf.c and:
1. Explain the memory layout of the ring buffer (pages, producer/consumer).
2. Trace bpf_ringbuf_reserve() through space allocation.
3. How does bpf_ringbuf_submit() signal the consumer?
4. What happens when the ring is full?

Verification: Diagram the ring buffer memory layout with page mapping.

### Challenge 3: Write a Kfunc-Using Program (125 XP)

Find an existing kfunc in the kernel (search for BTF_KFUNCS_START).
Write a BPF program that calls it. Explain:
1. How the kfunc is registered (register_btf_kfunc_id_set).
2. How the verifier resolves the kfunc call.
3. What BTF information is used for argument validation.

Verification: Show the BPF program, verifier output, and kfunc registration.


## Verification Criteria

- [ ] Explain the BPF map lifecycle through the bpf() syscall.
- [ ] Trace a hash map lookup through __htab_map_lookup_elem() in hashtab.c.
- [ ] Describe preallocation and why it matters for BPF safety.
- [ ] Explain the ring buffer producer/consumer protocol in ringbuf.c.
- [ ] List at least 10 BPF helpers across different categories.
- [ ] Describe how kfuncs differ from helpers and how they are registered.
- [ ] Explain per-CPU maps and when to use them vs regular maps.

import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

export interface SkbPointers {
  head: number;
  data: number;
  tail: number;
  end: number;
  label: string;
}

export interface SkbuffState {
  phase: 'alloc' | 'put' | 'push' | 'pull' | 'clone' | 'cow' | 'copy' | 'gso' | 'gro' | 'free';
  skbuffs: SkbPointers[];
  cloneCount: number;
  gsoSegments: number;
  groMerged: number;
  refcount: number;
  srcRef: string;
}

function cloneState(s: SkbuffState): SkbuffState {
  return {
    phase: s.phase,
    skbuffs: s.skbuffs.map(skb => ({ ...skb })),
    cloneCount: s.cloneCount,
    gsoSegments: s.gsoSegments,
    groMerged: s.groMerged,
    refcount: s.refcount,
    srcRef: s.srcRef,
  };
}

// ---------------------------------------------------------------------------
// Scenario: skb-alloc-free
// Trace __alloc_skb(), skb_put(), skb_push(), skb_pull(), kfree_skb(), consume_skb()
// ---------------------------------------------------------------------------
function generateAllocFree(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: SkbuffState = {
    phase: 'alloc',
    skbuffs: [],
    cloneCount: 0,
    gsoSegments: 0,
    groMerged: 0,
    refcount: 0,
    srcRef: '',
  };

  // Frame 0: __alloc_skb entry
  state.srcRef = 'net/core/skbuff.c:672 (struct sk_buff *__alloc_skb)';
  frames.push({
    step: 0,
    label: '__alloc_skb() allocates sk_buff and data buffer',
    description: '__alloc_skb() at net/core/skbuff.c:672 allocates a struct sk_buff from the skbuff_cache slab (net_hotdata.skbuff_cache at line 686) via kmem_cache_alloc_node() (line 702). For NAPI context (SKB_ALLOC_NAPI flag), it uses napi_skb_cache_get() at line 691 for faster per-CPU allocation. A separate data buffer is allocated via kmalloc_reserve() at line 713.',
    highlights: ['skb-struct'],
    data: cloneState(state),
  });

  // Frame 1: __finalize_skb_around sets up pointers
  state.skbuffs = [{ head: 0, data: 0, tail: 0, end: 1500, label: 'skb' }];
  state.refcount = 1;
  state.srcRef = 'net/core/skbuff.c:720 (__finalize_skb_around) -> line 388-401';
  frames.push({
    step: 1,
    label: '__finalize_skb_around() sets head/data/tail/end',
    description: '__finalize_skb_around() at net/core/skbuff.c:388 initializes the sk_buff pointers. skb->head and skb->data both point to the start of the data buffer (line 398-399). skb_reset_tail_pointer() at line 400 sets tail = data (empty buffer). skb_set_end_offset() at line 401 sets end to the usable size (total minus skb_shared_info at the end). refcount_set(&skb->users, 1) at line 397.',
    highlights: ['skb-pointers'],
    data: cloneState(state),
  });

  // Frame 2: skb_put extends tail
  state.phase = 'put';
  state.skbuffs = [{ head: 0, data: 0, tail: 1400, end: 1500, label: 'skb' }];
  state.srcRef = 'net/core/skbuff.c:2621 (void *skb_put)';
  frames.push({
    step: 2,
    label: 'skb_put() extends data area toward end',
    description: 'skb_put() at net/core/skbuff.c:2621 adds data to the tail of the buffer. It saves the current tail pointer (line 2623 via skb_tail_pointer()), then advances skb->tail by len (line 2625) and increases skb->len (line 2626). If tail exceeds end, skb_over_panic() is called at line 2628. Used after __alloc_skb to reserve space for packet payload (e.g., 1400 bytes for MTU-sized frame).',
    highlights: ['skb-tail'],
    data: cloneState(state),
  });

  // Frame 3: skb_push prepends header
  state.phase = 'push';
  state.skbuffs = [{ head: 0, data: -54, tail: 1400, end: 1500, label: 'skb' }];
  state.srcRef = 'net/core/skbuff.c:2642 (void *skb_push)';
  frames.push({
    step: 3,
    label: 'skb_push() prepends protocol headers',
    description: 'skb_push() at net/core/skbuff.c:2642 adds data to the front of the buffer by decrementing skb->data (line 2644) and increasing skb->len (line 2645). If data goes below head, skb_under_panic() triggers (line 2647). Typically used to prepend L2/L3/L4 headers: e.g., 20 bytes TCP + 20 bytes IP + 14 bytes Ethernet = 54 bytes pushed before the payload.',
    highlights: ['skb-data'],
    data: cloneState(state),
  });

  // Frame 4: skb_pull strips header on receive
  state.phase = 'pull';
  state.skbuffs = [{ head: 0, data: -40, tail: 1400, end: 1500, label: 'skb' }];
  state.srcRef = 'net/core/skbuff.c:2662 (void *skb_pull)';
  frames.push({
    step: 4,
    label: 'skb_pull() strips processed headers',
    description: 'skb_pull() at net/core/skbuff.c:2662 removes data from the start of the buffer, advancing skb->data forward and decreasing skb->len. It calls skb_pull_inline() at line 2664 which is equivalent to (skb->len -= len, skb->data += len). On the receive path, each protocol layer calls skb_pull to strip its header after processing: Ethernet (14 bytes) then IP (20 bytes).',
    highlights: ['skb-data'],
    data: cloneState(state),
  });

  // Frame 5: skb_shared_info at end of data buffer
  state.srcRef = 'include/linux/skbuff.h:593 (struct skb_shared_info)';
  frames.push({
    step: 5,
    label: 'skb_shared_info lives at buffer end',
    description: 'struct skb_shared_info at include/linux/skbuff.h:593 is placed at the end of the data buffer (at skb->end). It contains: nr_frags (line 596) for scatter-gather fragments, frag_list (line 601) for chained sk_buffs, gso_size/gso_segs (lines 598-600) for GSO metadata, gso_type (line 606), dataref (line 612) for shared data refcounting, and frags[] array for page fragment references.',
    highlights: ['skb-shared-info'],
    data: cloneState(state),
  });

  // Frame 6: refcount and skb_unref
  state.srcRef = 'net/core/skbuff.c:1212 (skb_unref check in __sk_skb_reason_drop)';
  frames.push({
    step: 6,
    label: 'Reference counting: skb->users',
    description: 'sk_buff uses refcount_t users (set to 1 at allocation). skb_get() increments it, skb_unref() at net/core/skbuff.c:1212 decrements it. When users reaches 0, the skb can be freed. skb_shared() checks if users > 1 before allowing modification. This is separate from skb_shared_info.dataref which tracks sharing of the data buffer independently.',
    highlights: ['skb-refcount'],
    data: cloneState(state),
  });

  // Frame 7: kfree_skb vs consume_skb
  state.phase = 'free';
  state.skbuffs = [];
  state.refcount = 0;
  state.srcRef = 'net/core/skbuff.c:1237 (sk_skb_reason_drop) / net/core/skbuff.c:1430 (consume_skb)';
  frames.push({
    step: 7,
    label: 'kfree_skb() vs consume_skb() frees the buffer',
    description: 'Two free paths exist. sk_skb_reason_drop() at net/core/skbuff.c:1237 (formerly kfree_skb) is for error/drop paths -- it fires the kfree_skb tracepoint (line 1223) with a drop reason for debugging. consume_skb() at line 1430 is for normal consumption -- it fires trace_consume_skb (line 1435). Both call __kfree_skb() at line 1201 which runs skb_release_all() (line 1203) to free fragments, dst, sk, then kfree_skbmem() (line 1204) to return the struct to slab.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 8: skb_release_all teardown
  state.srcRef = 'net/core/skbuff.c:1201 (__kfree_skb -> skb_release_all -> kfree_skbmem)';
  frames.push({
    step: 8,
    label: 'Complete teardown: skb_release_all()',
    description: '__kfree_skb() at net/core/skbuff.c:1201 calls skb_release_all() which releases the data buffer (skb_release_data decrements skb_shared_info.dataref, frees page fragments via skb_frag_unref(), frees frag_list via kfree_skb_list()), releases the associated socket (skb_release_head_state calls skb->destructor if set), and finally kfree_skbmem() returns the sk_buff struct to the skbuff_cache slab via kmem_cache_free().',
    highlights: [],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario: skb-clone-cow
// Cloning and copy-on-write for shared data
// ---------------------------------------------------------------------------
function generateCloneCow(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: SkbuffState = {
    phase: 'alloc',
    skbuffs: [{ head: 0, data: -54, tail: 1400, end: 1500, label: 'orig' }],
    cloneCount: 0,
    gsoSegments: 0,
    groMerged: 0,
    refcount: 1,
    srcRef: '',
  };

  // Frame 0: Original skb with data
  state.srcRef = 'net/core/skbuff.c:672 (__alloc_skb initial allocation)';
  frames.push({
    step: 0,
    label: 'Original sk_buff with packet data',
    description: 'An sk_buff has been allocated via __alloc_skb() at net/core/skbuff.c:672. The struct sk_buff is from skbuff_cache slab, the data buffer is from kmalloc. head points to buffer start, data points to the network header (after L2), tail to end of payload, end to start of skb_shared_info. skb_shared_info.dataref is 1 (sole owner of data buffer).',
    highlights: ['skb-pointers'],
    data: cloneState(state),
  });

  // Frame 1: skb_clone creates lightweight copy
  state.phase = 'clone';
  state.cloneCount = 1;
  state.refcount = 2;
  state.skbuffs = [
    { head: 0, data: -54, tail: 1400, end: 1500, label: 'orig' },
    { head: 0, data: -54, tail: 1400, end: 1500, label: 'clone' },
  ];
  state.srcRef = 'net/core/skbuff.c:2088 (struct sk_buff *skb_clone)';
  frames.push({
    step: 1,
    label: 'skb_clone() creates lightweight clone',
    description: 'skb_clone() at net/core/skbuff.c:2088 creates a new sk_buff struct that SHARES the same data buffer. If the original was allocated with SKB_ALLOC_FCLONE, it reuses the pre-allocated skb2 from sk_buff_fclones (line 2098-2102, setting fclone_ref to 2). Otherwise it allocates a new sk_buff from skbuff_cache (line 2107). __skb_clone() at line 2114 copies all header fields and increments skb_shared_info.dataref.',
    highlights: ['skb-clone'],
    data: cloneState(state),
  });

  // Frame 2: fclone optimization
  state.srcRef = 'net/core/skbuff.c:2098-2102 (fclone fast path)';
  frames.push({
    step: 2,
    label: 'fclone optimization: pre-allocated clone',
    description: 'When SKB_ALLOC_FCLONE is set at allocation (line 682), __alloc_skb allocates from skbuff_fclone_cache which contains struct sk_buff_fclones -- a pair of sk_buff structs. skb_clone() checks skb->fclone == SKB_FCLONE_ORIG and fclone_ref == 1 at line 2098-2099. If true, it reuses the pre-allocated skb2 (line 2100) and sets fclone_ref to 2 (line 2101), avoiding kmem_cache_alloc. This is critical for TCP retransmission.',
    highlights: ['skb-clone'],
    data: cloneState(state),
  });

  // Frame 3: shared data - cloned bit
  state.srcRef = 'include/linux/skbuff.h:955 (cloned bit) / skb_shared_info:612 (dataref)';
  frames.push({
    step: 3,
    label: 'Shared data: cloned bit and dataref',
    description: 'After cloning, both sk_buffs have the cloned bit set (include/linux/skbuff.h:955). skb_cloned() checks this bit to determine if the data buffer is shared. skb_shared_info.dataref at line 612 (atomic_t) tracks how many sk_buffs reference this data buffer. skb_shared() checks skb->users > 1 for struct sharing. These are independent: cloned means data is shared, shared means the struct itself has multiple references.',
    highlights: ['skb-shared-info'],
    data: cloneState(state),
  });

  // Frame 4: skb_copy - full deep copy
  state.phase = 'copy';
  state.skbuffs = [
    { head: 0, data: -54, tail: 1400, end: 1500, label: 'orig' },
    { head: 0, data: -54, tail: 1400, end: 1500, label: 'clone' },
    { head: 0, data: -54, tail: 1400, end: 1500, label: 'copy' },
  ];
  state.cloneCount = 1;
  state.srcRef = 'net/core/skbuff.c:2168 (struct sk_buff *skb_copy)';
  frames.push({
    step: 4,
    label: 'skb_copy() creates full independent copy',
    description: 'skb_copy() at net/core/skbuff.c:2168 creates a COMPLETE copy: new sk_buff struct AND new data buffer. It allocates via __alloc_skb (line 2182), copies all linear data (skb_copy_bits at line 2186), and copies headers (skb_copy_header at line 2189). Unlike skb_clone, the copy is fully independent -- modifying data in the copy does not affect the original. Used when caller needs to modify packet payload.',
    highlights: ['skb-copy'],
    data: cloneState(state),
  });

  // Frame 5: pskb_copy - partial copy
  state.srcRef = 'net/core/skbuff.c:2216 (struct sk_buff *__pskb_copy_fclone)';
  frames.push({
    step: 5,
    label: '__pskb_copy_fclone() copies header, shares frags',
    description: '__pskb_copy_fclone() at net/core/skbuff.c:2216 copies only the linear header portion (skb_headlen bytes via skb_copy_from_linear_data at line 2231), but SHARES the paged fragment data. skb_shinfo(n)->frags[i] references the same pages (line 2247) with skb_frag_ref (line 2248) incrementing page refcount. This is more efficient than skb_copy when only headers need modification.',
    highlights: ['skb-copy'],
    data: cloneState(state),
  });

  // Frame 6: skb_cow - copy-on-write
  state.phase = 'cow';
  state.srcRef = 'include/linux/skbuff.h:3896 (static inline int skb_cow)';
  frames.push({
    step: 6,
    label: 'skb_cow() ensures writable header via copy-on-write',
    description: 'skb_cow() at include/linux/skbuff.h:3896 calls __skb_cow(skb, headroom, skb_cloned(skb)) at line 3898. __skb_cow() at line 3870 checks if the skb is cloned. If so, it calls pskb_expand_head() which allocates a new data buffer, copies the linear header data, and sets dataref to 1 on the new buffer. This is the copy-on-write pattern: defer the expensive copy until a write is actually needed.',
    highlights: ['skb-cow'],
    data: cloneState(state),
  });

  // Frame 7: skb_cow_head variant
  state.srcRef = 'include/linux/skbuff.h:3911 (static inline int skb_cow_head)';
  frames.push({
    step: 7,
    label: 'skb_cow_head() only unshares the header',
    description: 'skb_cow_head() at include/linux/skbuff.h:3911 is identical to skb_cow except it uses skb_header_cloned() instead of skb_cloned() at line 3913. This means it only triggers a copy when the header region is shared, not when only the data payload is shared. Network drivers commonly call skb_cow_head(skb, headroom) before modifying L2 headers to ensure sufficient headroom without copying payload unnecessarily.',
    highlights: ['skb-cow'],
    data: cloneState(state),
  });

  // Frame 8: cleanup of cloned skbs
  state.phase = 'free';
  state.skbuffs = [{ head: 0, data: -54, tail: 1400, end: 1500, label: 'orig' }];
  state.cloneCount = 0;
  state.refcount = 1;
  state.srcRef = 'net/core/skbuff.c:1201 (__kfree_skb clone release path)';
  frames.push({
    step: 8,
    label: 'Freeing clones: dataref-based data release',
    description: 'When a cloned skb is freed via __kfree_skb() at net/core/skbuff.c:1201, skb_release_data() decrements skb_shared_info.dataref. If dataref reaches 0, the data buffer and all fragments are freed. If dataref > 0, only the sk_buff struct is returned to slab -- the shared data buffer survives for remaining references. For fclone skbs, kfree_skbmem checks fclone_ref and only frees when both skb1 and skb2 are done.',
    highlights: [],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario: gso-gro-path
// Generic Segmentation/Receive Offload
// ---------------------------------------------------------------------------
function generateGsoGro(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: SkbuffState = {
    phase: 'alloc',
    skbuffs: [{ head: 0, data: -54, tail: 65536, end: 65600, label: 'gso-skb' }],
    cloneCount: 0,
    gsoSegments: 0,
    groMerged: 0,
    refcount: 1,
    srcRef: '',
  };

  // Frame 0: Large skb with GSO metadata
  state.srcRef = 'include/linux/skbuff.h:593-606 (skb_shared_info gso fields)';
  frames.push({
    step: 0,
    label: 'Super-sized sk_buff with GSO metadata',
    description: 'TCP creates a large sk_buff (up to 64KB) that exceeds the NIC MTU. skb_shared_info at include/linux/skbuff.h:593 carries GSO metadata: gso_size (line 598) is set to MSS (e.g., 1460 bytes), gso_segs (line 600) is the segment count (e.g., 44 segments), and gso_type (line 606) is set to SKB_GSO_TCPV4. The large buffer avoids per-segment overhead through the entire stack.',
    highlights: ['skb-gso'],
    data: cloneState(state),
  });

  // Frame 1: validate_xmit_skb triggers segmentation
  state.phase = 'gso';
  state.srcRef = 'net/core/dev.c (validate_xmit_skb -> __skb_gso_segment)';
  frames.push({
    step: 1,
    label: 'validate_xmit_skb() triggers GSO segmentation',
    description: 'When the NIC does not support hardware GSO for this packet type, validate_xmit_skb() calls __skb_gso_segment() at net/core/gso.c:88. This performs software segmentation before handing individual segments to the driver. The function first checks if checksum fixup is needed via skb_needs_check() (line 93), calling skb_cow_head() (line 97) to ensure the header is writable.',
    highlights: ['skb-gso'],
    data: cloneState(state),
  });

  // Frame 2: __skb_gso_segment dispatches
  state.srcRef = 'net/core/gso.c:88 (struct sk_buff *__skb_gso_segment)';
  frames.push({
    step: 2,
    label: '__skb_gso_segment() dispatches to protocol',
    description: '__skb_gso_segment() at net/core/gso.c:88 calls skb_mac_gso_segment() at line 37. This function identifies the network protocol from the skb, iterates net_hotdata.offload_base (line 51) under RCU to find the matching packet_offload handler, and calls ptype->callbacks.gso_segment() at line 53. For IPv4/TCP, this chains through inet_gso_segment -> tcp_gso_segment.',
    highlights: ['skb-gso'],
    data: cloneState(state),
  });

  // Frame 3: skb_segment splits the buffer
  state.gsoSegments = 4;
  state.skbuffs = [
    { head: 0, data: -54, tail: 1460, end: 1520, label: 'seg-1' },
    { head: 0, data: -54, tail: 1460, end: 1520, label: 'seg-2' },
    { head: 0, data: -54, tail: 1460, end: 1520, label: 'seg-3' },
    { head: 0, data: -54, tail: 1460, end: 1520, label: 'seg-4' },
  ];
  state.srcRef = 'net/core/skbuff.c:4742 (struct sk_buff *skb_segment)';
  frames.push({
    step: 3,
    label: 'skb_segment() splits into MSS-sized segments',
    description: 'skb_segment() at net/core/skbuff.c:4742 is the core segmentation engine. It reads MSS from skb_shinfo(head_skb)->gso_size (line 4748), calculates the MAC+network header offset (doffset at line 4749), and loops to create individual segments. Each segment gets a new sk_buff via __alloc_skb (line 4910) with its own header copy but may share fragment pages. The result is a linked list of MSS-sized skbs.',
    highlights: ['skb-segments'],
    data: cloneState(state),
  });

  // Frame 4: skb_mac_gso_segment return
  state.srcRef = 'net/core/gso.c:37-62 (skb_mac_gso_segment returns segment list)';
  frames.push({
    step: 4,
    label: 'Segment list returned to transmit path',
    description: 'skb_mac_gso_segment() at net/core/gso.c:37 returns the linked list of segments. Each segment has correct L3/L4 headers (TCP sequence numbers incremented, IP total length adjusted, checksums updated by tcp_gso_segment). The original large skb is freed. The device transmit path (dev_hard_start_xmit) sends each segment individually to the NIC driver.',
    highlights: ['skb-segments'],
    data: cloneState(state),
  });

  // Frame 5: GRO receive path begins
  state.phase = 'gro';
  state.gsoSegments = 0;
  state.groMerged = 0;
  state.skbuffs = [{ head: 0, data: -54, tail: 1460, end: 1520, label: 'rx-skb' }];
  state.srcRef = 'net/core/gro.c:624 (gro_receive_skb)';
  frames.push({
    step: 5,
    label: 'GRO receive: gro_receive_skb() entry',
    description: 'On the receive side, gro_receive_skb() at net/core/gro.c:624 (formerly napi_gro_receive) is called by NAPI poll for each incoming packet. It marks the NAPI ID on the skb (line 628), resets GRO offsets via skb_gro_reset_offset (line 631), then calls dev_gro_receive() at line 633 to attempt merging with existing flows. GRO is the receive-side counterpart to GSO.',
    highlights: ['skb-gro'],
    data: cloneState(state),
  });

  // Frame 6: dev_gro_receive flow matching
  state.groMerged = 1;
  state.srcRef = 'net/core/gro.c:462 (static enum gro_result dev_gro_receive)';
  frames.push({
    step: 6,
    label: 'dev_gro_receive() matches flow and merges',
    description: 'dev_gro_receive() at net/core/gro.c:462 hashes the skb (line 465), looks up the GRO hash bucket, and calls gro_list_prepare() (line 477) to find matching flows. Under RCU (line 479), it finds the protocol handler and calls ptype->callbacks.gro_receive() at line 515 (e.g., inet_gro_receive -> tcp4_gro_receive). If same_flow is set (line 526), the new skb data is merged into an existing GRO skb by extending frag_list or coalescing frags.',
    highlights: ['skb-gro'],
    data: cloneState(state),
  });

  // Frame 7: GRO complete - flush merged skb
  state.groMerged = 4;
  state.skbuffs = [{ head: 0, data: -54, tail: 5840, end: 6000, label: 'gro-merged' }];
  state.srcRef = 'net/core/gro.c:529-531 (gro_complete flushes merged skb)';
  frames.push({
    step: 7,
    label: 'GRO complete: flushed merged super-packet',
    description: 'When enough packets merge or a flush condition occurs, dev_gro_receive() calls gro_complete() at line 531. The merged skb has NAPI_GRO_CB(skb)->count tracking the merged segment count (line 495). gro_complete() calls the protocol gro_complete callback (tcp4_gro_complete) to finalize headers, sets gso_size/gso_segs in skb_shared_info, and passes the super-packet up the stack via gro_skb_finish() at line 633. This amortizes per-packet stack processing.',
    highlights: ['skb-gro'],
    data: cloneState(state),
  });

  // Frame 8: GRO vs no-GRO comparison
  state.phase = 'free';
  state.srcRef = 'net/core/gro.c:462-545 (dev_gro_receive flow summary)';
  frames.push({
    step: 8,
    label: 'GRO/GSO lifecycle complete',
    description: 'GSO and GRO are symmetric optimizations. GSO defers segmentation from TCP to the device layer, reducing per-segment overhead through the stack (one skb through netfilter, routing, qdisc instead of many). GRO reassembles received segments back into large skbs before passing up the stack. Together they enable near-hardware-offload performance in software. The skb_shared_info gso_size/gso_segs/gso_type fields at include/linux/skbuff.h:598-606 carry this metadata end-to-end.',
    highlights: [],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// SVG Rendering
// ---------------------------------------------------------------------------
const NS = 'http://www.w3.org/2000/svg';

const PHASE_LABELS = [
  { id: 'alloc', label: 'Alloc' },
  { id: 'put', label: 'Put' },
  { id: 'push', label: 'Push' },
  { id: 'pull', label: 'Pull' },
  { id: 'clone', label: 'Clone' },
  { id: 'cow', label: 'COW' },
  { id: 'gso', label: 'GSO' },
  { id: 'gro', label: 'GRO' },
  { id: 'free', label: 'Free' },
];

function getActivePhaseIndex(phase: string): number {
  switch (phase) {
    case 'alloc': return 0;
    case 'put': return 1;
    case 'push': return 2;
    case 'pull': return 3;
    case 'clone': return 4;
    case 'cow': return 5;
    case 'copy': return 4;
    case 'gso': return 6;
    case 'gro': return 7;
    case 'free': return 8;
    default: return -1;
  }
}

function renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void {
  while (container.firstChild) container.removeChild(container.firstChild);
  const data = frame.data as SkbuffState;
  const margin = { top: 10, left: 15, right: 15, bottom: 10 };
  const usableWidth = width - margin.left - margin.right;

  // Title
  const title = document.createElementNS(NS, 'text');
  title.setAttribute('x', String(width / 2));
  title.setAttribute('y', '18');
  title.setAttribute('text-anchor', 'middle');
  title.setAttribute('class', 'anim-title');
  title.textContent = 'sk_buff Lifecycle';
  container.appendChild(title);

  // --- Phase flow diagram ---
  const flowTop = margin.top + 28;
  const phaseCount = PHASE_LABELS.length;
  const phaseWidth = Math.min(75, (usableWidth - (phaseCount - 1) * 4) / phaseCount);
  const phaseHeight = 24;
  const activeIndex = getActivePhaseIndex(data.phase);

  PHASE_LABELS.forEach((phase, i) => {
    const px = margin.left + i * (phaseWidth + 4);
    const isActive = i === activeIndex;
    const isPast = activeIndex > 0 && i < activeIndex;

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(px));
    rect.setAttribute('y', String(flowTop));
    rect.setAttribute('width', String(phaseWidth));
    rect.setAttribute('height', String(phaseHeight));
    rect.setAttribute('rx', '4');
    let blockClass = 'anim-block';
    if (isActive) {
      blockClass += ' anim-block-allocated anim-highlight';
    } else if (isPast) {
      blockClass += ' anim-block-allocated';
    } else {
      blockClass += ' anim-block-free';
    }
    rect.setAttribute('class', blockClass);
    container.appendChild(rect);

    const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', String(px + phaseWidth / 2));
    label.setAttribute('y', String(flowTop + phaseHeight / 2 + 4));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('class', 'anim-cpu-label');
    label.textContent = phase.label;
    container.appendChild(label);

    // Arrow between phases
    if (i < phaseCount - 1) {
      const arrowX = px + phaseWidth;
      const arrowY = flowTop + phaseHeight / 2;
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', String(arrowX));
      line.setAttribute('y1', String(arrowY));
      line.setAttribute('x2', String(arrowX + 4));
      line.setAttribute('y2', String(arrowY));
      line.setAttribute('stroke', '#8b949e');
      line.setAttribute('stroke-width', '2');
      container.appendChild(line);
    }
  });

  // --- Stats bar ---
  const statsTop = flowTop + phaseHeight + 16;
  const statsItems = [
    `refcount: ${data.refcount}`,
    `clones: ${data.cloneCount}`,
    `gso_segs: ${data.gsoSegments}`,
    `gro_merged: ${data.groMerged}`,
  ];

  statsItems.forEach((item, i) => {
    const sx = margin.left + i * 160;
    const text = document.createElementNS(NS, 'text');
    text.setAttribute('x', String(sx));
    text.setAttribute('y', String(statsTop));
    text.setAttribute('fill', '#8b949e');
    text.setAttribute('font-size', '11');
    text.setAttribute('class', 'anim-cpu-label');
    text.textContent = item;
    container.appendChild(text);
  });

  // --- sk_buff buffer visualization ---
  const bufTop = statsTop + 20;
  const bufHeight = 40;
  const maxBufWidth = Math.min(200, (usableWidth - 20) / Math.max(data.skbuffs.length, 1));

  data.skbuffs.forEach((skb, i) => {
    const bx = margin.left + i * (maxBufWidth + 10);
    const isHighlighted = frame.highlights.some(h =>
      h.startsWith('skb-')
    );

    // Buffer rectangle
    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(bx));
    rect.setAttribute('y', String(bufTop));
    rect.setAttribute('width', String(maxBufWidth));
    rect.setAttribute('height', String(bufHeight));
    rect.setAttribute('rx', '3');
    rect.setAttribute('fill', '#21262d');
    rect.setAttribute('stroke', isHighlighted ? '#58a6ff' : '#30363d');
    rect.setAttribute('stroke-width', isHighlighted ? '2' : '1');
    let bufClass = 'anim-block';
    if (isHighlighted) bufClass += ' anim-highlight';
    rect.setAttribute('class', bufClass);
    container.appendChild(rect);

    // Label
    const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', String(bx + maxBufWidth / 2));
    label.setAttribute('y', String(bufTop + 15));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('fill', '#e6edf3');
    label.setAttribute('font-size', '10');
    label.setAttribute('class', 'anim-cpu-label');
    label.textContent = skb.label;
    container.appendChild(label);

    // Pointer labels
    const ptrY = bufTop + 30;
    const ptrText = document.createElementNS(NS, 'text');
    ptrText.setAttribute('x', String(bx + 4));
    ptrText.setAttribute('y', String(ptrY));
    ptrText.setAttribute('fill', '#8b949e');
    ptrText.setAttribute('font-size', '8');
    ptrText.setAttribute('class', 'anim-cpu-label');
    ptrText.textContent = `h:${skb.head} d:${skb.data} t:${skb.tail} e:${skb.end}`;
    container.appendChild(ptrText);
  });

  // --- Source reference ---
  if (data.srcRef) {
    const srcText = document.createElementNS(NS, 'text');
    srcText.setAttribute('x', String(margin.left));
    srcText.setAttribute('y', String(height - margin.bottom - 5));
    srcText.setAttribute('fill', '#8b949e');
    srcText.setAttribute('font-size', '9');
    srcText.setAttribute('class', 'anim-cpu-label');
    srcText.textContent = data.srcRef;
    container.appendChild(srcText);
  }
}

// ---------------------------------------------------------------------------
// Module export
// ---------------------------------------------------------------------------
const SCENARIOS: AnimationScenario[] = [
  { id: 'skb-alloc-free', label: 'sk_buff Allocation & Freeing' },
  { id: 'skb-clone-cow', label: 'Cloning & Copy-on-Write' },
  { id: 'gso-gro-path', label: 'GSO/GRO Segmentation & Offload' },
];

const skbuffLifecycle: AnimationModule = {
  config: {
    id: 'skbuff-lifecycle',
    title: 'sk_buff Allocation, Cloning & GSO/GRO',
    skillName: 'sk-buff-lifecycle',
  },
  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario) {
      case 'skb-clone-cow': return generateCloneCow();
      case 'gso-gro-path': return generateGsoGro();
      case 'skb-alloc-free':
      default: return generateAllocFree();
    }
  },
  renderFrame,
  getScenarios: () => SCENARIOS,
};

export default skbuffLifecycle;

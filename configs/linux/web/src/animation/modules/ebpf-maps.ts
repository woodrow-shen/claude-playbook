import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

export interface BucketEntry {
  key: string;
  value: string;
  hash: string;
}

export interface Bucket {
  index: number;
  locked: boolean;
  elements: BucketEntry[];
}

export interface RingBufferState {
  producerPos: number;
  consumerPos: number;
  size: number;
  records: { offset: number; len: number; committed: boolean }[];
}

export interface HelperCallEntry {
  funcId: string;
  funcName: string;
  result: string;
}

export interface EbpfMapsState {
  phase: string;
  mapType: 'hash' | 'ringbuf' | 'array' | 'percpu_array';
  buckets: Bucket[];
  ringBuffer: RingBufferState;
  helperCalls: HelperCallEntry[];
  currentKey: string;
  currentValue: string;
  srcRef: string;
  // v7.0 BPF_F_CPU per-CPU map fields (optional for backward compatibility)
  perCpuValues?: number[];
  updateMode?: 'current' | 'cpu' | 'all_cpus';
  targetCpu?: number;
  // v7.0 deepening: per-CPU slots written in the current frame (for per-syscall
  // visualization of the pre-v7 loop), API path selector, and syscall cost.
  cpuMask?: number[];
  apiMode?: 'pre-v7' | 'single-cpu' | 'all-cpus';
  syscallCount?: number;
}

function cloneState(s: EbpfMapsState): EbpfMapsState {
  return {
    phase: s.phase,
    mapType: s.mapType,
    buckets: s.buckets.map(b => ({
      index: b.index,
      locked: b.locked,
      elements: b.elements.map(e => ({ ...e })),
    })),
    ringBuffer: {
      producerPos: s.ringBuffer.producerPos,
      consumerPos: s.ringBuffer.consumerPos,
      size: s.ringBuffer.size,
      records: s.ringBuffer.records.map(r => ({ ...r })),
    },
    helperCalls: s.helperCalls.map(h => ({ ...h })),
    currentKey: s.currentKey,
    currentValue: s.currentValue,
    srcRef: s.srcRef,
    perCpuValues: s.perCpuValues ? [...s.perCpuValues] : undefined,
    updateMode: s.updateMode,
    targetCpu: s.targetCpu,
    cpuMask: s.cpuMask ? [...s.cpuMask] : undefined,
    apiMode: s.apiMode,
    syscallCount: s.syscallCount,
  };
}

function emptyBuckets(count: number): Bucket[] {
  return Array.from({ length: count }, (_, i) => ({
    index: i,
    locked: false,
    elements: [],
  }));
}

function emptyRingBuffer(): RingBufferState {
  return { producerPos: 0, consumerPos: 0, size: 262144, records: [] };
}

// ---------------------------------------------------------------------------
// Scenario: hashmap-operations
// BPF hash map alloc, lookup, update, delete with per-bucket locking
// ---------------------------------------------------------------------------
function generateHashmapOperations(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: EbpfMapsState = {
    phase: 'init',
    mapType: 'hash',
    buckets: emptyBuckets(8),
    ringBuffer: emptyRingBuffer(),
    helperCalls: [],
    currentKey: '',
    currentValue: '',
    srcRef: '',
  };

  // Frame 0: htab_map_alloc - allocate hash table
  state.phase = 'alloc';
  state.srcRef = 'kernel/bpf/hashtab.c:542 (htab_map_alloc)';
  frames.push({
    step: 0,
    label: 'htab_map_alloc() creates hash table',
    description: 'htab_map_alloc() at kernel/bpf/hashtab.c:542 allocates the bpf_htab struct via bpf_map_area_alloc() (line 556). It rounds max_entries up to a power of 2 for n_buckets (line 581), computes elem_size including key and value (lines 583-588), then allocates the bucket array via bpf_map_area_alloc(n_buckets * sizeof(struct bucket)) at line 599. Each bucket has a hlist_nulls_head and an rqspinlock_t (kernel/bpf/hashtab.c:80-83). htab_init_buckets() at line 610 initializes each bucket with nulls markers.',
    highlights: ['buckets'],
    data: cloneState(state),
  });

  // Frame 1: Hash seed and bucket init
  state.phase = 'alloc';
  state.srcRef = 'kernel/bpf/hashtab.c:605-610 (hashrnd, htab_init_buckets)';
  frames.push({
    step: 1,
    label: 'Hash seed and bucket initialization',
    description: 'At kernel/bpf/hashtab.c:605-608, the hash seed is set: if BPF_F_ZERO_SEED is set, hashrnd=0 (for deterministic testing), otherwise get_random_u32() provides a random seed. htab_init_buckets() at line 610 initializes each bucket: INIT_HLIST_NULLS_HEAD sets the nulls marker to the bucket index (preventing false-positive lookups during RCU traversal), and each bucket raw_lock is initialized.',
    highlights: ['buckets'],
    data: cloneState(state),
  });

  // Frame 2: htab_map_update_elem - insert first element
  state.phase = 'update';
  state.currentKey = 'pid=1234';
  state.currentValue = 'count=1';
  state.srcRef = 'kernel/bpf/hashtab.c:1171 (htab_map_update_elem)';
  const hash1 = 5; // bucket index for this key
  state.buckets[hash1].locked = true;
  state.buckets[hash1].elements.push({ key: 'pid=1234', value: 'count=1', hash: '0xa3f5' });
  frames.push({
    step: 2,
    label: 'htab_map_update_elem() inserts element',
    description: 'htab_map_update_elem() at kernel/bpf/hashtab.c:1171 computes hash = htab_map_hash(key, key_size, htab->hashrnd) at line 1190, then selects bucket b = __select_bucket(htab, hash) at line 1192. It acquires the bucket lock via htab_lock_bucket(b, &flags) at line 1217, which calls raw_res_spin_lock_irqsave(&b->raw_lock, flags) at line 154. lookup_elem_raw() at line 1221 checks if the key already exists. Since this is a new key, alloc_htab_elem() at line 1241 allocates a new element.',
    highlights: ['bucket-5'],
    data: cloneState(state),
  });

  // Frame 3: Element inserted, bucket unlocked
  state.phase = 'update';
  state.buckets[hash1].locked = false;
  state.srcRef = 'kernel/bpf/hashtab.c:1248-1262 (insert into bucket, unlock)';
  frames.push({
    step: 3,
    label: 'Element linked into bucket chain',
    description: 'The new htab_elem is initialized with the key and value. At kernel/bpf/hashtab.c:1248, hlist_nulls_add_head_rcu(&l_new->hash_node, head) links it into the bucket chain using RCU-safe insertion. If an old element existed (BPF_EXIST), it is unlinked and freed via free_htab_elem() after the new one is inserted. htab_unlock_bucket(b, flags) at line 1262 releases the per-bucket spinlock via raw_res_spin_unlock_irqrestore().',
    highlights: ['bucket-5'],
    data: cloneState(state),
  });

  // Frame 4: Insert second element in different bucket
  state.phase = 'update';
  state.currentKey = 'pid=5678';
  state.currentValue = 'count=42';
  const hash2 = 2;
  state.buckets[hash2].locked = true;
  state.srcRef = 'kernel/bpf/hashtab.c:1190-1217 (hash, select bucket, lock)';
  frames.push({
    step: 4,
    label: 'Insert second element (different bucket)',
    description: 'A second update for key pid=5678 hashes to a different bucket (index 2). htab_map_hash() at kernel/bpf/hashtab.c:674 calls jhash(key, key_len, htab->hashrnd) which mixes the key bytes with the seed. __select_bucket() at line 681 computes hash & (htab->n_buckets - 1) to get the bucket index. The per-bucket lock means concurrent updates to different buckets proceed in parallel without contention.',
    highlights: ['bucket-2'],
    data: cloneState(state),
  });

  state.buckets[hash2].elements.push({ key: 'pid=5678', value: 'count=42', hash: '0x72b1' });
  state.buckets[hash2].locked = false;

  // Frame 5: __htab_map_lookup_elem
  state.phase = 'lookup';
  state.currentKey = 'pid=1234';
  state.currentValue = '';
  state.srcRef = 'kernel/bpf/hashtab.c:732 (__htab_map_lookup_elem)';
  frames.push({
    step: 5,
    label: '__htab_map_lookup_elem() finds element',
    description: '__htab_map_lookup_elem() at kernel/bpf/hashtab.c:732 is the core lookup path. It calls htab_map_hash(key, key_size, htab->hashrnd) at line 743, then select_bucket(htab, hash) at line 745 to get the hlist_nulls_head for the target bucket. lookup_nulls_elem_raw() at line 747 traverses the RCU-protected hlist_nulls chain, comparing hash and key bytes. WARN_ON_ONCE(!bpf_rcu_lock_held()) at line 739 asserts RCU read-side lock. No bucket spinlock needed for read-only lookup.',
    highlights: ['bucket-5'],
    data: cloneState(state),
  });

  // Frame 6: Lookup returns value
  state.phase = 'lookup';
  state.currentValue = 'count=1';
  state.srcRef = 'kernel/bpf/hashtab.c:752-760 (htab_map_lookup_elem -> htab_elem_value)';
  frames.push({
    step: 6,
    label: 'Lookup returns pointer to value',
    description: 'htab_map_lookup_elem() at kernel/bpf/hashtab.c:752 calls __htab_map_lookup_elem() which returns the htab_elem. If found (l != NULL), htab_elem_value(l, map->key_size) at line 757 returns a pointer to the value portion of the element (offset past the key). The BPF program receives this pointer in R0. If not found, NULL is returned and the verifier ensures the program checks for NULL before dereferencing.',
    highlights: ['bucket-5'],
    data: cloneState(state),
  });

  // Frame 7: htab_map_delete_elem
  state.phase = 'delete';
  state.currentKey = 'pid=5678';
  state.currentValue = '';
  state.buckets[hash2].locked = true;
  state.srcRef = 'kernel/bpf/hashtab.c:1499 (htab_map_delete_elem)';
  frames.push({
    step: 7,
    label: 'htab_map_delete_elem() removes element',
    description: 'htab_map_delete_elem() at kernel/bpf/hashtab.c:1499 computes hash at line 1513, selects bucket at line 1514, and acquires the bucket lock via htab_lock_bucket() at line 1517. lookup_elem_raw() at line 1521 finds the element. If found, hlist_nulls_del_rcu(&l->hash_node) at line 1523 unlinks it from the chain (RCU-safe, readers can still see it). htab_unlock_bucket() at line 1527 releases the lock, then free_htab_elem() at line 1530 frees the element after an RCU grace period.',
    highlights: ['bucket-2'],
    data: cloneState(state),
  });

  // Frame 8: Element removed
  state.buckets[hash2].elements = [];
  state.buckets[hash2].locked = false;
  state.phase = 'delete';
  state.srcRef = 'kernel/bpf/hashtab.c:1523-1531 (hlist_nulls_del_rcu, free_htab_elem)';
  frames.push({
    step: 8,
    label: 'Element unlinked and freed via RCU',
    description: 'After hlist_nulls_del_rcu() unlinks the element, free_htab_elem() at kernel/bpf/hashtab.c:1530 schedules deferred freeing. For preallocated maps, the element returns to the freelist. For non-preallocated maps, bpf_mem_cache_free() returns memory to the per-CPU BPF memory allocator. RCU grace period ensures no concurrent readers hold references to the deleted element. The bucket now has an empty hlist_nulls chain with only the nulls marker.',
    highlights: ['bucket-2'],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario: ringbuf-reserve-commit
// BPF ring buffer producer/consumer with reserve/submit/output
// ---------------------------------------------------------------------------
function generateRingbufReserveCommit(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: EbpfMapsState = {
    phase: 'init',
    mapType: 'ringbuf',
    buckets: emptyBuckets(8),
    ringBuffer: { producerPos: 0, consumerPos: 0, size: 262144, records: [] },
    helperCalls: [],
    currentKey: '',
    currentValue: '',
    srcRef: '',
  };

  // Frame 0: Ring buffer allocation
  state.phase = 'alloc';
  state.srcRef = 'kernel/bpf/ringbuf.c:172 (bpf_ringbuf_alloc)';
  frames.push({
    step: 0,
    label: 'bpf_ringbuf_alloc() creates ring buffer',
    description: 'bpf_ringbuf_alloc() at kernel/bpf/ringbuf.c:172 allocates the ring buffer structure. bpf_ringbuf_area_alloc() at line 176 allocates contiguous pages for the data area, mapped twice consecutively in virtual memory so the ring wraps seamlessly. At lines 186-188, consumer_pos=0, producer_pos=0, and pending_pos=0 are initialized. The mask (data_sz - 1) at line 185 enables fast modular arithmetic. init_irq_work() at line 183 sets up the notification callback.',
    highlights: ['ring'],
    data: cloneState(state),
  });

  // Frame 1: BPF program calls bpf_ringbuf_reserve
  state.phase = 'reserve';
  state.ringBuffer.producerPos = 64;
  state.ringBuffer.records.push({ offset: 0, len: 48, committed: false });
  state.srcRef = 'kernel/bpf/ringbuf.c:540 (bpf_ringbuf_reserve)';
  frames.push({
    step: 1,
    label: 'BPF program calls bpf_ringbuf_reserve()',
    description: 'BPF_CALL_3(bpf_ringbuf_reserve) at kernel/bpf/ringbuf.c:540 validates flags==0 (line 544), then calls __bpf_ringbuf_reserve(rb_map->rb, size) at line 548. The BPF verifier ensures the size argument is a compile-time constant via ARG_CONST_ALLOC_SIZE_OR_ZERO in bpf_ringbuf_reserve_proto at line 551. The return type RET_PTR_TO_RINGBUF_MEM_OR_NULL means the program must check for NULL.',
    highlights: ['ring'],
    data: cloneState(state),
  });

  // Frame 2: __bpf_ringbuf_reserve internals
  state.phase = 'reserve';
  state.srcRef = 'kernel/bpf/ringbuf.c:463 (__bpf_ringbuf_reserve)';
  frames.push({
    step: 2,
    label: '__bpf_ringbuf_reserve() allocates record',
    description: '__bpf_ringbuf_reserve() at kernel/bpf/ringbuf.c:463 first reads cons_pos via smp_load_acquire(&rb->consumer_pos) at line 476 to see how much space is available. It acquires the spinlock at line 478, reads producer_pos at line 482, and computes new_prod_pos = prod_pos + len at line 483. bpf_ringbuf_has_space() at line 494 checks new_prod_pos - cons_pos <= data_sz. The record header at line 529 is written with BPF_RINGBUF_BUSY_BIT set, and smp_store_release(&rb->producer_pos, new_prod_pos) at line 533 publishes the new position.',
    highlights: ['ring'],
    data: cloneState(state),
  });

  // Frame 3: BPF program writes data to reserved space
  state.phase = 'write';
  state.currentKey = 'event_type=1';
  state.currentValue = 'pid=1234, comm=bash';
  state.srcRef = 'kernel/bpf/ringbuf.c:537 (returns pointer past header)';
  frames.push({
    step: 3,
    label: 'BPF program writes to reserved memory',
    description: '__bpf_ringbuf_reserve() returns (void *)hdr + BPF_RINGBUF_HDR_SZ at kernel/bpf/ringbuf.c:537, giving the BPF program a pointer to the data area after the 8-byte header. The BPF program writes event data directly into this memory. The BPF_RINGBUF_BUSY_BIT in hdr->len signals to the consumer that this record is not yet ready to read. The producer_pos has already advanced, reserving the space.',
    highlights: ['ring'],
    data: cloneState(state),
  });

  // Frame 4: bpf_ringbuf_submit commits the record
  state.phase = 'commit';
  state.ringBuffer.records[0].committed = true;
  state.srcRef = 'kernel/bpf/ringbuf.c:587-591 (bpf_ringbuf_submit -> bpf_ringbuf_commit)';
  frames.push({
    step: 4,
    label: 'bpf_ringbuf_submit() commits record',
    description: 'BPF_CALL_2(bpf_ringbuf_submit) at kernel/bpf/ringbuf.c:587 calls bpf_ringbuf_commit(sample, flags, false) at line 589. bpf_ringbuf_commit() at line 559 computes new_len = hdr->len ^ BPF_RINGBUF_BUSY_BIT at line 568, clearing the busy bit. xchg(&hdr->len, new_len) at line 573 atomically updates the header. If the consumer is waiting at cons_pos == rec_pos (line 583), irq_work_queue(&rb->work) at line 584 wakes it up via the irq_work mechanism.',
    highlights: ['ring'],
    data: cloneState(state),
  });

  // Frame 5: Second record via bpf_ringbuf_output (reserve+copy+commit)
  state.phase = 'output';
  state.ringBuffer.producerPos = 128;
  state.ringBuffer.records.push({ offset: 64, len: 48, committed: true });
  state.srcRef = 'kernel/bpf/ringbuf.c:613-630 (bpf_ringbuf_output)';
  frames.push({
    step: 5,
    label: 'bpf_ringbuf_output() does reserve+copy+commit',
    description: 'BPF_CALL_4(bpf_ringbuf_output) at kernel/bpf/ringbuf.c:613 combines reserve, copy, and commit in one call. It calls __bpf_ringbuf_reserve() at line 623 to get space. If successful, memcpy(rec, data, size) at line 627 copies the data, then bpf_ringbuf_commit() at line 628 publishes it. If reserve fails (ring full), it returns -EAGAIN at line 625. This is simpler than reserve+submit but requires the data to already be in a contiguous buffer.',
    highlights: ['ring'],
    data: cloneState(state),
  });

  // Frame 6: Consumer reads records
  state.phase = 'consume';
  state.ringBuffer.consumerPos = 64;
  state.srcRef = 'kernel/bpf/ringbuf.c:755-790 (consumer side)';
  frames.push({
    step: 6,
    label: 'Consumer reads and advances consumer_pos',
    description: 'The userspace consumer (via perf_event or epoll) reads records from the ring buffer. At kernel/bpf/ringbuf.c:755, prod_pos = smp_load_acquire(&rb->producer_pos) gets the current producer position. At line 760, cons_pos = smp_load_acquire(&rb->consumer_pos) gets the consumer position. Records between cons_pos and prod_pos are available. After processing, smp_store_release(&rb->consumer_pos, cons_pos + total_len) at line 790 advances the consumer, freeing space for the producer.',
    highlights: ['ring'],
    data: cloneState(state),
  });

  // Frame 7: Space reclaimed
  state.phase = 'consume';
  state.ringBuffer.consumerPos = 128;
  state.srcRef = 'kernel/bpf/ringbuf.c:75-76 (consumer_pos, producer_pos layout)';
  frames.push({
    step: 7,
    label: 'Consumer catches up, space reclaimed',
    description: 'With consumer_pos advanced to match producer_pos, the entire ring buffer is free. The consumer_pos and producer_pos fields are on separate cache lines (each PAGE_SIZE aligned at kernel/bpf/ringbuf.c:75-76) to avoid false sharing between the producer (BPF program in kernel) and consumer (userspace). The ring buffer uses smp_load_acquire/smp_store_release pairs to ensure correct ordering on weakly-ordered architectures without heavyweight barriers.',
    highlights: ['ring'],
    data: cloneState(state),
  });

  // Frame 8: Summary of ring buffer design
  state.phase = 'summary';
  state.srcRef = 'kernel/bpf/ringbuf.c:172 (bpf_ringbuf_alloc design)';
  frames.push({
    step: 8,
    label: 'Ring buffer design: single-producer, multi-consumer',
    description: 'The BPF ring buffer (kernel/bpf/ringbuf.c) uses a single contiguous memory region mapped twice for seamless wrap-around. The spinlock at line 478 serializes producers; the BUSY_BIT protocol allows lock-free consumption. Advantages over BPF_MAP_TYPE_PERF_EVENT_ARRAY: shared across CPUs (no per-CPU waste), variable-length records, and the reserve/commit API avoids extra memcpy. The overwrite mode (line 504) handles full-ring scenarios by discarding oldest records.',
    highlights: [],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario: helper-call-dispatch
// How BPF programs call kernel helpers via func_id dispatch
// ---------------------------------------------------------------------------
function generateHelperCallDispatch(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: EbpfMapsState = {
    phase: 'init',
    mapType: 'hash',
    buckets: emptyBuckets(8),
    ringBuffer: emptyRingBuffer(),
    helperCalls: [],
    currentKey: '',
    currentValue: '',
    srcRef: '',
  };

  // Frame 0: BPF program contains CALL instruction
  state.phase = 'load';
  state.srcRef = 'kernel/bpf/core.c:2075 (JMP_CALL interpreter dispatch)';
  frames.push({
    step: 0,
    label: 'BPF CALL instruction in program',
    description: 'A BPF program contains BPF_CALL instructions (opcode 0x85). Each CALL instruction has an imm field encoding the helper function offset. In the interpreter at kernel/bpf/core.c:2075, the JMP_CALL handler executes: BPF_R0 = (__bpf_call_base + insn->imm)(BPF_R1, BPF_R2, BPF_R3, BPF_R4, BPF_R5). __bpf_call_base at line 1593 is a no-op function whose address serves as the base for computing helper function pointers.',
    highlights: ['dispatch'],
    data: cloneState(state),
  });

  // Frame 1: Verifier resolves func_id to helper
  state.phase = 'verify';
  state.srcRef = 'kernel/bpf/helpers.c:2066-2071 (bpf_base_func_proto)';
  frames.push({
    step: 1,
    label: 'Verifier resolves func_id via bpf_base_func_proto()',
    description: 'During program load, the verifier calls bpf_base_func_proto(func_id, prog) at kernel/bpf/helpers.c:2066 to resolve each helper call. The switch statement at line 2069 maps enum bpf_func_id values to bpf_func_proto structures: BPF_FUNC_map_lookup_elem -> &bpf_map_lookup_elem_proto (line 2071), BPF_FUNC_map_update_elem -> &bpf_map_update_elem_proto (line 2073), etc. The proto struct defines argument types, return type, and the actual function pointer.',
    highlights: ['dispatch'],
    data: cloneState(state),
  });

  // Frame 2: Dispatch bpf_get_current_pid_tgid
  state.phase = 'dispatch';
  state.helperCalls.push({ funcId: 'BPF_FUNC_get_current_pid_tgid', funcName: 'bpf_get_current_pid_tgid', result: '' });
  state.srcRef = 'kernel/bpf/helpers.c:225-233 (bpf_get_current_pid_tgid)';
  frames.push({
    step: 2,
    label: 'Helper: bpf_get_current_pid_tgid()',
    description: 'BPF_CALL_0(bpf_get_current_pid_tgid) at kernel/bpf/helpers.c:225 reads current task_struct. At line 227, task = current gets the currently running task. Line 232 returns (u64) task->tgid << 32 | task->pid, packing both the thread group ID (process ID) and the kernel thread ID into a single 64-bit value. The upper 32 bits are tgid (getpid()), lower 32 bits are pid (gettid()). This is the most commonly used BPF helper.',
    highlights: ['helper-0'],
    data: cloneState(state),
  });

  // Frame 3: Result returned
  state.phase = 'call';
  state.helperCalls[0].result = '0x00004D2_000004D2 (tgid=1234, pid=1234)';
  state.srcRef = 'kernel/bpf/helpers.c:232 (return tgid<<32 | pid)';
  frames.push({
    step: 3,
    label: 'Return: tgid<<32 | pid in R0',
    description: 'The helper returns the combined tgid|pid value in BPF register R0. At kernel/bpf/core.c:2075, BPF_R0 receives the return value. The BPF program can extract the pid with (u32)val and the tgid with val >> 32. bpf_func_proto at kernel/bpf/helpers.c:235 declares .ret_type = RET_INTEGER and .gpl_only = false, meaning this helper is available to all BPF programs regardless of license.',
    highlights: ['helper-0'],
    data: cloneState(state),
  });

  // Frame 4: Dispatch bpf_map_lookup_elem
  state.phase = 'dispatch';
  state.helperCalls.push({ funcId: 'BPF_FUNC_map_lookup_elem', funcName: 'bpf_map_lookup_elem', result: '' });
  state.currentKey = 'pid=1234';
  state.srcRef = 'kernel/bpf/helpers.c:44-48 (bpf_map_lookup_elem)';
  frames.push({
    step: 4,
    label: 'Helper: bpf_map_lookup_elem(map, key)',
    description: 'BPF_CALL_2(bpf_map_lookup_elem) at kernel/bpf/helpers.c:44 is the generic map lookup dispatcher. It asserts bpf_rcu_lock_held() at line 46, then calls map->ops->map_lookup_elem(map, key) at line 47, which dispatches to the map-type-specific implementation. For hash maps, this calls htab_map_lookup_elem() at kernel/bpf/hashtab.c:752. The verifier ensures R1 is ARG_CONST_MAP_PTR and R2 is ARG_PTR_TO_MAP_KEY (line 55-56).',
    highlights: ['helper-1'],
    data: cloneState(state),
  });

  // Frame 5: Map lookup result
  state.phase = 'call';
  state.helperCalls[1].result = 'PTR_TO_MAP_VALUE (count=1)';
  state.currentValue = 'count=1';
  state.buckets[5].elements = [{ key: 'pid=1234', value: 'count=1', hash: '0xa3f5' }];
  state.srcRef = 'kernel/bpf/hashtab.c:752-760 (htab_map_lookup_elem returns value ptr)';
  frames.push({
    step: 5,
    label: 'Lookup returns PTR_TO_MAP_VALUE or NULL',
    description: 'map->ops->map_lookup_elem dispatches to htab_map_lookup_elem() at kernel/bpf/hashtab.c:752. It calls __htab_map_lookup_elem() at line 754 which hashes the key, selects the bucket, and traverses the nulls chain. If found, htab_elem_value(l, map->key_size) at line 757 returns a pointer to the value. The return type RET_PTR_TO_MAP_VALUE_OR_NULL (helpers.c:54) means the verifier forces the BPF program to check for NULL before accessing the returned pointer.',
    highlights: ['helper-1', 'bucket-5'],
    data: cloneState(state),
  });

  // Frame 6: Dispatch bpf_probe_read_kernel
  state.phase = 'dispatch';
  state.helperCalls.push({ funcId: 'BPF_FUNC_probe_read_kernel', funcName: 'bpf_probe_read_kernel', result: '' });
  state.srcRef = 'kernel/trace/bpf_trace.c:235-238 (bpf_probe_read_kernel)';
  frames.push({
    step: 6,
    label: 'Helper: bpf_probe_read_kernel(dst, size, src)',
    description: 'BPF_CALL_3(bpf_probe_read_kernel) at kernel/trace/bpf_trace.c:235 safely reads kernel memory. It calls bpf_probe_read_kernel_common(dst, size, unsafe_ptr) at line 238, which uses copy_from_kernel_nofault() to read from arbitrary kernel addresses. If the address is unmapped or faulting, it returns an error instead of crashing. The proto at line 241 has .gpl_only = true (only GPL-licensed BPF programs can use it) and ARG_ANYTHING for the source pointer.',
    highlights: ['helper-2'],
    data: cloneState(state),
  });

  // Frame 7: probe_read result
  state.phase = 'call';
  state.helperCalls[2].result = '0 (success, 8 bytes read)';
  state.srcRef = 'kernel/trace/bpf_trace.c:238 (bpf_probe_read_kernel_common)';
  frames.push({
    step: 7,
    label: 'Safe kernel read completes',
    description: 'bpf_probe_read_kernel_common() uses copy_from_kernel_nofault() which temporarily disables page fault handling via pagefault_disable(). If the source address is valid, it copies size bytes to dst and returns 0. If faulting, it returns -EFAULT and zeros the destination buffer (security: prevents leaking stale stack data). This is essential for reading kernel data structures whose layout may change between kernel versions -- BTF and CO-RE relocate field offsets at load time.',
    highlights: ['helper-2'],
    data: cloneState(state),
  });

  // Frame 8: JIT compilation of helper calls
  state.phase = 'jit';
  state.srcRef = 'kernel/bpf/core.c:1275-1279 (__bpf_call_base offset computation)';
  frames.push({
    step: 8,
    label: 'JIT compiles CALL to direct function call',
    description: 'When JIT-compiled, the BPF CALL instruction becomes a native CALL. At kernel/bpf/core.c:1275-1279, the JIT computes the target address as (u8 *)__bpf_call_base + imm, where imm is the offset from __bpf_call_base (line 1593) to the actual helper function. The JIT converts this to a direct x86 CALL instruction with relative addressing. Arguments pass via native registers matching the BPF calling convention (R1-R5 map to x86 registers). Return value lands in R0.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 9: Summary of helper dispatch
  state.phase = 'summary';
  state.srcRef = 'kernel/bpf/helpers.c:2066 (bpf_base_func_proto dispatch table)';
  frames.push({
    step: 9,
    label: 'Helper dispatch: verifier + JIT pipeline',
    description: 'The BPF helper call pipeline: (1) BPF program uses BPF_FUNC_xxx enum as call target, (2) verifier calls bpf_base_func_proto() at kernel/bpf/helpers.c:2066 or program-type-specific get_func_proto() to resolve func_id to bpf_func_proto, (3) verifier checks argument types and return type against the proto, (4) fixup_call_args() patches insn->imm to the offset from __bpf_call_base to the actual helper function, (5) JIT emits native CALL instruction. Result: zero-overhead dispatch at runtime.',
    highlights: [],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario: bpf-f-cpu-flags (Linux v7.0)
// BPF_F_CPU and BPF_F_ALL_CPUS flags for per-CPU maps: target a specific CPU
// (upper 32 bits of flags encode the cpu number) or broadcast to all CPUs.
// ---------------------------------------------------------------------------
function generateBpfFCpuFlags(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: EbpfMapsState = {
    phase: 'init',
    mapType: 'percpu_array',
    buckets: emptyBuckets(8),
    ringBuffer: emptyRingBuffer(),
    helperCalls: [],
    currentKey: 'idx=0',
    currentValue: '',
    srcRef: '',
    perCpuValues: [10, 20, 30, 40],
    updateMode: 'current',
    targetCpu: undefined,
    cpuMask: undefined,
    apiMode: undefined,
    syscallCount: 0,
  };

  // Frame 0: Initial per-CPU array with 4 CPUs holding distinct values
  state.phase = 'init';
  state.srcRef = 'kernel/bpf/arraymap.c:84 array_map_alloc()';
  frames.push({
    step: 0,
    label: 'BPF_MAP_TYPE_PERCPU_ARRAY with 4 CPUs',
    description: 'A BPF_MAP_TYPE_PERCPU_ARRAY is allocated by array_map_alloc() at kernel/bpf/arraymap.c:84. Each of the 4 CPUs owns an independent value slot (here 10, 20, 30, 40) accessed through per-CPU pointers in array->pptrs[]. Before v7.0, a BPF program update with BPF_ANY could only reach the CURRENT CPU (this_cpu_ptr), and userspace batch reads/writes used a buffer sized round_up(value_size, 8) * num_possible_cpus() holding every slot at once — see bpf_map_value_size() at kernel/bpf/syscall.c:137.',
    highlights: ['percpu'],
    data: cloneState(state),
  });

  // Frame 1: Pre-v7 userspace loop — one syscall per CPU
  state.phase = 'update';
  state.apiMode = 'pre-v7';
  state.updateMode = 'current';
  state.targetCpu = undefined;
  state.currentValue = '99';
  state.syscallCount = 4;
  state.cpuMask = [0, 1, 2, 3];
  state.srcRef = 'kernel/bpf/syscall.c:1766 map_update_elem()';
  frames.push({
    step: 1,
    label: 'Pre-v7.0: N syscalls, N user-kernel copies',
    description: 'Before v7.0 there was no kernel-side broadcast or remote-CPU target. To update every slot, userspace had to loop over num_possible_cpus() and either (a) pin itself to each CPU and issue bpf(BPF_MAP_UPDATE_ELEM) per CPU, or (b) build a full num_possible_cpus()*round_up(value_size,8) buffer and submit it through the syscall path at kernel/bpf/syscall.c:1766 map_update_elem(). With 4 CPUs this is 4 syscalls (or one large syscall with 4 * value_size bytes of copy_from_user). The BPF_F_CPU and BPF_F_ALL_CPUS flags added in v7.0 collapse both patterns into a single syscall.',
    highlights: ['percpu'],
    data: cloneState(state),
  });

  // Frame 2: Legacy BPF_ANY update (no per-CPU flag) — current-CPU semantics
  state.phase = 'update';
  state.apiMode = undefined;
  state.updateMode = 'current';
  state.targetCpu = undefined;
  state.currentValue = '99';
  state.syscallCount = 1;
  state.cpuMask = undefined;
  state.srcRef = 'kernel/bpf/hashtab.c:1028 pcpu_copy_value()';
  frames.push({
    step: 2,
    label: 'Legacy update: bpf_map_update_elem(fd, &key, &val, BPF_ANY)',
    description: 'When flags=BPF_ANY (no per-CPU flag), the percpu hash map helper pcpu_copy_value() at kernel/bpf/hashtab.c:1028 takes the this_cpu_ptr(pptr) branch at line 1020 and copies the value into the CURRENT CPU only. The percpu array equivalent array_map_update_elem() at kernel/bpf/arraymap.c:386 also uses this_cpu_ptr. A BPF program has no portable way to target a specific remote CPU slot with this legacy path: value 99 lands on whichever CPU the syscall happens to run on.',
    highlights: ['percpu'],
    data: cloneState(state),
  });

  // Frame 3: v7.0 syscall entry — map_update_elem -> bpf_map_update_value
  state.phase = 'update';
  state.apiMode = 'single-cpu';
  state.updateMode = 'cpu';
  state.targetCpu = 2;
  state.currentValue = '77';
  state.syscallCount = 1;
  state.cpuMask = [2];
  state.srcRef = 'kernel/bpf/syscall.c:1788 map_update_elem() -> kernel/bpf/syscall.c:274 bpf_map_update_value()';
  frames.push({
    step: 3,
    label: 'Syscall path: copy_from_user -> bpf_map_update_value -> bpf_percpu_array_update',
    description: 'A single bpf(BPF_MAP_UPDATE_ELEM) with flags = BPF_F_CPU | ((u64)2 << 32) enters map_update_elem() at kernel/bpf/syscall.c:1766. Line 1788 calls bpf_map_check_op_flags(map, attr->flags, ~0) to accept any flag combo and let the map-specific code validate. bpf_map_value_size() at kernel/bpf/syscall.c:137 returns just map->value_size (no N*value_size multiplication) because BPF_F_CPU is set. copy_from_user copies one value_size buffer, then bpf_map_update_value() at kernel/bpf/syscall.c:274 dispatches to bpf_percpu_array_update().',
    highlights: ['percpu'],
    data: cloneState(state),
  });

  // Frame 4: Flag encoding
  state.phase = 'encode';
  state.srcRef = 'include/uapi/linux/bpf.h:1396 BPF_F_CPU -> kernel/bpf/arraymap.c:434 bpf_percpu_array_update()';
  frames.push({
    step: 4,
    label: 'v7.0: build flags = BPF_F_CPU | (target_cpu << 32)',
    description: 'Linux v7.0 defines BPF_F_CPU = 8 at include/uapi/linux/bpf.h:1396 with the comment "cpu flag for percpu maps, upper 32-bit of flags is a cpu number". Userspace packs u64 map_flags = BPF_F_CPU | ((u64)target_cpu << 32): low 32 bits hold the flag bit, high 32 bits hold the target CPU index. For target_cpu=2 the encoded value is 0x0000000200000008. Inside bpf_percpu_array_update() the kernel decodes this at kernel/bpf/arraymap.c:434 with cpu = map_flags >> 32.',
    highlights: ['percpu'],
    data: cloneState(state),
  });

  // Frame 5: Flag validation
  state.phase = 'validate';
  state.srcRef = 'kernel/bpf/arraymap.c:412 bpf_percpu_array_update()';
  frames.push({
    step: 5,
    label: 'Validation: (u32)map_flags > BPF_F_ALL_CPUS rejects bad combos',
    description: 'bpf_percpu_array_update() at kernel/bpf/arraymap.c:412 validates: if ((map_flags & BPF_F_LOCK) || (u32)map_flags > BPF_F_ALL_CPUS) return -EINVAL. The cast to u32 masks off the upper 32 bits (the CPU index), so only the low 32-bit flag bits are compared against BPF_F_ALL_CPUS=16. BPF_F_LOCK is invalid for per-CPU maps (no shared value to lock), and any unknown flag in the low 32 bits is rejected. The batch variant at kernel/bpf/hashtab.c:1348 performs an identical check, and the syscall-entry check at kernel/bpf/syscall.c:1723 passes BPF_F_LOCK | BPF_F_CPU as the allowed mask for lookup.',
    highlights: ['percpu'],
    data: cloneState(state),
  });

  // Frame 6: BPF_F_CPU branch — write only to CPU 2
  state.phase = 'applied';
  state.apiMode = 'single-cpu';
  state.updateMode = 'cpu';
  state.targetCpu = 2;
  state.perCpuValues = [10, 20, 77, 40];
  state.cpuMask = [2];
  state.syscallCount = 1;
  state.srcRef = 'kernel/bpf/arraymap.c:433 bpf_percpu_array_update()';
  frames.push({
    step: 6,
    label: 'BPF_F_CPU branch: per_cpu_ptr(pptr, cpu) writes only CPU 2',
    description: 'At kernel/bpf/arraymap.c:433 the BPF_F_CPU branch runs: cpu = map_flags >> 32 at line 434, ptr = per_cpu_ptr(pptr, cpu) at line 435, copy_map_value(map, ptr, value) at line 436 writes into CPU 2\'s slot, then goto unlock at line 438 skips the for_each_possible_cpu broadcast at line 440. CPUs 0, 1, and 3 keep their prior values (10, 20, 40). One syscall, one value_size copy_from_user, one per_cpu_ptr write — versus the pre-v7 4-syscall or 4*value_size pattern.',
    highlights: ['cpu-2'],
    data: cloneState(state),
  });

  // Frame 7: BPF_F_ALL_CPUS encoding
  state.phase = 'encode';
  state.apiMode = 'all-cpus';
  state.updateMode = 'all_cpus';
  state.targetCpu = undefined;
  state.currentValue = '55';
  state.cpuMask = [0, 1, 2, 3];
  state.syscallCount = 1;
  state.srcRef = 'include/uapi/linux/bpf.h:1397 BPF_F_ALL_CPUS -> kernel/bpf/arraymap.c:442 bpf_percpu_array_update()';
  frames.push({
    step: 7,
    label: 'Broadcast: flags = BPF_F_ALL_CPUS (single value for all CPUs)',
    description: 'Linux v7.0 adds BPF_F_ALL_CPUS = 16 at include/uapi/linux/bpf.h:1397, "update value across all CPUs for percpu maps". Userspace sets flags = BPF_F_ALL_CPUS with no CPU index in the upper 32 bits. In bpf_percpu_array_update() at kernel/bpf/arraymap.c:442 the for_each_possible_cpu loop runs, and val = (map_flags & BPF_F_ALL_CPUS) ? value : value + size * cpu collapses to the same source pointer for every CPU. A single map->value_size copy_from_user replaces the old num_possible_cpus()*round_up(value_size,8) buffer; one syscall replaces N syscalls.',
    highlights: ['percpu'],
    data: cloneState(state),
  });

  // Frame 8: Broadcast applied
  state.phase = 'applied';
  state.apiMode = 'all-cpus';
  state.updateMode = 'all_cpus';
  state.perCpuValues = [55, 55, 55, 55];
  state.cpuMask = [0, 1, 2, 3];
  state.syscallCount = 1;
  state.srcRef = 'kernel/bpf/arraymap.c:440 bpf_percpu_array_update()';
  frames.push({
    step: 8,
    label: 'All 4 CPU slots receive the same value',
    description: 'After the for_each_possible_cpu loop at kernel/bpf/arraymap.c:440 completes, every CPU slot holds 55. Because BPF_F_ALL_CPUS is set, val points at the same source buffer on each iteration instead of advancing by size*cpu. The hash map equivalent lives at kernel/bpf/hashtab.c:1038 inside pcpu_copy_value() with identical (map_flags & BPF_F_ALL_CPUS) semantics. Kernel does the N-CPU iteration internally, so userspace pays one syscall regardless of cpu count.',
    highlights: ['cpu-0', 'cpu-1', 'cpu-2', 'cpu-3'],
    data: cloneState(state),
  });

  // Frame 9: BPF_F_CPU lookup syscall path
  state.phase = 'lookup';
  state.apiMode = 'single-cpu';
  state.updateMode = 'cpu';
  state.targetCpu = 2;
  state.currentValue = '55';
  state.cpuMask = [2];
  state.syscallCount = 1;
  state.srcRef = 'kernel/bpf/syscall.c:1704 map_lookup_elem() -> kernel/bpf/arraymap.c:328 bpf_percpu_array_copy()';
  frames.push({
    step: 9,
    label: 'Lookup syscall path: map_lookup_elem -> bpf_percpu_array_copy',
    description: 'Read path is symmetric. bpf(BPF_MAP_LOOKUP_ELEM) with flags = BPF_F_CPU | ((u64)2 << 32) enters map_lookup_elem() at kernel/bpf/syscall.c:1704. Line 1723 restricts allowed lookup flags to BPF_F_LOCK | BPF_F_CPU (BPF_F_ALL_CPUS is NOT accepted on the read path — there is no way to return N distinct values into one value_size buffer). bpf_map_value_size() returns map->value_size (not N*value_size) because BPF_F_CPU is set. The per-map handler dispatches to bpf_percpu_array_copy() at kernel/bpf/arraymap.c:310.',
    highlights: ['cpu-2'],
    data: cloneState(state),
  });

  // Frame 10: BPF_F_CPU lookup applied
  state.phase = 'lookup';
  state.apiMode = 'single-cpu';
  state.updateMode = 'cpu';
  state.targetCpu = 2;
  state.currentValue = '55';
  state.cpuMask = [2];
  state.syscallCount = 1;
  state.srcRef = 'kernel/bpf/arraymap.c:328 bpf_percpu_array_copy()';
  frames.push({
    step: 10,
    label: 'Lookup with BPF_F_CPU: read CPU 2 specifically',
    description: 'bpf_percpu_array_copy() at kernel/bpf/arraymap.c:328 tests (map_flags & BPF_F_CPU), executes cpu = map_flags >> 32 at line 329, then copy_map_value(map, value, per_cpu_ptr(pptr, cpu)) at line 330 and goto unlock at line 332. Userspace receives exactly CPU 2\'s slot in a single value_size buffer (55 here, after the earlier broadcast) instead of the legacy full num_possible_cpus()*round_up(value_size,8) snapshot. Any unknown flag above BPF_F_CPU in the low 32 bits would fail the bpf_map_check_op_flags() check earlier in map_lookup_elem().',
    highlights: ['cpu-2'],
    data: cloneState(state),
  });

  // Frame 11: Summary across percpu map family
  state.phase = 'summary';
  state.apiMode = undefined;
  state.updateMode = undefined;
  state.targetCpu = undefined;
  state.cpuMask = undefined;
  state.syscallCount = undefined;
  state.currentValue = '';
  state.currentKey = '';
  state.srcRef = 'kernel/bpf/hashtab.c:1796 __htab_map_lookup_and_delete_batch()';
  frames.push({
    step: 11,
    label: 'Applies to all per-CPU map types',
    description: 'BPF_F_CPU / BPF_F_ALL_CPUS is consistent across every per-CPU map type: BPF_MAP_TYPE_PERCPU_ARRAY (kernel/bpf/arraymap.c), BPF_MAP_TYPE_PERCPU_HASH and BPF_MAP_TYPE_LRU_PERCPU_HASH (pcpu_copy_value() at kernel/bpf/hashtab.c:1028), and BPF_MAP_TYPE_PERCPU_CGROUP_STORAGE. The batch path __htab_map_lookup_and_delete_batch() at kernel/bpf/hashtab.c:1770 extends allowed_flags with BPF_F_CPU at line 1796 only when !do_delete && is_percpu, preserving safety on delete batches. Across the whole family, the upper-32 CPU encoding (map_flags >> 32) and the (u32)map_flags > BPF_F_ALL_CPUS validator are identical.',
    highlights: [],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// SVG Rendering
// ---------------------------------------------------------------------------
const NS = 'http://www.w3.org/2000/svg';

const PHASE_LABELS_HASH = [
  { id: 'alloc', label: 'Alloc' },
  { id: 'update', label: 'Update' },
  { id: 'lookup', label: 'Lookup' },
  { id: 'delete', label: 'Delete' },
];

const PHASE_LABELS_RING = [
  { id: 'alloc', label: 'Alloc' },
  { id: 'reserve', label: 'Reserve' },
  { id: 'write', label: 'Write' },
  { id: 'commit', label: 'Commit' },
  { id: 'output', label: 'Output' },
  { id: 'consume', label: 'Consume' },
];

const PHASE_LABELS_HELPER = [
  { id: 'load', label: 'Load' },
  { id: 'verify', label: 'Verify' },
  { id: 'dispatch', label: 'Dispatch' },
  { id: 'call', label: 'Call' },
  { id: 'jit', label: 'JIT' },
];

const PHASE_LABELS_PERCPU = [
  { id: 'init', label: 'Init' },
  { id: 'update', label: 'Update' },
  { id: 'encode', label: 'Encode' },
  { id: 'validate', label: 'Validate' },
  { id: 'applied', label: 'Applied' },
  { id: 'lookup', label: 'Lookup' },
];

function getPhaseLabels(mapType: string, phase: string): { labels: { id: string; label: string }[]; activeIndex: number } {
  let labels: { id: string; label: string }[];
  if (mapType === 'percpu_array') {
    labels = PHASE_LABELS_PERCPU;
  } else if (mapType === 'ringbuf') {
    labels = PHASE_LABELS_RING;
  } else if (phase === 'load' || phase === 'verify' || phase === 'dispatch' || phase === 'call' || phase === 'jit' || phase === 'summary') {
    labels = PHASE_LABELS_HELPER;
  } else {
    labels = PHASE_LABELS_HASH;
  }
  let activeIndex = labels.findIndex(l => l.id === phase);
  if (activeIndex === -1 && phase === 'summary') activeIndex = labels.length - 1;
  if (activeIndex === -1 && phase === 'init') activeIndex = 0;
  return { labels, activeIndex };
}

function renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void {
  while (container.firstChild) container.removeChild(container.firstChild);
  const data = frame.data as EbpfMapsState;
  const margin = { top: 10, left: 15, right: 15, bottom: 10 };
  const usableWidth = width - margin.left - margin.right;

  // Title
  const title = document.createElementNS(NS, 'text');
  title.setAttribute('x', String(width / 2));
  title.setAttribute('y', '18');
  title.setAttribute('text-anchor', 'middle');
  title.setAttribute('class', 'anim-title');
  title.textContent = 'BPF Maps & Helper Functions';
  container.appendChild(title);

  // --- Phase flow diagram ---
  const flowTop = margin.top + 28;
  const { labels: phaseLabels, activeIndex } = getPhaseLabels(data.mapType, data.phase);
  const phaseCount = phaseLabels.length;
  const phaseWidth = Math.min(100, (usableWidth - (phaseCount - 1) * 6) / phaseCount);
  const phaseHeight = 28;

  phaseLabels.forEach((phase, i) => {
    const px = margin.left + i * (phaseWidth + 6);
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

    if (i < phaseCount - 1) {
      const arrowX = px + phaseWidth;
      const arrowY = flowTop + phaseHeight / 2;
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', String(arrowX));
      line.setAttribute('y1', String(arrowY));
      line.setAttribute('x2', String(arrowX + 6));
      line.setAttribute('y2', String(arrowY));
      line.setAttribute('stroke', '#8b949e');
      line.setAttribute('stroke-width', '2');
      container.appendChild(line);
    }
  });

  // --- Bucket visualization (for hash maps) ---
  const bucketTop = flowTop + phaseHeight + 25;
  if (data.mapType === 'hash') {
    const bucketWidth = Math.min(90, (usableWidth - 7 * 6) / 8);
    const bucketHeight = 60;

    data.buckets.forEach((bucket, i) => {
      const bx = margin.left + i * (bucketWidth + 6);
      const isHighlighted = frame.highlights.includes(`bucket-${i}`) || frame.highlights.includes('buckets');

      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', String(bx));
      rect.setAttribute('y', String(bucketTop));
      rect.setAttribute('width', String(bucketWidth));
      rect.setAttribute('height', String(bucketHeight));
      rect.setAttribute('rx', '4');
      rect.setAttribute('fill', bucket.locked ? '#f85149' : bucket.elements.length > 0 ? '#1f6feb' : '#21262d');
      let cls = 'anim-bucket';
      if (isHighlighted) cls += ' anim-highlight';
      rect.setAttribute('class', cls);
      container.appendChild(rect);

      // Bucket label
      const bucketLabel = document.createElementNS(NS, 'text');
      bucketLabel.setAttribute('x', String(bx + bucketWidth / 2));
      bucketLabel.setAttribute('y', String(bucketTop + 14));
      bucketLabel.setAttribute('text-anchor', 'middle');
      bucketLabel.setAttribute('fill', '#e6edf3');
      bucketLabel.setAttribute('font-size', '9');
      bucketLabel.setAttribute('class', 'anim-bucket');
      bucketLabel.textContent = `[${i}]${bucket.locked ? ' LOCK' : ''}`;
      container.appendChild(bucketLabel);

      // Elements in bucket
      bucket.elements.forEach((elem, ei) => {
        const ey = bucketTop + 20 + ei * 16;
        const elemText = document.createElementNS(NS, 'text');
        elemText.setAttribute('x', String(bx + 4));
        elemText.setAttribute('y', String(ey + 12));
        elemText.setAttribute('fill', '#8b949e');
        elemText.setAttribute('font-size', '8');
        elemText.setAttribute('class', 'anim-bucket');
        elemText.textContent = `${elem.key}`;
        container.appendChild(elemText);
      });
    });
  }

  // --- Ring buffer visualization ---
  if (data.mapType === 'ringbuf') {
    const ringCenterX = width / 2;
    const ringCenterY = bucketTop + 70;
    const ringRadius = 55;

    // Ring outline
    const circle = document.createElementNS(NS, 'circle');
    circle.setAttribute('cx', String(ringCenterX));
    circle.setAttribute('cy', String(ringCenterY));
    circle.setAttribute('r', String(ringRadius));
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', '#30363d');
    circle.setAttribute('stroke-width', '16');
    circle.setAttribute('class', 'anim-ring');
    container.appendChild(circle);

    // Producer position arc
    const prodAngle = (data.ringBuffer.producerPos / data.ringBuffer.size) * 2 * Math.PI - Math.PI / 2;
    const prodX = ringCenterX + ringRadius * Math.cos(prodAngle);
    const prodY = ringCenterY + ringRadius * Math.sin(prodAngle);
    const prodMarker = document.createElementNS(NS, 'circle');
    prodMarker.setAttribute('cx', String(prodX));
    prodMarker.setAttribute('cy', String(prodY));
    prodMarker.setAttribute('r', '5');
    prodMarker.setAttribute('fill', '#3fb950');
    prodMarker.setAttribute('class', 'anim-ring');
    container.appendChild(prodMarker);

    const prodLabel = document.createElementNS(NS, 'text');
    prodLabel.setAttribute('x', String(prodX + 8));
    prodLabel.setAttribute('y', String(prodY - 8));
    prodLabel.setAttribute('fill', '#3fb950');
    prodLabel.setAttribute('font-size', '10');
    prodLabel.setAttribute('class', 'anim-ring');
    prodLabel.textContent = `P:${data.ringBuffer.producerPos}`;
    container.appendChild(prodLabel);

    // Consumer position
    const consAngle = (data.ringBuffer.consumerPos / data.ringBuffer.size) * 2 * Math.PI - Math.PI / 2;
    const consX = ringCenterX + ringRadius * Math.cos(consAngle);
    const consY = ringCenterY + ringRadius * Math.sin(consAngle);
    const consMarker = document.createElementNS(NS, 'circle');
    consMarker.setAttribute('cx', String(consX));
    consMarker.setAttribute('cy', String(consY));
    consMarker.setAttribute('r', '5');
    consMarker.setAttribute('fill', '#58a6ff');
    consMarker.setAttribute('class', 'anim-ring');
    container.appendChild(consMarker);

    const consLabel = document.createElementNS(NS, 'text');
    consLabel.setAttribute('x', String(consX + 8));
    consLabel.setAttribute('y', String(consY + 14));
    consLabel.setAttribute('fill', '#58a6ff');
    consLabel.setAttribute('font-size', '10');
    consLabel.setAttribute('class', 'anim-ring');
    consLabel.textContent = `C:${data.ringBuffer.consumerPos}`;
    container.appendChild(consLabel);

    // Center label
    const centerLabel = document.createElementNS(NS, 'text');
    centerLabel.setAttribute('x', String(ringCenterX));
    centerLabel.setAttribute('y', String(ringCenterY + 4));
    centerLabel.setAttribute('text-anchor', 'middle');
    centerLabel.setAttribute('fill', '#e6edf3');
    centerLabel.setAttribute('font-size', '10');
    centerLabel.setAttribute('class', 'anim-ring');
    centerLabel.textContent = `${data.ringBuffer.records.length} records`;
    container.appendChild(centerLabel);
  }

  // --- Per-CPU array visualization (BPF_F_CPU scenario) ---
  if (data.mapType === 'percpu_array' && data.perCpuValues) {
    const cpuCount = data.perCpuValues.length;
    const slotWidth = Math.min(140, (usableWidth - (cpuCount - 1) * 10) / cpuCount);
    const slotHeight = 70;
    const slotTop = bucketTop + 20;

    // Mode label
    const modeLabel = document.createElementNS(NS, 'text');
    modeLabel.setAttribute('x', String(margin.left));
    modeLabel.setAttribute('y', String(slotTop - 6));
    modeLabel.setAttribute('fill', '#e6edf3');
    modeLabel.setAttribute('font-size', '11');
    modeLabel.setAttribute('class', 'anim-percpu-label');
    let modeText = 'Mode: ';
    if (data.updateMode === 'cpu') modeText += `BPF_F_CPU (target=${data.targetCpu ?? '?'})`;
    else if (data.updateMode === 'all_cpus') modeText += 'BPF_F_ALL_CPUS (broadcast)';
    else if (data.updateMode === 'current') modeText += 'Legacy (current CPU only)';
    else modeText += '(init)';
    if (data.apiMode) modeText += `  |  API: ${data.apiMode}`;
    if (typeof data.syscallCount === 'number' && data.syscallCount > 0) {
      modeText += `  |  syscalls=${data.syscallCount}`;
    }
    modeLabel.textContent = modeText;
    container.appendChild(modeLabel);

    data.perCpuValues.forEach((val, i) => {
      const sx = margin.left + i * (slotWidth + 10);
      const inMask = !!(data.cpuMask && data.cpuMask.includes(i));
      const isTarget =
        (data.updateMode === 'cpu' && data.targetCpu === i) ||
        (data.updateMode === 'all_cpus' && data.phase === 'applied') ||
        inMask;
      const isHighlighted = frame.highlights.includes(`cpu-${i}`);

      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', String(sx));
      rect.setAttribute('y', String(slotTop));
      rect.setAttribute('width', String(slotWidth));
      rect.setAttribute('height', String(slotHeight));
      rect.setAttribute('rx', '4');
      rect.setAttribute('fill', isTarget ? '#1f6feb' : '#21262d');
      rect.setAttribute('stroke', isHighlighted ? '#f0883e' : '#30363d');
      rect.setAttribute('stroke-width', isHighlighted ? '2' : '1');
      rect.setAttribute('class', 'anim-percpu-slot');
      container.appendChild(rect);

      const cpuLabel = document.createElementNS(NS, 'text');
      cpuLabel.setAttribute('x', String(sx + slotWidth / 2));
      cpuLabel.setAttribute('y', String(slotTop + 18));
      cpuLabel.setAttribute('text-anchor', 'middle');
      cpuLabel.setAttribute('fill', '#8b949e');
      cpuLabel.setAttribute('font-size', '10');
      cpuLabel.setAttribute('class', 'anim-percpu-slot');
      cpuLabel.textContent = `CPU ${i}`;
      container.appendChild(cpuLabel);

      const valText = document.createElementNS(NS, 'text');
      valText.setAttribute('x', String(sx + slotWidth / 2));
      valText.setAttribute('y', String(slotTop + 46));
      valText.setAttribute('text-anchor', 'middle');
      valText.setAttribute('fill', '#e6edf3');
      valText.setAttribute('font-size', '16');
      valText.setAttribute('class', 'anim-percpu-slot');
      valText.textContent = String(val);
      container.appendChild(valText);
    });
  }

  // --- Helper calls list ---
  if (data.helperCalls.length > 0) {
    const callTop = bucketTop + (data.mapType === 'ringbuf' ? 160 : 80);
    const callLabel = document.createElementNS(NS, 'text');
    callLabel.setAttribute('x', String(margin.left));
    callLabel.setAttribute('y', String(callTop));
    callLabel.setAttribute('class', 'anim-cpu-label');
    callLabel.textContent = 'Helper Calls:';
    container.appendChild(callLabel);

    data.helperCalls.forEach((call, i) => {
      const cy = callTop + 16 + i * 22;
      const isHighlighted = frame.highlights.includes(`helper-${i}`);

      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', String(margin.left));
      rect.setAttribute('y', String(cy));
      rect.setAttribute('width', String(Math.min(400, usableWidth)));
      rect.setAttribute('height', '18');
      rect.setAttribute('rx', '3');
      rect.setAttribute('fill', isHighlighted ? '#1f6feb' : '#21262d');
      let cls = 'anim-helper-call';
      if (isHighlighted) cls += ' anim-highlight';
      rect.setAttribute('class', cls);
      container.appendChild(rect);

      const text = document.createElementNS(NS, 'text');
      text.setAttribute('x', String(margin.left + 6));
      text.setAttribute('y', String(cy + 13));
      text.setAttribute('fill', '#e6edf3');
      text.setAttribute('font-size', '10');
      text.setAttribute('class', 'anim-helper-call');
      text.textContent = `${call.funcName}() -> ${call.result || '...'}`;
      container.appendChild(text);
    });
  }

  // --- Current key/value display ---
  if (data.currentKey || data.currentValue) {
    const kvTop = height - margin.bottom - 30;
    const kvText = document.createElementNS(NS, 'text');
    kvText.setAttribute('x', String(margin.left));
    kvText.setAttribute('y', String(kvTop));
    kvText.setAttribute('fill', '#8b949e');
    kvText.setAttribute('font-size', '11');
    kvText.setAttribute('class', 'anim-cpu-label');
    const parts: string[] = [];
    if (data.currentKey) parts.push(`Key: ${data.currentKey}`);
    if (data.currentValue) parts.push(`Value: ${data.currentValue}`);
    kvText.textContent = parts.join('  |  ');
    container.appendChild(kvText);
  }
}

// ---------------------------------------------------------------------------
// Module export
// ---------------------------------------------------------------------------
const SCENARIOS: AnimationScenario[] = [
  { id: 'hashmap-operations', label: 'Hash Map Operations (lookup/update/delete)' },
  { id: 'ringbuf-reserve-commit', label: 'Ring Buffer (reserve/submit/output)' },
  { id: 'helper-call-dispatch', label: 'Helper Call Dispatch (func_id -> kernel)' },
  { id: 'bpf-f-cpu-flags', label: 'BPF_F_CPU Per-CPU Map Flags (v7.0)' },
];

const ebpfMaps: AnimationModule = {
  config: {
    id: 'ebpf-maps',
    title: 'BPF Maps & Helper Functions',
    skillName: 'ebpf-maps-and-helpers',
  },
  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario) {
      case 'ringbuf-reserve-commit': return generateRingbufReserveCommit();
      case 'helper-call-dispatch': return generateHelperCallDispatch();
      case 'bpf-f-cpu-flags': return generateBpfFCpuFlags();
      case 'hashmap-operations':
      default: return generateHashmapOperations();
    }
  },
  renderFrame,
  getScenarios: () => SCENARIOS,
};

export default ebpfMaps;

import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

export interface BlockIoState {
  bios: Array<{ sector: number; size: number; op: string }>;
  requests: Array<{ sector: number; size: number; tag: number; merged: boolean }>;
  plugList: number[];  // request tags in plug
  hwQueues: Array<{ id: number; dispatched: number[] }>;
  currentFunction: string;
  phase: 'bio-alloc' | 'submit' | 'mq-submit' | 'get-request' | 'plug-merge' | 'unplug' | 'dispatch' | 'hw-issue' | 'complete' | 'bio-endio';
  srcRef: string;
}

function cloneState(s: BlockIoState): BlockIoState {
  return {
    bios: s.bios.map(b => ({ ...b })),
    requests: s.requests.map(r => ({ ...r })),
    plugList: [...s.plugList],
    hwQueues: s.hwQueues.map(q => ({ id: q.id, dispatched: [...q.dispatched] })),
    currentFunction: s.currentFunction,
    phase: s.phase,
    srcRef: s.srcRef,
  };
}

// ---------------------------------------------------------------------------
// Scenario 1: bio-to-dispatch (default)
// Filesystem submits a single bio through the blk-mq path
// ---------------------------------------------------------------------------
function generateBioToDispatch(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: BlockIoState = {
    bios: [],
    requests: [],
    plugList: [],
    hwQueues: [{ id: 0, dispatched: [] }, { id: 1, dispatched: [] }],
    currentFunction: '',
    phase: 'bio-alloc',
    srcRef: '',
  };

  // Frame 0: bio allocation
  state.currentFunction = 'bio_alloc_bioset';
  state.srcRef = 'block/bio.c:549 (bio_alloc_bioset)';
  state.bios.push({ sector: 2048, size: 4096, op: 'REQ_OP_READ' });
  frames.push({
    step: 0,
    label: 'Filesystem allocates a bio',
    description: 'The filesystem (e.g., ext4 readahead) calls bio_alloc_bioset() at block/bio.c:549 to allocate a bio from the bioset mempool. The bio describes a 4096-byte read at sector 2048. bio_alloc_bioset() initializes bi_opf, sets the block_device, and pre-allocates inline biovecs for up to BIO_INLINE_VECS page references.',
    highlights: ['bio-0'],
    data: cloneState(state),
  });

  // Frame 1: bio_add_page
  state.currentFunction = 'bio_add_page';
  state.srcRef = 'block/bio.c:1062 (bio_add_page)';
  frames.push({
    step: 1,
    label: 'bio_add_page() adds data pages',
    description: 'The filesystem calls bio_add_page() at block/bio.c:1062 to attach page cache pages to the bio. bio_add_page() checks BIO_MAX_SIZE at line 1067, attempts to merge into the last bvec via bvec_try_merge_page() at line 1076, and falls through to __bio_add_page() at line 1084 if a new segment is needed. Each bvec holds a page pointer, offset, and length.',
    highlights: ['bio-0'],
    data: cloneState(state),
  });

  // Frame 2: submit_bio entry
  state.phase = 'submit';
  state.currentFunction = 'submit_bio';
  state.srcRef = 'block/blk-core.c:916 (submit_bio)';
  frames.push({
    step: 2,
    label: 'submit_bio() enters block layer',
    description: 'The filesystem calls submit_bio() at block/blk-core.c:916. For reads, it accounts I/O via task_io_account_read() at line 919 and increments PGPGIN VM counters at line 920. It sets the bio ioprio via bio_set_ioprio() at line 925, then calls submit_bio_noacct() at line 926 which validates the bio against the device limits.',
    highlights: ['bio-0'],
    data: cloneState(state),
  });

  // Frame 3: __submit_bio -> blk_mq_submit_bio
  state.phase = 'mq-submit';
  state.currentFunction = '__submit_bio';
  state.srcRef = 'block/blk-core.c:627 (__submit_bio) -> line 635 (blk_mq_submit_bio)';
  frames.push({
    step: 3,
    label: '__submit_bio() dispatches to blk-mq',
    description: '__submit_bio() at block/blk-core.c:627 sets up a temporary blk_plug via blk_start_plug() at line 632. At line 634, it checks BD_HAS_SUBMIT_BIO flag -- for standard blk-mq devices this is false, so it calls blk_mq_submit_bio() at line 635. This is the main entry point into the multi-queue block layer.',
    highlights: ['bio-0'],
    data: cloneState(state),
  });

  // Frame 4: blk_mq_submit_bio processing
  state.currentFunction = 'blk_mq_submit_bio';
  state.srcRef = 'block/blk-mq.c:3141 (blk_mq_submit_bio)';
  frames.push({
    step: 4,
    label: 'blk_mq_submit_bio() processes bio',
    description: 'blk_mq_submit_bio() at block/blk-mq.c:3141 is the core blk-mq submission function. It first peeks at plug cached request at line 3154, then calls bio_queue_enter() at line 3174 to hold a queue usage reference. At line 3194 it calls __bio_split_to_limits() to split the bio if it exceeds hardware limits. At line 3202, blk_mq_attempt_bio_merge() tries to merge into existing requests.',
    highlights: ['bio-0'],
    data: cloneState(state),
  });

  // Frame 5: allocate request
  state.phase = 'get-request';
  state.currentFunction = 'blk_mq_get_new_requests';
  state.srcRef = 'block/blk-mq.c:3046 (blk_mq_get_new_requests) -> line 3214';
  state.requests.push({ sector: 2048, size: 4096, tag: 0, merged: false });
  frames.push({
    step: 5,
    label: 'Allocate request from tag set',
    description: 'No merge possible -- blk_mq_get_new_requests() at block/blk-mq.c:3046 allocates a new struct request. Called from line 3214, it selects a hardware queue via blk_mq_map_queue(), allocates a tag from the tag bitmap (which limits outstanding I/Os), and initializes the request. At line 3226, blk_mq_bio_to_request() at line 2685 copies bio data into the request structure.',
    highlights: ['request-0'],
    data: cloneState(state),
  });

  // Frame 6: plug or direct issue decision
  state.phase = 'dispatch';
  state.currentFunction = 'blk_mq_try_issue_directly';
  state.srcRef = 'block/blk-mq.c:3242-3254 (plug vs direct issue decision)';
  frames.push({
    step: 6,
    label: 'Dispatch decision: plug or direct issue',
    description: 'At block/blk-mq.c:3242, if current->plug is active, blk_add_rq_to_plug() at line 1408 adds the request to the plug list and returns. Otherwise at line 3248, if an I/O scheduler is active (RQF_USE_SCHED) or the queue is busy, blk_mq_insert_request() at line 2623 inserts into the scheduler and blk_mq_run_hw_queue() at line 2352 kicks dispatch. For direct path at line 3253: blk_mq_try_issue_directly().',
    highlights: ['request-0'],
    data: cloneState(state),
  });

  // Frame 7: try_issue_directly -> __blk_mq_issue_directly
  state.phase = 'hw-issue';
  state.currentFunction = '__blk_mq_issue_directly';
  state.srcRef = 'block/blk-mq.c:2768 (blk_mq_try_issue_directly) -> line 2710 (__blk_mq_issue_directly)';
  state.hwQueues[0].dispatched.push(0);
  frames.push({
    step: 7,
    label: '__blk_mq_issue_directly() sends to hardware',
    description: 'blk_mq_try_issue_directly() at block/blk-mq.c:2768 checks hctx stopped state at line 2773, then gets a budget and tag at line 2779. At line 2785 it calls __blk_mq_issue_directly() at line 2710 which invokes the driver queue_rq callback: q->mq_ops->queue_rq(hctx, &bd) at line 2725. This hands the request to the NVMe/SCSI/virtio driver. On BLK_STS_OK the request is now in-flight in hardware.',
    highlights: ['hwq-0', 'request-0'],
    data: cloneState(state),
  });

  // Frame 8: request in-flight
  state.currentFunction = 'queue_rq (driver)';
  state.srcRef = 'block/blk-mq.c:2725 (q->mq_ops->queue_rq) -> driver-specific queue_rq';
  frames.push({
    step: 8,
    label: 'Request in-flight: hardware processing',
    description: 'The driver queue_rq() callback (e.g., nvme_queue_rq for NVMe) programs the hardware submission queue, writes doorbell registers, and returns BLK_STS_OK. Back in __blk_mq_issue_directly() at block/blk-mq.c:2728, blk_mq_update_dispatch_busy() marks the queue as not busy. The I/O is now fully dispatched -- the block layer waits for the hardware completion interrupt.',
    highlights: ['hwq-0'],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario 2: plug-merge
// Multiple sequential I/Os get merged via the plug mechanism
// ---------------------------------------------------------------------------
function generatePlugMerge(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: BlockIoState = {
    bios: [],
    requests: [],
    plugList: [],
    hwQueues: [{ id: 0, dispatched: [] }, { id: 1, dispatched: [] }],
    currentFunction: '',
    phase: 'bio-alloc',
    srcRef: '',
  };

  // Frame 0: First bio allocated
  state.currentFunction = 'bio_alloc_bioset';
  state.srcRef = 'block/bio.c:549 (bio_alloc_bioset)';
  state.bios.push({ sector: 1024, size: 4096, op: 'REQ_OP_READ' });
  frames.push({
    step: 0,
    label: 'Allocate first bio (sector 1024)',
    description: 'ext4 readahead allocates the first bio via bio_alloc_bioset() at block/bio.c:549 for sector 1024, 4096 bytes. The bioset uses a per-CPU cache at line 561 for fast allocation when nr_vecs <= BIO_INLINE_VECS. bio_add_page() at block/bio.c:1062 attaches the page cache page.',
    highlights: ['bio-0'],
    data: cloneState(state),
  });

  // Frame 1: First bio submitted, request allocated, plugged
  state.phase = 'submit';
  state.currentFunction = 'submit_bio -> blk_mq_submit_bio';
  state.srcRef = 'block/blk-core.c:916 (submit_bio) -> block/blk-mq.c:3141 (blk_mq_submit_bio)';
  state.requests.push({ sector: 1024, size: 4096, tag: 0, merged: false });
  state.plugList.push(0);
  frames.push({
    step: 1,
    label: 'First bio submitted and plugged',
    description: 'submit_bio() at block/blk-core.c:916 enters the block layer. blk_mq_submit_bio() at block/blk-mq.c:3141 allocates a request via blk_mq_get_new_requests() at line 3046. Since current->plug is active (set by the filesystem), blk_add_rq_to_plug() at block/blk-mq.c:1408 adds the request to plug->mq_list instead of dispatching. The request is batched for later.',
    highlights: ['request-0', 'plug-list'],
    data: cloneState(state),
  });

  // Frame 2: Second bio allocated (adjacent sector)
  state.phase = 'bio-alloc';
  state.currentFunction = 'bio_alloc_bioset';
  state.srcRef = 'block/bio.c:549 (bio_alloc_bioset)';
  state.bios.push({ sector: 1032, size: 4096, op: 'REQ_OP_READ' });
  frames.push({
    step: 2,
    label: 'Allocate second bio (sector 1032)',
    description: 'The filesystem allocates a second bio via bio_alloc_bioset() at block/bio.c:549 for sector 1032 (immediately following the first bio at sector 1024 + 8 sectors). bio_add_page() at block/bio.c:1062 attaches its page. These two bios are sequential and mergeable.',
    highlights: ['bio-1'],
    data: cloneState(state),
  });

  // Frame 3: Second bio submitted -- merge attempt
  state.phase = 'plug-merge';
  state.currentFunction = 'blk_attempt_plug_merge';
  state.srcRef = 'block/blk-mq.c:3034 (blk_mq_attempt_bio_merge) -> block/blk-merge.c:1085 (blk_attempt_plug_merge)';
  frames.push({
    step: 3,
    label: 'blk_attempt_plug_merge() checks plug list',
    description: 'submit_bio() enters blk_mq_submit_bio() at block/blk-mq.c:3141 for the second bio. At line 3202, blk_mq_attempt_bio_merge() at line 3034 calls blk_attempt_plug_merge() at block/blk-merge.c:1085. This gets current->plug at line 1088, checks plug->mq_list.tail at line 1094, and calls blk_attempt_bio_merge() at line 1096 to check if the new bio can merge with the tail request.',
    highlights: ['bio-1', 'plug-list'],
    data: cloneState(state),
  });

  // Frame 4: Back merge succeeds
  state.currentFunction = 'bio_attempt_back_merge';
  state.srcRef = 'block/blk-merge.c:944 (bio_attempt_back_merge)';
  state.requests[0].size += 4096;
  state.requests[0].merged = true;
  frames.push({
    step: 4,
    label: 'bio_attempt_back_merge() merges bio into request',
    description: 'blk_attempt_bio_merge() calls bio_attempt_back_merge() at block/blk-merge.c:944. It checks segment limits via ll_back_merge_fn() at line 949, traces the merge at line 952, then links the bio: req->biotail->bi_next = bio at line 965, updates req->biotail at line 966, and adds the bio size to req->__data_len at line 967. The two 4K bios are now a single 8K request. Merge succeeds: BIO_MERGE_OK.',
    highlights: ['request-0'],
    data: cloneState(state),
  });

  // Frame 5: Third bio -- another sequential I/O
  state.phase = 'bio-alloc';
  state.currentFunction = 'bio_alloc_bioset';
  state.srcRef = 'block/bio.c:549 (bio_alloc_bioset)';
  state.bios.push({ sector: 1040, size: 4096, op: 'REQ_OP_READ' });
  frames.push({
    step: 5,
    label: 'Allocate third bio (sector 1040)',
    description: 'The filesystem allocates a third bio via bio_alloc_bioset() at block/bio.c:549 for sector 1040 (following sector 1032 + 8). The readahead window is building a large contiguous I/O through the plug mechanism.',
    highlights: ['bio-2'],
    data: cloneState(state),
  });

  // Frame 6: Third bio also merges
  state.phase = 'plug-merge';
  state.currentFunction = 'bio_attempt_back_merge';
  state.srcRef = 'block/blk-merge.c:944 (bio_attempt_back_merge) -> line 967 (__data_len += bi_size)';
  state.requests[0].size += 4096;
  frames.push({
    step: 6,
    label: 'Third bio merges into same request',
    description: 'Again blk_attempt_plug_merge() at block/blk-merge.c:1085 succeeds. bio_attempt_back_merge() at line 944 links bio 3 into the request chain. req->__data_len at line 967 is now 12288 (3 x 4K). Three separate filesystem I/Os have been coalesced into a single 12K request -- all without any lock contention, using only the per-task plug list.',
    highlights: ['request-0'],
    data: cloneState(state),
  });

  // Frame 7: Unplug -- blk_mq_flush_plug_list
  state.phase = 'unplug';
  state.currentFunction = 'blk_mq_flush_plug_list';
  state.srcRef = 'block/blk-mq.c:2969 (blk_mq_flush_plug_list)';
  frames.push({
    step: 7,
    label: 'Unplug: blk_mq_flush_plug_list() dispatches',
    description: 'When the filesystem calls blk_finish_plug() or schedule(), blk_mq_flush_plug_list() at block/blk-mq.c:2969 fires. It reads plug->rq_count at line 2982, clears it at line 2983. At line 2985, if no elevator is active and not scheduling, it takes the fast path: blk_mq_dispatch_queue_requests() at line 2991 dispatches all batched requests. The merged 12K request is sent to the hardware queue.',
    highlights: ['plug-list'],
    data: cloneState(state),
  });

  // Frame 8: Dispatched to hardware
  state.phase = 'hw-issue';
  state.currentFunction = '__blk_mq_issue_directly';
  state.srcRef = 'block/blk-mq.c:2710 (__blk_mq_issue_directly) -> line 2725 (queue_rq)';
  state.plugList = [];
  state.hwQueues[0].dispatched.push(0);
  frames.push({
    step: 8,
    label: 'Merged request dispatched to hardware',
    description: 'The unplug path eventually calls __blk_mq_issue_directly() at block/blk-mq.c:2710 for each request. At line 2725, q->mq_ops->queue_rq(hctx, &bd) hands the merged 12K request to the driver. Instead of 3 separate hardware I/Os, the device processes a single efficient large read. The plug mechanism saved 2 hardware submissions and reduced interrupt overhead.',
    highlights: ['hwq-0', 'request-0'],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario 3: io-completion
// Hardware completes I/O and the completion path runs
// ---------------------------------------------------------------------------
function generateIoCompletion(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: BlockIoState = {
    bios: [{ sector: 2048, size: 4096, op: 'REQ_OP_READ' }],
    requests: [{ sector: 2048, size: 4096, tag: 0, merged: false }],
    plugList: [],
    hwQueues: [{ id: 0, dispatched: [0] }, { id: 1, dispatched: [] }],
    currentFunction: '',
    phase: 'hw-issue',
    srcRef: '',
  };

  // Frame 0: Hardware processing complete
  state.currentFunction = 'hardware IRQ';
  state.srcRef = 'block/blk-mq.c:2725 (q->mq_ops->queue_rq returned BLK_STS_OK earlier)';
  frames.push({
    step: 0,
    label: 'Hardware completes I/O transfer',
    description: 'The NVMe/SCSI controller finishes the DMA transfer and fires a completion interrupt. The request was submitted via q->mq_ops->queue_rq() at block/blk-mq.c:2725 and has been in-flight in hardware. The interrupt handler in the device driver (e.g., nvme_irq) reads the completion queue entry to identify which request completed.',
    highlights: ['hwq-0'],
    data: cloneState(state),
  });

  // Frame 1: blk_mq_complete_request
  state.phase = 'complete';
  state.currentFunction = 'blk_mq_complete_request';
  state.srcRef = 'block/blk-mq.c:1353 (blk_mq_complete_request)';
  frames.push({
    step: 1,
    label: 'blk_mq_complete_request() starts completion',
    description: 'The driver interrupt handler calls blk_mq_complete_request() at block/blk-mq.c:1353. At line 1355, it calls blk_mq_complete_request_remote() at line 1319, which sets rq->state = MQ_RQ_COMPLETE at line 1321. If the completion CPU differs from the submission CPU, it may raise BLOCK_SOFTIRQ via IPI (__blk_mq_complete_request_remote at line 1267). Otherwise, it calls mq_ops->complete() directly at line 1356.',
    highlights: ['request-0'],
    data: cloneState(state),
  });

  // Frame 2: blk_mq_end_request
  state.currentFunction = 'blk_mq_end_request';
  state.srcRef = 'block/blk-mq.c:1176 (blk_mq_end_request)';
  frames.push({
    step: 2,
    label: 'blk_mq_end_request() processes completion',
    description: 'The driver complete callback (e.g., nvme_pci_complete_rq) calls blk_mq_end_request() at block/blk-mq.c:1176. At line 1178, blk_update_request() updates I/O statistics, advances the bio iterator for partial completions, and returns false for full completion. Then __blk_mq_end_request() at line 1180 is called.',
    highlights: ['request-0'],
    data: cloneState(state),
  });

  // Frame 3: __blk_mq_end_request internals
  state.currentFunction = '__blk_mq_end_request';
  state.srcRef = 'block/blk-mq.c:1159 (__blk_mq_end_request)';
  frames.push({
    step: 3,
    label: '__blk_mq_end_request() frees request',
    description: '__blk_mq_end_request() at block/blk-mq.c:1159 timestamps the request if needed via __blk_mq_end_request_acct() at line 1162 for latency accounting. At line 1164, blk_mq_finish_request() runs rq_qos callbacks and decrements the queue usage counter. At line 1166, if rq->end_io is set, it calls the end_io callback; otherwise blk_mq_free_request() at line 1171 frees the tag and request memory.',
    highlights: ['request-0'],
    data: cloneState(state),
  });

  // Frame 4: bio_endio called
  state.phase = 'bio-endio';
  state.currentFunction = 'bio_endio';
  state.srcRef = 'block/bio.c:1749 (bio_endio)';
  frames.push({
    step: 4,
    label: 'bio_endio() starts bio completion',
    description: 'blk_update_request() (called from blk_mq_end_request) calls bio_endio() at block/bio.c:1749 for each bio in the request chain. bio_endio() first checks bio_remaining_done() at line 1752 -- for chained bios this decrements bi_remaining and returns false until all sub-bios complete. At line 1757, blk_zone_bio_endio() handles zoned device bookkeeping.',
    highlights: ['bio-0'],
    data: cloneState(state),
  });

  // Frame 5: bio chain walking
  state.currentFunction = 'bio_endio (chain)';
  state.srcRef = 'block/bio.c:1774 (bio_chain_endio check) -> line 1775 (__bio_chain_endio)';
  frames.push({
    step: 5,
    label: 'bio_endio() walks the bio chain',
    description: 'At block/bio.c:1774, bio_endio() checks if bi_end_io == bio_chain_endio -- this is the chain marker set by bio_chain(). If true, __bio_chain_endio() at line 1775 frees the current bio and returns the parent bio, then goto again at line 1776 recurses via tail call optimization (avoiding stack overflow for long chains). This unwinds the entire bio chain built during merging.',
    highlights: ['bio-0'],
    data: cloneState(state),
  });

  // Frame 6: bi_end_io callback
  state.currentFunction = 'bi_end_io (filesystem)';
  state.srcRef = 'block/bio.c:1791 (bio->bi_end_io callback)';
  frames.push({
    step: 6,
    label: 'bi_end_io() calls filesystem callback',
    description: 'At block/bio.c:1791, for the final bio in the chain, bio->bi_end_io(bio) invokes the filesystem completion callback. For ext4 buffered reads this is mpage_end_io() which marks page cache pages uptodate via SetPageUptodate() and unlocks them. For direct I/O this is blkdev_bio_end_io(). The callback checks bio->bi_status for errors.',
    highlights: ['bio-0'],
    data: cloneState(state),
  });

  // Frame 7: Page cache updated, tag freed
  state.currentFunction = 'blk_mq_free_request';
  state.srcRef = 'block/blk-mq.c:1171 (blk_mq_free_request)';
  state.hwQueues[0].dispatched = [];
  state.requests = [];
  frames.push({
    step: 7,
    label: 'Request freed, tag returned to pool',
    description: 'blk_mq_free_request() at block/blk-mq.c:1171 returns the tag to the tag bitmap, making it available for new I/Os. The hardware queue tag is freed via blk_mq_put_tag() and the request memory returns to the slab cache. The block layer I/O is fully complete: data is in the page cache, pages are unlocked, and any processes sleeping in wait_on_page_locked() are woken.',
    highlights: ['hwq-0'],
    data: cloneState(state),
  });

  // Frame 8: Process wakes up
  state.phase = 'bio-endio';
  state.currentFunction = 'wake_up_page (completion)';
  state.srcRef = 'mm/filemap.c (folio_unlock -> folio_wake_bit -> wake_up_page)';
  state.bios = [];
  frames.push({
    step: 8,
    label: 'Waiting process woken -- I/O complete',
    description: 'The filesystem bi_end_io callback called folio_unlock() which triggers folio_wake_bit() in mm/filemap.c. Any process that was blocked in filemap_get_pages() -> folio_wait_locked() is now woken. The read() system call can copy data from the page cache to userspace. The entire I/O path is complete: from submit_bio() through hardware and back to the waiting process.',
    highlights: [],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------
function renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void {
  container.innerHTML = '';
  const data = frame.data as BlockIoState;
  const ns = 'http://www.w3.org/2000/svg';

  // Title
  const title = document.createElementNS(ns, 'text');
  title.setAttribute('class', 'anim-title');
  title.setAttribute('x', '10');
  title.setAttribute('y', '24');
  title.setAttribute('font-size', '16');
  title.setAttribute('font-weight', 'bold');
  title.textContent = frame.label;
  container.appendChild(title);

  // Current function label
  const fnLabel = document.createElementNS(ns, 'text');
  fnLabel.setAttribute('class', 'anim-function');
  fnLabel.setAttribute('x', '10');
  fnLabel.setAttribute('y', '48');
  fnLabel.setAttribute('font-size', '12');
  fnLabel.textContent = `fn: ${data.currentFunction}`;
  container.appendChild(fnLabel);

  // Bios section
  const bioY = 70;
  data.bios.forEach((bio, i) => {
    const rect = document.createElementNS(ns, 'rect');
    rect.setAttribute('class', 'anim-bio');
    rect.setAttribute('x', String(20 + i * 120));
    rect.setAttribute('y', String(bioY));
    rect.setAttribute('width', '100');
    rect.setAttribute('height', '40');
    rect.setAttribute('fill', '#4a9eff');
    rect.setAttribute('stroke', '#333');
    rect.setAttribute('rx', '4');
    container.appendChild(rect);

    const label = document.createElementNS(ns, 'text');
    label.setAttribute('x', String(70 + i * 120));
    label.setAttribute('y', String(bioY + 25));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('font-size', '10');
    label.textContent = `bio s:${bio.sector}`;
    container.appendChild(label);
  });

  // Requests section
  const reqY = 140;
  data.requests.forEach((req, i) => {
    const rect = document.createElementNS(ns, 'rect');
    rect.setAttribute('class', 'anim-request');
    rect.setAttribute('x', String(20 + i * 140));
    rect.setAttribute('y', String(reqY));
    rect.setAttribute('width', '120');
    rect.setAttribute('height', '40');
    rect.setAttribute('fill', req.merged ? '#ff9f43' : '#54a0ff');
    rect.setAttribute('stroke', '#333');
    rect.setAttribute('rx', '4');
    container.appendChild(rect);

    const label = document.createElementNS(ns, 'text');
    label.setAttribute('x', String(80 + i * 140));
    label.setAttribute('y', String(reqY + 25));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('font-size', '10');
    label.textContent = `rq tag:${req.tag} ${req.size}B`;
    container.appendChild(label);
  });

  // Plug list
  if (data.plugList.length > 0) {
    const plugY = 210;
    const plugRect = document.createElementNS(ns, 'rect');
    plugRect.setAttribute('class', 'anim-plug');
    plugRect.setAttribute('x', '20');
    plugRect.setAttribute('y', String(plugY));
    plugRect.setAttribute('width', String(Math.max(200, data.plugList.length * 60 + 40)));
    plugRect.setAttribute('height', '40');
    plugRect.setAttribute('fill', '#ffeaa7');
    plugRect.setAttribute('stroke', '#333');
    plugRect.setAttribute('rx', '4');
    container.appendChild(plugRect);

    const plugLabel = document.createElementNS(ns, 'text');
    plugLabel.setAttribute('x', '30');
    plugLabel.setAttribute('y', String(plugY + 25));
    plugLabel.setAttribute('font-size', '10');
    plugLabel.textContent = `plug: [${data.plugList.map(t => `tag:${t}`).join(', ')}]`;
    container.appendChild(plugLabel);
  }

  // Hardware queues
  const hwY = 280;
  data.hwQueues.forEach((hq, i) => {
    const rect = document.createElementNS(ns, 'rect');
    rect.setAttribute('class', 'anim-hwq');
    rect.setAttribute('x', String(20 + i * 200));
    rect.setAttribute('y', String(hwY));
    rect.setAttribute('width', '180');
    rect.setAttribute('height', '50');
    rect.setAttribute('fill', hq.dispatched.length > 0 ? '#00d2d3' : '#dfe6e9');
    rect.setAttribute('stroke', '#333');
    rect.setAttribute('rx', '4');
    container.appendChild(rect);

    const label = document.createElementNS(ns, 'text');
    label.setAttribute('x', String(110 + i * 200));
    label.setAttribute('y', String(hwY + 30));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('font-size', '11');
    label.textContent = `hctx[${hq.id}] dispatched: ${hq.dispatched.length}`;
    container.appendChild(label);
  });

  // Phase indicator
  const phaseText = document.createElementNS(ns, 'text');
  phaseText.setAttribute('class', 'anim-phase');
  phaseText.setAttribute('x', String(width - 10));
  phaseText.setAttribute('y', '24');
  phaseText.setAttribute('text-anchor', 'end');
  phaseText.setAttribute('font-size', '12');
  phaseText.textContent = `phase: ${data.phase}`;
  container.appendChild(phaseText);

  // Source reference
  const srcText = document.createElementNS(ns, 'text');
  srcText.setAttribute('class', 'anim-srcref');
  srcText.setAttribute('x', '10');
  srcText.setAttribute('y', String(height - 10));
  srcText.setAttribute('font-size', '10');
  srcText.setAttribute('fill', '#636e72');
  srcText.textContent = data.srcRef;
  container.appendChild(srcText);
}

// ---------------------------------------------------------------------------
// Module export
// ---------------------------------------------------------------------------
const blockIoPath: AnimationModule = {
  config: {
    id: 'block-io-path',
    title: 'Block I/O Path: bio to Hardware Dispatch',
    skillName: 'block-device-layer',
  },

  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario ?? 'bio-to-dispatch') {
      case 'bio-to-dispatch':
        return generateBioToDispatch();
      case 'plug-merge':
        return generatePlugMerge();
      case 'io-completion':
        return generateIoCompletion();
      default:
        return generateBioToDispatch();
    }
  },

  renderFrame,

  getScenarios(): AnimationScenario[] {
    return [
      { id: 'bio-to-dispatch', label: 'Bio Submission to Hardware Dispatch' },
      { id: 'plug-merge', label: 'Plug Merge: Batching Sequential I/Os' },
      { id: 'io-completion', label: 'I/O Completion Path' },
    ];
  },
};

export default blockIoPath;

import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

export interface BuddyBlock {
  id: string;
  order: number;
  address: number;
  state: 'free' | 'allocated' | 'splitting' | 'coalescing';
}

export interface BuddyState {
  maxOrder: number;
  blocks: BuddyBlock[];
  srcRef?: string;
  pcpLocked?: boolean;
  fpiTrylock?: boolean;
  irqSaved?: boolean;
}

function cloneBlocks(blocks: BuddyBlock[]): BuddyBlock[] {
  return blocks.map(b => ({ ...b }));
}

function cloneState(state: BuddyState): BuddyState {
  return {
    maxOrder: state.maxOrder,
    blocks: cloneBlocks(state.blocks),
    srcRef: state.srcRef,
    pcpLocked: state.pcpLocked,
    fpiTrylock: state.fpiTrylock,
    irqSaved: state.irqSaved,
  };
}

function makeId(order: number, address: number): string {
  return `o${order}-a${address}`;
}

function initialState(maxOrder: number): BuddyState {
  return {
    maxOrder,
    blocks: [{ id: makeId(maxOrder, 0), order: maxOrder, address: 0, state: 'free' }],
  };
}

function generateAllocateFrames(requestOrder: number, maxOrder: number): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  let blocks = initialState(maxOrder).blocks;

  frames.push({
    step: 0,
    label: `Initial state: one free block of order ${maxOrder}`,
    description: `The buddy allocator starts with a single contiguous memory region of order ${maxOrder} (${1 << maxOrder} pages). We need to allocate order ${requestOrder} (${1 << requestOrder} page${requestOrder > 0 ? 's' : ''}). Entry point: __alloc_pages_noprof() at mm/page_alloc.c:5279 calls get_page_from_freelist() at line 3808. Free blocks are tracked in zone->free_area[] (include/linux/mmzone.h:138), one list per order up to MAX_PAGE_ORDER (mmzone.h:30).`,
    highlights: [],
    data: { maxOrder, blocks: cloneBlocks(blocks), srcRef: 'mm/page_alloc.c:5272 __alloc_pages_noprof()' },
  });

  // Split down from maxOrder to requestOrder
  let currentOrder = maxOrder;
  while (currentOrder > requestOrder) {
    const blockToSplit = blocks.find(b => b.order === currentOrder && b.state === 'free');
    if (!blockToSplit) break;

    // Show splitting state
    blockToSplit.state = 'splitting';
    frames.push({
      step: frames.length,
      label: `Splitting order-${currentOrder} block at ${blockToSplit.address}`,
      description: `No free block of order ${requestOrder} exists. __rmqueue_smallest() at mm/page_alloc.c:1919 walks free_area[] from the requested order upward (line 1927). It finds an order-${currentOrder} block and calls page_del_and_expand() (line 1760) which invokes expand() at line 1732 to split it into two order-${currentOrder - 1} buddies. Each half is ${1 << (currentOrder - 1)} pages.`,
      highlights: [blockToSplit.id],
      data: { maxOrder, blocks: cloneBlocks(blocks), srcRef: 'mm/page_alloc.c:1932 __rmqueue_smallest()' },
    });

    // Perform split
    const newOrder = currentOrder - 1;
    const buddy1: BuddyBlock = { id: makeId(newOrder, blockToSplit.address), order: newOrder, address: blockToSplit.address, state: 'free' };
    const buddy2: BuddyBlock = { id: makeId(newOrder, blockToSplit.address + (1 << newOrder)), order: newOrder, address: blockToSplit.address + (1 << newOrder), state: 'free' };
    blocks = blocks.filter(b => b.id !== blockToSplit.id);
    blocks.push(buddy1, buddy2);
    blocks.sort((a, b) => a.address - b.address);

    frames.push({
      step: frames.length,
      label: `Created two order-${newOrder} buddies`,
      description: `The split produces two buddy blocks: one at address ${buddy1.address} and one at ${buddy2.address}. Inside expand() (mm/page_alloc.c:1732), the while loop at line 1738 decrements the order and adds the upper half to the free list via __add_to_free_list() at line 1752. The lower half is kept for further splitting or allocation.`,
      highlights: [buddy1.id, buddy2.id],
      data: { maxOrder, blocks: cloneBlocks(blocks), srcRef: 'mm/page_alloc.c:1738 expand()' },
    });

    currentOrder = newOrder;
  }

  // Allocate the target block
  const target = blocks.find(b => b.order === requestOrder && b.state === 'free');
  if (target) {
    target.state = 'allocated';
    frames.push({
      step: frames.length,
      label: `Allocated order-${requestOrder} block at ${target.address}`,
      description: `Found a free block of the requested order ${requestOrder}. __rmqueue_smallest() returns the page at line 1938 after page_del_and_expand() removes it from the free list. The call chain is: __alloc_pages_noprof() (line 5279) -> get_page_from_freelist() (line 3808) -> rmqueue() (line 3410) -> __rmqueue_smallest() (line 1919). Allocation complete -- ${1 << requestOrder} page${requestOrder > 0 ? 's' : ''} of contiguous memory.`,
      highlights: [target.id],
      data: { maxOrder, blocks: cloneBlocks(blocks), srcRef: 'mm/page_alloc.c:1932 __rmqueue_smallest() return' },
    });
  }

  return frames;
}

function generateFreeAndCoalesceFrames(maxOrder: number): AnimationFrame[] {
  // First allocate, then free and coalesce
  const allocFrames = generateAllocateFrames(0, maxOrder);
  const lastAllocData = allocFrames[allocFrames.length - 1].data as BuddyState;
  let blocks = cloneBlocks(lastAllocData.blocks);
  const frames = [...allocFrames];

  // Free the allocated block
  const allocated = blocks.find(b => b.state === 'allocated');
  if (!allocated) return frames;

  allocated.state = 'free';
  frames.push({
    step: frames.length,
    label: `Freed order-${allocated.order} block at ${allocated.address}`,
    description: `The allocated block is freed via __free_one_page() at mm/page_alloc.c:978. The function enters a while loop at line 998 that iterates up to MAX_PAGE_ORDER, checking if the buddy (adjacent block of the same order) is also free. It calls find_buddy_page_pfn() at line 1006 to locate the buddy using XOR arithmetic on the page frame number.`,
    highlights: [allocated.id],
    data: { maxOrder, blocks: cloneBlocks(blocks), srcRef: 'mm/page_alloc.c:944 __free_one_page()' },
  });

  // Coalesce up
  let order = allocated.order;
  while (order < maxOrder) {
    const buddyAddr = allocated.address ^ (1 << order);
    const buddy = blocks.find(b => b.order === order && b.address === buddyAddr && b.state === 'free');
    if (!buddy) break;

    // Show coalescing
    const self = blocks.find(b => b.order === order && b.address === Math.min(allocated.address, buddyAddr) && b.state === 'free')
      || blocks.find(b => b.order === order && b.address === allocated.address && b.state === 'free');
    if (self) self.state = 'coalescing';
    buddy.state = 'coalescing';

    frames.push({
      step: frames.length,
      label: `Coalescing order-${order} buddies at ${Math.min(allocated.address, buddyAddr)}`,
      description: `The buddy at address ${buddyAddr} is also free! In __free_one_page() (mm/page_alloc.c:978), the while loop at line 998 found the buddy via find_buddy_page_pfn() (line 1006). It removes the buddy from its free list with __del_page_from_free_list() at line 1032, then computes the combined PFN with buddy_pfn & pfn (line 1043) and increments order (line 1046). This is the beauty of the buddy system -- adjacent power-of-2 blocks combine perfectly.`,
      highlights: [self?.id || '', buddy.id],
      data: { maxOrder, blocks: cloneBlocks(blocks), srcRef: 'mm/page_alloc.c:998 buddy coalescing loop' },
    });

    // Merge
    const mergedAddr = Math.min(allocated.address, buddyAddr);
    blocks = blocks.filter(b => !(b.order === order && (b.address === allocated.address || b.address === buddyAddr)));
    const merged: BuddyBlock = { id: makeId(order + 1, mergedAddr), order: order + 1, address: mergedAddr, state: 'free' };
    blocks.push(merged);
    blocks.sort((a, b) => a.address - b.address);

    frames.push({
      step: frames.length,
      label: `Merged into order-${order + 1} block at ${mergedAddr}`,
      description: `The two buddies are now a single order-${order + 1} block (${1 << (order + 1)} pages). The loop in __free_one_page() continues at line 998, checking if the next-level buddy is also free. When merging stops (done_merging label at line 1049), the block is placed on its free list via set_buddy_order() (line 1050) and __add_to_free_list().`,
      highlights: [merged.id],
      data: { maxOrder, blocks: cloneBlocks(blocks), srcRef: 'mm/page_alloc.c:1049 done_merging' },
    });

    allocated.address = mergedAddr;
    order++;
  }

  return frames;
}

function generatePcpLockOptimizationFrames(maxOrder: number): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const baseBlocks = initialState(maxOrder).blocks;

  // Mark one block as allocated so the scene represents a live page being freed.
  const allocated: BuddyBlock = { id: makeId(0, 0), order: 0, address: 0, state: 'allocated' };
  const rest: BuddyBlock[] = [
    { id: makeId(0, 1), order: 0, address: 1, state: 'free' },
    { id: makeId(1, 2), order: 1, address: 2, state: 'free' },
    { id: makeId(2, 4), order: 2, address: 4, state: 'free' },
    { id: makeId(3, 8), order: 3, address: 8, state: 'free' },
  ];
  const _base = baseBlocks; // silence unused
  void _base;

  let state: BuddyState = {
    maxOrder,
    blocks: [allocated, ...rest],
    pcpLocked: false,
    fpiTrylock: false,
    irqSaved: false,
  };

  frames.push({
    step: 0,
    label: 'Freeing a page in a tight context (v7.0)',
    description: 'A page must be freed from a context that cannot tolerate taking the full PCP (per-CPU pageset) lock. The kernel uses the nolock fast path via free_frozen_pages_nolock() which threads the FPI_TRYLOCK flag (mm/page_alloc.c:91) through the free path. Before v7.0 the PCP lock acquisition saved and restored IRQ flags on every call; v7.0 removed that cost on the common path.',
    highlights: [allocated.id],
    data: { ...cloneState(state), srcRef: 'mm/page_alloc.c:91 FPI_TO_TAIL() FPI_TRYLOCK definition' },
  });

  state = cloneState(state);
  state.fpiTrylock = true;
  frames.push({
    step: frames.length,
    label: 'FPI_TRYLOCK flag set on the free request',
    description: 'The caller sets FPI_TRYLOCK (mm/page_alloc.c:91) in the fpi_flags bitmask. This flag signals "do not block, do not execute expensive debug helpers". It is the contract passed into the per-CPU fast path so every layer can take the cheap branch. On a failed trylock the page is queued to zone->trylock_free_pages for later drainage rather than blocking.',
    highlights: [allocated.id],
    data: { ...cloneState(state), srcRef: 'mm/page_alloc.c:1550 free_one_page() FPI_TRYLOCK branch' },
  });

  state = cloneState(state);
  frames.push({
    step: frames.length,
    label: 'Pre-v7.0 behavior: local_irq_save() + spin_lock()',
    description: 'Before v7.0, locking a PCP required disabling local IRQs (local_irq_save) in addition to taking the spinlock. That extra pushf/cli+popf per free is a measurable cost on hot paths. v7.0 audited every PCP acquisition site and proved IRQs do not need to be masked, so the save/restore was removed entirely.',
    highlights: [],
    data: { ...cloneState(state), srcRef: 'mm/page_alloc.c:119 pcp_spin_trylock() SMP variant' },
  });

  state = cloneState(state);
  state.pcpLocked = true;
  state.irqSaved = false;
  frames.push({
    step: frames.length,
    label: 'v7.0: pcp_spin_trylock() without IRQ save',
    description: 'pcp_spin_trylock() at mm/page_alloc.c:119 now calls spin_trylock() directly on the per-CPU pageset lock, preceded only by pcpu_task_pin() (preempt_disable on !RT, migrate_disable on RT). No pushf/cli, no IRQ-flag bookkeeping. On success it returns the pinned per_cpu_pages pointer; on failure it unpins and returns NULL so the caller can fall back.',
    highlights: [],
    data: { ...cloneState(state), srcRef: 'mm/page_alloc.c:119 pcp_spin_trylock() SMP variant' },
  });

  state = cloneState(state);
  frames.push({
    step: frames.length,
    label: 'UP build: trylock always fails, slow path taken',
    description: 'On CONFIG_SMP=n the UP variant of pcp_spin_trylock() at mm/page_alloc.c:144 is defined to NULL. The up-front comment explains the reasoning: UP spin_trylock() always succeeds, which would defeat the trylock contract; instead we always take the slow path because PCP scalability matters only on SMP. This keeps semantics identical across builds.',
    highlights: [],
    data: { ...cloneState(state), srcRef: 'mm/page_alloc.c:144 pcp_spin_trylock() UP variant' },
  });

  state = cloneState(state);
  frames.push({
    step: frames.length,
    label: 'Debug helpers skipped when FPI_TRYLOCK is set',
    description: 'Inside __free_pages_prepare() the guard at mm/page_alloc.c:1408 reads: "if (!PageHighMem(page) && !(fpi_flags & FPI_TRYLOCK))" before calling debug_check_no_locks_freed() and debug_check_no_obj_freed(). Those helpers walk the lockdep chain and the kmemleak object tree and cannot be invoked from a context that may be holding unrelated locks. FPI_TRYLOCK elides them cleanly.',
    highlights: [allocated.id],
    data: { ...cloneState(state), srcRef: 'mm/page_alloc.c:1408 __free_pages_prepare() debug skip' },
  });

  state = cloneState(state);
  frames.push({
    step: frames.length,
    label: 'free_one_page() fast-exit on trylock failure',
    description: 'In free_one_page() the branch at mm/page_alloc.c:1550 is "if (unlikely(fpi_flags & FPI_TRYLOCK))". If the zone->lock trylock fails, add_page_to_zone_llist() queues the page onto zone->trylock_free_pages and returns immediately instead of spinning. The heavy work is deferred to the next non-trylock freer.',
    highlights: [allocated.id],
    data: { ...cloneState(state), srcRef: 'mm/page_alloc.c:1550 free_one_page() FPI_TRYLOCK branch' },
  });

  state = cloneState(state);
  frames.push({
    step: frames.length,
    label: 'Non-trylock path drains deferred llist',
    description: 'The guard at mm/page_alloc.c:1561 reads: "if (unlikely(!llist_empty(llhead) && !(fpi_flags & FPI_TRYLOCK)))". When a regular (non-trylock) caller successfully acquires zone->lock, it pulls every page from zone->trylock_free_pages via llist_del_all() and feeds them through split_large_buddy(). Trylock callers skip the drain to preserve their fast path.',
    highlights: [allocated.id],
    data: { ...cloneState(state), srcRef: 'mm/page_alloc.c:1561 free_one_page() llist drain guard' },
  });

  state = cloneState(state);
  const freed = state.blocks.find(b => b.state === 'allocated');
  if (freed) freed.state = 'free';
  state.pcpLocked = false;
  frames.push({
    step: frames.length,
    label: 'pcp_spin_unlock() releases lock and unpins task',
    description: 'pcp_spin_unlock() at mm/page_alloc.c:131 releases the per-CPU pageset spinlock and calls pcpu_task_unpin() to re-enable preemption (or migration on RT). No IRQ-flag restore step is needed. The page is on the PCP free list; it will be bulk-freed to the buddy allocator when the PCP high watermark is hit.',
    highlights: freed ? [freed.id] : [],
    data: { ...cloneState(state), srcRef: 'mm/page_alloc.c:131 pcp_spin_unlock() SMP variant' },
  });

  state = cloneState(state);
  frames.push({
    step: frames.length,
    label: 'Benefit: fewer cycles per alloc/free under contention',
    description: 'Net effect of v7.0: (a) every PCP acquisition saves the cost of IRQ save/restore on x86 that is two serializing instructions plus a memory write; (b) FPI_TRYLOCK callers skip lockdep/kmemleak debug helpers that can dominate a small free. Under high-contention alloc/free microbenchmarks the improvement shows up as lower cycles/op in perf and reduced tail latency at p99. For specialized single-CPU pointer grabs the nopin variant pcp_spin_lock_nopin() at mm/page_alloc.c:155 avoids even the preempt pin.',
    highlights: [],
    data: { ...cloneState(state), srcRef: 'mm/page_alloc.c:155 pcp_spin_lock_nopin()' },
  });

  return frames;
}

const SCENARIOS: AnimationScenario[] = [
  { id: 'allocate-order-0', label: 'Allocate 1 Page (Order 0)' },
  { id: 'free-and-coalesce', label: 'Allocate, Free & Coalesce' },
  { id: 'fragmentation', label: 'Multiple Allocations' },
  { id: 'pcp-lock-optimization', label: 'PCP Lock IRQ Removal & FPI_TRYLOCK (v7.0)' },
];

function generateFragmentationFrames(maxOrder: number): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  let blocks = initialState(maxOrder).blocks;

  frames.push({
    step: 0,
    label: `Initial state: one free block of order ${maxOrder}`,
    description: `Starting with ${1 << maxOrder} pages of contiguous memory. Each zone maintains free_area[NR_PAGE_ORDERS] (include/linux/mmzone.h:138, zone struct at line 999) with a free list per order. We will make multiple allocations of different sizes to show how fragmentation develops.`,
    highlights: [],
    data: { maxOrder, blocks: cloneBlocks(blocks), srcRef: 'include/linux/mmzone.h:138 struct free_area' },
  });

  // Allocate order-1, then order-0
  const allocOrders = [1, 0];
  for (const reqOrder of allocOrders) {
    // Find or split to get a block of reqOrder
    let currentOrder = reqOrder;
    while (!blocks.find(b => b.order === currentOrder && b.state === 'free') && currentOrder <= maxOrder) {
      currentOrder++;
    }

    while (currentOrder > reqOrder) {
      const blockToSplit = blocks.find(b => b.order === currentOrder && b.state === 'free');
      if (!blockToSplit) break;
      blockToSplit.state = 'splitting';
      frames.push({
        step: frames.length,
        label: `Splitting order-${currentOrder} block for order-${reqOrder} request`,
        description: `Need order-${reqOrder} but smallest free is order-${currentOrder}. __rmqueue_smallest() (mm/page_alloc.c:1919) scans from the requested order upward at line 1927 and calls expand() (line 1732) to split down.`,
        highlights: [blockToSplit.id],
        data: { maxOrder, blocks: cloneBlocks(blocks), srcRef: 'mm/page_alloc.c:1932 __rmqueue_smallest() scan loop' },
      });

      const newOrder = currentOrder - 1;
      const b1: BuddyBlock = { id: makeId(newOrder, blockToSplit.address), order: newOrder, address: blockToSplit.address, state: 'free' };
      const b2: BuddyBlock = { id: makeId(newOrder, blockToSplit.address + (1 << newOrder)), order: newOrder, address: blockToSplit.address + (1 << newOrder), state: 'free' };
      blocks = blocks.filter(b => b.id !== blockToSplit.id);
      blocks.push(b1, b2);
      blocks.sort((a, b) => a.address - b.address);
      currentOrder = newOrder;
    }

    const target = blocks.find(b => b.order === reqOrder && b.state === 'free');
    if (target) {
      target.state = 'allocated';
      frames.push({
        step: frames.length,
        label: `Allocated order-${reqOrder} at address ${target.address}`,
        description: `Order-${reqOrder} block allocated (${1 << reqOrder} pages). The kernel tracks free counts in free_area.nr_free (include/linux/mmzone.h:140). Notice the remaining free blocks of various sizes -- this is external fragmentation, which the buddy system mitigates but cannot fully prevent.`,
        highlights: [target.id],
        data: { maxOrder, blocks: cloneBlocks(blocks), srcRef: 'mm/page_alloc.c:1904 page_del_and_expand()' },
      });
    }
  }

  return frames;
}

const NS = 'http://www.w3.org/2000/svg';

function renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void {
  // Clear previous content
  while (container.firstChild) container.removeChild(container.firstChild);

  const data = frame.data as BuddyState;
  const { blocks, maxOrder } = data;
  const totalPages = 1 << maxOrder;

  const margin = { top: 20, right: 10, bottom: 80, left: 10 };
  const barHeight = 40;
  const barTop = margin.top;
  const usableWidth = width - margin.left - margin.right;

  // Title
  const titleEl = document.createElementNS(NS, 'text');
  titleEl.setAttribute('x', String(width / 2));
  titleEl.setAttribute('y', '14');
  titleEl.setAttribute('text-anchor', 'middle');
  titleEl.setAttribute('class', 'anim-title');
  titleEl.textContent = 'Buddy Allocator';
  container.appendChild(titleEl);

  // Draw memory blocks as a linear bar
  for (const block of blocks) {
    const x = margin.left + (block.address / totalPages) * usableWidth;
    const w = ((1 << block.order) / totalPages) * usableWidth;

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(x));
    rect.setAttribute('y', String(barTop));
    rect.setAttribute('width', String(Math.max(w - 1, 1)));
    rect.setAttribute('height', String(barHeight));
    rect.setAttribute('rx', '3');

    let cls = `anim-block anim-block-${block.state}`;
    if (frame.highlights.includes(block.id)) cls += ' anim-highlight';
    rect.setAttribute('class', cls);
    container.appendChild(rect);

    // Block label
    if (w > 30) {
      const label = document.createElementNS(NS, 'text');
      label.setAttribute('x', String(x + w / 2));
      label.setAttribute('y', String(barTop + barHeight / 2 + 4));
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('class', 'anim-block-label');
      label.textContent = `O${block.order}`;
      container.appendChild(label);
    }
  }

  // Draw free list summary below
  const freeListTop = barTop + barHeight + 30;
  const freeByOrder = new Map<number, number>();
  for (const b of blocks) {
    if (b.state === 'free') {
      freeByOrder.set(b.order, (freeByOrder.get(b.order) || 0) + 1);
    }
  }

  const flTitle = document.createElementNS(NS, 'text');
  flTitle.setAttribute('x', String(margin.left));
  flTitle.setAttribute('y', String(freeListTop));
  flTitle.setAttribute('class', 'anim-freelist-title');
  flTitle.textContent = 'Free Lists:';
  container.appendChild(flTitle);

  let colX = margin.left;
  for (let order = 0; order <= maxOrder; order++) {
    const count = freeByOrder.get(order) || 0;
    const text = document.createElementNS(NS, 'text');
    text.setAttribute('x', String(colX));
    text.setAttribute('y', String(freeListTop + 20));
    text.setAttribute('class', `anim-freelist-entry ${count > 0 ? 'anim-freelist-active' : ''}`);
    text.textContent = `Order ${order}: ${count}`;
    container.appendChild(text);
    colX += usableWidth / (maxOrder + 1);
  }

  // Address markers along bottom of bar
  const markerY = barTop + barHeight + 12;
  for (let i = 0; i <= totalPages; i += Math.max(1, totalPages / 4)) {
    const x = margin.left + (i / totalPages) * usableWidth;
    const marker = document.createElementNS(NS, 'text');
    marker.setAttribute('x', String(x));
    marker.setAttribute('y', String(markerY));
    marker.setAttribute('class', 'anim-addr-marker');
    marker.textContent = `${i}`;
    container.appendChild(marker);
  }
}

const buddyAllocator: AnimationModule = {
  config: {
    id: 'buddy-allocator',
    title: 'Buddy Allocator Visualization',
    skillName: 'page-allocation',
  },

  generateFrames(scenario?: string): AnimationFrame[] {
    const maxOrder = 4; // 16 pages for visualization
    switch (scenario) {
      case 'free-and-coalesce':
        return generateFreeAndCoalesceFrames(maxOrder);
      case 'fragmentation':
        return generateFragmentationFrames(maxOrder);
      case 'pcp-lock-optimization':
        return generatePcpLockOptimizationFrames(maxOrder);
      case 'allocate-order-0':
      default:
        return generateAllocateFrames(0, maxOrder);
    }
  },

  renderFrame,
  getScenarios: () => SCENARIOS,
};

export default buddyAllocator;

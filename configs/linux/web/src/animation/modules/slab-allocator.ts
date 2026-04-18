import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

export interface SlabObject {
  id: string;
  index: number;
  state: 'free' | 'allocated' | 'allocating' | 'freeing';
}

export interface SlabInfo {
  id: string;
  index: number;
  objectCount: number;
  inuse: number;
  state: 'active' | 'partial' | 'full' | 'empty' | 'new' | 'reclaiming';
}

export interface SlabState {
  objects: SlabObject[];
  freelist: number[];
  slabs: SlabInfo[];
  cpuSlabIndex: number;
  partialList: number[];
  buddyPages: { id: string; state: 'free' | 'allocated' | 'allocating' }[];
  srcRef: string;
}

function cloneState(s: SlabState): SlabState {
  return {
    objects: s.objects.map(o => ({ ...o })),
    freelist: [...s.freelist],
    slabs: s.slabs.map(sl => ({ ...sl })),
    cpuSlabIndex: s.cpuSlabIndex,
    partialList: [...s.partialList],
    buddyPages: s.buddyPages.map(p => ({ ...p })),
    srcRef: s.srcRef,
  };
}

const OBJECTS_PER_SLAB = 8;

function makeObjects(slabIndex: number, startState: 'free' | 'allocated' = 'free'): SlabObject[] {
  const objs: SlabObject[] = [];
  for (let i = 0; i < OBJECTS_PER_SLAB; i++) {
    const globalIdx = slabIndex * OBJECTS_PER_SLAB + i;
    objs.push({
      id: `obj-${globalIdx}`,
      index: globalIdx,
      state: startState,
    });
  }
  return objs;
}

function makeFreelist(slabIndex: number): number[] {
  const list: number[] = [];
  for (let i = 0; i < OBJECTS_PER_SLAB; i++) {
    list.push(slabIndex * OBJECTS_PER_SLAB + i);
  }
  return list;
}

function makeSlab(index: number, state: SlabInfo['state'] = 'active'): SlabInfo {
  return {
    id: `slab-${index}`,
    index,
    objectCount: OBJECTS_PER_SLAB,
    inuse: 0,
    state,
  };
}

function makeBuddyPages(count: number): SlabState['buddyPages'] {
  const pages: SlabState['buddyPages'] = [];
  for (let i = 0; i < count; i++) {
    pages.push({ id: `page-${i}`, state: 'free' });
  }
  return pages;
}

// ---------------------------------------------------------------------------
// Scenario: fast-path-alloc
// Traces the percpu sheaves (PCS) fast path in mm/slub.c
// ---------------------------------------------------------------------------

function generateFastPathAllocFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];

  // Initial state: one active slab with all objects free, freelist populated
  const state: SlabState = {
    objects: makeObjects(0),
    freelist: makeFreelist(0),
    slabs: [makeSlab(0, 'active')],
    cpuSlabIndex: 0,
    partialList: [],
    buddyPages: makeBuddyPages(4),
    srcRef: 'mm/slub.c:4672 -- alloc_from_pcs()',
  };
  state.buddyPages[0].state = 'allocated'; // slab 0 uses page 0

  frames.push({
    step: 0,
    label: 'Initial kmem_cache state',
    description:
      'A kmem_cache has been created for fixed-size kernel objects. The per-CPU sheaf (PCS) ' +
      'holds a main array of cached object pointers (slub.c:4672, struct slab_sheaf). ' +
      `pcs->main->objects[] contains ${OBJECTS_PER_SLAB} pointers to free objects in the ` +
      'active slab page. local_trylock(&s->cpu_sheaves->lock) guards per-CPU access.',
    highlights: [],
    data: cloneState(state),
  });

  // Allocate first object from freelist (fast path)
  const obj0 = state.freelist.shift()!;
  state.objects[obj0].state = 'allocating';
  state.slabs[0].inuse = 1;
  state.srcRef = 'mm/slub.c:4837 -- slab_alloc_node()';
  frames.push({
    step: frames.length,
    label: 'slab_alloc_node: enter allocation',
    description:
      'kmem_cache_alloc() calls slab_alloc_node() (slub.c:4837). First, slab_pre_alloc_hook() ' +
      'runs memcg charging and kmemleak tracking. Then alloc_from_pcs(s, gfpflags, node) is ' +
      'called at line 4851. This is the hot path -- percpu sheaves avoid all locking contention.',
    highlights: [state.objects[obj0].id],
    data: cloneState(state),
  });

  state.objects[obj0].state = 'allocated';
  state.srcRef = 'mm/slub.c:4710-4720 -- pop from pcs->main';
  frames.push({
    step: frames.length,
    label: 'alloc_from_pcs: pop object from sheaf',
    description:
      'Inside alloc_from_pcs() (slub.c:4672): local_trylock(&s->cpu_sheaves->lock), then ' +
      'pcs = this_cpu_ptr(s->cpu_sheaves). Check pcs->main->size > 0. Pop: ' +
      'object = pcs->main->objects[--pcs->main->size] (slub.c:4710-4720). ' +
      'local_unlock(). Stat: ALLOC_FASTPATH. inuse: 1/' + OBJECTS_PER_SLAB + '.',
    highlights: [state.objects[obj0].id],
    data: cloneState(state),
  });

  // Allocate objects 1-3
  for (let i = 1; i <= 3; i++) {
    const idx = state.freelist.shift()!;
    state.objects[idx].state = 'allocating';
    state.slabs[0].inuse = i + 1;
    state.srcRef = `mm/slub.c:4710 -- pcs->main->objects[--size] (iteration ${i + 1})`;
    frames.push({
      step: frames.length,
      label: `alloc_from_pcs: pop object ${idx}`,
      description:
        `alloc_from_pcs() repeats (slub.c:4710): pcs->main->size is ${OBJECTS_PER_SLAB - i}, ` +
        `pop object ${idx}. The sheaf array acts as a stack -- last-in-first-out gives good ` +
        `cache locality. No locks beyond local_trylock because each CPU owns its sheaf. ` +
        `inuse: ${i + 1}/${OBJECTS_PER_SLAB}.`,
      highlights: [state.objects[idx].id],
      data: cloneState(state),
    });

    state.objects[idx].state = 'allocated';
  }

  // Allocate remaining objects to exhaust freelist
  while (state.freelist.length > 1) {
    const idx = state.freelist.shift()!;
    state.objects[idx].state = 'allocated';
    state.slabs[0].inuse++;
  }

  const lastIdx = state.freelist.shift()!;
  state.objects[lastIdx].state = 'allocating';
  state.slabs[0].inuse = OBJECTS_PER_SLAB;
  state.slabs[0].state = 'full';
  state.srcRef = 'mm/slub.c:4700-4705 -- pcs->main->size == 0';
  frames.push({
    step: frames.length,
    label: 'Sheaf empty after last pop',
    description:
      `Popping final object (index ${lastIdx}). After this, pcs->main->size reaches 0 ` +
      '(slub.c:4700). The next call to alloc_from_pcs() will find an empty sheaf and call ' +
      '__pcs_replace_empty_main() (slub.c:4705) to try swapping in a full spare sheaf. ' +
      'If no spare is available, alloc_from_pcs() returns NULL.',
    highlights: [state.objects[lastIdx].id],
    data: cloneState(state),
  });

  state.objects[lastIdx].state = 'allocated';
  state.srcRef = 'mm/slub.c:4851 -- alloc_from_pcs returns NULL';
  frames.push({
    step: frames.length,
    label: 'Slab full -- sheaf exhausted',
    description:
      'All objects allocated. pcs->main->size == 0 and no spare sheaf available. ' +
      'alloc_from_pcs() returns NULL at slub.c:4851. The slab transitions to "full". ' +
      'Full slabs are not tracked on any list by default in SLUB.',
    highlights: [],
    data: cloneState(state),
  });

  // Show slow path trigger
  state.srcRef = 'mm/slub.c:4453 -- __slab_alloc_node()';
  frames.push({
    step: frames.length,
    label: 'Fallback to __slab_alloc_node (slow path)',
    description:
      'A new allocation arrives. alloc_from_pcs() returns NULL, so slab_alloc_node() falls ' +
      'through to __slab_alloc_node() (slub.c:4453). The slow path will: (1) call ' +
      'get_from_partial(s, node, &pc) at line 4409 to search the node partial list, ' +
      '(2) if no partials, call new_slab(s, pc.flags, node) at line 4413 to allocate ' +
      'a fresh page from the buddy allocator.',
    highlights: [],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario: slow-path-new-slab
// Traces ___slab_alloc -> new_slab -> allocate_slab in mm/slub.c
// ---------------------------------------------------------------------------

function generateSlowPathFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];

  // Start with a full slab and empty partial list
  const state: SlabState = {
    objects: makeObjects(0, 'allocated'),
    freelist: [],
    slabs: [makeSlab(0, 'full')],
    cpuSlabIndex: 0,
    partialList: [],
    buddyPages: makeBuddyPages(4),
    srcRef: 'mm/slub.c:4453 -- entering __slab_alloc_node()',
  };
  state.slabs[0].inuse = OBJECTS_PER_SLAB;
  state.buddyPages[0].state = 'allocated';

  frames.push({
    step: 0,
    label: 'Sheaf empty, entering slow path',
    description:
      'The per-CPU sheaf is empty -- alloc_from_pcs() returned NULL (slub.c:4851). ' +
      'slab_alloc_node() falls through to __slab_alloc_node() (slub.c:4453). ' +
      'The current slab is full: all objects in use, pcs->main->size == 0.',
    highlights: [],
    data: cloneState(state),
  });

  state.srcRef = 'mm/slub.c:4409 -- get_from_partial()';
  frames.push({
    step: frames.length,
    label: '___slab_alloc: try node partial list',
    description:
      'Inside ___slab_alloc() (slub.c:4374-4451). First attempt: get_from_partial(s, node, &pc) ' +
      'at line 4409. This searches kmem_cache_node->partial for a slab with free objects. ' +
      'The partial list is protected by n->list_lock spinlock.',
    highlights: [],
    data: cloneState(state),
  });

  state.srcRef = 'mm/slub.c:4413 -- new_slab()';
  frames.push({
    step: frames.length,
    label: 'No partials available -- must allocate new slab',
    description:
      'get_from_partial() returns NULL -- no partial slabs on this NUMA node. ' +
      'Fallback at line 4413: new_slab(s, pc.flags, node). In a busy system, partial slabs ' +
      'are common and get_from_partial() often succeeds, avoiding the expensive page allocation.',
    highlights: [],
    data: cloneState(state),
  });

  // Request page from buddy allocator
  state.buddyPages[1].state = 'allocating';
  state.srcRef = 'mm/slub.c:3532 -- new_slab() -> allocate_slab() -> alloc_pages()';
  frames.push({
    step: frames.length,
    label: 'new_slab: requesting page from buddy allocator',
    description:
      'new_slab() (slub.c:3532) calls allocate_slab(s, flags, node), which calls ' +
      'alloc_pages(alloc_gfp, oo_order(s->oo)) to get a compound page from the buddy allocator. ' +
      'The order depends on cache->oo -- typically order-0 (4KB) or order-1 (8KB) for small objects.',
    highlights: ['page-1'],
    data: cloneState(state),
  });

  state.buddyPages[1].state = 'allocated';
  state.srcRef = 'mm/slub.c:3540 -- slab metadata initialization';
  frames.push({
    step: frames.length,
    label: 'Page allocated, initializing slab metadata',
    description:
      'The buddy allocator returns a free page. new_slab() initializes struct slab metadata ' +
      '(embedded in struct folio): sets slab->objects, slab->inuse = 0 (slub.c:3540). ' +
      'The freelist is threaded through all object slots -- each free slot contains a pointer ' +
      '(at s->offset bytes in) to the next free object.',
    highlights: ['page-1'],
    data: cloneState(state),
  });

  // Create new slab with objects
  const newSlab = makeSlab(1, 'new');
  state.slabs.push(newSlab);
  const newObjs = makeObjects(1);
  state.objects.push(...newObjs);
  const newFreelist = makeFreelist(1);
  state.srcRef = 'mm/slub.c:4316 -- alloc_from_new_slab()';

  frames.push({
    step: frames.length,
    label: 'alloc_from_new_slab: carve objects from fresh page',
    description:
      `alloc_from_new_slab() (slub.c:4316) carves the page into ${OBJECTS_PER_SLAB} object ` +
      'slots of cache->object_size. The freelist is set up with set_freepointer() linking ' +
      'each slot to the next. When CONFIG_SLAB_FREELIST_RANDOM is enabled, the freelist order ' +
      'is shuffled for security hardening against heap-spray attacks.',
    highlights: newObjs.map(o => o.id),
    data: { ...cloneState(state), freelist: [...newFreelist] },
  });

  // Set new slab as cpu_slab
  newSlab.state = 'active';
  state.cpuSlabIndex = 1;
  state.freelist = newFreelist;
  state.srcRef = 'mm/slub.c:4330 -- populate PCS sheaf from new slab';
  frames.push({
    step: frames.length,
    label: 'Populate per-CPU sheaf from new slab',
    description:
      'The new slab\'s free objects are loaded into pcs->main->objects[] (slub.c:4330). ' +
      'The old full slab is detached from the per-CPU slot -- full slabs are not tracked ' +
      'on any list by default. The sheaf now has a full stack of object pointers.',
    highlights: [newSlab.id],
    data: cloneState(state),
  });

  // Allocate first object from new slab
  const firstObj = state.freelist.shift()!;
  state.objects[firstObj].state = 'allocating';
  newSlab.inuse = 1;
  state.srcRef = 'mm/slub.c:4710 -- back to alloc_from_pcs() fast path';
  frames.push({
    step: frames.length,
    label: 'First allocation from new slab via PCS',
    description:
      'Back on the fast path. alloc_from_pcs() (slub.c:4710) pops the first object from ' +
      'pcs->main->objects[--size]. The slow path cost is amortized across all objects in the ' +
      'slab -- subsequent allocations use the lockless sheaf pop until exhausted again.',
    highlights: [state.objects[firstObj].id],
    data: cloneState(state),
  });

  state.objects[firstObj].state = 'allocated';
  state.srcRef = 'mm/slub.c:4720 -- ALLOC_FASTPATH stat';
  frames.push({
    step: frames.length,
    label: 'Object allocated -- fast path restored',
    description:
      'Allocation complete. Stat ALLOC_FASTPATH incremented (slub.c:4720). The new slab has ' +
      `1 object in use and ${OBJECTS_PER_SLAB - 1} remaining in the sheaf. Future allocations ` +
      'use the per-CPU fast path (local_trylock + array pop, no spinlocks) until exhausted.',
    highlights: [state.objects[firstObj].id],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario: free-and-reclaim
// Traces __slab_free -> CAS loop -> slab reclamation in mm/slub.c
// ---------------------------------------------------------------------------

function generateFreeAndReclaimFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];

  // Two slabs: slab 0 is the active cpu_slab (partially used), slab 1 is full
  const state: SlabState = {
    objects: [...makeObjects(0, 'allocated'), ...makeObjects(1, 'allocated')],
    freelist: [],
    slabs: [makeSlab(0, 'full'), makeSlab(1, 'full')],
    cpuSlabIndex: 0,
    partialList: [],
    buddyPages: makeBuddyPages(4),
    srcRef: 'mm/slub.c:5470 -- __slab_free()',
  };
  state.slabs[0].inuse = OBJECTS_PER_SLAB;
  state.slabs[1].inuse = OBJECTS_PER_SLAB;
  state.buddyPages[0].state = 'allocated';
  state.buddyPages[1].state = 'allocated';

  // Make slab 0 partially used: free first 4 objects
  for (let i = 0; i < 4; i++) {
    state.objects[i].state = 'free';
    state.slabs[0].inuse--;
  }
  state.slabs[0].state = 'active';
  state.freelist = [0, 1, 2, 3];
  state.cpuSlabIndex = 0;

  frames.push({
    step: 0,
    label: 'Two slabs: active (partial) and full',
    description:
      'The kmem_cache has two slabs. Slab 0 is the active per-CPU slab with 4 free and 4 allocated ' +
      'objects. Slab 1 is full (all 8 in use). We will trace __slab_free() (slub.c:5470-5560) ' +
      'and observe the CAS-based freelist updates and slab state transitions.',
    highlights: [],
    data: cloneState(state),
  });

  // Free object to current cpu_slab (fast free path)
  const freeIdx = 4; // first allocated object in slab 0
  state.objects[freeIdx].state = 'freeing';
  state.srcRef = 'mm/slub.c:5492-5501 -- CAS loop in __slab_free()';
  frames.push({
    step: frames.length,
    label: '__slab_free: CAS loop on slab->freelist',
    description:
      'kmem_cache_free() calls __slab_free() (slub.c:5470). The CAS loop at lines 5492-5501: ' +
      'old.freelist = slab->freelist; set_freepointer(s, tail, old.freelist); ' +
      'new.freelist = head; new.inuse -= cnt. This prepends the freed object to the ' +
      'slab\'s freelist atomically via cmpxchg.',
    highlights: [state.objects[freeIdx].id],
    data: cloneState(state),
  });

  state.objects[freeIdx].state = 'free';
  state.freelist.unshift(freeIdx);
  state.slabs[0].inuse--;
  state.srcRef = 'mm/slub.c:5524 -- slab_update_freelist() cmpxchg';
  frames.push({
    step: frames.length,
    label: 'Object freed via slab_update_freelist cmpxchg',
    description:
      `Object ${freeIdx} freed. slab_update_freelist() (slub.c:5524) completes the cmpxchg: ` +
      `the object's freepointer now points to the old freelist head. Slab inuse drops to ` +
      `${state.slabs[0].inuse}. This was a lockless CAS operation -- no spinlock needed ` +
      'for the common case where the slab state does not change.',
    highlights: [state.objects[freeIdx].id],
    data: cloneState(state),
  });

  // Free object from remote slab (slab 1) -- full -> partial transition
  const remoteFreeIdx = OBJECTS_PER_SLAB; // first object in slab 1
  state.objects[remoteFreeIdx].state = 'freeing';
  state.srcRef = 'mm/slub.c:5519 -- n->list_lock for state transition';
  frames.push({
    step: frames.length,
    label: 'Free from remote slab -- full slab needs list_lock',
    description:
      'Freeing object from slab 1 (not the per-CPU slab). __slab_free() detects the slab ' +
      'was full (old.inuse == slab->objects) at slub.c:5519. A full-to-partial transition ' +
      'requires taking n->list_lock to add the slab to the node partial list. ' +
      'This is the slow free path.',
    highlights: [state.objects[remoteFreeIdx].id],
    data: cloneState(state),
  });

  state.objects[remoteFreeIdx].state = 'free';
  state.slabs[1].inuse--;
  state.slabs[1].state = 'partial';
  state.partialList.push(1);
  state.srcRef = 'mm/slub.c:5530 -- add_partial(n, slab)';
  frames.push({
    step: frames.length,
    label: 'Slab 1: full -> partial, added to node list',
    description:
      'Slab 1 transitions full -> partial. add_partial(n, slab) at slub.c:5530 inserts it ' +
      'onto kmem_cache_node->partial under n->list_lock (spinlock). The partial list is ' +
      'ordered to prefer slabs with more free objects, improving cache utilization.',
    highlights: [state.slabs[1].id],
    data: cloneState(state),
  });

  // Free remaining objects from slab 1 to make it empty
  for (let i = OBJECTS_PER_SLAB + 1; i < OBJECTS_PER_SLAB * 2 - 1; i++) {
    state.objects[i].state = 'free';
    state.slabs[1].inuse--;
  }

  const lastRemoteIdx = OBJECTS_PER_SLAB * 2 - 1;
  state.objects[lastRemoteIdx].state = 'freeing';
  state.srcRef = 'mm/slub.c:5547 -- goto slab_empty';
  frames.push({
    step: frames.length,
    label: 'Freeing last object -- slab_empty path',
    description:
      `Freeing last object (index ${lastRemoteIdx}) in slab 1. When new.inuse reaches 0, ` +
      '__slab_free() at slub.c:5547 branches to slab_empty. The kernel checks if the ' +
      'node partial list already has enough slabs (controlled by kmem_cache->min_partial). ' +
      'If so, the empty slab is discarded rather than kept.',
    highlights: [state.objects[lastRemoteIdx].id],
    data: cloneState(state),
  });

  state.objects[lastRemoteIdx].state = 'free';
  state.slabs[1].inuse = 0;
  state.slabs[1].state = 'empty';
  state.srcRef = 'mm/slub.c:5548 -- discard_slab(s, slab)';
  frames.push({
    step: frames.length,
    label: 'Slab 1 empty -- discard_slab triggered',
    description:
      'Slab 1 is completely empty (inuse == 0). At slub.c:5547-5548: goto slab_empty ' +
      'leads to discard_slab(s, slab). This removes the slab from the partial list ' +
      'and prepares to return the underlying page to the buddy allocator via __free_pages().',
    highlights: [state.slabs[1].id],
    data: cloneState(state),
  });

  // Return slab to buddy allocator
  state.slabs[1].state = 'reclaiming';
  state.partialList = state.partialList.filter(i => i !== 1);
  state.srcRef = 'mm/slub.c:5548 -- __free_pages() returning to buddy';
  frames.push({
    step: frames.length,
    label: 'discard_slab: __free_pages back to buddy',
    description:
      'discard_slab() removes slab 1 from n->partial and calls __free_pages() to return ' +
      'the page to the buddy allocator (slub.c:5548). The struct folio metadata is cleared. ' +
      'This completes the slab lifecycle: alloc_pages -> slab carve -> use -> free -> buddy return.',
    highlights: [state.slabs[1].id, 'page-1'],
    data: cloneState(state),
  });

  state.buddyPages[1].state = 'free';
  // Remove slab 1 objects and slab entry
  state.objects = state.objects.filter(o => o.index < OBJECTS_PER_SLAB);
  state.slabs = state.slabs.filter(s => s.index !== 1);
  state.srcRef = 'mm/slub.c -- page returned to buddy free list';
  frames.push({
    step: frames.length,
    label: 'Page reclaimed -- back in buddy allocator',
    description:
      'The page is back in the buddy allocator\'s free list. Only slab 0 remains (the active ' +
      'per-CPU slab). The min_partial tunable (kmem_cache->min_partial) controls how aggressively ' +
      'SLUB reclaims empty slabs vs. keeping them cached. Lower values save memory; higher ' +
      'values reduce future alloc_pages() calls.',
    highlights: [],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// SVG Rendering
// ---------------------------------------------------------------------------

const NS = 'http://www.w3.org/2000/svg';

function createText(
  x: number, y: number, text: string, cls: string, anchor = 'start'
): SVGTextElement {
  const el = document.createElementNS(NS, 'text');
  el.setAttribute('x', String(x));
  el.setAttribute('y', String(y));
  el.setAttribute('text-anchor', anchor);
  el.setAttribute('class', cls);
  el.textContent = text;
  return el;
}

function createRect(
  x: number, y: number, w: number, h: number, cls: string, rx = 3
): SVGRectElement {
  const el = document.createElementNS(NS, 'rect');
  el.setAttribute('x', String(x));
  el.setAttribute('y', String(y));
  el.setAttribute('width', String(Math.max(w, 1)));
  el.setAttribute('height', String(h));
  el.setAttribute('rx', String(rx));
  el.setAttribute('class', cls);
  return el;
}

function stateToBlockClass(state: string): string {
  switch (state) {
    case 'free': return 'anim-block anim-block-free';
    case 'allocated': return 'anim-block anim-block-allocated';
    case 'allocating': return 'anim-block anim-block-splitting'; // reuse splitting style (blue)
    case 'freeing': return 'anim-block anim-block-coalescing';  // reuse coalescing style
    default: return 'anim-block';
  }
}

function renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void {
  while (container.firstChild) container.removeChild(container.firstChild);

  const data = frame.data as SlabState;
  const margin = { top: 30, right: 20, bottom: 20, left: 20 };

  // Title
  container.appendChild(
    createText(width / 2, 18, 'SLUB Slab Allocator', 'anim-title', 'middle')
  );

  // Layout zones
  const cpuBoxX = margin.left;
  const cpuBoxW = 120;
  const slabAreaX = cpuBoxX + cpuBoxW + 20;
  const partialAreaX = width - margin.right - 140;
  const slabAreaW = partialAreaX - slabAreaX - 20;
  const slabTop = margin.top + 20;
  const objSize = Math.min(Math.max(slabAreaW / OBJECTS_PER_SLAB - 2, 20), 50);
  const objHeight = 36;

  // --- Per-CPU section (left) ---
  container.appendChild(
    createText(cpuBoxX + cpuBoxW / 2, slabTop, 'Per-CPU', 'anim-freelist-title', 'middle')
  );
  container.appendChild(
    createText(cpuBoxX + cpuBoxW / 2, slabTop + 16, 'cpu_sheaves', 'anim-freelist-entry', 'middle')
  );

  // cpu_slab box
  const cpuBoxY = slabTop + 24;
  container.appendChild(
    createRect(cpuBoxX, cpuBoxY, cpuBoxW, 50, 'anim-block anim-block-free', 5)
  );
  container.appendChild(
    createText(cpuBoxX + cpuBoxW / 2, cpuBoxY + 20, `slab: ${data.cpuSlabIndex}`, 'anim-block-label', 'middle')
  );
  container.appendChild(
    createText(cpuBoxX + cpuBoxW / 2, cpuBoxY + 38, `sheaf: ${data.freelist.length} obj`, 'anim-block-label', 'middle')
  );

  // Arrow from cpu_slab to slab area
  const arrowY = cpuBoxY + 25;
  const line = document.createElementNS(NS, 'line');
  line.setAttribute('x1', String(cpuBoxX + cpuBoxW));
  line.setAttribute('y1', String(arrowY));
  line.setAttribute('x2', String(slabAreaX - 4));
  line.setAttribute('y2', String(arrowY));
  line.setAttribute('class', 'anim-freelist-entry');
  line.setAttribute('stroke', '#888');
  line.setAttribute('stroke-width', '2');
  line.setAttribute('marker-end', 'url(#arrowhead)');
  container.appendChild(line);

  // --- Slab objects (center) ---
  // Group slabs by slab index
  const slabGroups = new Map<number, SlabObject[]>();
  for (const obj of data.objects) {
    const slabIdx = Math.floor(obj.index / OBJECTS_PER_SLAB);
    if (!slabGroups.has(slabIdx)) slabGroups.set(slabIdx, []);
    slabGroups.get(slabIdx)!.push(obj);
  }

  let slabRowY = slabTop;
  const slabIndices = Array.from(slabGroups.keys()).sort((a, b) => a - b);

  for (const slabIdx of slabIndices) {
    const objs = slabGroups.get(slabIdx)!;
    const slabInfo = data.slabs.find(s => s.index === slabIdx);
    const isActive = slabIdx === data.cpuSlabIndex;

    // Slab label
    const slabLabel = `Slab ${slabIdx}${isActive ? ' (active)' : ''} [${slabInfo?.state || '?'}]`;
    container.appendChild(
      createText(slabAreaX, slabRowY, slabLabel, 'anim-freelist-title')
    );
    slabRowY += 16;

    // Object slots
    for (let i = 0; i < objs.length; i++) {
      const obj = objs[i];
      const ox = slabAreaX + i * (objSize + 2);
      let cls = stateToBlockClass(obj.state);
      if (frame.highlights.includes(obj.id)) cls += ' anim-highlight';

      container.appendChild(createRect(ox, slabRowY, objSize, objHeight, cls));

      // Object label inside slot
      if (objSize >= 28) {
        container.appendChild(
          createText(ox + objSize / 2, slabRowY + objHeight / 2 + 4, String(obj.index), 'anim-block-label', 'middle')
        );
      }
    }
    slabRowY += objHeight + 10;

    // Freelist visualization for active slab
    if (isActive && data.freelist.length > 0) {
      const flText = 'sheaf: ' + data.freelist.slice(0, 6).join(' -> ') +
        (data.freelist.length > 6 ? ' -> ...' : '');
      container.appendChild(
        createText(slabAreaX, slabRowY, flText, 'anim-freelist-entry')
      );
      slabRowY += 16;
    }

    slabRowY += 8;
  }

  // --- Node partial list (right) ---
  container.appendChild(
    createText(partialAreaX + 70, slabTop, 'Node Partial List', 'anim-freelist-title', 'middle')
  );

  if (data.partialList.length === 0) {
    container.appendChild(
      createText(partialAreaX + 70, slabTop + 20, '(empty)', 'anim-freelist-entry', 'middle')
    );
  } else {
    let py = slabTop + 20;
    for (const pIdx of data.partialList) {
      const pSlab = data.slabs.find(s => s.index === pIdx);
      let cls = 'anim-block anim-block-free';
      if (pSlab && frame.highlights.includes(pSlab.id)) cls += ' anim-highlight';
      container.appendChild(createRect(partialAreaX, py, 140, 30, cls, 4));
      container.appendChild(
        createText(partialAreaX + 70, py + 19,
          `Slab ${pIdx} (${pSlab?.inuse || 0}/${OBJECTS_PER_SLAB})`,
          'anim-block-label', 'middle')
      );
      py += 36;
    }
  }

  // --- Buddy allocator (bottom) ---
  const buddyTop = Math.max(slabRowY + 10, height - margin.bottom - 50);
  container.appendChild(
    createText(margin.left, buddyTop, 'Buddy Allocator Pages:', 'anim-freelist-title')
  );

  const pageW = Math.min(60, (width - margin.left - margin.right) / data.buddyPages.length - 4);
  for (let i = 0; i < data.buddyPages.length; i++) {
    const page = data.buddyPages[i];
    const px = margin.left + i * (pageW + 4);
    const py = buddyTop + 8;
    let cls = page.state === 'free' ? 'anim-block anim-block-free'
      : page.state === 'allocating' ? 'anim-block anim-block-splitting'
        : 'anim-block anim-block-allocated';
    if (frame.highlights.includes(page.id)) cls += ' anim-highlight';
    container.appendChild(createRect(px, py, pageW, 24, cls));
    container.appendChild(
      createText(px + pageW / 2, py + 16, `P${i}`, 'anim-block-label', 'middle')
    );
  }
}

// ---------------------------------------------------------------------------
// Module export
// ---------------------------------------------------------------------------

const SCENARIOS: AnimationScenario[] = [
  { id: 'fast-path-alloc', label: 'Fast Path Allocation (per-CPU freelist)' },
  { id: 'slow-path-new-slab', label: 'Slow Path: New Slab from Buddy' },
  { id: 'free-and-reclaim', label: 'Free Objects & Slab Reclamation' },
];

const slabAllocator: AnimationModule = {
  config: {
    id: 'slab-allocator',
    title: 'SLUB Slab Allocator',
    skillName: 'slab-allocator',
  },

  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario) {
      case 'slow-path-new-slab':
        return generateSlowPathFrames();
      case 'free-and-reclaim':
        return generateFreeAndReclaimFrames();
      case 'fast-path-alloc':
      default:
        return generateFastPathAllocFrames();
    }
  },

  renderFrame,
  getScenarios: () => SCENARIOS,
};

export default slabAllocator;

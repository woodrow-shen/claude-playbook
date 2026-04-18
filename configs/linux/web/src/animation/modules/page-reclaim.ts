import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

export interface PageInfo {
  id: string;
  type: 'anon' | 'file' | 'unevictable';
  state: 'active' | 'inactive' | 'reclaiming' | 'freed' | 'dirty' | 'writeback';
  accessed: boolean;
  dirty: boolean;
  mapped: boolean;
  owner: string;
}

export interface LruList {
  name: string;
  pages: PageInfo[];
}

export interface WatermarkState {
  freePages: number;
  minWatermark: number;
  lowWatermark: number;
  highWatermark: number;
  totalPages: number;
}

export interface ReclaimState {
  lruLists: LruList[];
  watermarks: WatermarkState;
  kswapdState: 'sleeping' | 'running' | 'done';
  directReclaim: boolean;
  oomTriggered: boolean;
  oomVictim: string | null;
  phase: string;
  scanCount: number;
  reclaimedCount: number;
  srcRef: string;
  // v7.0 batched large folio unmap (optional, backward compatible)
  folioSize?: number;
  ptesToFlush?: number;
  tlbFlushes?: number;
  batchMode?: boolean;
  // Extended v7.0 fields (see commit a67fe41e214f "mm: rmap: support batched
  // unmapping for file large folios").  Added as new optional fields so older
  // scenarios keep working while the batched-large-folio-unmap demo can carry
  // per-frame timing/mmu_gather detail.
  folioSizeLabel?: string;               // e.g. "64 KiB / 16 x 4 KiB"
  batchModeLabel?: 'per-page' | 'batched';
  mmuGather?: { pages: number; flushScheduled: boolean };
  cpuCycles?: { perPage: number; batched: number };
  ptesCleared?: number;                  // running count of PTEs cleared
  rmapWalks?: number;                    // number of rmap walks performed
}

// --- Helpers ---

function cloneLruLists(lists: LruList[]): LruList[] {
  return lists.map(l => ({
    name: l.name,
    pages: l.pages.map(p => ({ ...p })),
  }));
}

function cloneState(s: ReclaimState): ReclaimState {
  return {
    ...s,
    lruLists: cloneLruLists(s.lruLists),
    watermarks: { ...s.watermarks },
    mmuGather: s.mmuGather ? { ...s.mmuGather } : undefined,
    cpuCycles: s.cpuCycles ? { ...s.cpuCycles } : undefined,
  };
}

function makePage(id: string, type: PageInfo['type'], owner: string, opts?: Partial<PageInfo>): PageInfo {
  return {
    id,
    type,
    state: 'inactive',
    accessed: false,
    dirty: false,
    mapped: type === 'anon',
    owner,
    ...opts,
  };
}

function makeFrame(step: number, label: string, description: string, highlights: string[], state: ReclaimState): AnimationFrame {
  return { step, label, description, highlights, data: cloneState(state) };
}

function defaultWatermarks(): WatermarkState {
  return {
    freePages: 100,
    minWatermark: 10,
    lowWatermark: 30,
    highWatermark: 60,
    totalPages: 256,
  };
}

function emptyLruLists(): LruList[] {
  return [
    { name: 'active_file', pages: [] },
    { name: 'inactive_file', pages: [] },
    { name: 'active_anon', pages: [] },
    { name: 'inactive_anon', pages: [] },
    { name: 'unevictable', pages: [] },
  ];
}

function findList(lists: LruList[], name: string): LruList {
  return lists.find(l => l.name === name)!;
}

// --- Scenario: watermark-reclaim ---

function generateWatermarkReclaimFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const wm = defaultWatermarks();
  const lists = emptyLruLists();

  // Populate inactive_file with pages to reclaim
  const filePages: PageInfo[] = [];
  for (let i = 0; i < 12; i++) {
    const p = makePage(`fp-${i}`, 'file', i < 6 ? 'gcc' : 'vim', {
      state: 'inactive',
      dirty: i % 4 === 0,
    });
    filePages.push(p);
  }
  findList(lists, 'inactive_file').pages = filePages.slice();

  // Add some active file pages
  const activeFilePages: PageInfo[] = [];
  for (let i = 0; i < 4; i++) {
    activeFilePages.push(makePage(`afp-${i}`, 'file', 'make', { state: 'active', accessed: true }));
  }
  findList(lists, 'active_file').pages = activeFilePages;

  // Add anon pages
  const anonPages: PageInfo[] = [];
  for (let i = 0; i < 4; i++) {
    anonPages.push(makePage(`ap-${i}`, 'anon', 'bash', { state: 'inactive', mapped: true }));
  }
  findList(lists, 'inactive_anon').pages = anonPages;

  const state: ReclaimState = {
    lruLists: lists,
    watermarks: wm,
    kswapdState: 'sleeping',
    directReclaim: false,
    oomTriggered: false,
    oomVictim: null,
    phase: 'normal',
    scanCount: 0,
    reclaimedCount: 0,
    srcRef: 'include/linux/mmzone.h:709-711',
  };

  // Frame 0: initial state with plenty of free pages
  state.srcRef = 'include/linux/mmzone.h:709-711';
  frames.push(makeFrame(0,
    'System running normally',
    'The system has 100 free pages. Watermark levels defined at include/linux/mmzone.h:709-711 (WMARK_MIN, WMARK_LOW, WMARK_HIGH): min=10, low=30, high=60. __zone_watermark_ok() at mm/page_alloc.c:3602 confirms all watermarks are satisfied, so kswapd (mm/vmscan.c:7280) is sleeping. Pages are distributed across the LRU lists.',
    [],
    state,
  ));

  // Frame 1: memory pressure begins
  state.watermarks.freePages = 55;
  state.phase = 'allocating';
  state.srcRef = 'mm/page_alloc.c:3602';
  frames.push(makeFrame(1,
    'Memory pressure: allocations consuming free pages',
    'Processes allocate memory for buffers, page cache, and anonymous mappings. Free pages drop to 55 -- __zone_watermark_ok() at mm/page_alloc.c:3602 still returns true for WMARK_LOW (30), so no reclaim yet.',
    [],
    state,
  ));

  // Frame 2: drop below high watermark
  state.watermarks.freePages = 40;
  state.srcRef = 'mm/page_alloc.c:3602';
  frames.push(makeFrame(2,
    'Free pages drop below high watermark',
    'Free pages at 40, below WMARK_HIGH (60) defined at include/linux/mmzone.h:711. __zone_watermark_ok() at mm/page_alloc.c:3602 fails for the high mark. The zone is "not balanced" but allocation can still proceed from reserves.',
    [],
    state,
  ));

  // Frame 3: drop below low watermark -> wake kswapd
  state.watermarks.freePages = 25;
  state.kswapdState = 'running';
  state.phase = 'kswapd-wakeup';
  state.srcRef = 'mm/vmscan.c:7361';
  frames.push(makeFrame(3,
    'Low watermark breached -- kswapd wakes up!',
    'Free pages hit 25, below WMARK_LOW (30). The page allocator calls wakeup_kswapd() at mm/vmscan.c:7361. This wakes the kswapd kernel thread (mm/vmscan.c:7280) which calls balance_pgdat() at mm/vmscan.c:6950 to reclaim pages in the background so allocating processes do not have to block.',
    [],
    state,
  ));

  // Frame 4: kswapd scans inactive file list
  state.phase = 'shrink-inactive-file';
  state.scanCount = 3;
  state.srcRef = 'mm/vmscan.c:1083';
  const inactiveFile = findList(state.lruLists, 'inactive_file');
  // Mark first 3 pages as reclaiming
  for (let i = 0; i < 3; i++) {
    inactiveFile.pages[i].state = 'reclaiming';
  }
  frames.push(makeFrame(4,
    'kswapd: scanning inactive_file list',
    'kswapd -> balance_pgdat() (mm/vmscan.c:6950) -> shrink_node() (mm/vmscan.c:6039) -> shrink_lruvec() (mm/vmscan.c:5772) -> shrink_folio_list() (mm/vmscan.c:1083). For each folio, folio_check_references() at mm/vmscan.c:883 checks the PTE Accessed bit. Clean, unreferenced file pages are the cheapest to reclaim.',
    inactiveFile.pages.slice(0, 3).map(p => p.id),
    state,
  ));

  // Frame 5: reclaim clean file pages
  const reclaimedIds = inactiveFile.pages.slice(0, 2).map(p => p.id);
  inactiveFile.pages[0].state = 'freed';
  inactiveFile.pages[1].state = 'freed';
  // page index 2 was dirty
  inactiveFile.pages[2].state = 'dirty';
  state.reclaimedCount = 2;
  state.watermarks.freePages = 27;
  state.srcRef = 'mm/vmscan.c:1083';
  frames.push(makeFrame(5,
    'Reclaimed 2 clean file pages',
    'shrink_folio_list() at mm/vmscan.c:1083 frees two clean file pages by removing them from the page cache -- no I/O needed. The third folio is dirty (modified in memory but not yet written to disk). shrink_folio_list() queues writeback for dirty folios via the block I/O layer.',
    reclaimedIds,
    state,
  ));

  // Frame 6: writeback dirty page
  inactiveFile.pages[2].state = 'writeback';
  state.phase = 'writeback';
  state.srcRef = 'mm/vmscan.c:1083';
  frames.push(makeFrame(6,
    'Initiating writeback for dirty page',
    'The dirty folio must be written to disk before it can be freed. shrink_folio_list() at mm/vmscan.c:1083 sets PG_writeback and moves on to scan more folios. This is more expensive than reclaiming clean pages because it requires I/O.',
    [inactiveFile.pages[2].id],
    state,
  ));

  // Frame 7: dirty page written back and freed, scan more
  inactiveFile.pages[2].state = 'freed';
  state.reclaimedCount = 3;
  state.watermarks.freePages = 28;
  for (let i = 3; i < 6; i++) {
    inactiveFile.pages[i].state = 'reclaiming';
  }
  state.scanCount = 6;
  state.phase = 'shrink-inactive-file';
  state.srcRef = 'mm/vmscan.c:5772';
  frames.push(makeFrame(7,
    'Writeback complete, scanning more pages',
    'The dirty folio is now clean and freed. shrink_lruvec() at mm/vmscan.c:5772 continues driving shrink_folio_list() in batches. kswapd needs to reclaim enough pages to push free pages above WMARK_HIGH (60) as checked by balance_pgdat() at mm/vmscan.c:6950.',
    inactiveFile.pages.slice(3, 6).map(p => p.id),
    state,
  ));

  // Frame 8: reclaim more, also demote active pages
  for (let i = 3; i < 6; i++) {
    inactiveFile.pages[i].state = 'freed';
  }
  state.reclaimedCount = 6;
  state.watermarks.freePages = 31;
  state.phase = 'shrink-active';
  state.srcRef = 'mm/vmscan.c:2098';
  // Demote 2 active pages to inactive (shrink_active_list)
  const activeFile = findList(state.lruLists, 'active_file');
  const demoted = activeFile.pages.splice(0, 2);
  for (const p of demoted) {
    p.state = 'inactive';
    p.accessed = false;
  }
  findList(state.lruLists, 'inactive_file').pages.push(...demoted);
  frames.push(makeFrame(8,
    'shrink_active_list: demoting cold active pages',
    'shrink_active_list() at mm/vmscan.c:2098 rebalances active and inactive lists. It calls folio_check_references() (mm/vmscan.c:883) on each folio. Folios on the active list without the Accessed bit set are "cold" -- they are demoted to the inactive list. This is the two-chance algorithm: pages get a second chance on the inactive list before being reclaimed.',
    demoted.map(p => p.id),
    state,
  ));

  // Frame 9: continue reclaiming from inactive list
  const remaining = findList(state.lruLists, 'inactive_file').pages
    .filter(p => p.state !== 'freed');
  for (const p of remaining.slice(0, 4)) {
    p.state = 'freed';
  }
  state.reclaimedCount = 10;
  state.watermarks.freePages = 55;
  state.scanCount = 12;
  state.phase = 'shrink-inactive-file';
  state.srcRef = 'mm/vmscan.c:1083';
  frames.push(makeFrame(9,
    'Continuing reclaim: 10 pages freed so far',
    'shrink_folio_list() at mm/vmscan.c:1083 keeps scanning. As inactive folios are reclaimed, free pages rise. The two-list model (active/inactive) managed by shrink_lruvec() (mm/vmscan.c:5772) means frequently accessed pages stay active while cold pages are recycled, avoiding thrashing.',
    remaining.slice(0, 4).map(p => p.id),
    state,
  ));

  // Frame 10: free pages cross high watermark
  state.watermarks.freePages = 62;
  state.reclaimedCount = 12;
  state.phase = 'balanced';
  state.kswapdState = 'done';
  state.srcRef = 'mm/vmscan.c:6950';
  frames.push(makeFrame(10,
    'High watermark reached -- zone is balanced',
    'Free pages at 62, above WMARK_HIGH (60). balance_pgdat() at mm/vmscan.c:6950 detects the zone is now balanced via __zone_watermark_ok() (mm/page_alloc.c:3602). kswapd has successfully reclaimed 12 pages in the background without blocking any allocating process.',
    [],
    state,
  ));

  // Frame 11: kswapd goes back to sleep
  state.kswapdState = 'sleeping';
  state.phase = 'normal';
  state.srcRef = 'mm/vmscan.c:7280';
  frames.push(makeFrame(11,
    'kswapd returns to sleep',
    'With free pages above WMARK_HIGH, the kswapd loop at mm/vmscan.c:7280 goes back to sleep via prepare_kswapd_sleep(). It will be re-woken by wakeup_kswapd() (mm/vmscan.c:7361) if memory pressure returns. The watermark system (WMARK_MIN/LOW/HIGH at include/linux/mmzone.h:709-711) ensures reclaim starts early enough to avoid emergency situations.',
    [],
    state,
  ));

  return frames;
}

// --- Scenario: lru-aging ---

function generateLruAgingFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const wm = defaultWatermarks();
  const lists = emptyLruLists();

  const state: ReclaimState = {
    lruLists: lists,
    watermarks: wm,
    kswapdState: 'sleeping',
    directReclaim: false,
    oomTriggered: false,
    oomVictim: null,
    phase: 'page-lifecycle',
    scanCount: 0,
    reclaimedCount: 0,
    srcRef: 'mm/vmscan.c:5772',
  };

  // Frame 0: empty system
  frames.push(makeFrame(0,
    'Page lifecycle begins',
    'We trace the lifecycle of folios through the LRU lists managed by shrink_lruvec() at mm/vmscan.c:5772. The kernel maintains separate lists for file-backed and anonymous pages, each split into active and inactive (5 lists total including unevictable). New pages start on the inactive list.',
    [],
    state,
  ));

  // Frame 1: page fault brings in new file pages
  const newPages: PageInfo[] = [];
  for (let i = 0; i < 6; i++) {
    newPages.push(makePage(`page-${i}`, 'file', 'cat', { state: 'inactive', accessed: false }));
  }
  findList(state.lruLists, 'inactive_file').pages = newPages;
  state.watermarks.freePages = 94;
  state.srcRef = 'mm/vmscan.c:5772';
  frames.push(makeFrame(1,
    'Page faults bring new pages to inactive_file',
    'A process reads files, causing page faults. The kernel allocates physical pages and adds them to the inactive_file LRU list. Pages start inactive because the kernel does not know if they will be accessed again -- most file pages are read once and discarded (the streaming I/O pattern). The LRU lists are maintained per-lruvec, scanned by shrink_lruvec() (mm/vmscan.c:5772).',
    newPages.map(p => p.id),
    state,
  ));

  // Frame 2: some pages get accessed
  const inactiveFile = findList(state.lruLists, 'inactive_file');
  inactiveFile.pages[0].accessed = true;
  inactiveFile.pages[1].accessed = true;
  inactiveFile.pages[3].accessed = true;
  state.srcRef = 'mm/vmscan.c:883';
  frames.push(makeFrame(2,
    'Pages accessed: PTE Accessed bit set',
    'The MMU hardware sets the Accessed bit in the page table entry (PTE) whenever a page is read or written. folio_check_references() at mm/vmscan.c:883 detects this bit during reclaim scans. Pages 0, 1, and 3 have been accessed since they were added to the inactive list.',
    ['page-0', 'page-1', 'page-3'],
    state,
  ));

  // Frame 3: mark_page_accessed promotes pages
  const promoted = [inactiveFile.pages[0], inactiveFile.pages[1], inactiveFile.pages[3]];
  for (const p of promoted) {
    p.state = 'active';
    p.accessed = false; // clear after promotion
  }
  const activeFile = findList(state.lruLists, 'active_file');
  // Move them
  findList(state.lruLists, 'inactive_file').pages = inactiveFile.pages.filter(p => p.state !== 'active');
  activeFile.pages.push(...promoted);
  state.srcRef = 'mm/swap.c:455';
  frames.push(makeFrame(3,
    'Accessed pages promoted to active_file list',
    'folio_mark_accessed() at mm/swap.c:455 detects the Accessed bit and promotes these folios from inactive to active. This is the "second chance" in action: a folio accessed while on the inactive list gets promoted rather than reclaimed. The Accessed bit is then cleared so the kernel can detect future accesses.',
    promoted.map(p => p.id),
    state,
  ));

  // Frame 4: add anon pages
  const anonPages: PageInfo[] = [];
  for (let i = 0; i < 4; i++) {
    anonPages.push(makePage(`anon-${i}`, 'anon', 'python', { state: 'inactive', mapped: true }));
  }
  findList(state.lruLists, 'inactive_anon').pages = anonPages;
  state.watermarks.freePages = 90;
  state.srcRef = 'mm/vmscan.c:5772';
  frames.push(makeFrame(4,
    'Anonymous pages added to inactive_anon',
    'A process allocates heap memory (via malloc/mmap). These anonymous pages (not backed by a file) go to inactive_anon. Unlike file pages, anonymous pages must be swapped to disk before they can be reclaimed by shrink_folio_list() (mm/vmscan.c:1083), making them more expensive to evict.',
    anonPages.map(p => p.id),
    state,
  ));

  // Frame 5: anon pages accessed and promoted
  const inactiveAnon = findList(state.lruLists, 'inactive_anon');
  inactiveAnon.pages[0].accessed = true;
  inactiveAnon.pages[1].accessed = true;
  state.srcRef = 'mm/vmscan.c:883';
  frames.push(makeFrame(5,
    'Anonymous pages accessed',
    'The process writes to its heap memory, causing the hardware to set the Accessed bit on anonymous pages. folio_check_references() at mm/vmscan.c:883 will detect this during the next scan cycle.',
    ['anon-0', 'anon-1'],
    state,
  ));

  // Frame 6: promote accessed anon pages
  const promotedAnon = [inactiveAnon.pages[0], inactiveAnon.pages[1]];
  for (const p of promotedAnon) {
    p.state = 'active';
    p.accessed = false;
  }
  const activeAnon = findList(state.lruLists, 'active_anon');
  findList(state.lruLists, 'inactive_anon').pages = inactiveAnon.pages.filter(p => p.state !== 'active');
  activeAnon.pages.push(...promotedAnon);
  state.srcRef = 'mm/swap.c:455';
  frames.push(makeFrame(6,
    'Accessed anon pages promoted to active_anon',
    'Like file pages, accessed anonymous folios are promoted via folio_mark_accessed() at mm/swap.c:455 to the active_anon list. The active/inactive split prevents thrashing: the kernel keeps working set pages active and only reclaims pages that have not been recently accessed.',
    promotedAnon.map(p => p.id),
    state,
  ));

  // Frame 7: time passes, active pages age
  state.phase = 'aging';
  state.srcRef = 'mm/vmscan.c:2098';
  for (const p of activeFile.pages) {
    // None re-accessed, so they remain with accessed=false
  }
  frames.push(makeFrame(7,
    'Time passes: active pages age',
    'As time passes without the Accessed bit being set again, active pages become "cold". shrink_active_list() at mm/vmscan.c:2098 periodically scans the active list, checking each folio via folio_check_references() (mm/vmscan.c:883). Folios without the Accessed bit are candidates for demotion back to inactive.',
    [],
    state,
  ));

  // Frame 8: shrink_active_list demotes cold pages
  state.phase = 'shrink-active';
  state.srcRef = 'mm/vmscan.c:2098';
  const demotedFile = activeFile.pages.splice(0, 2);
  for (const p of demotedFile) {
    p.state = 'inactive';
  }
  findList(state.lruLists, 'inactive_file').pages.push(...demotedFile);
  frames.push(makeFrame(8,
    'shrink_active_list: demoting cold file pages',
    'shrink_active_list() at mm/vmscan.c:2098 runs when the active list is too large relative to the inactive list. It walks the active list from the tail, calling folio_check_references() (mm/vmscan.c:883) on each folio. Folios without the Accessed bit are demoted back to inactive. This rotation ensures the active list only contains truly hot pages.',
    demotedFile.map(p => p.id),
    state,
  ));

  // Frame 9: memory pressure triggers reclaim of inactive pages
  state.watermarks.freePages = 28;
  state.kswapdState = 'running';
  state.phase = 'reclaim';
  state.srcRef = 'mm/vmscan.c:1083';
  const inactiveFileNow = findList(state.lruLists, 'inactive_file');
  for (const p of inactiveFileNow.pages.slice(0, 3)) {
    p.state = 'reclaiming';
  }
  state.scanCount = 3;
  frames.push(makeFrame(9,
    'Memory pressure: kswapd reclaims inactive pages',
    'Free pages dropped below WMARK_LOW (include/linux/mmzone.h:710). wakeup_kswapd() at mm/vmscan.c:7361 wakes kswapd, which calls balance_pgdat() (mm/vmscan.c:6950) -> shrink_node() (mm/vmscan.c:6039) -> shrink_folio_list() (mm/vmscan.c:1083). Demoted folios that were not re-accessed are prime reclaim candidates.',
    inactiveFileNow.pages.slice(0, 3).map(p => p.id),
    state,
  ));

  // Frame 10: pages reclaimed
  for (const p of inactiveFileNow.pages.slice(0, 3)) {
    p.state = 'freed';
  }
  state.reclaimedCount = 3;
  state.watermarks.freePages = 31;
  state.srcRef = 'mm/vmscan.c:1083';
  frames.push(makeFrame(10,
    'Inactive pages reclaimed',
    'shrink_folio_list() at mm/vmscan.c:1083 frees the demoted folios that were never re-accessed. The complete lifecycle: new folio -> inactive list -> accessed? folio_mark_accessed() (mm/swap.c:455) promotes to active -> not accessed? shrink_active_list() (mm/vmscan.c:2098) demotes to inactive -> eventually reclaimed by shrink_folio_list(). This two-list approach is the kernel second-chance (clock) algorithm.',
    inactiveFileNow.pages.slice(0, 3).map(p => p.id),
    state,
  ));

  // Frame 11: still-active page survives
  state.phase = 'surviving';
  state.srcRef = 'mm/vmscan.c:883';
  const survivor = activeFile.pages[0];
  if (survivor) {
    survivor.accessed = true;
  }
  frames.push(makeFrame(11,
    'Active pages survive: working set protected',
    'Page "page-3" on the active list was re-accessed and survives -- folio_check_references() at mm/vmscan.c:883 sees the Accessed bit set. Without the two-chance algorithm, a sequential scan (like "cat largefile") would evict the entire working set. By requiring pages to be accessed on the inactive list before promotion, streaming I/O pages are reclaimed quickly while genuinely hot pages persist.',
    survivor ? [survivor.id] : [],
    state,
  ));

  return frames;
}

// --- Scenario: oom-kill ---

interface ProcessInfo {
  name: string;
  pages: number;
  oomScore: number;
}

function generateOomKillFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const wm: WatermarkState = {
    freePages: 50,
    minWatermark: 10,
    lowWatermark: 30,
    highWatermark: 60,
    totalPages: 256,
  };
  const lists = emptyLruLists();

  // Populate with mostly dirty/mapped pages that are hard to reclaim
  const hardPages: PageInfo[] = [];
  for (let i = 0; i < 8; i++) {
    hardPages.push(makePage(`hp-${i}`, 'anon', i < 4 ? 'leaky-app' : 'database', {
      state: 'inactive',
      mapped: true,
      dirty: true,
    }));
  }
  findList(lists, 'inactive_anon').pages = hardPages;

  // Some unevictable pages
  const unevict: PageInfo[] = [];
  for (let i = 0; i < 3; i++) {
    unevict.push(makePage(`ue-${i}`, 'unevictable', 'kernel', {
      state: 'active',
    }));
  }
  findList(lists, 'unevictable').pages = unevict;

  const state: ReclaimState = {
    lruLists: lists,
    watermarks: wm,
    kswapdState: 'sleeping',
    directReclaim: false,
    oomTriggered: false,
    oomVictim: null,
    phase: 'normal',
    scanCount: 0,
    reclaimedCount: 0,
    srcRef: 'include/linux/mmzone.h:709-711',
  };

  // Frame 0: initial state
  frames.push(makeFrame(0,
    'System under heavy memory pressure',
    'The system has processes consuming large amounts of memory. Most pages are anonymous (heap/stack) and dirty, making them expensive to reclaim via shrink_folio_list() (mm/vmscan.c:1083) because they require swap. Unevictable pages (mlock\'d or kernel pages) cannot be reclaimed at all and are skipped by shrink_lruvec() (mm/vmscan.c:5772).',
    [],
    state,
  ));

  // Frame 1: rapid allocation
  state.watermarks.freePages = 28;
  state.phase = 'pressure';
  state.srcRef = 'mm/vmscan.c:7361';
  frames.push(makeFrame(1,
    'Rapid allocation: free pages dropping fast',
    'A memory-hungry process (leaky-app) is allocating pages rapidly. Free pages drop to 28, below WMARK_LOW (30) defined at include/linux/mmzone.h:710. wakeup_kswapd() at mm/vmscan.c:7361 wakes the kswapd thread.',
    [],
    state,
  ));

  // Frame 2: kswapd wakes
  state.kswapdState = 'running';
  state.phase = 'kswapd-scanning';
  state.watermarks.freePages = 22;
  state.srcRef = 'mm/vmscan.c:6950';
  frames.push(makeFrame(2,
    'kswapd wakes but pages are hard to reclaim',
    'kswapd (mm/vmscan.c:7280) calls balance_pgdat() at mm/vmscan.c:6950 -> shrink_node() (mm/vmscan.c:6039) -> shrink_folio_list() (mm/vmscan.c:1083). But it finds mostly anonymous dirty folios requiring swap I/O. If swap is full or slow, kswapd cannot make progress. Unevictable pages are skipped entirely.',
    [],
    state,
  ));

  // Frame 3: kswapd struggles
  state.scanCount = 8;
  state.reclaimedCount = 1;
  state.watermarks.freePages = 15;
  state.srcRef = 'mm/vmscan.c:1083';
  const inactiveAnon = findList(state.lruLists, 'inactive_anon');
  inactiveAnon.pages[0].state = 'writeback';
  frames.push(makeFrame(3,
    'kswapd: swap writeback slow, minimal progress',
    'shrink_folio_list() at mm/vmscan.c:1083 managed to initiate swap writeback for one folio, but swap I/O is slow. Meanwhile, allocations continue consuming free pages faster than kswapd can reclaim them. Free pages drop to 15.',
    [inactiveAnon.pages[0].id],
    state,
  ));

  // Frame 4: drop below min watermark
  state.watermarks.freePages = 8;
  state.phase = 'direct-reclaim';
  state.directReclaim = true;
  state.srcRef = 'mm/vmscan.c:6566';
  inactiveAnon.pages[0].state = 'freed';
  state.reclaimedCount = 2;
  frames.push(makeFrame(4,
    'Below min watermark -- direct reclaim kicks in!',
    'Free pages at 8, below WMARK_MIN (10) at include/linux/mmzone.h:709. The allocating process enters direct reclaim via try_to_free_pages() at mm/vmscan.c:6566 -> do_try_to_free_pages() (mm/vmscan.c:6344) -> shrink_node() (mm/vmscan.c:6039). The process blocks until pages are freed. Direct reclaim is much worse than kswapd because the allocating process stalls.',
    [],
    state,
  ));

  // Frame 5: direct reclaim also struggles
  state.scanCount = 16;
  state.reclaimedCount = 3;
  state.watermarks.freePages = 6;
  state.srcRef = 'mm/vmscan.c:6344';
  for (let i = 1; i < 4; i++) {
    inactiveAnon.pages[i].state = 'writeback';
  }
  frames.push(makeFrame(5,
    'Direct reclaim: struggling to free pages',
    'do_try_to_free_pages() at mm/vmscan.c:6344 scans aggressively but most folios need swap writeback via shrink_folio_list() (mm/vmscan.c:1083). The process is blocked, waiting for I/O to complete. Other processes trying to allocate also enter try_to_free_pages() (mm/vmscan.c:6566), creating a reclaim storm.',
    inactiveAnon.pages.slice(1, 4).map(p => p.id),
    state,
  ));

  // Frame 6: reclaim fails completely
  state.watermarks.freePages = 3;
  state.reclaimedCount = 3;
  state.scanCount = 24;
  state.phase = 'reclaim-failed';
  state.srcRef = 'mm/vmscan.c:6566';
  for (let i = 1; i < 4; i++) {
    inactiveAnon.pages[i].state = 'inactive'; // writeback didn't help
  }
  frames.push(makeFrame(6,
    'Reclaim failure: unable to free enough pages',
    'After exhaustive scanning, neither kswapd nor direct reclaim could free enough pages. try_to_free_pages() at mm/vmscan.c:6566 returns 0. The allocation path in the page allocator has one last resort: invoke the OOM killer.',
    [],
    state,
  ));

  // Frame 7: OOM killer invoked
  state.phase = 'oom-invoked';
  state.oomTriggered = true;
  state.srcRef = 'mm/oom_kill.c:1119';
  frames.push(makeFrame(7,
    'OOM killer invoked: out_of_memory()',
    'The kernel calls out_of_memory() at mm/oom_kill.c:1119. The OOM killer uses select_bad_process() at mm/oom_kill.c:365 to find the best candidate to kill. It calls oom_evaluate_task() (mm/oom_kill.c:309) for each process, calculating an oom_score based on: RSS (resident set size), oom_score_adj (user-configurable), and whether it is a root process. Higher score = more likely to be killed.',
    [],
    state,
  ));

  // Frame 8: select victim
  state.phase = 'selecting-victim';
  state.oomVictim = 'leaky-app';
  state.srcRef = 'mm/oom_kill.c:1024';
  frames.push(makeFrame(8,
    'Victim selected: leaky-app (highest oom_score)',
    'select_bad_process() at mm/oom_kill.c:365 identifies leaky-app with the highest oom_score. oom_kill_process() at mm/oom_kill.c:1024 -> __oom_kill_process() (mm/oom_kill.c:928) sends SIGKILL to the victim. The process\'s mm_struct is marked with MMF_OOM_SKIP so reclaim does not waste time scanning it during teardown.',
    hardPages.filter(p => p.owner === 'leaky-app').map(p => p.id),
    state,
  ));

  // Frame 9: process killed, pages freed
  state.phase = 'oom-freeing';
  state.srcRef = 'mm/oom_kill.c:928';
  const victimPages = inactiveAnon.pages.filter(p => p.owner === 'leaky-app');
  for (const p of victimPages) {
    p.state = 'freed';
  }
  state.reclaimedCount = 3 + victimPages.length;
  state.watermarks.freePages = 3 + victimPages.length * 8;
  frames.push(makeFrame(9,
    'Victim killed: freeing leaky-app pages',
    'SIGKILL is delivered. __oom_kill_process() at mm/oom_kill.c:928 marks the victim. As leaky-app exits, the kernel reclaims all its pages: anonymous pages are freed from swap, file-backed pages are released from page cache, page tables are torn down. This is a violent but effective last resort.',
    victimPages.map(p => p.id),
    state,
  ));

  // Frame 10: system recovers
  state.watermarks.freePages = 65;
  state.kswapdState = 'done';
  state.directReclaim = false;
  state.phase = 'recovered';
  state.srcRef = 'mm/page_alloc.c:3602';
  frames.push(makeFrame(10,
    'System recovered: allocation can proceed',
    'With leaky-app killed, free pages jump to 65 -- __zone_watermark_ok() at mm/page_alloc.c:3602 confirms free pages are above WMARK_HIGH (include/linux/mmzone.h:711). The original allocation that triggered this chain can now succeed. The OOM killer is a blunt instrument: it sacrifices one process to save the rest.',
    [],
    state,
  ));

  // Frame 11: lessons
  state.kswapdState = 'sleeping';
  state.phase = 'normal';
  state.srcRef = 'mm/vmscan.c:7280';
  frames.push(makeFrame(11,
    'OOM aftermath: system stable again',
    'The reclaim hierarchy traced through real kernel code: (1) kswapd background reclaim via balance_pgdat() (mm/vmscan.c:6950), (2) direct reclaim via try_to_free_pages() (mm/vmscan.c:6566), (3) OOM killer via out_of_memory() (mm/oom_kill.c:1119). To avoid OOM: configure swap, use cgroups memory limits, tune oom_score_adj to protect critical processes, and fix memory leaks.',
    [],
    state,
  ));

  return frames;
}

// --- Scenario: batched-large-folio-unmap (v7.0) ---

function generateBatchedLargeFolioUnmap(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const wm = defaultWatermarks();
  wm.freePages = 24;
  const lists = emptyLruLists();

  // Build a reclaim candidate set on inactive_file:
  // - 16 subpages belonging to one large (order-4, 64 KiB) file folio "lf-*".
  //   Real v7.0 kernels care most about PMD-sized (2 MiB / 512-subpage) folios
  //   produced by readahead/THP_FILE, but keeping 16 subpages here preserves
  //   the existing test expectations while still illustrating the batching.
  // - A couple of small file folios alongside to provide contrast.
  const largeFolioPages: PageInfo[] = [];
  for (let i = 0; i < 16; i++) {
    largeFolioPages.push(
      makePage(`lf-${i}`, 'file', 'mmap-reader', {
        state: 'inactive',
        mapped: true,
        accessed: false,
        dirty: false,
      }),
    );
  }
  const smallFilePages: PageInfo[] = [];
  for (let i = 0; i < 3; i++) {
    smallFilePages.push(
      makePage(`sf-${i}`, 'file', 'cat', {
        state: 'inactive',
        mapped: true,
      }),
    );
  }
  findList(lists, 'inactive_file').pages = [
    ...largeFolioPages,
    ...smallFilePages,
  ];

  // Rough order-of-magnitude cycle budget, used for the pre-v7 vs v7 contrast
  // frames.  Numbers are illustrative (Arm64 Neoverse class), not measured:
  //   per-PTE cost ~= atomic xchg + rmap lookup + IPI-class tlbi range ~ 3000 c
  //   batched cost ~= 1 rmap walk + 16 x cheap store-exclusive + 1 IPI ~= 4500 c
  const CYCLES_PER_PAGE = 3000;
  const CYCLES_BATCHED_TOTAL = 4500;
  const perPageTotal = CYCLES_PER_PAGE * 16;

  const state: ReclaimState = {
    lruLists: lists,
    watermarks: wm,
    kswapdState: 'running',
    directReclaim: false,
    oomTriggered: false,
    oomVictim: null,
    phase: 'shrink-folio-list',
    scanCount: 0,
    reclaimedCount: 0,
    srcRef: 'mm/vmscan.c:1078 shrink_folio_list()',
    folioSize: 16,
    folioSizeLabel: '64 KiB (16 x 4 KiB subpages)',
    ptesToFlush: 0,
    tlbFlushes: 0,
    batchMode: true,
    batchModeLabel: 'batched',
    ptesCleared: 0,
    rmapWalks: 0,
    mmuGather: { pages: 0, flushScheduled: false },
  };

  // Frame 0: shrink_folio_list iterates the reclaim candidate list
  frames.push(makeFrame(0,
    'shrink_folio_list: iterating reclaim candidates',
    'kswapd has entered shrink_folio_list() at mm/vmscan.c:1078. The isolated list contains a 16-subpage file-backed large folio (lf-0..lf-15) plus a few small file folios. Each iteration picks one folio and drives it through reference check, unmap, writeback, and free. In v7.0 the loop treats the large folio as a single unit rather than splitting it into 16 small-folio iterations.',
    largeFolioPages.map(p => p.id),
    state,
  ));

  // Frame 1: iteration reaches the large folio, folio_test_large() is true
  state.phase = 'detect-large-folio';
  state.srcRef = 'mm/vmscan.c:1367 folio_test_large()';
  state.scanCount = 1;
  frames.push(makeFrame(1,
    'Iteration reaches the large folio: folio_test_large() == true',
    'shrink_folio_list() dequeues the 16-subpage file folio. The TTU flag assembly at mm/vmscan.c:1350 sets enum ttu_flags flags = TTU_BATCH_FLUSH, and because folio_test_large(folio) at mm/vmscan.c:1367 is true it also OR-ins TTU_SYNC. The comment at mm/vmscan.c:1356 explains why: without TTU_SYNC a parallel PTE writer could race with the rmap walk and leave some subpages still mapped after try_to_unmap returns.',
    largeFolioPages.map(p => p.id),
    state,
  ));

  // Frame 2: try_to_unmap(folio, flags) is called ONCE on the entire folio
  state.phase = 'try-to-unmap-call';
  state.srcRef = 'mm/vmscan.c:1370 try_to_unmap()';
  frames.push(makeFrame(2,
    'try_to_unmap(folio, TTU_BATCH_FLUSH | TTU_SYNC)',
    'shrink_folio_list() calls try_to_unmap(folio, flags) at mm/vmscan.c:1370 exactly once for the whole 16-subpage folio. try_to_unmap() itself is defined at mm/rmap.c:2392 and hands the folio to rmap_walk() with try_to_unmap_one() as the per-VMA callback. TTU_BATCH_FLUSH asks the rmap callback to accumulate TLB invalidations in the current task\'s tlb_ubc struct (current->tlb_ubc) instead of flushing eagerly.',
    largeFolioPages.map(p => p.id),
    state,
  ));

  // Frame 3: PRE-v7.0 CONTRAST PART A - describe the per-subpage loop.
  // This frame shows what used to happen in the kernel before commit
  // a67fe41e214f.  We flip batchMode off so the visible status ("per-page")
  // matches the narrative.
  state.phase = 'pre-v7-per-page-unmap';
  state.batchMode = false;
  state.batchModeLabel = 'per-page';
  state.srcRef = 'mm/rmap.c:1984 try_to_unmap_one()';
  state.tlbFlushes = 16;
  state.ptesCleared = 16;
  state.rmapWalks = 16;
  state.mmuGather = { pages: 0, flushScheduled: false };
  state.cpuCycles = { perPage: perPageTotal, batched: CYCLES_BATCHED_TOTAL };
  frames.push(makeFrame(3,
    'Pre-v7.0 contrast: 512 per-PTE unmap iterations for a PMD folio',
    'Before commit a67fe41e214f ("mm: rmap: support batched unmapping for file large folios"), file large folios fell through to the per-subpage path in try_to_unmap_one() (mm/rmap.c:1984). For a 2 MiB PMD folio the kernel executed 512 separate iterations: each called ptep_get_and_clear (or a helper), touched a per-PTE atomic, performed a per-subpage rmap lookup, and queued a fresh flush descriptor via set_tlb_ubc_flush_pending() (mm/rmap.c:742). Our 16-subpage miniature shows the same shape scaled down: 16 PTE clears, 16 rmap walks, 16 pending flush entries.',
    largeFolioPages.map(p => p.id),
    state,
  ));

  // Frame 4: PRE-v7.0 CONTRAST PART B - TLB flush cost is the killer.
  // Keep state.batchMode=false to stay in the "old world".
  state.phase = 'pre-v7-per-pte-tlbi';
  state.srcRef = 'mm/rmap.c:711 try_to_unmap_flush()';
  state.ptesCleared = 16;
  state.tlbFlushes = 16;
  frames.push(makeFrame(4,
    'Pre-v7.0 cost: 16 per-PTE TLB invalidates, 16 cross-CPU IPIs',
    'Each pre-v7.0 iteration recorded a single-page range into current->tlb_ubc via set_tlb_ubc_flush_pending() at mm/rmap.c:742, and every call to try_to_unmap_flush() (mm/rmap.c:711) resolved into arch_tlbbatch_flush() issuing a cross-CPU IPI. Budget estimate: 16 x ~3000 cycles of rmap+atomic+IPI = ~48,000 cycles on our toy example; a real 512-subpage PMD folio paid that penalty 32x larger. That overhead is what the v7.0 commit targets.',
    largeFolioPages.map(p => p.id),
    state,
  ));

  // Frame 5: rmap walks mappings; try_to_unmap_one visits each VMA (v7.0)
  // Flip batchMode back on: we are now describing v7.0 behavior.
  state.phase = 'rmap-walk';
  state.batchMode = true;
  state.batchModeLabel = 'batched';
  state.rmapWalks = 1;
  state.ptesCleared = 0;
  state.srcRef = 'mm/rmap.c:1984 try_to_unmap_one()';
  state.ptesToFlush = 16;
  state.tlbFlushes = 0;
  state.mmuGather = { pages: 0, flushScheduled: false };
  for (const p of largeFolioPages) {
    p.state = 'reclaiming';
  }
  frames.push(makeFrame(5,
    'v7.0 rmap walk: try_to_unmap_one() runs once per mapping VMA',
    'The rmap layer walks every VMA that maps this folio. For each VMA it calls try_to_unmap_one() at mm/rmap.c:1984 exactly once. v7.0 adds folio_unmap_pte_batch() at mm/rmap.c:1944, which in turn calls folio_pte_batch_flags() (declared at mm/internal.h:338) to find the run of consecutive present PTEs belonging to this folio within one page table (capped by pmd_addr_end). The 16 PTE clears will be performed as a single batch on the return path.',
    largeFolioPages.map(p => p.id),
    state,
  ));

  // Frame 6: v7.0 bulk PTE clear via get_and_clear_ptes().
  // This is the exact line that replaced the per-page loop.
  state.phase = 'v7-bulk-pte-clear';
  state.srcRef = 'mm/rmap.c:2172 get_and_clear_ptes()';
  state.ptesCleared = 16;
  state.ptesToFlush = 16;
  frames.push(makeFrame(6,
    'v7.0 bulk PTE clear: get_and_clear_ptes(mm, address, pvmw.pte, nr_pages)',
    'Inside try_to_unmap_one(), the present-PTE arm at mm/rmap.c:2166 now calls folio_unmap_pte_batch() to compute nr_pages, then clears all of them at once with pteval = get_and_clear_ptes(mm, address, pvmw.pte, nr_pages) at mm/rmap.c:2172. get_and_clear_ptes() (include/linux/pgtable.h:876) wraps get_and_clear_full_ptes() and atomically nukes the 16 consecutive PTEs using an architecture-specific primitive (contpte on Arm64, single STMXCSR-style store on x86). One call site replaces 16 iterations.',
    largeFolioPages.map(p => p.id),
    state,
  ));

  // Frame 7: TLB batching via set_tlb_ubc_flush_pending()
  state.phase = 'tlb-ubc-batch';
  state.srcRef = 'mm/rmap.c:2182 set_tlb_ubc_flush_pending()';
  state.mmuGather = { pages: 16, flushScheduled: true };
  frames.push(makeFrame(7,
    'TLB batching: set_tlb_ubc_flush_pending() records one range',
    'After the bulk PTE clear, try_to_unmap_one() calls should_defer_flush() (mm/rmap.c:787) which returns true because TTU_BATCH_FLUSH is set. It then invokes set_tlb_ubc_flush_pending(mm, pteval, address, end_addr) at mm/rmap.c:742. A single call records the whole [address, end_addr) range (64 KiB wide) into current->tlb_ubc->arch via arch_tlbbatch_add_pending(). tlb_ubc->flush_required becomes true, and if any subpage was writable tlb_ubc->writable is set.  The hardware TLBI is NOT issued yet.',
    largeFolioPages.map(p => p.id),
    state,
  ));

  // Frame 8: mmu_gather context - on the reclaim path, the tlb_ubc
  // accumulator is the "batched TLB flush" mechanism.  Use this frame to
  // explicitly reference include/asm-generic/tlb.h so learners can see the
  // parallel with munmap()-style mmu_gather batching.
  state.phase = 'mmu-gather-analogy';
  state.srcRef = 'include/asm-generic/tlb.h:325 struct mmu_gather';
  frames.push(makeFrame(8,
    'mmu_gather analogy: tlb_gather_mmu -> __tlb_remove_page -> tlb_finish_mmu',
    'On the munmap/exit path the kernel builds a struct mmu_gather (include/asm-generic/tlb.h:325), calls tlb_gather_mmu() (mm/mmu_gather.c:462), queues pages with __tlb_remove_page_size() (include/asm-generic/tlb.h:294), and finalizes with tlb_finish_mmu() (mm/mmu_gather.c:515) - one coalesced TLB shootdown for the whole gather. On the reclaim path the moral equivalent is current->tlb_ubc: set_tlb_ubc_flush_pending() is __tlb_remove_page, and try_to_unmap_flush() is tlb_finish_mmu. Both structures turn N per-page IPIs into one range IPI.',
    largeFolioPages.map(p => p.id),
    state,
  ));

  // Frame 9: contrast frame - put the timing side by side.
  state.phase = 'cycle-contrast';
  state.srcRef = 'mm/rmap.c:2167 folio_unmap_pte_batch()';
  state.cpuCycles = { perPage: perPageTotal, batched: CYCLES_BATCHED_TOTAL };
  frames.push(makeFrame(9,
    `Cost contrast: 16 x ${CYCLES_PER_PAGE}c (per-page) vs ~${CYCLES_BATCHED_TOTAL}c (batched)`,
    `Per-page path (pre-v7.0): ~${CYCLES_PER_PAGE} cycles * 16 subpages = ~${perPageTotal} cycles, plus 16 IPI-class TLB invalidates. Batched path (v7.0): ~${CYCLES_BATCHED_TOTAL} cycles total (one rmap walk + one get_and_clear_ptes batch + one pending-flush record), plus exactly 1 range IPI. For a real 2 MiB PMD folio the per-PTE path scales to 512 iterations and 512 IPIs; the batched path still issues 1. The speedup is O(folio_size).`,
    largeFolioPages.map(p => p.id),
    state,
  ));

  // Frame 10: try_to_unmap_flush_dirty issues one flush covering the range
  // (for clean file folios the flush is elided until the batch boundary,
  // but the code path is the same when any subpage was dirty/writable.)
  state.phase = 'tlb-flush-range';
  state.srcRef = 'mm/vmscan.c:1419 try_to_unmap_flush_dirty()';
  state.tlbFlushes = 1;
  state.ptesToFlush = 0;
  state.mmuGather = { pages: 16, flushScheduled: false };
  frames.push(makeFrame(10,
    'try_to_unmap_flush_dirty(): one IPI covers the whole folio range',
    'If any subpage was dirty or writable, shrink_folio_list() at mm/vmscan.c:1419 calls try_to_unmap_flush_dirty() (mm/rmap.c:724) before pageout(). That calls try_to_unmap_flush() (mm/rmap.c:711), which tests tlb_ubc->flush_required and invokes arch_tlbbatch_flush(&tlb_ubc->arch) - one cross-CPU IPI for the accumulated range, replacing the 16 IPIs the pre-v7.0 path would have generated.',
    largeFolioPages.map(p => p.id),
    state,
  ));

  // Frame 11: folio freed (clean file case: no writeback needed)
  state.phase = 'free-folio';
  state.srcRef = 'mm/vmscan.c:1533 folio_batch_add()';
  for (const p of largeFolioPages) {
    p.state = 'freed';
  }
  state.reclaimedCount = 16;
  state.watermarks.freePages = 40;
  frames.push(makeFrame(11,
    'Folio unmapped and released: 16 pages accounted in one step',
    'For a clean file folio, __remove_mapping() drops the page cache reference and the folio is added to the free_folios batch. The free_it path at mm/vmscan.c:1525 runs folio_batch_add(&free_folios, folio) at mm/vmscan.c:1533; when the batch fills, mm/vmscan.c:1534 calls mem_cgroup_uncharge_folios() then try_to_unmap_flush() at mm/vmscan.c:1535 then free_unref_folios(). nr_reclaimed is bumped by nr_pages (16) in a single accounting update at mm/vmscan.c:1530.',
    largeFolioPages.map(p => p.id),
    state,
  ));

  // Frame 12: batch flush at vmscan.c:1535 finalizes pending flushes
  state.phase = 'batch-flush-boundary';
  state.srcRef = 'mm/vmscan.c:1535 try_to_unmap_flush()';
  state.tlbFlushes = 1;
  state.mmuGather = { pages: 0, flushScheduled: false };
  frames.push(makeFrame(12,
    'Batch boundary: try_to_unmap_flush() drains pending TLB work',
    'When the free_folios batch fills inside the shrink_folio_list() loop, the code at mm/vmscan.c:1535 calls try_to_unmap_flush() (mm/rmap.c:711) to drain any remaining deferred invalidations before free_unref_folios() returns the pages to the buddy allocator. Any remaining small folios in the isolated list continue through the same loop.',
    smallFilePages.map(p => p.id),
    state,
  ));

  // Frame 13: final flush at function exit
  state.phase = 'final-flush';
  state.srcRef = 'mm/vmscan.c:1604 try_to_unmap_flush()';
  state.scanCount = 19;
  state.reclaimedCount = 19;
  state.kswapdState = 'done';
  state.watermarks.freePages = 65;
  for (const p of smallFilePages) {
    p.state = 'freed';
  }
  frames.push(makeFrame(13,
    'shrink_folio_list exit: final try_to_unmap_flush() at :1604',
    'At the bottom of shrink_folio_list(), mm/vmscan.c:1604 performs one last try_to_unmap_flush() to ensure no deferred TLB invalidations leak past the function. Result: the 16-subpage large folio plus 3 small folios were reclaimed with 2 IPI-class flushes total (one at the dirty gate, one at function exit) instead of the ~19 flushes the pre-v7.0 per-page path would have generated. Free pages climb from 24 to 65 and the zone re-balances.',
    [],
    state,
  ));

  return frames;
}

// --- SVG Rendering ---

const NS = 'http://www.w3.org/2000/svg';

function el(tag: string, attrs: Record<string, string>, text?: string): SVGElement {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    e.setAttribute(k, v);
  }
  if (text !== undefined) {
    e.textContent = text;
  }
  return e;
}

function renderWatermarkBar(
  container: SVGGElement,
  wm: WatermarkState,
  x: number,
  y: number,
  w: number,
  h: number,
  highlights: string[],
): void {
  const barX = x + 40;
  const barW = w - 50;

  // Background
  container.appendChild(el('rect', {
    x: String(barX), y: String(y), width: String(barW), height: String(h),
    class: 'anim-wm-bg', rx: '4',
  }));

  // Free pages level
  const freeRatio = Math.min(wm.freePages / wm.totalPages, 1);
  const fillH = freeRatio * h;
  const fillY = y + h - fillH;

  // Color by zone
  let fillClass = 'anim-wm-green';
  if (wm.freePages <= wm.minWatermark) fillClass = 'anim-wm-red';
  else if (wm.freePages <= wm.lowWatermark) fillClass = 'anim-wm-orange';
  else if (wm.freePages <= wm.highWatermark) fillClass = 'anim-wm-yellow';

  container.appendChild(el('rect', {
    x: String(barX), y: String(fillY), width: String(barW), height: String(fillH),
    class: fillClass, rx: '4',
  }));

  // Watermark lines
  const lines: [number, string, string][] = [
    [wm.highWatermark, 'high', '#22c55e'],
    [wm.lowWatermark, 'low', '#eab308'],
    [wm.minWatermark, 'min', '#ef4444'],
  ];

  for (const [level, label, color] of lines) {
    const ly = y + h - (level / wm.totalPages) * h;
    container.appendChild(el('line', {
      x1: String(barX - 5), y1: String(ly),
      x2: String(barX + barW + 5), y2: String(ly),
      stroke: color, 'stroke-width': '2', 'stroke-dasharray': '4,2',
    }));
    container.appendChild(el('text', {
      x: String(barX - 8), y: String(ly + 4),
      'text-anchor': 'end', class: 'anim-wm-label', fill: color,
    }, label));
  }

  // Title and free count
  container.appendChild(el('text', {
    x: String(barX + barW / 2), y: String(y - 5),
    'text-anchor': 'middle', class: 'anim-wm-title',
  }, 'Free Pages'));

  container.appendChild(el('text', {
    x: String(barX + barW / 2), y: String(y + h + 14),
    'text-anchor': 'middle', class: 'anim-wm-count',
  }, `${wm.freePages} / ${wm.totalPages}`));
}

function renderLruLists(
  container: SVGGElement,
  lists: LruList[],
  x: number,
  y: number,
  w: number,
  h: number,
  highlights: string[],
): void {
  const listNames = ['active_file', 'inactive_file', 'active_anon', 'inactive_anon', 'unevictable'];
  const displayNames = ['Active File', 'Inactive File', 'Active Anon', 'Inactive Anon', 'Unevictable'];
  const rowH = Math.min(h / listNames.length, 60);
  const labelW = 100;
  const pageSize = 24;
  const pageGap = 4;

  for (let i = 0; i < listNames.length; i++) {
    const list = lists.find(l => l.name === listNames[i]);
    const ly = y + i * rowH;

    // List label
    container.appendChild(el('text', {
      x: String(x), y: String(ly + rowH / 2 + 4),
      class: 'anim-lru-label',
    }, displayNames[i]));

    // Queue background
    container.appendChild(el('rect', {
      x: String(x + labelW), y: String(ly + 4),
      width: String(w - labelW), height: String(rowH - 8),
      class: 'anim-lru-bg', rx: '3',
    }));

    if (!list) continue;

    // Draw pages as small boxes
    for (let j = 0; j < list.pages.length; j++) {
      const page = list.pages[j];
      const px = x + labelW + 4 + j * (pageSize + pageGap);
      if (px + pageSize > x + w) break; // clip overflow

      let cls = 'anim-page';
      if (page.type === 'file') cls += ' anim-page-file';
      else if (page.type === 'anon') cls += ' anim-page-anon';
      else cls += ' anim-page-unevictable';

      if (page.state === 'reclaiming') cls += ' anim-page-reclaiming';
      else if (page.state === 'freed') cls += ' anim-page-freed';
      else if (page.state === 'writeback') cls += ' anim-page-writeback';
      else if (page.state === 'dirty') cls += ' anim-page-dirty';

      if (highlights.includes(page.id)) cls += ' anim-highlight';

      container.appendChild(el('rect', {
        x: String(px), y: String(ly + (rowH - pageSize) / 2),
        width: String(pageSize), height: String(pageSize),
        class: cls, rx: '2',
      }));

      // Accessed indicator
      if (page.accessed) {
        container.appendChild(el('text', {
          x: String(px + pageSize / 2), y: String(ly + (rowH - pageSize) / 2 + pageSize / 2 + 3),
          'text-anchor': 'middle', class: 'anim-page-indicator',
        }, 'A'));
      }

      // Dirty indicator
      if (page.dirty) {
        container.appendChild(el('text', {
          x: String(px + pageSize / 2), y: String(ly + (rowH - pageSize) / 2 + pageSize / 2 + 3),
          'text-anchor': 'middle', class: 'anim-page-indicator',
        }, 'D'));
      }
    }
  }
}

function renderStatusPanel(
  container: SVGGElement,
  state: ReclaimState,
  x: number,
  y: number,
  w: number,
): void {
  let cy = y + 15;
  const lineH = 18;

  container.appendChild(el('text', {
    x: String(x), y: String(cy), class: 'anim-status-title',
  }, 'Status'));
  cy += lineH + 4;

  const entries: [string, string][] = [
    ['kswapd', state.kswapdState],
    ['Phase', state.phase],
    ['Scanned', String(state.scanCount)],
    ['Reclaimed', String(state.reclaimedCount)],
    ['Direct Reclaim', state.directReclaim ? 'YES' : 'no'],
  ];

  if (state.oomTriggered) {
    entries.push(['OOM', 'TRIGGERED']);
  }
  if (state.oomVictim) {
    entries.push(['OOM Victim', state.oomVictim]);
  }

  for (const [key, value] of entries) {
    container.appendChild(el('text', {
      x: String(x), y: String(cy), class: 'anim-status-key',
    }, `${key}:`));
    let valClass = 'anim-status-value';
    if (key === 'OOM') valClass += ' anim-status-oom';
    container.appendChild(el('text', {
      x: String(x + 90), y: String(cy), class: valClass,
    }, value));
    cy += lineH;
  }
}

function renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void {
  while (container.firstChild) container.removeChild(container.firstChild);

  const data = frame.data as ReclaimState;
  const margin = { top: 25, right: 10, bottom: 10, left: 10 };

  // Title
  container.appendChild(el('text', {
    x: String(width / 2), y: '16',
    'text-anchor': 'middle', class: 'anim-title',
  }, 'Page Reclaim & LRU'));

  // Layout: left watermark bar, center LRU lists, right status
  const wmBarX = margin.left;
  const wmBarW = 100;
  const wmBarY = margin.top + 10;
  const wmBarH = height - margin.top - margin.bottom - 40;

  renderWatermarkBar(container, data.watermarks, wmBarX, wmBarY, wmBarW, wmBarH, frame.highlights);

  // Center: LRU lists
  const lruX = wmBarX + wmBarW + 20;
  const statusW = 180;
  const lruW = width - lruX - statusW - margin.right;
  const lruY = margin.top + 10;
  const lruH = height - margin.top - margin.bottom - 20;

  renderLruLists(container, data.lruLists, lruX, lruY, lruW, lruH, frame.highlights);

  // Right: status panel
  const statusX = width - statusW - margin.right;
  renderStatusPanel(container, data, statusX, margin.top + 10, statusW);
}

// --- Module ---

const SCENARIOS: AnimationScenario[] = [
  { id: 'watermark-reclaim', label: 'Watermark-Based Reclaim (kswapd)' },
  { id: 'lru-aging', label: 'LRU Page Aging Lifecycle' },
  { id: 'oom-kill', label: 'OOM Killer Scenario' },
  { id: 'batched-large-folio-unmap', label: 'Batched Large Folio Unmap (v7.0)' },
];

const pageReclaim: AnimationModule = {
  config: {
    id: 'page-reclaim',
    title: 'Page Reclaim & LRU',
    skillName: 'page-reclaim-and-swap',
  },

  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario) {
      case 'lru-aging':
        return generateLruAgingFrames();
      case 'oom-kill':
        return generateOomKillFrames();
      case 'batched-large-folio-unmap':
        return generateBatchedLargeFolioUnmap();
      case 'watermark-reclaim':
      default:
        return generateWatermarkReclaimFrames();
    }
  },

  renderFrame,
  getScenarios: () => SCENARIOS,
};

export default pageReclaim;

import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

export interface PageCacheReadaheadState {
  currentFunction: string;
  phase: 'entry' | 'lookup' | 'cache-hit' | 'cache-miss' | 'readahead-calc' | 'readahead-submit' | 'folio-alloc' | 'io-submit' | 'copy-to-user' | 'async-trigger' | 'completed';
  fileOffset: string;
  xarrayIndex: number;
  cacheSlots: { index: number; status: 'empty' | 'cached' | 'readahead-mark' | 'reading' }[];
  readaheadWindow: { start: number; size: number; asyncSize: number } | null;
  folioInfo: { address: string; uptodate: boolean } | null;
  srcRef: string;
}

const SCENARIOS: AnimationScenario[] = [
  { id: 'page-cache-hit', label: 'Page Cache Hit (xarray lookup succeeds)' },
  { id: 'readahead-window', label: 'Readahead Window (sequential access triggers ahead I/O)' },
  { id: 'cache-miss-and-read', label: 'Cache Miss and Read (folio allocated, I/O issued)' },
];

function makeState(overrides: Partial<PageCacheReadaheadState> & { srcRef: string; currentFunction: string; phase: PageCacheReadaheadState['phase'] }): PageCacheReadaheadState {
  return {
    currentFunction: overrides.currentFunction,
    phase: overrides.phase,
    fileOffset: '0',
    xarrayIndex: 0,
    cacheSlots: [],
    readaheadWindow: null,
    folioInfo: null,
    srcRef: overrides.srcRef,
    ...overrides,
  };
}

function cloneState(s: PageCacheReadaheadState): PageCacheReadaheadState {
  return {
    currentFunction: s.currentFunction,
    phase: s.phase,
    fileOffset: s.fileOffset,
    xarrayIndex: s.xarrayIndex,
    cacheSlots: s.cacheSlots.map(c => ({ ...c })),
    readaheadWindow: s.readaheadWindow ? { ...s.readaheadWindow } : null,
    folioInfo: s.folioInfo ? { ...s.folioInfo } : null,
    srcRef: s.srcRef,
  };
}

function frame(step: number, label: string, description: string, highlights: string[], state: PageCacheReadaheadState): AnimationFrame {
  return { step, label, description, highlights, data: cloneState(state) };
}

// ----- Scenario 1: Page Cache Hit -----

function generatePageCacheHit(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  let step = 0;

  // Pre-populate cache: pages 0-7 are cached, page 6 has readahead mark
  const cachedSlots: PageCacheReadaheadState['cacheSlots'] = [];
  for (let i = 0; i < 8; i++) {
    cachedSlots.push({ index: i, status: i === 6 ? 'readahead-mark' : 'cached' });
  }

  // Frame 0: Userspace calls read(), enters filemap_read
  const s = makeState({
    phase: 'entry',
    currentFunction: 'filemap_read',
    srcRef: 'mm/filemap.c:2768',
    fileOffset: '0x0',
    xarrayIndex: 0,
    cacheSlots: cachedSlots,
  });
  frames.push(frame(step++, 'Enter filemap_read()',
    'Userspace read() syscall reaches filemap_read() at mm/filemap.c:2768. Retrieves file_ra_state from filp->f_ra at line 2772 and address_space mapping from filp->f_mapping at line 2773. Initializes folio_batch at line 2789.',
    ['filemap_read'], s));

  // Frame 1: filemap_get_pages called
  s.phase = 'lookup';
  s.currentFunction = 'filemap_get_pages';
  s.srcRef = 'mm/filemap.c:2667';
  frames.push(frame(step++, 'Call filemap_get_pages()',
    'filemap_read() calls filemap_get_pages() at mm/filemap.c:2805. filemap_get_pages() at line 2667 computes index from iocb->ki_pos >> PAGE_SHIFT at line 2672 and last_index at line 2679.',
    ['filemap_get_pages'], s));

  // Frame 2: filemap_get_read_batch does xarray lookup
  s.currentFunction = 'filemap_get_read_batch';
  s.srcRef = 'mm/filemap.c:2455';
  frames.push(frame(step++, 'XArray Lookup via filemap_get_read_batch()',
    'filemap_get_pages() calls filemap_get_read_batch() at mm/filemap.c:2685. filemap_get_read_batch() at line 2455 initializes XA_STATE on mapping->i_pages at line 2458, enters rcu_read_lock() at line 2461, and iterates with xas_load()/xas_next() at line 2462.',
    ['filemap_get_read_batch', 'xarray'], s));

  // Frame 3: Folio found in cache (hit)
  s.phase = 'cache-hit';
  s.currentFunction = 'filemap_get_read_batch';
  s.srcRef = 'mm/filemap.c:2462';
  s.folioInfo = { address: '0xffff888000100000', uptodate: true };
  frames.push(frame(step++, 'Page Cache Hit -- Folio Found',
    'xas_load() at mm/filemap.c:2462 returns a valid folio from the xarray. folio_try_get() at line 2469 takes a reference. folio_test_uptodate() at line 2477 confirms the folio data is valid. The folio is added to fbatch via folio_batch_add() at line 2475.',
    ['cache-hit', 'folio'], s));

  // Frame 4: Batch collected, return to filemap_get_pages
  s.currentFunction = 'filemap_get_pages';
  s.srcRef = 'mm/filemap.c:2685';
  frames.push(frame(step++, 'Batch Collected Successfully',
    'filemap_get_read_batch() at mm/filemap.c:2685 exits rcu_read_unlock() at line 2488 with one or more folios in fbatch. filemap_get_pages() checks folio_batch_count() at line 2686 -- non-zero means cache hit. Traces via trace_mm_filemap_get_pages() at line 2724.',
    ['filemap_get_pages', 'batch'], s));

  // Frame 5: folio_mark_accessed
  s.phase = 'copy-to-user';
  s.currentFunction = 'filemap_read';
  s.srcRef = 'mm/filemap.c:2834';
  frames.push(frame(step++, 'Mark Folio Accessed',
    'Back in filemap_read() at mm/filemap.c:2834, folio_mark_accessed() is called if the position differs from the last access (checked via pos_same_folio() at line 2832). This updates the folio active/referenced flags for LRU aging.',
    ['folio_mark_accessed'], s));

  // Frame 6: copy_folio_to_iter copies data to userspace
  s.currentFunction = 'filemap_read';
  s.srcRef = 'mm/filemap.c:2856';
  frames.push(frame(step++, 'Copy Data to Userspace',
    'filemap_read() iterates over the folio batch at mm/filemap.c:2836. For each folio, computes offset and bytes at lines 2839-2841. Calls copy_folio_to_iter() at line 2856 to copy folio data into the user iov_iter. Updates already_read and ki_pos at lines 2858-2860.',
    ['copy_folio_to_iter'], s));

  // Frame 7: Release folios and update ra state
  s.currentFunction = 'filemap_read';
  s.srcRef = 'mm/filemap.c:2868';
  frames.push(frame(step++, 'Release Folios and Update State',
    'After copying, filemap_read() releases each folio at mm/filemap.c:2868-2873 via filemap_end_dropbehind_read() and folio_put(). The folio_batch is re-initialized at line 2874. The loop continues while data remains.',
    ['folio_put'], s));

  // Frame 8: Read complete
  s.phase = 'completed';
  s.currentFunction = 'filemap_read';
  s.srcRef = 'mm/filemap.c:2877';
  frames.push(frame(step++, 'Read Complete',
    'filemap_read() calls file_accessed() at mm/filemap.c:2877 to update inode access time. Updates ra->prev_pos at line 2878 for readahead heuristics. Returns already_read (total bytes copied) at line 2879. The page cache hit avoided any disk I/O.',
    ['completed'], s));

  return frames;
}

// ----- Scenario 2: Readahead Window -----

function generateReadaheadWindow(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  let step = 0;

  // Start with a few cached pages and sequential access pattern
  const initialSlots: PageCacheReadaheadState['cacheSlots'] = [
    { index: 0, status: 'cached' },
    { index: 1, status: 'cached' },
    { index: 2, status: 'cached' },
    { index: 3, status: 'readahead-mark' },
  ];

  // Frame 0: Sequential read hits readahead-marked folio
  const s = makeState({
    phase: 'entry',
    currentFunction: 'filemap_read',
    srcRef: 'mm/filemap.c:2768',
    fileOffset: '0x3000',
    xarrayIndex: 3,
    cacheSlots: initialSlots,
  });
  frames.push(frame(step++, 'Sequential Read Reaches Readahead Mark',
    'filemap_read() at mm/filemap.c:2768 begins a sequential read. The process has been reading pages 0, 1, 2 and now requests page index 3. The file_ra_state at filp->f_ra tracks the readahead window state.',
    ['filemap_read'], s));

  // Frame 1: filemap_get_pages finds readahead-marked folio
  s.phase = 'lookup';
  s.currentFunction = 'filemap_get_pages';
  s.srcRef = 'mm/filemap.c:2708';
  s.folioInfo = { address: '0xffff888000130000', uptodate: true };
  frames.push(frame(step++, 'Detect Readahead-Marked Folio',
    'filemap_get_pages() at mm/filemap.c:2667 calls filemap_get_read_batch() at line 2685 which returns the batch. The last folio has PG_readahead set, detected by folio_test_readahead() at line 2708. This triggers filemap_readahead() at line 2709.',
    ['filemap_get_pages', 'readahead-mark'], s));

  // Frame 2: filemap_readahead triggers page_cache_async_ra
  s.phase = 'async-trigger';
  s.currentFunction = 'filemap_readahead';
  s.srcRef = 'mm/filemap.c:2653';
  s.readaheadWindow = { start: 4, size: 4, asyncSize: 4 };
  frames.push(frame(step++, 'Trigger Async Readahead',
    'filemap_readahead() at mm/filemap.c:2653 creates a DEFINE_READAHEAD at line 2657 and calls page_cache_async_ra() at line 2663. page_cache_async_ra() at mm/readahead.c:633 clears PG_readahead via folio_clear_readahead() at line 652.',
    ['filemap_readahead', 'page_cache_async_ra'], s));

  // Frame 3: page_cache_async_ra calculates new window
  s.phase = 'readahead-calc';
  s.currentFunction = 'page_cache_async_ra';
  s.srcRef = 'mm/readahead.c:633';
  s.readaheadWindow = { start: 4, size: 8, asyncSize: 8 };
  frames.push(frame(step++, 'Calculate Readahead Window Size',
    'page_cache_async_ra() at mm/readahead.c:633 checks if index matches expected callback index at line 664. For sequential access, ra->start advances by ra->size at line 665. get_next_ra_size() at mm/readahead.c:394 doubles the window: cur < max/16 returns 4*cur, cur <= max/2 returns 2*cur.',
    ['page_cache_async_ra', 'ra-window'], s));

  // Frame 4: page_cache_ra_order submits the readahead
  s.phase = 'readahead-submit';
  s.currentFunction = 'page_cache_ra_order';
  s.srcRef = 'mm/readahead.c:467';
  // Show new pages being added
  s.cacheSlots = [
    ...initialSlots,
    { index: 4, status: 'reading' },
    { index: 5, status: 'reading' },
    { index: 6, status: 'reading' },
    { index: 7, status: 'reading' },
    { index: 8, status: 'reading' },
    { index: 9, status: 'reading' },
    { index: 10, status: 'reading' },
    { index: 11, status: 'readahead-mark' },
  ];
  frames.push(frame(step++, 'Submit Readahead I/O via page_cache_ra_order()',
    'page_cache_ra_order() at mm/readahead.c:467 allocates folios in a loop at line 506-518 via ra_alloc_folio() at line 515. Each folio is added to the page cache. The folio at the mark position gets PG_readahead set. Calls read_pages() at line 521 to submit I/O.',
    ['page_cache_ra_order', 'read_pages'], s));

  // Frame 5: Now simulate next sequential read triggering sync_ra
  s.phase = 'entry';
  s.currentFunction = 'page_cache_sync_ra';
  s.srcRef = 'mm/readahead.c:557';
  s.fileOffset = '0x10000';
  s.xarrayIndex = 16;
  s.readaheadWindow = { start: 16, size: 16, asyncSize: 8 };
  // Previous readahead pages are now cached
  s.cacheSlots = [];
  for (let i = 0; i < 12; i++) {
    s.cacheSlots.push({ index: i, status: i === 11 ? 'readahead-mark' : 'cached' });
  }
  // Pages 12-15 are empty (gap)
  for (let i = 12; i < 16; i++) {
    s.cacheSlots.push({ index: i, status: 'empty' });
  }
  frames.push(frame(step++, 'Sync Readahead on Cache Miss',
    'A later read at page index 16 misses the cache. filemap_get_pages() at mm/filemap.c:2686 returns empty batch. page_cache_sync_ra() at mm/readahead.c:557 is called at line 2695. It checks sequential pattern: index - prev_index <= 1 at line 593.',
    ['page_cache_sync_ra'], s));

  // Frame 6: page_cache_sync_ra computes larger window
  s.phase = 'readahead-calc';
  s.currentFunction = 'page_cache_sync_ra';
  s.srcRef = 'mm/readahead.c:593';
  s.readaheadWindow = { start: 16, size: 32, asyncSize: 16 };
  frames.push(frame(step++, 'Grow Readahead Window',
    'page_cache_sync_ra() at mm/readahead.c:557 detects sequential access at line 593 (index - prev_index <= 1). get_init_ra_size() at mm/readahead.c:376 computes initial window: roundup_pow_of_two(size), then ramps up (4x if <= max/32, 2x if <= max/4). The window grows from 16 to 32 pages.',
    ['page_cache_sync_ra', 'get_init_ra_size'], s));

  // Frame 7: page_cache_ra_unbounded allocates and submits
  s.phase = 'readahead-submit';
  s.currentFunction = 'page_cache_ra_unbounded';
  s.srcRef = 'mm/readahead.c:211';
  s.cacheSlots = [];
  for (let i = 0; i < 12; i++) {
    s.cacheSlots.push({ index: i, status: 'cached' });
  }
  for (let i = 16; i < 48; i++) {
    s.cacheSlots.push({ index: i, status: i === 40 ? 'readahead-mark' : 'reading' });
  }
  frames.push(frame(step++, 'Allocate and Submit via page_cache_ra_unbounded()',
    'page_cache_ra_order() falls through to do_page_cache_ra() at mm/readahead.c:315 which calls page_cache_ra_unbounded() at line 334. page_cache_ra_unbounded() at mm/readahead.c:211 loops at line 258, allocating folios via ractl_alloc_folio() at line 277, inserting via filemap_add_folio() at line 282, and submitting via read_pages() at line 304.',
    ['page_cache_ra_unbounded', 'filemap_add_folio'], s));

  // Frame 8: Readahead complete, data available
  s.phase = 'completed';
  s.currentFunction = 'filemap_read';
  s.srcRef = 'mm/filemap.c:2877';
  s.cacheSlots = [];
  for (let i = 0; i < 48; i++) {
    s.cacheSlots.push({ index: i, status: i === 40 ? 'readahead-mark' : 'cached' });
  }
  frames.push(frame(step++, 'Readahead Pipeline Active',
    'The readahead window has grown from 4 to 32 pages across sequential accesses. filemap_read() at mm/filemap.c:2877 returns data to userspace. Future reads will find data already in the page cache. When the process reaches the readahead mark at page 40, page_cache_async_ra() will extend the window further.',
    ['completed', 'pipeline'], s));

  return frames;
}

// ----- Scenario 3: Cache Miss and Read -----

function generateCacheMissAndRead(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  let step = 0;

  // All cache slots empty
  const emptySlots: PageCacheReadaheadState['cacheSlots'] = [];
  for (let i = 0; i < 8; i++) {
    emptySlots.push({ index: i, status: 'empty' });
  }

  // Frame 0: filemap_read entry
  const s = makeState({
    phase: 'entry',
    currentFunction: 'filemap_read',
    srcRef: 'mm/filemap.c:2768',
    fileOffset: '0x0',
    xarrayIndex: 0,
    cacheSlots: emptySlots,
  });
  frames.push(frame(step++, 'Enter filemap_read() -- Cold Cache',
    'filemap_read() at mm/filemap.c:2768 begins reading a file with no pages in the page cache. folio_batch_init() at line 2789 prepares the batch. The read loop begins at line 2791.',
    ['filemap_read'], s));

  // Frame 1: filemap_get_pages -> filemap_get_read_batch returns empty
  s.phase = 'cache-miss';
  s.currentFunction = 'filemap_get_pages';
  s.srcRef = 'mm/filemap.c:2685';
  frames.push(frame(step++, 'Cache Miss -- XArray Lookup Empty',
    'filemap_get_pages() at mm/filemap.c:2667 calls filemap_get_read_batch() at line 2685. filemap_get_read_batch() at mm/filemap.c:2455 does XA_STATE lookup on mapping->i_pages at line 2458. xas_load() returns NULL -- no folio at this index. folio_batch_count() at line 2686 is zero.',
    ['filemap_get_pages', 'cache-miss', 'xarray'], s));

  // Frame 2: page_cache_sync_ra triggered
  s.phase = 'readahead-calc';
  s.currentFunction = 'page_cache_sync_ra';
  s.srcRef = 'mm/readahead.c:557';
  s.readaheadWindow = { start: 0, size: 4, asyncSize: 2 };
  frames.push(frame(step++, 'Trigger Synchronous Readahead',
    'Since the batch is empty, filemap_get_pages() creates DEFINE_READAHEAD at mm/filemap.c:2687 and calls page_cache_sync_ra() at line 2695. page_cache_sync_ra() at mm/readahead.c:557 traces the event at line 566. For index 0 (start of file), it enters the sequential path at line 593 and computes ra->size via get_init_ra_size() at mm/readahead.c:376.',
    ['page_cache_sync_ra', 'readahead'], s));

  // Frame 3: page_cache_ra_unbounded allocates folios
  s.phase = 'folio-alloc';
  s.currentFunction = 'page_cache_ra_unbounded';
  s.srcRef = 'mm/readahead.c:211';
  s.cacheSlots = [
    { index: 0, status: 'reading' },
    { index: 1, status: 'reading' },
    { index: 2, status: 'readahead-mark' },
    { index: 3, status: 'reading' },
  ];
  frames.push(frame(step++, 'Allocate Folios into Page Cache',
    'page_cache_ra_order() calls page_cache_ra_unbounded() at mm/readahead.c:211 (via do_page_cache_ra at line 334). The allocation loop at line 258 calls ractl_alloc_folio() at line 277 to allocate each folio, then filemap_add_folio() at mm/filemap.c:949 to insert into the xarray. filemap_add_folio() charges memcg at line 959, locks the folio at line 965, and calls __filemap_add_folio() at line 966.',
    ['page_cache_ra_unbounded', 'filemap_add_folio'], s));

  // Frame 4: read_pages submits I/O
  s.phase = 'io-submit';
  s.currentFunction = 'read_pages';
  s.srcRef = 'mm/readahead.c:149';
  frames.push(frame(step++, 'Submit I/O via read_pages()',
    'page_cache_ra_unbounded() calls read_pages() at mm/readahead.c:304. read_pages() at line 149 starts a blk_plug at line 160. If aops->readahead exists (line 162), it calls the filesystem readahead handler. Otherwise iterates folios calling aops->read_folio() at line 173. blk_finish_plug() at line 176 flushes the I/O.',
    ['read_pages', 'io-submit'], s));

  // Frame 5: Second filemap_get_read_batch attempt succeeds
  s.phase = 'lookup';
  s.currentFunction = 'filemap_get_pages';
  s.srcRef = 'mm/filemap.c:2698';
  s.cacheSlots = [
    { index: 0, status: 'cached' },
    { index: 1, status: 'cached' },
    { index: 2, status: 'readahead-mark' },
    { index: 3, status: 'cached' },
  ];
  s.folioInfo = { address: '0xffff888000200000', uptodate: true };
  frames.push(frame(step++, 'Retry Batch Lookup -- Folios Available',
    'After page_cache_sync_ra() returns, filemap_get_pages() retries filemap_get_read_batch() at mm/filemap.c:2698. This time the xarray contains the newly read folios. The batch is populated successfully.',
    ['filemap_get_read_batch', 'retry'], s));

  // Frame 6: filemap_create_folio fallback path
  s.currentFunction = 'filemap_create_folio';
  s.srcRef = 'mm/filemap.c:2600';
  frames.push(frame(step++, 'Fallback: filemap_create_folio()',
    'If the second filemap_get_read_batch() also returns empty (race or error), filemap_get_pages() falls back to filemap_create_folio() at mm/filemap.c:2701. filemap_create_folio() at line 2600 allocates a folio via filemap_alloc_folio() at line 2611, inserts it via filemap_add_folio() at line 2632, and reads it via filemap_read_folio() at line 2639 which calls aops->read_folio.',
    ['filemap_create_folio', 'filemap_add_folio', 'read_folio'], s));

  // Frame 7: copy_folio_to_iter sends data to userspace
  s.phase = 'copy-to-user';
  s.currentFunction = 'filemap_read';
  s.srcRef = 'mm/filemap.c:2856';
  frames.push(frame(step++, 'Copy Data to Userspace',
    'filemap_read() at mm/filemap.c:2836 iterates the folio batch. For each folio, copy_folio_to_iter() at line 2856 transfers data to the user buffer. already_read accumulates the bytes at line 2858. Each folio is then released via folio_put() at line 2872.',
    ['copy_folio_to_iter', 'folio_put'], s));

  // Frame 8: Read complete
  s.phase = 'completed';
  s.currentFunction = 'filemap_read';
  s.srcRef = 'mm/filemap.c:2879';
  frames.push(frame(step++, 'Cache Miss Resolved',
    'filemap_read() completes the read at mm/filemap.c:2879. The readahead also populated pages 1-3 into the page cache. Subsequent sequential reads will find these pages cached, avoiding disk I/O. The readahead mark at page 2 will trigger page_cache_async_ra() to extend the window.',
    ['completed'], s));

  return frames;
}

// ----- Renderer -----

function renderFrame(container: SVGGElement, _frame: AnimationFrame, width: number, height: number): void {
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  const state = _frame.data as PageCacheReadaheadState;
  const ns = 'http://www.w3.org/2000/svg';

  // Background
  const bg = document.createElementNS(ns, 'rect');
  bg.setAttribute('width', String(width));
  bg.setAttribute('height', String(height));
  bg.setAttribute('fill', '#1a1a2e');
  container.appendChild(bg);

  // Title
  const title = document.createElementNS(ns, 'text');
  title.setAttribute('x', '20');
  title.setAttribute('y', '30');
  title.setAttribute('fill', '#e0e0ff');
  title.setAttribute('font-size', '16');
  title.setAttribute('font-weight', 'bold');
  title.textContent = `${_frame.label} [${state.phase}]`;
  container.appendChild(title);

  // Current function label
  const fnLabel = document.createElementNS(ns, 'text');
  fnLabel.setAttribute('x', '20');
  fnLabel.setAttribute('y', '55');
  fnLabel.setAttribute('fill', '#80ff80');
  fnLabel.setAttribute('font-size', '13');
  fnLabel.textContent = `Function: ${state.currentFunction}()  |  ${state.srcRef}`;
  container.appendChild(fnLabel);

  // File offset info
  const offsetLabel = document.createElementNS(ns, 'text');
  offsetLabel.setAttribute('x', '20');
  offsetLabel.setAttribute('y', '78');
  offsetLabel.setAttribute('fill', '#ffcc80');
  offsetLabel.setAttribute('font-size', '12');
  offsetLabel.textContent = `File Offset: ${state.fileOffset}  XArray Index: ${state.xarrayIndex}`;
  container.appendChild(offsetLabel);

  // Page cache slots visualization
  const slotW = Math.min(60, (width - 60) / Math.max(state.cacheSlots.length, 1));
  const slotH = 40;
  const startY = 100;
  const maxVisible = Math.min(state.cacheSlots.length, Math.floor((width - 40) / slotW));

  const cacheTitle = document.createElementNS(ns, 'text');
  cacheTitle.setAttribute('x', '20');
  cacheTitle.setAttribute('y', String(startY - 5));
  cacheTitle.setAttribute('fill', '#aabbcc');
  cacheTitle.setAttribute('font-size', '11');
  cacheTitle.textContent = 'Page Cache (XArray):';
  container.appendChild(cacheTitle);

  const statusColors: Record<string, { fill: string; stroke: string }> = {
    'empty': { fill: '#333344', stroke: '#555566' },
    'cached': { fill: '#2a4a2a', stroke: '#44aa44' },
    'readahead-mark': { fill: '#4a4a2a', stroke: '#aaaa44' },
    'reading': { fill: '#2a2a4a', stroke: '#4444aa' },
  };

  for (let i = 0; i < maxVisible; i++) {
    const slot = state.cacheSlots[i];
    const x = 20 + i * slotW;
    const colors = statusColors[slot.status] ?? statusColors['empty'];

    const rect = document.createElementNS(ns, 'rect');
    rect.setAttribute('x', String(x));
    rect.setAttribute('y', String(startY));
    rect.setAttribute('width', String(slotW - 2));
    rect.setAttribute('height', String(slotH));
    rect.setAttribute('rx', '3');
    rect.setAttribute('fill', colors.fill);
    rect.setAttribute('stroke', colors.stroke);
    rect.setAttribute('stroke-width', '1.5');
    container.appendChild(rect);

    const idxText = document.createElementNS(ns, 'text');
    idxText.setAttribute('x', String(x + (slotW - 2) / 2));
    idxText.setAttribute('y', String(startY + 16));
    idxText.setAttribute('fill', '#ccddff');
    idxText.setAttribute('font-size', '10');
    idxText.setAttribute('font-weight', 'bold');
    idxText.setAttribute('text-anchor', 'middle');
    idxText.textContent = `P${slot.index}`;
    container.appendChild(idxText);

    const statusText = document.createElementNS(ns, 'text');
    statusText.setAttribute('x', String(x + (slotW - 2) / 2));
    statusText.setAttribute('y', String(startY + 32));
    statusText.setAttribute('fill', colors.stroke);
    statusText.setAttribute('font-size', '8');
    statusText.setAttribute('text-anchor', 'middle');
    statusText.textContent = slot.status === 'readahead-mark' ? 'RA' : slot.status;
    container.appendChild(statusText);
  }

  // Readahead window info
  if (state.readaheadWindow) {
    const raY = startY + slotH + 20;
    const raRect = document.createElementNS(ns, 'rect');
    raRect.setAttribute('x', '20');
    raRect.setAttribute('y', String(raY));
    raRect.setAttribute('width', String(width - 40));
    raRect.setAttribute('height', '35');
    raRect.setAttribute('rx', '4');
    raRect.setAttribute('fill', '#2a2a3a');
    raRect.setAttribute('stroke', '#6666aa');
    container.appendChild(raRect);

    const raText = document.createElementNS(ns, 'text');
    raText.setAttribute('x', '30');
    raText.setAttribute('y', String(raY + 22));
    raText.setAttribute('fill', '#8888cc');
    raText.setAttribute('font-size', '11');
    raText.textContent = `Readahead Window: start=${state.readaheadWindow.start} size=${state.readaheadWindow.size} async_size=${state.readaheadWindow.asyncSize}`;
    container.appendChild(raText);
  }

  // Folio info
  if (state.folioInfo) {
    const fY = height - 60;
    const fRect = document.createElementNS(ns, 'rect');
    fRect.setAttribute('x', '20');
    fRect.setAttribute('y', String(fY));
    fRect.setAttribute('width', String(width - 40));
    fRect.setAttribute('height', '30');
    fRect.setAttribute('rx', '4');
    fRect.setAttribute('fill', '#3a2a4a');
    fRect.setAttribute('stroke', '#8844cc');
    container.appendChild(fRect);

    const fText = document.createElementNS(ns, 'text');
    fText.setAttribute('x', '30');
    fText.setAttribute('y', String(fY + 20));
    fText.setAttribute('fill', '#cc88ff');
    fText.setAttribute('font-size', '11');
    fText.textContent = `Folio: ${state.folioInfo.address}  uptodate: ${state.folioInfo.uptodate}`;
    container.appendChild(fText);
  }

  // Phase indicator
  const phaseColors: Record<string, string> = {
    'entry': '#ff4444',
    'lookup': '#ffaa44',
    'cache-hit': '#44ff88',
    'cache-miss': '#ff4466',
    'readahead-calc': '#44aaff',
    'readahead-submit': '#4488ff',
    'folio-alloc': '#ff8844',
    'io-submit': '#8844ff',
    'copy-to-user': '#44ffdd',
    'async-trigger': '#ffdd44',
    'completed': '#44ff44',
  };
  const phaseRect = document.createElementNS(ns, 'rect');
  phaseRect.setAttribute('x', String(width - 140));
  phaseRect.setAttribute('y', '15');
  phaseRect.setAttribute('width', '120');
  phaseRect.setAttribute('height', '24');
  phaseRect.setAttribute('rx', '12');
  phaseRect.setAttribute('fill', phaseColors[state.phase] ?? '#888888');
  phaseRect.setAttribute('opacity', '0.3');
  container.appendChild(phaseRect);

  const phaseText = document.createElementNS(ns, 'text');
  phaseText.setAttribute('x', String(width - 80));
  phaseText.setAttribute('y', '32');
  phaseText.setAttribute('fill', phaseColors[state.phase] ?? '#888888');
  phaseText.setAttribute('font-size', '11');
  phaseText.setAttribute('font-weight', 'bold');
  phaseText.setAttribute('text-anchor', 'middle');
  phaseText.textContent = state.phase;
  container.appendChild(phaseText);
}

// ----- Module -----

const pageCacheReadahead: AnimationModule = {
  config: {
    id: 'page-cache-readahead',
    title: 'Page Cache and Readahead',
    skillName: 'page-cache-and-readahead',
  },

  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario) {
      case 'readahead-window':
        return generateReadaheadWindow();
      case 'cache-miss-and-read':
        return generateCacheMissAndRead();
      case 'page-cache-hit':
      default:
        return generatePageCacheHit();
    }
  },

  renderFrame,
  getScenarios: () => SCENARIOS,
};

export default pageCacheReadahead;

import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

export interface Ext4State {
  extentTree: {
    depth: number;
    levels: Array<{ type: 'header' | 'index' | 'leaf'; entries: Array<{ block: number; len: number }> }>;
  };
  journalState: {
    transactionId: number;
    state: 'idle' | 'running' | 'committing' | 'committed' | 'checkpointed';
    dirtyBuffers: number;
  };
  currentFunction: string;
  phase: 'map-blocks' | 'find-extent' | 'walk-tree' | 'found' | 'allocate' | 'insert-extent' | 'split' | 'journal-start' | 'journal-access' | 'journal-dirty' | 'journal-stop' | 'journal-commit';
  srcRef: string;
}

function cloneState(state: Ext4State): Ext4State {
  return {
    ...state,
    extentTree: {
      depth: state.extentTree.depth,
      levels: state.extentTree.levels.map(l => ({
        ...l,
        entries: l.entries.map(e => ({ ...e })),
      })),
    },
    journalState: { ...state.journalState },
  };
}

function buildExtentTree(): Ext4State['extentTree'] {
  return {
    depth: 2,
    levels: [
      { type: 'header', entries: [{ block: 0, len: 3 }] },
      { type: 'index', entries: [{ block: 1000, len: 1 }, { block: 5000, len: 1 }, { block: 9000, len: 1 }] },
      { type: 'leaf', entries: [{ block: 1000, len: 512 }, { block: 5000, len: 256 }, { block: 9000, len: 128 }] },
    ],
  };
}

function buildInsertionTree(): Ext4State['extentTree'] {
  return {
    depth: 2,
    levels: [
      { type: 'header', entries: [{ block: 0, len: 2 }] },
      { type: 'index', entries: [{ block: 1000, len: 1 }, { block: 5000, len: 1 }] },
      { type: 'leaf', entries: [{ block: 1000, len: 512 }, { block: 5000, len: 256 }] },
    ],
  };
}

// ---- Scenario 1: Extent Tree Lookup ----

function generateExtentTreeLookupFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: Ext4State = {
    extentTree: buildExtentTree(),
    journalState: { transactionId: 0, state: 'idle', dirtyBuffers: 0 },
    currentFunction: 'ext4_map_blocks',
    phase: 'map-blocks',
    srcRef: 'fs/ext4/inode.c:696',
  };

  // Frame 0: ext4_map_blocks entry
  frames.push({
    step: 0,
    label: 'ext4_map_blocks() entry',
    description: `ext4_map_blocks() (fs/ext4/inode.c:696) is the top-level block mapping function. It receives a handle_t, inode, and ext4_map_blocks struct containing m_lblk (logical block) and m_len (length). First it checks the extent status tree via ext4_es_lookup_extent() (fs/ext4/inode.c:734). On a cache miss, it calls the extent-based mapper ext4_ext_map_blocks().`,
    highlights: ['ext4_map_blocks'],
    data: cloneState(state),
  });

  // Frame 1: ext4_es_lookup_extent cache check
  state.currentFunction = 'ext4_es_lookup_extent';
  state.srcRef = 'fs/ext4/inode.c:734';
  frames.push({
    step: 1,
    label: 'ext4_es_lookup_extent() cache miss',
    description: `ext4_es_lookup_extent() (fs/ext4/inode.c:734) searches the in-memory extent status tree (a red-black tree of struct extent_status) for a cached mapping of the requested logical block. If the extent status entry covers the block and is marked written (ext4_es_is_written), the physical block is returned immediately without touching on-disk extents. In this scenario, we simulate a cache miss, so control falls through to ext4_ext_map_blocks().`,
    highlights: ['es-tree'],
    data: cloneState(state),
  });

  // Frame 2: Enter ext4_ext_map_blocks
  state.currentFunction = 'ext4_ext_map_blocks';
  state.phase = 'find-extent';
  state.srcRef = 'fs/ext4/extents.c:4269';
  frames.push({
    step: 2,
    label: 'ext4_ext_map_blocks() begins extent lookup',
    description: `ext4_ext_map_blocks() (fs/ext4/extents.c:4269) is the core extent-based block mapper. It traces ext4_ext_map_blocks_enter (line 4283), then calls ext4_find_extent() (line 4286) to walk the on-disk B-tree. The extent tree root is stored in the inode's i_data[] area as an ext4_extent_header (eh_magic=0xF30A, eh_entries, eh_max, eh_depth, eh_generation).`,
    highlights: ['header'],
    data: cloneState(state),
  });

  // Frame 3: ext4_find_extent starts
  state.currentFunction = 'ext4_find_extent';
  state.srcRef = 'fs/ext4/extents.c:886';
  frames.push({
    step: 3,
    label: 'ext4_find_extent() reads extent header',
    description: `ext4_find_extent() (fs/ext4/extents.c:886) allocates an ext4_ext_path array (line 918) with depth+2 entries. It reads the root extent header via ext_inode_hdr(inode) (line 900), getting depth = ext_depth(inode) (line 901). Path[0].p_hdr points to the root header. If depth==0 and EXT4_EX_NOCACHE is not set, ext4_cache_extents() pre-populates the extent status tree (line 928).`,
    highlights: ['header', 'path-0'],
    data: cloneState(state),
  });

  // Frame 4: Walk index level via binary search
  state.phase = 'walk-tree';
  state.srcRef = 'fs/ext4/extents.c:934';
  frames.push({
    step: 4,
    label: 'Binary search at index level (depth=1)',
    description: `The while(i) loop (fs/ext4/extents.c:930) walks from root toward leaf. At each internal level, ext4_ext_binsearch_idx() (line 934) performs binary search on ext4_extent_idx entries to find the child block containing the target logical block. path[ppos].p_block = ext4_idx_pblock(path[ppos].p_idx) (line 935) extracts the physical block number. Then read_extent_tree_block() (line 939) reads the child block from disk via __read_extent_tree_block() which calls ext4_read_bh_nowait().`,
    highlights: ['index', 'path-1'],
    data: cloneState(state),
  });

  // Frame 5: Walk to leaf level
  state.srcRef = 'fs/ext4/extents.c:956';
  frames.push({
    step: 5,
    label: 'Binary search at leaf level (depth=0)',
    description: `After descending to the leaf block, ext4_ext_binsearch() (fs/ext4/extents.c:956) performs binary search on ext4_extent entries. Each ext4_extent contains ee_block (logical start), ee_len (length, 15 bits + unwritten flag in MSB), and ee_start_hi:ee_start_lo (48-bit physical block). If the target block falls within an extent's range, path[ppos].p_ext points to it and path[ppos].p_block = ext4_ext_pblock(ex) (line 959).`,
    highlights: ['leaf', 'path-2'],
    data: cloneState(state),
  });

  // Frame 6: Extent found - check coverage
  state.phase = 'found';
  state.currentFunction = 'ext4_ext_map_blocks';
  state.srcRef = 'fs/ext4/extents.c:4324';
  frames.push({
    step: 6,
    label: 'Extent found: in_range() check',
    description: `Back in ext4_ext_map_blocks(), ex = path[depth].p_ext (line 4308). The code checks in_range(map->m_lblk, ee_block, ee_len) (fs/ext4/extents.c:4324). If the requested logical block falls within the extent, newblock = m_lblk - ee_block + ee_start (line 4325), and allocated = ee_len - (m_lblk - ee_block) (line 4327). For initialized extents, map->m_flags |= EXT4_MAP_MAPPED (line 4343) and the physical block is set in map->m_pblk.`,
    highlights: ['leaf', 'extent-match'],
    data: cloneState(state),
  });

  // Frame 7: Return mapped blocks
  state.srcRef = 'fs/ext4/extents.c:4538';
  frames.push({
    step: 7,
    label: 'ext4_ext_map_blocks() returns mapped block',
    description: `ext4_ext_map_blocks() traces ext4_ext_map_blocks_exit (fs/ext4/extents.c:4538), then returns the number of mapped blocks. Control returns to ext4_map_blocks() (fs/ext4/inode.c:696) which caches the result in the extent status tree via ext4_es_insert_extent() if it was not a cache hit. The VFS layer now has the physical block number to submit the I/O.`,
    highlights: ['ext4_map_blocks'],
    data: cloneState(state),
  });

  // Frame 8: Summary
  state.srcRef = 'fs/ext4/inode.c:696';
  frames.push({
    step: 8,
    label: 'Block mapping complete',
    description: `The extent tree lookup is complete. ext4_find_extent() (fs/ext4/extents.c:886) walked the B-tree: root header (depth=2) -> ext4_ext_binsearch_idx() at index level -> read_extent_tree_block() to load child -> ext4_ext_binsearch() at leaf -> found extent covering requested block. The physical block mapping is cached in the extent status tree for future fast lookups.`,
    highlights: [],
    data: cloneState(state),
  });

  return frames;
}

// ---- Scenario 2: Extent Insertion ----

function generateExtentInsertionFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: Ext4State = {
    extentTree: buildInsertionTree(),
    journalState: { transactionId: 42, state: 'running', dirtyBuffers: 0 },
    currentFunction: 'ext4_da_write_begin',
    phase: 'map-blocks',
    srcRef: 'fs/ext4/inode.c:3115',
  };

  // Frame 0: ext4_da_write_begin entry
  frames.push({
    step: 0,
    label: 'ext4_da_write_begin() delayed allocation write',
    description: `ext4_da_write_begin() (fs/ext4/inode.c:3115) handles buffered write page preparation. It checks ext4_nonda_switch() (line 3131) to see if the filesystem should fall back to non-delayed allocation. For delayed allocation, it calls ext4_da_reserve_space() to reserve data blocks and metadata, then grabs a folio. The actual block allocation is deferred until writeback calls ext4_map_blocks() with the CREATE flag.`,
    highlights: ['write-begin'],
    data: cloneState(state),
  });

  // Frame 1: ext4_map_blocks with CREATE
  state.currentFunction = 'ext4_map_blocks';
  state.srcRef = 'fs/ext4/inode.c:696';
  frames.push({
    step: 1,
    label: 'ext4_map_blocks() with EXT4_GET_BLOCKS_CREATE',
    description: `During writeback, ext4_map_blocks() (fs/ext4/inode.c:696) is called with flags containing EXT4_GET_BLOCKS_CREATE. The extent status tree lookup (ext4_es_lookup_extent, line 734) shows a delayed extent (ext4_es_is_delayed). Since actual allocation is needed, control passes to ext4_ext_map_blocks() (fs/ext4/extents.c:4269) with the CREATE flag to allocate physical blocks and insert a new extent.`,
    highlights: ['ext4_map_blocks'],
    data: cloneState(state),
  });

  // Frame 2: ext4_ext_map_blocks - find current extent
  state.currentFunction = 'ext4_ext_map_blocks';
  state.phase = 'find-extent';
  state.srcRef = 'fs/ext4/extents.c:4286';
  frames.push({
    step: 2,
    label: 'ext4_find_extent() locates insertion point',
    description: `ext4_ext_map_blocks() (fs/ext4/extents.c:4269) calls ext4_find_extent() (line 4286) to locate where the new extent should be inserted. The B-tree walk descends from root header through index nodes to the leaf level. Since the requested logical block has no existing extent (no in_range match at line 4324), the code falls through to the allocation path. The path array now points to the leaf node where insertion will occur.`,
    highlights: ['header', 'index'],
    data: cloneState(state),
  });

  // Frame 3: Walk tree
  state.currentFunction = 'ext4_find_extent';
  state.phase = 'walk-tree';
  state.srcRef = 'fs/ext4/extents.c:930';
  frames.push({
    step: 3,
    label: 'Tree walk: index -> leaf (no matching extent)',
    description: `ext4_find_extent() (fs/ext4/extents.c:886) walks the tree. ext4_ext_binsearch_idx() (line 934) finds the index entry, read_extent_tree_block() (line 939) loads the leaf block. ext4_ext_binsearch() (line 956) finds the nearest extent but in_range() returns false -- there is a hole at the requested logical block. path[depth].p_ext points to the nearest extent (or NULL for an empty leaf).`,
    highlights: ['leaf'],
    data: cloneState(state),
  });

  // Frame 4: Prepare allocation request
  state.currentFunction = 'ext4_ext_map_blocks';
  state.phase = 'allocate';
  state.srcRef = 'fs/ext4/extents.c:4435';
  frames.push({
    step: 4,
    label: 'Prepare ext4_allocation_request',
    description: `ext4_ext_map_blocks() builds an ext4_allocation_request: ar.inode, ar.goal = ext4_ext_find_goal() (fs/ext4/extents.c:4436), ar.logical = map->m_lblk, ar.len computed from cluster alignment (line 4447). For regular files, ar.flags = EXT4_MB_HINT_DATA (line 4451). The cluster offset calculation (EXT4_LBLK_COFF, line 4446) ensures physical allocation aligns to cluster boundaries for bigalloc filesystems.`,
    highlights: ['alloc-request'],
    data: cloneState(state),
  });

  // Frame 5: ext4_mb_new_blocks
  state.currentFunction = 'ext4_mb_new_blocks';
  state.srcRef = 'fs/ext4/extents.c:4461';
  frames.push({
    step: 5,
    label: 'ext4_mb_new_blocks() allocates physical blocks',
    description: `ext4_mb_new_blocks() (called at fs/ext4/extents.c:4461, defined at fs/ext4/mballoc.c:6235) is the multiblock allocator entry point. It searches buddy bitmaps for free clusters matching the allocation request. On success, newblock contains the starting physical block and ar.len the allocated cluster count. allocated_clusters = ar.len (line 4464), then ar.len is converted to blocks via EXT4_C2B (line 4465).`,
    highlights: ['mballoc'],
    data: cloneState(state),
  });

  // Frame 6: Build newex and insert
  state.currentFunction = 'ext4_ext_insert_extent';
  state.phase = 'insert-extent';
  state.srcRef = 'fs/ext4/extents.c:1992';
  state.extentTree.levels[2].entries.push({ block: 7000, len: 64 });
  frames.push({
    step: 6,
    label: 'ext4_ext_insert_extent() inserts new extent',
    description: `The allocated block is stored: ext4_ext_store_pblock(&newex, pblk) (fs/ext4/extents.c:4474), newex.ee_len set (line 4475). Then ext4_ext_insert_extent() (fs/ext4/extents.c:1992, called at line 4482) attempts to merge with adjacent extents first (ext4_ext_try_to_merge, line 2054). If no merge is possible, it finds the insertion position in the leaf's sorted extent array via binary search, shifts existing entries, and stores the new ext4_extent. If the leaf is full (eh_entries == eh_max), it calls ext4_ext_create_new_leaf() to split.`,
    highlights: ['leaf', 'new-extent'],
    data: cloneState(state),
  });

  // Frame 7: Update extent status tree
  state.currentFunction = 'ext4_ext_map_blocks';
  state.srcRef = 'fs/ext4/extents.c:4538';
  frames.push({
    step: 7,
    label: 'ext4_ext_map_blocks() returns with new mapping',
    description: `ext4_ext_map_blocks() sets map->m_flags |= EXT4_MAP_NEW|EXT4_MAP_MAPPED, map->m_pblk = newblock (fs/ext4/extents.c:4474). It traces ext4_ext_map_blocks_exit (line 4538) and returns. Back in ext4_map_blocks() (fs/ext4/inode.c:696), the new mapping is inserted into the extent status tree via ext4_es_insert_extent(). The journal transaction records the modified inode and extent tree blocks.`,
    highlights: ['ext4_map_blocks'],
    data: cloneState(state),
  });

  // Frame 8: Split extent scenario note
  state.phase = 'split';
  state.srcRef = 'fs/ext4/extents.c:3191';
  frames.push({
    step: 8,
    label: 'Extent splitting (when leaf is full)',
    description: `If the leaf node is full during insertion, ext4_ext_create_new_leaf() calls ext4_ext_split_extent_at() (fs/ext4/extents.c:3191) to split the tree. This allocates a new block for the split node, copies half the entries, updates parent index entries, and may propagate splits up the tree. The split creates a new ext4_extent_idx in the parent pointing to the new leaf. In extreme cases, the tree depth increases via ext4_ext_grow_indepth() when the root overflows.`,
    highlights: ['split'],
    data: cloneState(state),
  });

  return frames;
}

// ---- Scenario 3: JBD2 Journal Commit ----

function generateJbd2JournalCommitFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: Ext4State = {
    extentTree: buildExtentTree(),
    journalState: { transactionId: 100, state: 'idle', dirtyBuffers: 0 },
    currentFunction: 'ext4_journal_start',
    phase: 'journal-start',
    srcRef: 'fs/ext4/ext4_jbd2.h:225',
  };

  // Frame 0: ext4_journal_start macro
  frames.push({
    step: 0,
    label: 'ext4_journal_start() begins transaction',
    description: `ext4_journal_start() (fs/ext4/ext4_jbd2.h:225) is a macro that expands to __ext4_journal_start() (fs/ext4/ext4_jbd2.h:237), which calls __ext4_journal_start_sb() (fs/ext4/ext4_jbd2.c:92). This function checks if the journal is present (ext4_handle_valid), then calls jbd2_journal_start() (fs/jbd2/transaction.c:538) with the number of blocks the transaction will modify (nblocks). The caller estimates credits needed for the metadata operation.`,
    highlights: ['journal-start'],
    data: cloneState(state),
  });

  // Frame 1: jbd2_journal_start
  state.currentFunction = 'jbd2_journal_start';
  state.journalState.state = 'running';
  state.srcRef = 'fs/jbd2/transaction.c:538';
  frames.push({
    step: 1,
    label: 'jbd2_journal_start() allocates handle',
    description: `jbd2_journal_start() (fs/jbd2/transaction.c:538) calls jbd2__journal_start() (line 540) which allocates a handle_t and attaches it to the current running transaction. If no transaction is running, start_this_handle() creates one via jbd2_get_transaction() which transitions the journal state machine. The handle's h_total_credits tracks how many journal blocks this handle may use. The transaction's t_outstanding_credits is incremented atomically.`,
    highlights: ['handle'],
    data: cloneState(state),
  });

  // Frame 2: Modify metadata - get write access
  state.currentFunction = 'jbd2_journal_get_write_access';
  state.phase = 'journal-access';
  state.srcRef = 'fs/jbd2/transaction.c:1212';
  frames.push({
    step: 2,
    label: 'jbd2_journal_get_write_access() on buffer',
    description: `Before modifying any metadata buffer (extent tree block, inode table block, etc.), the caller must call jbd2_journal_get_write_access() (fs/jbd2/transaction.c:1212). This checks is_handle_aborted() (line 1218), verifies the fs device has no write errors via jbd2_check_fs_dev_write_error() (line 1222), then calls do_get_write_access() which may need to copy the buffer's current contents to the journal's frozen data area if the buffer belongs to a committing transaction.`,
    highlights: ['buffer-access'],
    data: cloneState(state),
  });

  // Frame 3: Second buffer access
  state.journalState.dirtyBuffers = 1;
  state.srcRef = 'fs/jbd2/transaction.c:1212';
  frames.push({
    step: 3,
    label: 'jbd2_journal_get_write_access() on inode table block',
    description: `A second call to jbd2_journal_get_write_access() (fs/jbd2/transaction.c:1212) prepares the inode table buffer for modification. The journal_head (struct journal_head) attached to the buffer_head tracks which transaction owns it. do_get_write_access() adds the buffer to the transaction's t_buffers list (BJ_Reserved state). Each buffer access consumes one credit from the handle's h_total_credits.`,
    highlights: ['inode-buffer'],
    data: cloneState(state),
  });

  // Frame 4: Perform modifications and mark dirty
  state.currentFunction = 'jbd2_journal_dirty_metadata';
  state.phase = 'journal-dirty';
  state.journalState.dirtyBuffers = 2;
  state.srcRef = 'fs/jbd2/transaction.c:1491';
  frames.push({
    step: 4,
    label: 'jbd2_journal_dirty_metadata() marks buffers dirty',
    description: `After modifying the buffer contents (e.g., inserting an extent entry), the caller calls jbd2_journal_dirty_metadata() (fs/jbd2/transaction.c:1491) for each modified buffer. This moves the journal_head from BJ_Reserved to BJ_Metadata on the transaction's buffer list (via __jbd2_journal_file_buffer). The buffer is now tracked for writeout during commit. jh = bh2jh(bh) (line 1505) gets the journal_head, then the function verifies the buffer belongs to the current running transaction (line 1493).`,
    highlights: ['dirty-metadata'],
    data: cloneState(state),
  });

  // Frame 5: Mark second buffer dirty
  state.journalState.dirtyBuffers = 3;
  state.srcRef = 'fs/jbd2/transaction.c:1491';
  frames.push({
    step: 5,
    label: 'jbd2_journal_dirty_metadata() on inode block',
    description: `A second jbd2_journal_dirty_metadata() (fs/jbd2/transaction.c:1491) call marks the inode table block as dirty in the journal. The transaction now has multiple buffers on its t_buffers (BJ_Metadata) list. Each dirty buffer will be written to the journal area on disk during the commit phase, ensuring atomicity: either all metadata changes are committed, or none are.`,
    highlights: ['dirty-inode'],
    data: cloneState(state),
  });

  // Frame 6: jbd2_journal_stop
  state.currentFunction = 'jbd2_journal_stop';
  state.phase = 'journal-stop';
  state.srcRef = 'fs/jbd2/transaction.c:1836';
  frames.push({
    step: 6,
    label: 'jbd2_journal_stop() closes handle',
    description: `jbd2_journal_stop() (fs/jbd2/transaction.c:1836) decrements handle->h_ref (line 1844). When h_ref reaches 0, it updates the transaction's t_outstanding_credits (subtracting unused credits), checks if the transaction needs synchronous commit (handle->h_sync), and drops the handle. If the transaction has exceeded journal->j_max_transaction_buffers, it signals the kjournald2 thread to begin committing. The handle is freed but the transaction continues running.`,
    highlights: ['handle-close'],
    data: cloneState(state),
  });

  // Frame 7: jbd2_journal_commit_transaction begins
  state.currentFunction = 'jbd2_journal_commit_transaction';
  state.phase = 'journal-commit';
  state.journalState.state = 'committing';
  state.srcRef = 'fs/jbd2/commit.c:348';
  frames.push({
    step: 7,
    label: 'jbd2_journal_commit_transaction() begins commit',
    description: `jbd2_journal_commit_transaction() (fs/jbd2/commit.c:348) is called by the kjournald2 kernel thread. It transitions the transaction state to T_LOCKED, waits for all outstanding handles to close (t_updates == 0), then moves to T_FLUSH. Phase 1: write all dirty metadata buffers (BJ_Metadata list) to the journal area on disk. For each buffer, a descriptor block tag (journal_block_tag_t) records the destination block number. Phase 2: write the commit record.`,
    highlights: ['commit-phase'],
    data: cloneState(state),
  });

  // Frame 8: Commit record and checkpoint
  state.journalState.state = 'committed';
  state.journalState.dirtyBuffers = 0;
  state.srcRef = 'fs/jbd2/commit.c:348';
  frames.push({
    step: 8,
    label: 'Commit record written, transaction committed',
    description: `jbd2_journal_commit_transaction() (fs/jbd2/commit.c:348) writes the commit record (journal_commit_header with h_chksum_type and h_chksum) after all metadata blocks are on disk. The transaction transitions to T_COMMIT_DFLUSH, waits for I/O completion, then T_FINISHED. The committed buffers move to the checkpoint list. During checkpointing, the actual filesystem metadata blocks are written to their final locations. Once all buffers are checkpointed, the journal space is reclaimed for reuse.`,
    highlights: ['committed'],
    data: cloneState(state),
  });

  return frames;
}

// ---- SVG Rendering ----

const NS = 'http://www.w3.org/2000/svg';

function createRect(
  container: SVGGElement,
  x: number, y: number, w: number, h: number,
  fill: string, stroke: string, highlighted: boolean,
): SVGRectElement {
  const rect = document.createElementNS(NS, 'rect');
  rect.setAttribute('x', String(x));
  rect.setAttribute('y', String(y));
  rect.setAttribute('width', String(w));
  rect.setAttribute('height', String(h));
  rect.setAttribute('fill', fill);
  rect.setAttribute('stroke', stroke);
  rect.setAttribute('stroke-width', highlighted ? '3' : '1.5');
  rect.setAttribute('rx', '4');
  if (highlighted) rect.setAttribute('class', 'anim-highlight');
  container.appendChild(rect);
  return rect;
}

function createText(
  container: SVGGElement,
  x: number, y: number, text: string,
  opts: { anchor?: string; fill?: string; size?: string } = {},
): SVGTextElement {
  const el = document.createElementNS(NS, 'text');
  el.setAttribute('x', String(x));
  el.setAttribute('y', String(y));
  el.setAttribute('text-anchor', opts.anchor || 'middle');
  el.setAttribute('fill', opts.fill || '#eee');
  el.setAttribute('font-size', opts.size || '12');
  el.setAttribute('font-family', 'monospace');
  el.textContent = text;
  container.appendChild(el);
  return el;
}

function createLine(
  container: SVGGElement,
  x1: number, y1: number, x2: number, y2: number,
  stroke: string,
): void {
  const line = document.createElementNS(NS, 'line');
  line.setAttribute('x1', String(x1));
  line.setAttribute('y1', String(y1));
  line.setAttribute('x2', String(x2));
  line.setAttribute('y2', String(y2));
  line.setAttribute('stroke', stroke);
  line.setAttribute('stroke-width', '1.5');
  container.appendChild(line);
}

function renderExtentTree(
  container: SVGGElement,
  state: Ext4State,
  width: number,
  height: number,
  frameHighlights: string[],
): void {
  const highlightSet = new Set(frameHighlights);
  const treeTop = 40;
  const levelHeight = 70;
  const boxW = 100;
  const boxH = 32;

  // Title with optional highlight
  if (highlightSet.has(state.currentFunction)) {
    createRect(container, width / 2 - 120, 6, 240, 34, '#44475a', '#8be9fd', true);
  }
  createText(container, width / 2, 20, `${state.currentFunction}()`, { size: '14', fill: '#8be9fd' });
  createText(container, width / 2, 35, state.srcRef, { size: '10', fill: '#888' });

  // Draw extent tree levels
  for (let li = 0; li < state.extentTree.levels.length; li++) {
    const level = state.extentTree.levels[li];
    const y = treeTop + li * levelHeight + 20;
    const entries = level.entries;
    const totalWidth = entries.length * (boxW + 20) - 20;
    const startX = (width - totalWidth) / 2;

    // Level label
    const labelColors: Record<string, string> = {
      header: '#ff79c6',
      index: '#ffb86c',
      leaf: '#50fa7b',
    };
    createText(container, 40, y + boxH / 2 + 4, level.type.toUpperCase(), {
      anchor: 'start',
      fill: labelColors[level.type] || '#eee',
      size: '11',
    });

    for (let ei = 0; ei < entries.length; ei++) {
      const entry = entries[ei];
      const x = startX + ei * (boxW + 20);
      const isHighlighted = highlightSet.has(level.type) || (
        (state.phase === 'walk-tree' && li <= 1) ||
        (state.phase === 'found' && li === state.extentTree.levels.length - 1) ||
        (state.phase === 'insert-extent' && li === state.extentTree.levels.length - 1)
      );

      createRect(container, x, y, boxW, boxH,
        isHighlighted ? '#44475a' : '#282a36',
        labelColors[level.type] || '#666',
        isHighlighted,
      );
      createText(container, x + boxW / 2, y + 14, `blk:${entry.block}`, { size: '10' });
      createText(container, x + boxW / 2, y + 26, `len:${entry.len}`, { size: '10' });

      // Draw lines connecting levels
      if (li > 0) {
        const parentLevel = state.extentTree.levels[li - 1];
        const parentEntries = parentLevel.entries;
        const parentTotalWidth = parentEntries.length * (boxW + 20) - 20;
        const parentStartX = (width - parentTotalWidth) / 2;
        const parentIdx = Math.min(ei, parentEntries.length - 1);
        const px = parentStartX + parentIdx * (boxW + 20) + boxW / 2;
        const py = treeTop + (li - 1) * levelHeight + 20 + boxH;
        createLine(container, px, py, x + boxW / 2, y, '#666');
      }
    }
  }

  // Phase indicator
  const phaseY = treeTop + state.extentTree.levels.length * levelHeight + 30;
  const phaseLabels: Record<string, string> = {
    'map-blocks': 'Phase: Block Mapping',
    'find-extent': 'Phase: Finding Extent',
    'walk-tree': 'Phase: Walking B-Tree',
    'found': 'Phase: Extent Found',
    'allocate': 'Phase: Allocating Blocks',
    'insert-extent': 'Phase: Inserting Extent',
    'split': 'Phase: Tree Splitting',
  };
  createText(container, width / 2, phaseY, phaseLabels[state.phase] || state.phase, {
    size: '12',
    fill: '#f8f8f2',
  });
}

function renderJournal(
  container: SVGGElement,
  state: Ext4State,
  width: number,
  height: number,
): void {
  // Title
  createText(container, width / 2, 20, `${state.currentFunction}()`, { size: '14', fill: '#8be9fd' });
  createText(container, width / 2, 35, state.srcRef, { size: '10', fill: '#888' });

  // Transaction box
  const txX = width / 2 - 150;
  const txY = 50;
  const txW = 300;
  const txH = 60;
  const stateColors: Record<string, string> = {
    idle: '#6272a4',
    running: '#50fa7b',
    committing: '#ffb86c',
    committed: '#8be9fd',
    checkpointed: '#bd93f9',
  };
  const txColor = stateColors[state.journalState.state] || '#666';

  createRect(container, txX, txY, txW, txH, '#282a36', txColor,
    state.phase === 'journal-commit' || state.phase === 'journal-start');
  createText(container, width / 2, txY + 20, `Transaction #${state.journalState.transactionId}`, { size: '13' });
  createText(container, width / 2, txY + 38, `State: ${state.journalState.state.toUpperCase()}`, {
    size: '11', fill: txColor,
  });
  createText(container, width / 2, txY + 52, `Dirty buffers: ${state.journalState.dirtyBuffers}`, { size: '10', fill: '#888' });

  // Buffer visualization
  const bufY = txY + txH + 30;
  const bufW = 60;
  const bufH = 40;
  const bufCount = Math.max(state.journalState.dirtyBuffers, 1);
  const totalBufWidth = bufCount * (bufW + 10) - 10;
  const bufStartX = (width - totalBufWidth) / 2;

  for (let i = 0; i < bufCount; i++) {
    const isDirty = i < state.journalState.dirtyBuffers;
    createRect(container, bufStartX + i * (bufW + 10), bufY, bufW, bufH,
      isDirty ? '#44475a' : '#282a36',
      isDirty ? '#ff5555' : '#444',
      isDirty && (state.phase === 'journal-dirty' || state.phase === 'journal-access'),
    );
    createText(container, bufStartX + i * (bufW + 10) + bufW / 2, bufY + 15,
      isDirty ? 'DIRTY' : 'CLEAN', { size: '9', fill: isDirty ? '#ff5555' : '#666' });
    createText(container, bufStartX + i * (bufW + 10) + bufW / 2, bufY + 30,
      `buf${i}`, { size: '9' });
  }

  // Journal timeline
  const timeY = bufY + bufH + 40;
  const phases = ['start', 'access', 'dirty', 'stop', 'commit'];
  const phaseMap: Record<string, number> = {
    'journal-start': 0,
    'journal-access': 1,
    'journal-dirty': 2,
    'journal-stop': 3,
    'journal-commit': 4,
  };
  const activeIdx = phaseMap[state.phase] ?? -1;
  const timelineW = width - 100;
  const stepW = timelineW / (phases.length - 1);

  // Timeline line
  createLine(container, 50, timeY, 50 + timelineW, timeY, '#555');

  for (let i = 0; i < phases.length; i++) {
    const cx = 50 + i * stepW;
    const isActive = i === activeIdx;
    const isPast = i < activeIdx;
    const circle = document.createElementNS(NS, 'circle');
    circle.setAttribute('cx', String(cx));
    circle.setAttribute('cy', String(timeY));
    circle.setAttribute('r', isActive ? '8' : '6');
    circle.setAttribute('fill', isPast ? '#50fa7b' : isActive ? '#ffb86c' : '#444');
    circle.setAttribute('stroke', isActive ? '#fff' : '#666');
    circle.setAttribute('stroke-width', isActive ? '2' : '1');
    if (isActive) circle.setAttribute('class', 'anim-highlight');
    container.appendChild(circle);

    createText(container, cx, timeY + 22, phases[i], {
      size: '10',
      fill: isActive ? '#ffb86c' : isPast ? '#50fa7b' : '#888',
    });
  }
}

// ---- Module ----

const ext4ExtentJournal: AnimationModule = {
  config: {
    id: 'ext4-extent-journal',
    title: 'ext4 Extent Tree & JBD2 Journal',
    skillName: 'ext4-internals',
  },

  getScenarios(): AnimationScenario[] {
    return [
      { id: 'extent-tree-lookup', label: 'Extent Tree Lookup (read path)' },
      { id: 'extent-insertion', label: 'Extent Insertion (write path)' },
      { id: 'jbd2-journal-commit', label: 'JBD2 Journal Transaction Lifecycle' },
    ];
  },

  generateFrames(scenario?: string): AnimationFrame[] {
    const s = scenario || 'extent-tree-lookup';
    switch (s) {
      case 'extent-tree-lookup':
        return generateExtentTreeLookupFrames();
      case 'extent-insertion':
        return generateExtentInsertionFrames();
      case 'jbd2-journal-commit':
        return generateJbd2JournalCommitFrames();
      default:
        return generateExtentTreeLookupFrames();
    }
  },

  renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void {
    container.innerHTML = '';
    const state = frame.data as Ext4State;

    if (state.phase.startsWith('journal-')) {
      renderJournal(container, state, width, height);
    } else {
      renderExtentTree(container, state, width, height, frame.highlights);
    }
  },
};

export default ext4ExtentJournal;

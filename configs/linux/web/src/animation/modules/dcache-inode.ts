import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

export interface DcacheInodeState {
  phase: 'lookup' | 'hash' | 'rcu-walk' | 'hit' | 'miss' | 'slow-path' | 'negative' | 'alloc' | 'cache' | 'lru' | 'evict' | 'revalidate';
  dentryHashTable: { name: string; parent: string; inode: number | null; highlighted: boolean }[];
  inodeCache: { ino: number; state: string; refcount: number; highlighted: boolean }[];
  currentLookup: { name: string; parent: string; function: string };
  lruList: string[];
  srcRef: string;
}

function cloneState(s: DcacheInodeState): DcacheInodeState {
  return {
    phase: s.phase,
    dentryHashTable: s.dentryHashTable.map(e => ({ ...e })),
    inodeCache: s.inodeCache.map(e => ({ ...e })),
    currentLookup: { ...s.currentLookup },
    lruList: [...s.lruList],
    srcRef: s.srcRef,
  };
}

// ---------------------------------------------------------------------------
// Scenario: dcache-lookup
// Fast path dentry cache lookup via RCU-walk: lookup_fast -> __d_lookup_rcu
// ---------------------------------------------------------------------------
function generateDcacheLookup(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: DcacheInodeState = {
    phase: 'lookup',
    dentryHashTable: [
      { name: '/', parent: '', inode: 2, highlighted: false },
      { name: 'home', parent: '/', inode: 1001, highlighted: false },
      { name: 'user', parent: '/home', inode: 1050, highlighted: false },
    ],
    inodeCache: [
      { ino: 2, state: 'I_ACTIVE', refcount: 5, highlighted: false },
      { ino: 1001, state: 'I_ACTIVE', refcount: 3, highlighted: false },
      { ino: 1050, state: 'I_ACTIVE', refcount: 2, highlighted: false },
    ],
    currentLookup: { name: 'file.txt', parent: '/home/user', function: 'path_openat' },
    lruList: ['old_dentry_1', 'old_dentry_2'],
    srcRef: '',
  };

  // Frame 0: Path walk begins
  state.srcRef = 'fs/namei.c:2274 (walk_component calls lookup_fast)';
  frames.push({
    step: 0,
    label: 'Path walk reaches final component',
    description: 'The VFS path walk (path_openat -> link_path_walk) has resolved /home/user and now needs to look up "file.txt" in the parent directory. walk_component() at fs/namei.c:2274 first tries lookup_fast() for a lockless dcache lookup before falling back to the slow path.',
    highlights: ['current-lookup'],
    data: cloneState(state),
  });

  // Frame 1: lookup_fast enters RCU-walk mode
  state.phase = 'hash';
  state.currentLookup.function = 'lookup_fast';
  state.srcRef = 'fs/namei.c:1838 (lookup_fast) -> line 1848 (LOOKUP_RCU check)';
  frames.push({
    step: 1,
    label: 'lookup_fast() enters RCU-walk mode',
    description: 'lookup_fast() at fs/namei.c:1838 checks nd->flags & LOOKUP_RCU at line 1848. In RCU-walk mode, no locks are taken. The function calls __d_lookup_rcu(parent, &nd->last, &nd->next_seq) at line 1849 to search the dcache hash table without acquiring d_lock on any dentry.',
    highlights: ['hash-table'],
    data: cloneState(state),
  });

  // Frame 2: Hash computation via d_hash
  state.currentLookup.function = '__d_lookup_rcu';
  state.srcRef = 'fs/dcache.c:2299-2305 (__d_lookup_rcu) -> fs/dcache.c:117 (d_hash)';
  frames.push({
    step: 2,
    label: 'Compute hash bucket via d_hash()',
    description: '__d_lookup_rcu() at fs/dcache.c:2299 receives the parent dentry and the name qstr. It computes the hash bucket using d_hash(name->hash_len) at line 2305. d_hash() at fs/dcache.c:117 indexes into dentry_hashtable[] (line 115) using runtime_const_shift_right_32() to map the hash to a bucket in the global hash table.',
    highlights: ['hash-table'],
    data: cloneState(state),
  });

  // Frame 3: RCU hash chain walk
  state.phase = 'rcu-walk';
  state.srcRef = 'fs/dcache.c:2332-2353 (hlist_bl_for_each_entry_rcu walk)';
  frames.push({
    step: 3,
    label: 'Walk hash chain under RCU protection',
    description: '__d_lookup_rcu() walks the hash chain with hlist_bl_for_each_entry_rcu() at fs/dcache.c:2332. For each candidate dentry, it reads d_seq via raw_seqcount_begin() at line 2352 (no waiting for concurrent renames), checks d_parent matches at line 2353, verifies d_name.hash_len matches at the next comparison, and finally compares the actual name bytes.',
    highlights: ['hash-chain'],
    data: cloneState(state),
  });

  // Frame 4: Dentry found in hash table
  state.dentryHashTable.push({ name: 'file.txt', parent: '/home/user', inode: 1100, highlighted: true });
  state.srcRef = 'fs/dcache.c:2332-2365 (__d_lookup_rcu match found)';
  frames.push({
    step: 4,
    label: 'Dentry "file.txt" found in hash chain',
    description: 'The hash chain walk finds a dentry where d_parent matches, d_name.hash_len matches, and the name bytes compare equal. __d_lookup_rcu() returns this dentry along with the d_seq value at fs/dcache.c:2365. The caller (lookup_fast) must validate d_seq before using the dentry to guard against concurrent d_move() renames.',
    highlights: ['found-dentry'],
    data: cloneState(state),
  });

  // Frame 5: Seqcount validation in lookup_fast
  state.phase = 'revalidate';
  state.currentLookup.function = 'lookup_fast (validate)';
  state.srcRef = 'fs/namei.c:1860-1865 (read_seqcount_retry and d_revalidate)';
  frames.push({
    step: 5,
    label: 'Validate d_seq and revalidate dentry',
    description: 'Back in lookup_fast() at fs/namei.c:1860, read_seqcount_retry(&parent->d_seq, nd->seq) checks the parent dentry was not renamed during lookup. If the seqcount changed, -ECHILD is returned and the walk falls back to ref-walk. Otherwise, d_revalidate() at line 1863 calls the filesystem d_revalidate op (if set) to ensure the cached dentry is still valid.',
    highlights: ['found-dentry'],
    data: cloneState(state),
  });

  // Frame 6: Cache hit -- dentry returned
  state.phase = 'hit';
  state.inodeCache.push({ ino: 1100, state: 'I_ACTIVE', refcount: 1, highlighted: true });
  state.currentLookup.function = 'walk_component (hit)';
  state.srcRef = 'fs/namei.c:1864-1865 (lookup_fast returns valid dentry)';
  frames.push({
    step: 6,
    label: 'Cache HIT -- dentry returned to caller',
    description: 'd_revalidate() returns > 0 (valid), so lookup_fast() returns the dentry at fs/namei.c:1865. The dentry->d_inode points to the in-memory inode (ino 1100). No disk I/O occurred. The entire path component resolution used only RCU read-side protection -- no spinlocks, no atomic refcount increments on the fast path.',
    highlights: ['found-dentry', 'inode-entry'],
    data: cloneState(state),
  });

  // Frame 7: Dentry struct fields used
  state.currentLookup.function = 'step_into';
  state.srcRef = 'include/linux/dcache.h:92-104 (struct dentry layout)';
  frames.push({
    step: 7,
    label: 'Dentry connects name to inode',
    description: 'The returned dentry (include/linux/dcache.h:92) maps the filename to its inode: d_flags (line 94) holds cache state, d_seq (line 95) is the per-dentry seqlock for RCU, d_hash (line 96) links into the global hash table, d_parent (line 97) points to the parent directory dentry, d_name (line 99-100) stores the filename, and d_inode (line 102) points to the inode. If d_inode is NULL, it is a negative dentry.',
    highlights: ['found-dentry'],
    data: cloneState(state),
  });

  // Frame 8: Summary -- fast path performance
  state.srcRef = 'fs/dcache.c:100-121 (dentry_hashtable and d_hash)';
  frames.push({
    step: 8,
    label: 'Fast path: lockless lookup complete',
    description: 'The dcache fast path resolved "file.txt" without taking any locks. The global dentry_hashtable (fs/dcache.c:115) is sized at boot based on system memory. d_hash() at line 117 uses runtime_const_shift_right_32 for efficient bucket computation. The RCU-walk design (Documentation/filesystems/path-lookup.txt) enables millions of path lookups per second on multi-core systems by avoiding cache-line bouncing from lock/refcount operations.',
    highlights: [],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario: negative-dentry
// Failed lookup cached as negative dentry to avoid repeated disk access
// ---------------------------------------------------------------------------
function generateNegativeDentry(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: DcacheInodeState = {
    phase: 'lookup',
    dentryHashTable: [
      { name: '/', parent: '', inode: 2, highlighted: false },
      { name: 'home', parent: '/', inode: 1001, highlighted: false },
    ],
    inodeCache: [
      { ino: 2, state: 'I_ACTIVE', refcount: 5, highlighted: false },
      { ino: 1001, state: 'I_ACTIVE', refcount: 3, highlighted: false },
    ],
    currentLookup: { name: 'nonexistent.txt', parent: '/home', function: 'walk_component' },
    lruList: ['old_entry_1'],
    srcRef: '',
  };

  // Frame 0: lookup_fast misses
  state.srcRef = 'fs/namei.c:1838-1853 (lookup_fast -> __d_lookup_rcu returns NULL)';
  frames.push({
    step: 0,
    label: 'lookup_fast() misses for "nonexistent.txt"',
    description: 'walk_component() calls lookup_fast() at fs/namei.c:2274. lookup_fast() at line 1838 calls __d_lookup_rcu() which walks the hash chain at the computed bucket but finds no dentry matching "nonexistent.txt" with parent /home. __d_lookup_rcu returns NULL at fs/dcache.c:2299. lookup_fast() calls try_to_unlazy(nd) at line 1851 to drop out of RCU-walk mode, then returns NULL.',
    highlights: ['hash-table'],
    data: cloneState(state),
  });

  // Frame 1: Fall to lookup_slow
  state.phase = 'slow-path';
  state.currentLookup.function = '__lookup_slow';
  state.srcRef = 'fs/namei.c:2278 (walk_component -> lookup_slow) -> fs/namei.c:1888 (__lookup_slow)';
  frames.push({
    step: 1,
    label: 'Fall back to __lookup_slow()',
    description: 'walk_component() at fs/namei.c:2278 calls lookup_slow(&nd->last, nd->path.dentry, nd->flags). lookup_slow() at line 1925 delegates to __lookup_slow() at line 1888. __lookup_slow checks IS_DEADDIR(inode) at line 1897 then calls d_alloc_parallel(dir, name, &wq) at line 1900 to allocate a new dentry for the lookup.',
    highlights: ['current-lookup'],
    data: cloneState(state),
  });

  // Frame 2: d_alloc_parallel allocates dentry
  state.phase = 'alloc';
  state.currentLookup.function = 'd_alloc_parallel';
  state.srcRef = 'fs/dcache.c:1734-1791 (__d_alloc) -> fs/dcache.c:1817 (d_alloc)';
  frames.push({
    step: 2,
    label: 'd_alloc_parallel() allocates new dentry',
    description: 'd_alloc_parallel() calls __d_alloc() at fs/dcache.c:1734 which allocates from dentry_cache slab via kmem_cache_alloc_lru() at line 1740. The new dentry is initialized: d_inode = NULL (line 1781), d_parent = self (line 1782), d_flags from sb->s_d_flags (line 1785), hash node initialized at line 1787, LRU list at line 1788, and children list at line 1789. The dentry is marked DCACHE_PAR_LOOKUP for parallel lookup coordination.',
    highlights: ['new-dentry'],
    data: cloneState(state),
  });

  // Frame 3: Filesystem inode lookup on disk
  state.currentLookup.function = 'inode->i_op->lookup';
  state.srcRef = 'fs/namei.c:1915 (inode->i_op->lookup(inode, dentry, flags))';
  frames.push({
    step: 3,
    label: 'Filesystem lookup() reads directory on disk',
    description: '__lookup_slow() at fs/namei.c:1915 calls inode->i_op->lookup(inode, dentry, flags). For ext4, this calls ext4_lookup() which reads the parent directory blocks from disk (or buffer cache), searches the directory entries for "nonexistent.txt", and finds no match. The filesystem returns NULL to indicate "not found" -- this will become a negative dentry.',
    highlights: ['current-lookup'],
    data: cloneState(state),
  });

  // Frame 4: d_splice_alias with NULL inode
  state.phase = 'negative';
  state.currentLookup.function = 'd_splice_alias';
  state.dentryHashTable.push({ name: 'nonexistent.txt', parent: '/home', inode: null, highlighted: true });
  state.srcRef = 'fs/dcache.c:3137-3141 (d_splice_alias) -> fs/dcache.c:3063-3111 (d_splice_alias_ops)';
  frames.push({
    step: 4,
    label: 'd_splice_alias() creates negative dentry',
    description: 'The filesystem calls d_splice_alias(NULL, dentry) at fs/dcache.c:3137. Since inode is NULL, d_splice_alias_ops() at line 3063 skips to the "out" label at line 3071, calling __d_add(dentry, NULL, ops) at line 3110. __d_add() at line 2747 hashes the dentry into the dcache with d_inode = NULL. This is a negative dentry: it caches the fact that "nonexistent.txt" does not exist.',
    highlights: ['negative-dentry'],
    data: cloneState(state),
  });

  // Frame 5: d_lookup_done completes parallel lookup
  state.currentLookup.function = '__lookup_slow (done)';
  state.srcRef = 'fs/namei.c:1916 (d_lookup_done(dentry))';
  frames.push({
    step: 5,
    label: 'd_lookup_done() completes in-progress lookup',
    description: '__lookup_slow() calls d_lookup_done(dentry) at fs/namei.c:1916 to clear DCACHE_PAR_LOOKUP and wake any waiters that were blocked in d_alloc_parallel() waiting for this same name. The negative dentry is now visible to all concurrent lookups. Since old returned NULL at line 1917, the allocated dentry is returned directly.',
    highlights: ['negative-dentry'],
    data: cloneState(state),
  });

  // Frame 6: Return -ENOENT to caller
  state.currentLookup.function = 'walk_component';
  state.srcRef = 'fs/namei.c:2278-2280 (walk_component handles NULL d_inode)';
  frames.push({
    step: 6,
    label: 'Negative dentry returned: -ENOENT',
    description: 'walk_component() receives the negative dentry (d_inode == NULL). Since the dentry has no inode, the path walk fails with -ENOENT. The negative dentry remains in the dcache hash table. The next time any process looks up "/home/nonexistent.txt", lookup_fast() -> __d_lookup_rcu() will find this dentry, see d_inode == NULL, and return -ENOENT immediately without reading the disk.',
    highlights: ['negative-dentry'],
    data: cloneState(state),
  });

  // Frame 7: Subsequent fast-path negative hit
  state.phase = 'hit';
  state.currentLookup.function = 'lookup_fast (negative hit)';
  state.srcRef = 'fs/namei.c:1849 (__d_lookup_rcu finds negative dentry)';
  frames.push({
    step: 7,
    label: 'Next lookup: fast-path negative cache hit',
    description: 'On the next access to "/home/nonexistent.txt", lookup_fast() at fs/namei.c:1849 calls __d_lookup_rcu() which finds the negative dentry in the hash chain. The dentry d_inode is NULL, confirming the file does not exist. No filesystem or disk I/O is needed. Negative dentries are tracked by nr_dentry_negative (fs/dcache.c:144) and can be reclaimed under memory pressure via dentry_negative_policy (line 145).',
    highlights: ['negative-dentry'],
    data: cloneState(state),
  });

  // Frame 8: LRU and reclaim
  state.phase = 'lru';
  state.lruList.push('negative:nonexistent.txt');
  state.currentLookup.function = 'shrink_dentry_list';
  state.srcRef = 'fs/dcache.c:133-145 (dentry_stat: nr_dentry, nr_unused, nr_negative)';
  frames.push({
    step: 8,
    label: 'Negative dentry LRU and reclaim',
    description: 'Unreferenced negative dentries are placed on the superblock LRU list (sb->s_dentry_lru). dentry_stat at fs/dcache.c:133 tracks global counts: nr_dentry (total), nr_unused (unreferenced), nr_negative (unused negative). Under memory pressure, the shrinker calls prune_dcache_sb() which walks the LRU via list_lru_shrink_walk(), calling dentry_lru_isolate() to select victims. The age_limit (default 45s, line 137) provides minimum survival time.',
    highlights: ['lru-list'],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario: inode-lifecycle
// Inode allocation, caching in the hash table, and eviction
// ---------------------------------------------------------------------------
function generateInodeLifecycle(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: DcacheInodeState = {
    phase: 'lookup',
    dentryHashTable: [
      { name: '/', parent: '', inode: 2, highlighted: false },
    ],
    inodeCache: [
      { ino: 2, state: 'I_ACTIVE', refcount: 5, highlighted: false },
    ],
    currentLookup: { name: 'newfile.c', parent: '/', function: 'path_openat' },
    lruList: [],
    srcRef: '',
  };

  // Frame 0: iget_locked called
  state.srcRef = 'fs/inode.c:1452-1515 (iget_locked)';
  frames.push({
    step: 0,
    label: 'iget_locked() searches inode hash table',
    description: 'The filesystem (e.g., ext4_iget) calls iget_locked() at fs/inode.c:1452 to obtain an inode for a given inode number. iget_locked() computes the hash bucket via inode_hashtable + hash(sb, ino) at line 1454, then calls find_inode_fast() at line 1461 to search the hash chain under RCU protection. If the inode is already cached, it is returned with an incremented reference count.',
    highlights: ['inode-hash'],
    data: cloneState(state),
  });

  // Frame 1: Inode not found, allocate new
  state.phase = 'alloc';
  state.currentLookup.function = 'alloc_inode';
  state.srcRef = 'fs/inode.c:1474-1488 (iget_locked allocates new inode)';
  frames.push({
    step: 1,
    label: 'Cache miss: alloc_inode() allocates new inode',
    description: 'find_inode_fast() returns NULL -- the inode is not cached. iget_locked() calls alloc_inode(sb) at fs/inode.c:1474 which uses sb->s_op->alloc_inode() (or kmem_cache_alloc for the default). The new inode is initialized with inode_init_once(). iget_locked() then takes inode_hash_lock (line 1478) and re-checks with find_inode_fast() (line 1480) to handle races.',
    highlights: ['new-inode'],
    data: cloneState(state),
  });

  // Frame 2: Insert into hash table with I_NEW
  state.phase = 'cache';
  state.inodeCache.push({ ino: 500, state: 'I_NEW', refcount: 1, highlighted: true });
  state.currentLookup.function = 'iget_locked (insert)';
  state.srcRef = 'fs/inode.c:1482-1493 (set I_NEW, hash, add to sb list)';
  frames.push({
    step: 2,
    label: 'Insert inode into hash table with I_NEW',
    description: 'No racing insertion found. iget_locked() at fs/inode.c:1482 sets i_ino, then spin_lock(&inode->i_lock) at line 1483. inode_state_assign(inode, I_NEW) at line 1484 marks the inode as being filled in. hlist_add_head_rcu(&inode->i_hash, head) at line 1485 inserts into the hash table under RCU. inode_sb_list_add() at line 1488 adds to the superblock inode list. The inode is returned with I_NEW set.',
    highlights: ['inode-entry'],
    data: cloneState(state),
  });

  // Frame 3: Filesystem fills in inode
  state.currentLookup.function = 'ext4_read_inode (fill)';
  state.inodeCache[state.inodeCache.length - 1].state = 'I_NEW (filling)';
  state.srcRef = 'fs/inode.c:1490-1493 (caller fills in, then unlock_new_inode)';
  frames.push({
    step: 3,
    label: 'Filesystem reads inode from disk',
    description: 'The caller (ext4_iget) sees I_NEW is set and fills in the inode fields: i_mode, i_uid, i_gid, i_size, i_blocks, timestamps, extent tree pointers. Other processes calling iget_locked() for the same ino will find it in the hash table and call wait_on_new_inode() at fs/inode.c:1466 until the I_NEW flag is cleared.',
    highlights: ['inode-entry'],
    data: cloneState(state),
  });

  // Frame 4: unlock_new_inode makes it available
  state.inodeCache[state.inodeCache.length - 1].state = 'I_ACTIVE';
  state.currentLookup.function = 'unlock_new_inode';
  state.srcRef = 'fs/inode.c:1213-1222 (unlock_new_inode clears I_NEW, wakes waiters)';
  frames.push({
    step: 4,
    label: 'unlock_new_inode() activates the inode',
    description: 'unlock_new_inode() at fs/inode.c:1213 clears I_NEW from i_state and calls inode_wake_up_bit() to wake any processes blocked in wait_on_new_inode(). The inode is now fully initialized and accessible. Subsequent iget_locked() calls will find it in the hash table and return it immediately without disk I/O.',
    highlights: ['inode-entry'],
    data: cloneState(state),
  });

  // Frame 5: iput drops reference
  state.phase = 'lru';
  state.inodeCache[state.inodeCache.length - 1].refcount = 0;
  state.currentLookup.function = 'iput';
  state.srcRef = 'fs/inode.c:1972-2010 (iput)';
  frames.push({
    step: 5,
    label: 'iput() drops last reference',
    description: 'When the last user closes the file, iput() at fs/inode.c:1972 is called. atomic_add_unless(&inode->i_count, -1, 1) at line 1988 handles the fast path (count > 1). When count reaches 1, iput() takes i_lock (line 1994), decrements to 0 (line 2000), and calls iput_final() at line 2009. iput_final() at line 1916 checks op->drop_inode or inode_generic_drop (line 1925-1928).',
    highlights: ['inode-entry'],
    data: cloneState(state),
  });

  // Frame 6: iput_final adds to LRU
  state.lruList.push('inode:500');
  state.inodeCache[state.inodeCache.length - 1].state = 'I_LRU';
  state.currentLookup.function = 'iput_final (LRU)';
  state.srcRef = 'fs/inode.c:1930-1935 (iput_final -> __inode_lru_list_add)';
  frames.push({
    step: 6,
    label: 'iput_final() adds inode to LRU for caching',
    description: 'If i_nlink > 0 and !I_DONTCACHE and the superblock is active, iput_final() at fs/inode.c:1930-1932 keeps the inode cached by calling __inode_lru_list_add(inode, true) at line 1933. The inode stays in the hash table and on the superblock LRU list. It can be found again by iget_locked() without disk I/O. Only unreferenced inodes on the LRU are candidates for reclaim.',
    highlights: ['lru-list'],
    data: cloneState(state),
  });

  // Frame 7: Memory pressure triggers prune_icache_sb
  state.phase = 'evict';
  state.currentLookup.function = 'prune_icache_sb';
  state.srcRef = 'fs/inode.c:1023-1031 (prune_icache_sb)';
  frames.push({
    step: 7,
    label: 'Memory pressure: prune_icache_sb() reclaims inodes',
    description: 'Under memory pressure, the memory shrinker calls prune_icache_sb() at fs/inode.c:1023. It walks sb->s_inode_lru via list_lru_shrink_walk() at line 1028, calling inode_lru_isolate() for each candidate. Inodes that are unreferenced (i_count == 0), not dirty, and not recently accessed are moved to the freeable list. dispose_list() at line 1030 calls evict() on each.',
    highlights: ['lru-list'],
    data: cloneState(state),
  });

  // Frame 8: evict() destroys the inode
  state.inodeCache = state.inodeCache.filter(e => e.ino !== 500);
  state.lruList = state.lruList.filter(e => e !== 'inode:500');
  state.currentLookup.function = 'evict';
  state.srcRef = 'fs/inode.c:818-866 (evict)';
  frames.push({
    step: 8,
    label: 'evict() destroys the inode',
    description: 'evict() at fs/inode.c:818 removes the inode from the sb list (line 826), waits for writeback (line 837), calls op->evict_inode() at line 841 (or truncate_inode_pages_final + clear_inode at lines 843-844 for the default path). remove_inode_hash() at line 849 removes from the hash table. Finally destroy_inode() at line 865 returns the memory to the slab allocator. The inode is gone.',
    highlights: ['evicted'],
    data: cloneState(state),
  });

  // Frame 9: new_inode alternative path
  state.phase = 'alloc';
  state.currentLookup.function = 'new_inode';
  state.srcRef = 'fs/inode.c:1175-1183 (new_inode)';
  frames.push({
    step: 9,
    label: 'Alternative: new_inode() for file creation',
    description: 'For creating new files (not looking up existing ones), filesystems call new_inode() at fs/inode.c:1175. This calls alloc_inode(sb) at line 1179 and inode_sb_list_add() at line 1181. Unlike iget_locked(), new_inode() does NOT insert into the inode hash table -- the filesystem is responsible for hashing it later via insert_inode_hash() or d_instantiate(). new_inode() is used in mkdir, create, mknod paths.',
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
  { id: 'lookup', label: 'Lookup' },
  { id: 'hash', label: 'Hash' },
  { id: 'rcu-walk', label: 'RCU-Walk' },
  { id: 'hit', label: 'Hit' },
  { id: 'slow-path', label: 'Slow Path' },
  { id: 'negative', label: 'Negative' },
  { id: 'alloc', label: 'Alloc' },
  { id: 'cache', label: 'Cache' },
  { id: 'lru', label: 'LRU' },
  { id: 'evict', label: 'Evict' },
];

function getActivePhaseIndex(phase: string): number {
  const idx = PHASE_LABELS.findIndex(p => p.id === phase);
  if (idx >= 0) return idx;
  if (phase === 'miss') return 4;
  if (phase === 'revalidate') return 3;
  return -1;
}

function renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void {
  while (container.firstChild) container.removeChild(container.firstChild);
  const data = frame.data as DcacheInodeState;
  const margin = { top: 10, left: 15, right: 15, bottom: 10 };
  const usableWidth = width - margin.left - margin.right;

  // Title
  const title = document.createElementNS(NS, 'text');
  title.setAttribute('x', String(width / 2));
  title.setAttribute('y', '18');
  title.setAttribute('text-anchor', 'middle');
  title.setAttribute('class', 'anim-title');
  title.textContent = 'Dentry Cache & Inode Cache';
  container.appendChild(title);

  // --- Phase flow diagram ---
  const flowTop = margin.top + 28;
  const phaseCount = PHASE_LABELS.length;
  const phaseWidth = Math.min(72, (usableWidth - (phaseCount - 1) * 4) / phaseCount);
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
    label.setAttribute('font-size', '9');
    label.setAttribute('class', 'anim-cpu-label');
    label.textContent = phase.label;
    container.appendChild(label);

    if (i < phaseCount - 1) {
      const arrowX = px + phaseWidth;
      const arrowY = flowTop + phaseHeight / 2;
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', String(arrowX));
      line.setAttribute('y1', String(arrowY));
      line.setAttribute('x2', String(arrowX + 4));
      line.setAttribute('y2', String(arrowY));
      line.setAttribute('stroke', '#8b949e');
      line.setAttribute('stroke-width', '1');
      container.appendChild(line);
    }
  });

  // --- Current lookup info ---
  const lookupTop = flowTop + phaseHeight + 18;
  const lookupText = document.createElementNS(NS, 'text');
  lookupText.setAttribute('x', String(margin.left));
  lookupText.setAttribute('y', String(lookupTop));
  lookupText.setAttribute('fill', '#e6edf3');
  lookupText.setAttribute('font-size', '11');
  lookupText.setAttribute('class', 'anim-cpu-label');
  lookupText.textContent = `Lookup: "${data.currentLookup.name}" in ${data.currentLookup.parent} [${data.currentLookup.function}]`;
  container.appendChild(lookupText);

  // --- Dentry hash table ---
  const hashTop = lookupTop + 18;
  const hashLabel = document.createElementNS(NS, 'text');
  hashLabel.setAttribute('x', String(margin.left));
  hashLabel.setAttribute('y', String(hashTop));
  hashLabel.setAttribute('class', 'anim-cpu-label');
  hashLabel.textContent = 'Dentry Hash Table:';
  container.appendChild(hashLabel);

  const entryHeight = 18;
  const entryWidth = Math.min(200, usableWidth / 2 - 10);

  data.dentryHashTable.forEach((entry, i) => {
    const ey = hashTop + 8 + i * (entryHeight + 2);
    const ex = margin.left;
    const isNegative = entry.inode === null;

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(ex));
    rect.setAttribute('y', String(ey));
    rect.setAttribute('width', String(entryWidth));
    rect.setAttribute('height', String(entryHeight));
    rect.setAttribute('rx', '3');
    rect.setAttribute('fill', isNegative ? '#3d1f1f' : entry.highlighted ? '#1f4068' : '#21262d');
    let cls = 'anim-hash-entry';
    if (entry.highlighted) cls += ' anim-highlight';
    rect.setAttribute('class', cls);
    container.appendChild(rect);

    const text = document.createElementNS(NS, 'text');
    text.setAttribute('x', String(ex + 4));
    text.setAttribute('y', String(ey + entryHeight / 2 + 4));
    text.setAttribute('fill', isNegative ? '#f85149' : '#e6edf3');
    text.setAttribute('font-size', '9');
    text.setAttribute('class', 'anim-hash-entry');
    const inodeStr = isNegative ? 'NULL (negative)' : `ino=${entry.inode}`;
    text.textContent = `${entry.parent}/${entry.name} -> ${inodeStr}`;
    container.appendChild(text);
  });

  // --- Inode cache ---
  const inodeLeft = margin.left + entryWidth + 20;
  const inodeTop = hashTop;
  const inodeLabel = document.createElementNS(NS, 'text');
  inodeLabel.setAttribute('x', String(inodeLeft));
  inodeLabel.setAttribute('y', String(inodeTop));
  inodeLabel.setAttribute('class', 'anim-cpu-label');
  inodeLabel.textContent = 'Inode Cache:';
  container.appendChild(inodeLabel);

  const inodeEntryWidth = Math.min(180, usableWidth / 2 - 10);

  data.inodeCache.forEach((entry, i) => {
    const iy = inodeTop + 8 + i * (entryHeight + 2);

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(inodeLeft));
    rect.setAttribute('y', String(iy));
    rect.setAttribute('width', String(inodeEntryWidth));
    rect.setAttribute('height', String(entryHeight));
    rect.setAttribute('rx', '3');
    rect.setAttribute('fill', entry.highlighted ? '#1f4068' : '#21262d');
    let cls = 'anim-inode';
    if (entry.highlighted) cls += ' anim-highlight';
    rect.setAttribute('class', cls);
    container.appendChild(rect);

    const text = document.createElementNS(NS, 'text');
    text.setAttribute('x', String(inodeLeft + 4));
    text.setAttribute('y', String(iy + entryHeight / 2 + 4));
    text.setAttribute('fill', '#e6edf3');
    text.setAttribute('font-size', '9');
    text.setAttribute('class', 'anim-inode');
    text.textContent = `ino=${entry.ino} [${entry.state}] ref=${entry.refcount}`;
    container.appendChild(text);
  });

  // --- LRU list ---
  if (data.lruList.length > 0) {
    const lruTop = hashTop + 8 + Math.max(data.dentryHashTable.length, data.inodeCache.length) * (entryHeight + 2) + 14;
    const lruLabel = document.createElementNS(NS, 'text');
    lruLabel.setAttribute('x', String(margin.left));
    lruLabel.setAttribute('y', String(lruTop));
    lruLabel.setAttribute('class', 'anim-cpu-label');
    lruLabel.textContent = 'LRU List:';
    container.appendChild(lruLabel);

    data.lruList.forEach((entry, i) => {
      const ly = lruTop + 8 + i * (entryHeight + 2);
      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', String(margin.left));
      rect.setAttribute('y', String(ly));
      rect.setAttribute('width', String(entryWidth));
      rect.setAttribute('height', String(entryHeight));
      rect.setAttribute('rx', '3');
      rect.setAttribute('fill', '#2d1f00');
      let cls = 'anim-lru-entry';
      if (frame.highlights.includes('lru-list')) cls += ' anim-highlight';
      rect.setAttribute('class', cls);
      container.appendChild(rect);

      const text = document.createElementNS(NS, 'text');
      text.setAttribute('x', String(margin.left + 4));
      text.setAttribute('y', String(ly + entryHeight / 2 + 4));
      text.setAttribute('fill', '#e6edf3');
      text.setAttribute('font-size', '9');
      text.setAttribute('class', 'anim-lru-entry');
      text.textContent = entry;
      container.appendChild(text);
    });
  }
}

// ---------------------------------------------------------------------------
// Module export
// ---------------------------------------------------------------------------
const SCENARIOS: AnimationScenario[] = [
  { id: 'dcache-lookup', label: 'Dcache Lookup Fast Path' },
  { id: 'negative-dentry', label: 'Negative Dentry Caching' },
  { id: 'inode-lifecycle', label: 'Inode Allocation & Eviction' },
];

const dcacheInode: AnimationModule = {
  config: {
    id: 'dcache-inode',
    title: 'Dentry Cache & Inode Cache',
    skillName: 'dcache-and-inode-cache',
  },
  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario) {
      case 'negative-dentry': return generateNegativeDentry();
      case 'inode-lifecycle': return generateInodeLifecycle();
      case 'dcache-lookup':
      default: return generateDcacheLookup();
    }
  },
  renderFrame,
  getScenarios: () => SCENARIOS,
};

export default dcacheInode;

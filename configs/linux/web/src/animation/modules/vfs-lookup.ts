import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

export interface DentryNode {
  id: string;
  name: string;
  parentId: string | null;
  inDcache: boolean;
  isMountpoint: boolean;
  isSymlink: boolean;
  state: 'idle' | 'looking-up' | 'found' | 'miss' | 'created';
}

export interface VfsWalkState {
  path: string;
  components: string[];
  currentComponent: number;
  mode: 'rcu-walk' | 'ref-walk';
  dentryTree: DentryNode[];
  currentDentryId: string;
  mountPoints: Array<{ dentryId: string; fsType: string }>;
  dcacheLookups: number;
  dcacheHits: number;
  dcacheMisses: number;
  phase: 'init' | 'walking' | 'lookup-fast' | 'lookup-slow' | 'mount-crossing' | 'complete';
  srcRef: string;
}

function cloneDentryTree(tree: DentryNode[]): DentryNode[] {
  return tree.map(d => ({ ...d }));
}

function cloneState(state: VfsWalkState): VfsWalkState {
  return {
    ...state,
    components: [...state.components],
    dentryTree: cloneDentryTree(state.dentryTree),
    mountPoints: state.mountPoints.map(m => ({ ...m })),
  };
}

// Build a dentry tree for /home/user/file.txt (all cached)
function buildDcacheHitTree(): DentryNode[] {
  return [
    { id: 'root', name: '/', parentId: null, inDcache: true, isMountpoint: false, isSymlink: false, state: 'idle' },
    { id: 'home', name: 'home', parentId: 'root', inDcache: true, isMountpoint: false, isSymlink: false, state: 'idle' },
    { id: 'user', name: 'user', parentId: 'home', inDcache: true, isMountpoint: false, isSymlink: false, state: 'idle' },
    { id: 'file.txt', name: 'file.txt', parentId: 'user', inDcache: true, isMountpoint: false, isSymlink: false, state: 'idle' },
  ];
}

// Build a dentry tree for /home/user/newfile.txt where newfile.txt is NOT cached
function buildDcacheMissTree(): DentryNode[] {
  return [
    { id: 'root', name: '/', parentId: null, inDcache: true, isMountpoint: false, isSymlink: false, state: 'idle' },
    { id: 'home', name: 'home', parentId: 'root', inDcache: true, isMountpoint: false, isSymlink: false, state: 'idle' },
    { id: 'user', name: 'user', parentId: 'home', inDcache: true, isMountpoint: false, isSymlink: false, state: 'idle' },
    // newfile.txt intentionally absent from dcache
  ];
}

// Build a dentry tree for /mnt/usb/data with mount crossing at /mnt/usb
function buildMountCrossingTree(): DentryNode[] {
  return [
    { id: 'root', name: '/', parentId: null, inDcache: true, isMountpoint: false, isSymlink: false, state: 'idle' },
    { id: 'mnt', name: 'mnt', parentId: 'root', inDcache: true, isMountpoint: false, isSymlink: false, state: 'idle' },
    { id: 'usb', name: 'usb', parentId: 'mnt', inDcache: true, isMountpoint: true, isSymlink: false, state: 'idle' },
    { id: 'usb-root', name: '/', parentId: null, inDcache: true, isMountpoint: false, isSymlink: false, state: 'idle' },
    { id: 'data', name: 'data', parentId: 'usb-root', inDcache: true, isMountpoint: false, isSymlink: false, state: 'idle' },
  ];
}

function generateDcacheHitFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const path = '/home/user/file.txt';
  const components = ['home', 'user', 'file.txt'];
  const tree = buildDcacheHitTree();

  const state: VfsWalkState = {
    path,
    components,
    currentComponent: -1,
    mode: 'rcu-walk',
    dentryTree: tree,
    currentDentryId: 'root',
    mountPoints: [],
    dcacheLookups: 0,
    dcacheHits: 0,
    dcacheMisses: 0,
    phase: 'init',
    srcRef: 'fs/namei.c:2831',
  };

  // Frame 0: filename_lookup -> path_lookupat initializes nameidata
  frames.push({
    step: 0,
    label: 'filename_lookup() calls path_lookupat()',
    description: `filename_lookup() (fs/namei.c:2831) is the top-level entry point. It calls path_lookupat() (fs/namei.c:2798), which allocates struct nameidata (fs/namei.c:723) on the stack and sets nd->path.dentry to the root dentry (struct dentry, include/linux/dcache.h:92) via set_root() (fs/namei.c:1100). Walk mode is LOOKUP_RCU for lockless dcache traversal.`,
    highlights: ['root'],
    data: cloneState(state),
  });

  // Frame 1: Enter link_path_walk
  state.phase = 'walking';
  state.currentComponent = 0;
  state.srcRef = 'fs/namei.c:2575';
  frames.push({
    step: 1,
    label: 'link_path_walk() begins component iteration',
    description: `link_path_walk() (fs/namei.c:2575) splits the path into components: ${components.map(c => `"${c}"`).join(', ')}. It loops calling walk_component() (fs/namei.c:2262) for each component. For non-final components it passes WALK_MORE (fs/namei.c:2653); the final component gets WALK_TRAILING (fs/namei.c:2786).`,
    highlights: ['root'],
    data: cloneState(state),
  });

  // For each component: walk_component -> lookup_fast -> __d_lookup_rcu -> dcache HIT
  for (let i = 0; i < components.length; i++) {
    const comp = components[i];
    const dentryId = tree[i + 1].id;
    const parentId = i === 0 ? 'root' : tree[i].id;

    // Show walk_component -> lookup_fast call
    state.phase = 'lookup-fast';
    state.currentComponent = i;
    state.dcacheLookups++;
    state.srcRef = 'fs/namei.c:1839';

    const lookingUpTree = cloneDentryTree(state.dentryTree);
    const lookingUpNode = lookingUpTree.find(d => d.id === dentryId);
    if (lookingUpNode) lookingUpNode.state = 'looking-up';

    frames.push({
      step: frames.length,
      label: `walk_component("${comp}") -> lookup_fast()`,
      description: `walk_component() (fs/namei.c:2262) calls lookup_fast() (fs/namei.c:1839). In RCU-walk mode, lookup_fast() calls __d_lookup_rcu() (fs/dcache.c:2299) which performs a lockless hash table lookup using hash(parent="${parentId}", name="${comp}"). No atomic refcount operations -- RCU read-side critical section only.`,
      highlights: [dentryId],
      data: { ...cloneState(state), dentryTree: lookingUpTree },
    });

    // Show dcache HIT
    state.dcacheHits++;
    state.currentDentryId = dentryId;
    state.srcRef = 'fs/dcache.c:2299';

    const foundTree = cloneDentryTree(state.dentryTree);
    const foundNode = foundTree.find(d => d.id === dentryId);
    if (foundNode) foundNode.state = 'found';

    frames.push({
      step: frames.length,
      label: `__d_lookup_rcu("${parentId}", "${comp}") -> dcache HIT`,
      description: `__d_lookup_rcu() (fs/dcache.c:2299) finds "${comp}" in the dcache hash table. It validates the dentry's d_seq seqcount to ensure no concurrent modification. Hit count: ${state.dcacheHits}/${state.dcacheLookups}. No locks taken, no d_count incremented -- pure RCU read-side traversal. handle_mounts() (fs/namei.c:1723) checks d_flags but no mount is present here.`,
      highlights: [dentryId],
      data: { ...cloneState(state), dentryTree: foundTree, phase: 'walking' as const },
    });

    state.phase = 'walking';
  }

  // Final frame: complete
  state.phase = 'complete';
  state.currentComponent = components.length - 1;
  state.srcRef = 'fs/namei.c:2798';

  const finalTree = cloneDentryTree(state.dentryTree);
  const finalNode = finalTree.find(d => d.id === 'file.txt');
  if (finalNode) finalNode.state = 'found';

  frames.push({
    step: frames.length,
    label: 'path_lookupat() returns 0 -- all dcache hits',
    description: `path_lookupat() (fs/namei.c:2798) completes successfully. The path "${path}" was resolved entirely in RCU-walk mode with ${state.dcacheHits} dcache hits and 0 misses. This is the fastest path through VFS: no locks, no blocking, no disk I/O. filename_lookup() (fs/namei.c:2831) copies the result into the caller's struct path.`,
    highlights: ['file.txt'],
    data: { ...cloneState(state), dentryTree: finalTree },
  });

  return frames;
}

function generateDcacheMissFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const path = '/home/user/newfile.txt';
  const components = ['home', 'user', 'newfile.txt'];
  const tree = buildDcacheMissTree();

  const state: VfsWalkState = {
    path,
    components,
    currentComponent: -1,
    mode: 'rcu-walk',
    dentryTree: tree,
    currentDentryId: 'root',
    mountPoints: [],
    dcacheLookups: 0,
    dcacheHits: 0,
    dcacheMisses: 0,
    phase: 'init',
    srcRef: 'fs/namei.c:2831',
  };

  // Frame 0: Initialize
  frames.push({
    step: 0,
    label: 'filename_lookup() calls path_lookupat()',
    description: `filename_lookup() (fs/namei.c:2831) enters path_lookupat() (fs/namei.c:2798). Starts in RCU-walk mode (LOOKUP_RCU) at root dentry "/". struct nameidata (fs/namei.c:723) is initialized on the stack. This scenario shows what happens when __d_lookup_rcu() misses -- the slow path via lookup_slow() (fs/namei.c:1926).`,
    highlights: ['root'],
    data: cloneState(state),
  });

  // Frame 1: Start walking
  state.phase = 'walking';
  state.currentComponent = 0;
  state.srcRef = 'fs/namei.c:2575';
  frames.push({
    step: 1,
    label: 'link_path_walk() begins: "home" / "user" / "newfile.txt"',
    description: `link_path_walk() (fs/namei.c:2575) iterates through path components. The first two ("home", "user") are cached and will be resolved via __d_lookup_rcu() (fs/dcache.c:2299). "newfile.txt" is not in the dcache and will trigger the slow path.`,
    highlights: ['root'],
    data: cloneState(state),
  });

  // Cached components: home, user
  const cachedComponents = ['home', 'user'];
  for (let i = 0; i < cachedComponents.length; i++) {
    const comp = cachedComponents[i];
    const dentryId = tree[i + 1].id;

    state.phase = 'lookup-fast';
    state.currentComponent = i;
    state.dcacheLookups++;
    state.dcacheHits++;
    state.currentDentryId = dentryId;
    state.srcRef = 'fs/dcache.c:2299';

    const foundTree = cloneDentryTree(state.dentryTree);
    const foundNode = foundTree.find(d => d.id === dentryId);
    if (foundNode) foundNode.state = 'found';

    frames.push({
      step: frames.length,
      label: `__d_lookup_rcu("${comp}") -> dcache HIT (RCU-walk)`,
      description: `walk_component() (fs/namei.c:2262) calls lookup_fast() (fs/namei.c:1839), which calls __d_lookup_rcu() (fs/dcache.c:2299). "${comp}" is found in the dcache hash table. d_seq validation passes. Continuing in RCU-walk mode. Hits: ${state.dcacheHits}/${state.dcacheLookups}.`,
      highlights: [dentryId],
      data: { ...cloneState(state), dentryTree: foundTree, phase: 'walking' as const },
    });

    state.phase = 'walking';
  }

  // Now: newfile.txt - dcache MISS
  state.currentComponent = 2;
  state.phase = 'lookup-fast';
  state.dcacheLookups++;
  state.srcRef = 'fs/namei.c:1839';

  frames.push({
    step: frames.length,
    label: 'lookup_fast("newfile.txt") -> dcache MISS',
    description: `walk_component() (fs/namei.c:2262) calls lookup_fast() (fs/namei.c:1839). __d_lookup_rcu() (fs/dcache.c:2299) searches the dcache hash table for (parent="user", name="newfile.txt") but finds no matching dentry. The miss means RCU-walk cannot continue -- walk_component() must fall through to the slow path at fs/namei.c:2279.`,
    highlights: ['user'],
    data: { ...cloneState(state), dcacheMisses: state.dcacheMisses + 1 },
  });

  state.dcacheMisses++;

  // Transition RCU-walk -> REF-walk via try_to_unlazy
  state.mode = 'ref-walk';
  state.srcRef = 'fs/namei.c:930';

  frames.push({
    step: frames.length,
    label: 'try_to_unlazy() -> RCU-walk to REF-walk transition',
    description: `try_to_unlazy() (fs/namei.c:930) transitions from RCU-walk to REF-walk. It takes a refcount on the current dentry and vfsmount, calls legitimize_links() (fs/namei.c:882) to validate the path so far, then drops rcu_read_unlock(). This is more expensive -- atomic refcount operations contend on multi-core -- but necessary because lookup_slow() may block.`,
    highlights: ['user'],
    data: cloneState(state),
  });

  // lookup_slow -> filesystem lookup
  state.phase = 'lookup-slow';
  state.srcRef = 'fs/namei.c:1926';

  frames.push({
    step: frames.length,
    label: 'lookup_slow() -> inode->i_op->lookup()',
    description: `lookup_slow() (fs/namei.c:1926) calls __lookup_slow() (fs/namei.c:1889) which takes i_rwsem on the parent directory inode and calls d_alloc_parallel() (fs/dcache.c:2597) to allocate a new dentry. Then the filesystem's inode->i_op->lookup(dir_inode, dentry, flags) reads the directory data from the page cache (or disk) to search for "newfile.txt".`,
    highlights: ['user'],
    data: cloneState(state),
  });

  // New dentry created and inserted into dcache
  const newDentry: DentryNode = {
    id: 'newfile.txt',
    name: 'newfile.txt',
    parentId: 'user',
    inDcache: true,
    isMountpoint: false,
    isSymlink: false,
    state: 'created',
  };
  state.dentryTree.push(newDentry);
  state.currentDentryId = 'newfile.txt';
  state.srcRef = 'fs/dcache.c:3137';

  frames.push({
    step: frames.length,
    label: 'New dentry created via d_splice_alias()',
    description: `d_alloc_parallel() (fs/dcache.c:2597) allocated a new dentry for "newfile.txt". The filesystem's lookup returns the inode, and d_splice_alias() (fs/dcache.c:3137) inserts it into the dcache hash table. Future lookups of this path will find it via __d_lookup_rcu() (fs/dcache.c:2299). The dentry is linked: parent="user", name="newfile.txt", inode=<resolved>.`,
    highlights: ['newfile.txt'],
    data: cloneState(state),
  });

  // Complete
  state.phase = 'complete';
  state.srcRef = 'fs/namei.c:2798';

  frames.push({
    step: frames.length,
    label: 'path_lookupat() complete -- slow path recovery',
    description: `path_lookupat() (fs/namei.c:2798) completes. Stats: ${state.dcacheHits} dcache hits, ${state.dcacheMisses} miss. The miss forced try_to_unlazy() (fs/namei.c:930) to transition RCU->REF-walk and lookup_slow() (fs/namei.c:1926) to call into the filesystem. Next time "${path}" is accessed, all components will be in the dcache and the entire lookup stays in the fast RCU-walk path.`,
    highlights: ['newfile.txt'],
    data: cloneState(state),
  });

  return frames;
}

function generateMountCrossingFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const path = '/mnt/usb/data';
  const components = ['mnt', 'usb', 'data'];
  const tree = buildMountCrossingTree();
  const mountPoints = [{ dentryId: 'usb', fsType: 'vfat' }];

  const state: VfsWalkState = {
    path,
    components,
    currentComponent: -1,
    mode: 'rcu-walk',
    dentryTree: tree,
    currentDentryId: 'root',
    mountPoints,
    dcacheLookups: 0,
    dcacheHits: 0,
    dcacheMisses: 0,
    phase: 'init',
    srcRef: 'fs/namei.c:2831',
  };

  // Frame 0: Initialize
  frames.push({
    step: 0,
    label: 'filename_lookup() calls path_lookupat()',
    description: `filename_lookup() (fs/namei.c:2831) enters path_lookupat() (fs/namei.c:2798). Starts in RCU-walk mode at root dentry "/" (struct dentry, include/linux/dcache.h:92). This scenario demonstrates mount point crossing: when walk_component() encounters a dentry with DCACHE_MOUNTED (include/linux/dcache.h:210), handle_mounts() (fs/namei.c:1723) follows it to the mounted filesystem.`,
    highlights: ['root'],
    data: cloneState(state),
  });

  // Frame 1: Begin walking
  state.phase = 'walking';
  state.currentComponent = 0;
  state.srcRef = 'fs/namei.c:2575';
  frames.push({
    step: 1,
    label: 'link_path_walk() begins: "mnt" / "usb" / "data"',
    description: `link_path_walk() (fs/namei.c:2575) iterates through components. When walk_component() (fs/namei.c:2262) resolves "usb", handle_mounts() (fs/namei.c:1723) will detect DCACHE_MOUNTED and call __follow_mount_rcu() (fs/namei.c:1682) to switch to the mounted filesystem's dentry tree.`,
    highlights: ['root'],
    data: cloneState(state),
  });

  // Lookup "mnt" -- cached, normal
  state.phase = 'lookup-fast';
  state.currentComponent = 0;
  state.dcacheLookups++;
  state.dcacheHits++;
  state.currentDentryId = 'mnt';
  state.srcRef = 'fs/dcache.c:2299';

  const mntFoundTree = cloneDentryTree(state.dentryTree);
  const mntNode = mntFoundTree.find(d => d.id === 'mnt');
  if (mntNode) mntNode.state = 'found';

  frames.push({
    step: frames.length,
    label: '__d_lookup_rcu("/", "mnt") -> dcache HIT',
    description: `walk_component() (fs/namei.c:2262) calls lookup_fast() (fs/namei.c:1839), which calls __d_lookup_rcu() (fs/dcache.c:2299). "mnt" is found in the dcache. handle_mounts() (fs/namei.c:1723) checks d_flags -- no DCACHE_MOUNTED flag is set, so no mount crossing. Standard RCU-walk dcache hit.`,
    highlights: ['mnt'],
    data: { ...cloneState(state), dentryTree: mntFoundTree, phase: 'walking' as const },
  });

  // Lookup "usb" -- cached, but is a mountpoint
  state.phase = 'lookup-fast';
  state.currentComponent = 1;
  state.dcacheLookups++;
  state.dcacheHits++;
  state.currentDentryId = 'usb';
  state.srcRef = 'fs/namei.c:1723';

  const usbFoundTree = cloneDentryTree(state.dentryTree);
  const usbNode = usbFoundTree.find(d => d.id === 'usb');
  if (usbNode) usbNode.state = 'found';

  frames.push({
    step: frames.length,
    label: '__d_lookup_rcu("mnt", "usb") -> dcache HIT (DCACHE_MOUNTED)',
    description: `lookup_fast() (fs/namei.c:1839) finds "usb" via __d_lookup_rcu() (fs/dcache.c:2299). However, d_flags has DCACHE_MOUNTED set (include/linux/dcache.h:210). handle_mounts() (fs/namei.c:1723) detects this and must follow the mount to the mounted filesystem's root dentry.`,
    highlights: ['usb'],
    data: { ...cloneState(state), dentryTree: usbFoundTree, phase: 'walking' as const },
  });

  // Mount crossing: __follow_mount_rcu
  state.phase = 'mount-crossing';
  state.currentDentryId = 'usb-root';
  state.srcRef = 'fs/namei.c:1682';

  frames.push({
    step: frames.length,
    label: '__follow_mount_rcu() -> switch to mounted vfat filesystem',
    description: `handle_mounts() (fs/namei.c:1723) calls __follow_mount_rcu() (fs/namei.c:1682). It looks up the mount hash table using (parent_vfsmount, dentry) to find the child vfsmount for the vfat filesystem. nd->path.mnt switches to the vfat mount and nd->path.dentry switches to the mounted filesystem's root dentry. All done under RCU -- no locks.`,
    highlights: ['usb', 'usb-root'],
    data: cloneState(state),
  });

  // Now on mounted filesystem
  state.phase = 'walking';
  state.currentComponent = 2;
  state.srcRef = 'fs/namei.c:2575';

  frames.push({
    step: frames.length,
    label: 'Continuing walk on mounted vfat filesystem',
    description: `After __follow_mount_rcu() (fs/namei.c:1682), nd->path now points to the vfat filesystem's root dentry and vfsmount. link_path_walk() (fs/namei.c:2575) continues with the remaining component "data". The same walk_component()/lookup_fast() code (fs/namei.c:2262, fs/namei.c:1839) works regardless of the underlying filesystem type -- this is the VFS abstraction.`,
    highlights: ['usb-root'],
    data: cloneState(state),
  });

  // Lookup "data" on mounted filesystem
  state.phase = 'lookup-fast';
  state.currentComponent = 2;
  state.dcacheLookups++;
  state.dcacheHits++;
  state.currentDentryId = 'data';
  state.srcRef = 'fs/dcache.c:2299';

  const dataFoundTree = cloneDentryTree(state.dentryTree);
  const dataNode = dataFoundTree.find(d => d.id === 'data');
  if (dataNode) dataNode.state = 'found';

  frames.push({
    step: frames.length,
    label: '__d_lookup_rcu("usb-root", "data") -> dcache HIT (on vfat)',
    description: `Now walking on the mounted vfat filesystem. lookup_fast() (fs/namei.c:1839) calls __d_lookup_rcu() (fs/dcache.c:2299) which finds "data" in the dcache. The dcache is a single global hash table (fs/dcache.c:2387) -- the (parent, name) hash naturally separates dentries across filesystems because parent dentries differ per mount.`,
    highlights: ['data'],
    data: { ...cloneState(state), dentryTree: dataFoundTree, phase: 'walking' as const },
  });

  // Complete
  state.phase = 'complete';
  state.currentComponent = 2;
  state.srcRef = 'fs/namei.c:2798';

  frames.push({
    step: frames.length,
    label: 'path_lookupat() returns 0 -- mount crossing successful',
    description: `path_lookupat() (fs/namei.c:2798) completes. The path "${path}" crossed from rootfs to the vfat filesystem mounted at /mnt/usb. __follow_mount_rcu() (fs/namei.c:1682) handled the transition seamlessly in RCU-walk mode. Dcache stats: ${state.dcacheHits} hits, ${state.dcacheMisses} misses. No locks needed for the entire lookup.`,
    highlights: ['data'],
    data: cloneState(state),
  });

  return frames;
}

const SCENARIOS: AnimationScenario[] = [
  { id: 'dcache-hit', label: 'Dcache Hit (RCU-walk Fast Path)' },
  { id: 'dcache-miss-slow-path', label: 'Dcache Miss (REF-walk Slow Path)' },
  { id: 'mount-crossing', label: 'Mount Point Crossing' },
];

const NS = 'http://www.w3.org/2000/svg';

function renderDentryTree(
  container: SVGGElement,
  tree: DentryNode[],
  highlights: string[],
  centerX: number,
  topY: number,
  treeWidth: number,
  mountPoints: Array<{ dentryId: string; fsType: string }>,
): void {
  // Build parent->children map
  const childrenOf = new Map<string | null, DentryNode[]>();
  for (const node of tree) {
    const parent = node.parentId;
    if (!childrenOf.has(parent)) childrenOf.set(parent, []);
    childrenOf.get(parent)!.push(node);
  }

  // Layout: BFS from roots
  const roots = childrenOf.get(null) || [];
  const nodePositions = new Map<string, { x: number; y: number }>();
  const boxW = 80;
  const boxH = 30;
  const levelHeight = 55;
  const mountPointIds = new Set(mountPoints.map(m => m.dentryId));

  // Separate root filesystem tree and mounted filesystem trees
  let rootOffsetX = 0;
  for (let ri = 0; ri < roots.length; ri++) {
    const root = roots[ri];
    const subtreeNodes: Array<{ node: DentryNode; depth: number }> = [];
    const queue: Array<{ node: DentryNode; depth: number }> = [{ node: root, depth: 0 }];

    while (queue.length > 0) {
      const item = queue.shift()!;
      subtreeNodes.push(item);
      const children = childrenOf.get(item.node.id) || [];
      for (const child of children) {
        queue.push({ node: child, depth: item.depth + 1 });
      }
    }

    // Group by depth
    const byDepth = new Map<number, DentryNode[]>();
    for (const { node, depth } of subtreeNodes) {
      if (!byDepth.has(depth)) byDepth.set(depth, []);
      byDepth.get(depth)!.push(node);
    }

    const maxDepth = Math.max(...Array.from(byDepth.keys()));
    const subtreeBaseX = centerX - treeWidth / 2 + rootOffsetX;

    for (let d = 0; d <= maxDepth; d++) {
      const nodesAtDepth = byDepth.get(d) || [];
      const levelWidth = nodesAtDepth.length * (boxW + 20);
      const startX = subtreeBaseX + (treeWidth / roots.length - levelWidth) / 2;

      for (let ni = 0; ni < nodesAtDepth.length; ni++) {
        const n = nodesAtDepth[ni];
        const x = startX + ni * (boxW + 20);
        const y = topY + d * levelHeight;
        nodePositions.set(n.id, { x, y });
      }
    }

    rootOffsetX += treeWidth / roots.length;
  }

  // Draw connections
  for (const node of tree) {
    if (node.parentId && nodePositions.has(node.parentId) && nodePositions.has(node.id)) {
      const parentPos = nodePositions.get(node.parentId)!;
      const childPos = nodePositions.get(node.id)!;

      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', String(parentPos.x + boxW / 2));
      line.setAttribute('y1', String(parentPos.y + boxH));
      line.setAttribute('x2', String(childPos.x + boxW / 2));
      line.setAttribute('y2', String(childPos.y));
      line.setAttribute('class', 'anim-block');
      line.setAttribute('stroke', '#666');
      line.setAttribute('stroke-width', '1.5');
      container.appendChild(line);
    }
  }

  // Draw mount crossing arrows
  for (const mp of mountPoints) {
    const mpPos = nodePositions.get(mp.dentryId);
    // Find the root of the mounted fs
    const mountedRoot = tree.find(d => d.parentId === null && d.id !== 'root');
    if (mpPos && mountedRoot) {
      const mountedRootPos = nodePositions.get(mountedRoot.id);
      if (mountedRootPos) {
        const arrow = document.createElementNS(NS, 'line');
        arrow.setAttribute('x1', String(mpPos.x + boxW));
        arrow.setAttribute('y1', String(mpPos.y + boxH / 2));
        arrow.setAttribute('x2', String(mountedRootPos.x));
        arrow.setAttribute('y2', String(mountedRootPos.y + boxH / 2));
        arrow.setAttribute('stroke', '#e67e22');
        arrow.setAttribute('stroke-width', '2');
        arrow.setAttribute('stroke-dasharray', '5,3');
        arrow.setAttribute('marker-end', 'url(#arrowhead)');
        container.appendChild(arrow);

        // Mount label
        const label = document.createElementNS(NS, 'text');
        const midX = (mpPos.x + boxW + mountedRootPos.x) / 2;
        const midY = (mpPos.y + mountedRootPos.y) / 2 + boxH / 2 - 5;
        label.setAttribute('x', String(midX));
        label.setAttribute('y', String(midY));
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('class', 'anim-block-label');
        label.setAttribute('fill', '#e67e22');
        label.textContent = mp.fsType;
        container.appendChild(label);
      }
    }
  }

  // Draw dentry boxes
  for (const node of tree) {
    const pos = nodePositions.get(node.id);
    if (!pos) continue;

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(pos.x));
    rect.setAttribute('y', String(pos.y));
    rect.setAttribute('width', String(boxW));
    rect.setAttribute('height', String(boxH));
    rect.setAttribute('rx', '4');

    let cls = 'anim-block';
    if (node.state === 'found' || node.state === 'created') cls += ' anim-block-allocated';
    else if (node.state === 'looking-up') cls += ' anim-block-free';
    else if (node.state === 'miss') cls += ' anim-block-free';
    else cls += ' anim-block-free';

    if (highlights.includes(node.id)) cls += ' anim-highlight';
    if (mountPointIds.has(node.id)) cls += ' anim-block-allocated';
    rect.setAttribute('class', cls);
    container.appendChild(rect);

    // Node name label
    const text = document.createElementNS(NS, 'text');
    text.setAttribute('x', String(pos.x + boxW / 2));
    text.setAttribute('y', String(pos.y + boxH / 2 + 4));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('class', 'anim-block-label');
    text.textContent = node.name;
    container.appendChild(text);
  }
}

function renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void {
  while (container.firstChild) container.removeChild(container.firstChild);

  const data = frame.data as VfsWalkState;
  const margin = { top: 10, right: 10, bottom: 10, left: 10 };

  // Arrowhead marker definition (for mount crossing)
  const defs = document.createElementNS(NS, 'defs');
  const marker = document.createElementNS(NS, 'marker');
  marker.setAttribute('id', 'arrowhead');
  marker.setAttribute('markerWidth', '10');
  marker.setAttribute('markerHeight', '7');
  marker.setAttribute('refX', '10');
  marker.setAttribute('refY', '3.5');
  marker.setAttribute('orient', 'auto');
  const arrowPath = document.createElementNS(NS, 'polygon');
  arrowPath.setAttribute('points', '0 0, 10 3.5, 0 7');
  arrowPath.setAttribute('fill', '#e67e22');
  marker.appendChild(arrowPath);
  defs.appendChild(marker);
  container.appendChild(defs);

  // Title
  const titleEl = document.createElementNS(NS, 'text');
  titleEl.setAttribute('x', String(width / 2));
  titleEl.setAttribute('y', String(margin.top + 14));
  titleEl.setAttribute('text-anchor', 'middle');
  titleEl.setAttribute('class', 'anim-title');
  titleEl.textContent = 'VFS Path Lookup';
  container.appendChild(titleEl);

  // Path display with current component highlighted (top-left area)
  const pathY = margin.top + 40;
  const pathLabel = document.createElementNS(NS, 'text');
  pathLabel.setAttribute('x', String(margin.left + 10));
  pathLabel.setAttribute('y', String(pathY));
  pathLabel.setAttribute('class', 'anim-block-label');
  pathLabel.textContent = 'Path: ';
  container.appendChild(pathLabel);

  // Render path components
  let pathX = margin.left + 55;
  const slashText = document.createElementNS(NS, 'text');
  slashText.setAttribute('x', String(pathX));
  slashText.setAttribute('y', String(pathY));
  slashText.setAttribute('class', 'anim-block-label');
  slashText.textContent = '/';
  container.appendChild(slashText);
  pathX += 10;

  for (let i = 0; i < data.components.length; i++) {
    const comp = data.components[i];
    const compText = document.createElementNS(NS, 'text');
    compText.setAttribute('x', String(pathX));
    compText.setAttribute('y', String(pathY));

    if (i === data.currentComponent) {
      compText.setAttribute('class', 'anim-block-label anim-highlight');
      compText.setAttribute('fill', '#e74c3c');
      compText.setAttribute('font-weight', 'bold');
    } else if (i < data.currentComponent) {
      compText.setAttribute('class', 'anim-block-label');
      compText.setAttribute('fill', '#27ae60');
    } else {
      compText.setAttribute('class', 'anim-block-label');
      compText.setAttribute('fill', '#999');
    }

    compText.textContent = comp;
    container.appendChild(compText);
    pathX += comp.length * 8 + 5;

    if (i < data.components.length - 1) {
      const sep = document.createElementNS(NS, 'text');
      sep.setAttribute('x', String(pathX));
      sep.setAttribute('y', String(pathY));
      sep.setAttribute('class', 'anim-block-label');
      sep.textContent = '/';
      container.appendChild(sep);
      pathX += 12;
    }
  }

  // Right side info panel
  const panelX = width - 180;
  const panelY = margin.top + 35;

  // Mode indicator
  const modeLabel = document.createElementNS(NS, 'text');
  modeLabel.setAttribute('x', String(panelX));
  modeLabel.setAttribute('y', String(panelY));
  modeLabel.setAttribute('class', 'anim-block-label');
  modeLabel.textContent = `Mode: ${data.mode === 'rcu-walk' ? 'RCU-walk' : 'REF-walk'}`;
  container.appendChild(modeLabel);

  // Mode box
  const modeBox = document.createElementNS(NS, 'rect');
  modeBox.setAttribute('x', String(panelX - 5));
  modeBox.setAttribute('y', String(panelY - 14));
  modeBox.setAttribute('width', '170');
  modeBox.setAttribute('height', '20');
  modeBox.setAttribute('rx', '3');
  modeBox.setAttribute('class', data.mode === 'rcu-walk' ? 'anim-block anim-block-free' : 'anim-block anim-block-allocated');
  modeBox.setAttribute('opacity', '0.3');
  container.appendChild(modeBox);

  // Dcache stats
  const statsY = panelY + 25;
  const statsLabel = document.createElementNS(NS, 'text');
  statsLabel.setAttribute('x', String(panelX));
  statsLabel.setAttribute('y', String(statsY));
  statsLabel.setAttribute('class', 'anim-block-label');
  statsLabel.textContent = `Dcache hits: ${data.dcacheHits}`;
  container.appendChild(statsLabel);

  const missLabel = document.createElementNS(NS, 'text');
  missLabel.setAttribute('x', String(panelX));
  missLabel.setAttribute('y', String(statsY + 18));
  missLabel.setAttribute('class', 'anim-block-label');
  missLabel.textContent = `Dcache misses: ${data.dcacheMisses}`;
  container.appendChild(missLabel);

  const phaseLabel = document.createElementNS(NS, 'text');
  phaseLabel.setAttribute('x', String(panelX));
  phaseLabel.setAttribute('y', String(statsY + 36));
  phaseLabel.setAttribute('class', 'anim-block-label');
  phaseLabel.textContent = `Phase: ${data.phase}`;
  container.appendChild(phaseLabel);

  // Source reference
  const srcRefLabel = document.createElementNS(NS, 'text');
  srcRefLabel.setAttribute('x', String(panelX));
  srcRefLabel.setAttribute('y', String(statsY + 54));
  srcRefLabel.setAttribute('class', 'anim-block-label');
  srcRefLabel.setAttribute('fill', '#888');
  srcRefLabel.textContent = `Src: ${data.srcRef}`;
  container.appendChild(srcRefLabel);

  // Center: Dentry tree visualization
  const treeTopY = margin.top + 65;
  const treeWidth = width - 220;
  renderDentryTree(container, data.dentryTree, frame.highlights, treeWidth / 2 + margin.left, treeTopY, treeWidth, data.mountPoints);

  // Bottom: Step description
  const descY = height - margin.bottom - 15;
  const descBg = document.createElementNS(NS, 'rect');
  descBg.setAttribute('x', String(margin.left));
  descBg.setAttribute('y', String(descY - 14));
  descBg.setAttribute('width', String(width - margin.left - margin.right));
  descBg.setAttribute('height', '22');
  descBg.setAttribute('rx', '3');
  descBg.setAttribute('class', 'anim-block');
  descBg.setAttribute('opacity', '0.15');
  container.appendChild(descBg);

  const descText = document.createElementNS(NS, 'text');
  descText.setAttribute('x', String(margin.left + 5));
  descText.setAttribute('y', String(descY));
  descText.setAttribute('class', 'anim-block-label');
  // Truncate long labels for the bottom bar
  const shortLabel = frame.label.length > 90 ? frame.label.substring(0, 87) + '...' : frame.label;
  descText.textContent = shortLabel;
  container.appendChild(descText);
}

const vfsLookup: AnimationModule = {
  config: {
    id: 'vfs-lookup',
    title: 'VFS Path Lookup',
    skillName: 'vfs-layer',
  },

  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario) {
      case 'dcache-miss-slow-path':
        return generateDcacheMissFrames();
      case 'mount-crossing':
        return generateMountCrossingFrames();
      case 'dcache-hit':
      default:
        return generateDcacheHitFrames();
    }
  },

  renderFrame,
  getScenarios: () => SCENARIOS,
};

export default vfsLookup;

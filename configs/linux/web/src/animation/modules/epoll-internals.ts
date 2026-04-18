import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

/**
 * epoll-internals Animation Module
 *
 * Traces the EXACT implementation from fs/eventpoll.c:
 *   - do_epoll_create() (line 2167) -> ep_alloc() (line 1146)
 *   - do_epoll_ctl() (line 2236) -> ep_insert() (line 1564)
 *   - ep_poll_callback() (line 1247) -> ready list addition
 *   - ep_poll() (line 1936) -> ep_send_events() (line 1763)
 *
 * Key data structures (from fs/eventpoll.c):
 *   struct eventpoll (line 179): main epoll instance with RB tree, ready list, wait queue
 *   struct epitem (line 131): one monitored fd, stored in RB tree, linked into rdllist
 *   struct eppoll_entry (line 108): links epitem to target file's wait queue
 */

/* ---------- State interface ---------- */

export interface EpollState {
  epollFd: number;
  rbTreeItems: Array<{ fd: number; events: string }>;
  readyList: number[];
  waitingThreads: string[];
  currentFunction: string;
  phase: 'create' | 'ctl-add' | 'ctl-mod' | 'ctl-del' | 'wait' | 'callback' | 'send-events' | 'return';
  triggerMode: 'level' | 'edge';
  srcRef: string;
}

/* ---------- Helpers ---------- */

function cloneState(s: EpollState): EpollState {
  return {
    epollFd: s.epollFd,
    rbTreeItems: s.rbTreeItems.map(item => ({ ...item })),
    readyList: [...s.readyList],
    waitingThreads: [...s.waitingThreads],
    currentFunction: s.currentFunction,
    phase: s.phase,
    triggerMode: s.triggerMode,
    srcRef: s.srcRef,
  };
}

function makeInitialState(): EpollState {
  return {
    epollFd: -1,
    rbTreeItems: [],
    readyList: [],
    waitingThreads: [],
    currentFunction: '',
    phase: 'create',
    triggerMode: 'level',
    srcRef: '',
  };
}

/* ========================================================================
 * Scenario 1: epoll-create-and-add
 *
 * Traces: epoll_create1() -> do_epoll_create() -> ep_alloc()
 *         epoll_ctl(EPOLL_CTL_ADD) -> do_epoll_ctl() -> ep_insert()
 *         -> ep_rbtree_insert() -> ep_item_poll() -> ep_ptable_queue_proc()
 * ======================================================================== */

function generateCreateAndAdd(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state = makeInitialState();

  // Frame 0: epoll_create1 syscall entry
  state.currentFunction = 'SYSCALL_DEFINE1(epoll_create1)';
  state.srcRef = 'fs/eventpoll.c:2198 SYSCALL_DEFINE1(epoll_create1, int, flags) -> do_epoll_create(flags)';
  frames.push({
    step: 0,
    label: 'epoll_create1() syscall entry',
    description: 'Userspace calls epoll_create1(EPOLL_CLOEXEC). The syscall handler at fs/eventpoll.c:2198 (SYSCALL_DEFINE1(epoll_create1)) simply forwards to do_epoll_create(flags). The flags parameter is validated: only EPOLL_CLOEXEC (== O_CLOEXEC) is permitted, any other bit returns -EINVAL.',
    highlights: ['syscall-entry'],
    data: cloneState(state),
  });

  // Frame 1: do_epoll_create validates and calls ep_alloc
  state.currentFunction = 'do_epoll_create';
  state.srcRef = 'fs/eventpoll.c:2167-2180 do_epoll_create() -> ep_alloc(&ep)';
  frames.push({
    step: 1,
    label: 'do_epoll_create() allocates eventpoll',
    description: 'do_epoll_create() at fs/eventpoll.c:2167 checks flags (line 2175), then calls ep_alloc(&ep) at line 2180 to allocate and initialize the struct eventpoll. This is the core epoll instance that holds the RB tree of monitored fds, the ready list, and the wait queue.',
    highlights: ['do-epoll-create'],
    data: cloneState(state),
  });

  // Frame 2: ep_alloc initializes eventpoll structure
  state.currentFunction = 'ep_alloc';
  state.epollFd = 3;
  state.srcRef = 'fs/eventpoll.c:1146-1166 ep_alloc(): kzalloc, mutex_init, spin_lock_init, INIT_LIST_HEAD(&ep->rdllist), ep->rbr = RB_ROOT_CACHED';
  frames.push({
    step: 2,
    label: 'ep_alloc() initializes struct eventpoll',
    description: 'ep_alloc() at fs/eventpoll.c:1146 allocates struct eventpoll via kzalloc_obj (line 1150). It initializes: mutex_init(&ep->mtx) (line 1154), spin_lock_init(&ep->lock) (line 1155), init_waitqueue_head(&ep->wq) for epoll_wait sleepers (line 1156), INIT_LIST_HEAD(&ep->rdllist) for the ready list (line 1158), ep->rbr = RB_ROOT_CACHED for the interest RB tree (line 1159), ep->ovflist = EP_UNACTIVE_PTR as the overflow sentinel (line 1160).',
    highlights: ['ep-alloc'],
    data: cloneState(state),
  });

  // Frame 3: anon_inode_getfile creates [eventpoll] file descriptor
  state.currentFunction = 'do_epoll_create';
  state.srcRef = 'fs/eventpoll.c:2187-2195 FD_PREPARE -> anon_inode_getfile("[eventpoll]", &eventpoll_fops, ep, ...)';
  frames.push({
    step: 3,
    label: 'Create [eventpoll] anon inode file descriptor',
    description: 'Back in do_epoll_create() at line 2187, FD_PREPARE allocates a file descriptor and creates an anonymous inode file via anon_inode_getfile("[eventpoll]", &eventpoll_fops, ep, O_RDWR | flags). The eventpoll_fops provides poll/release operations. ep->file is set at line 2194, and fd_publish(fdf) at line 2195 installs the fd in the process file table. The returned fd (e.g., 3) is the epoll instance handle.',
    highlights: ['fd-create'],
    data: cloneState(state),
  });

  // Frame 4: epoll_ctl(EPOLL_CTL_ADD) entry -> do_epoll_ctl
  state.phase = 'ctl-add';
  state.currentFunction = 'do_epoll_ctl';
  state.srcRef = 'fs/eventpoll.c:2236-2341 do_epoll_ctl(epfd=3, EPOLL_CTL_ADD, fd=5, EPOLLIN) -> ep_find() -> ep_insert()';
  frames.push({
    step: 4,
    label: 'epoll_ctl(EPOLL_CTL_ADD, fd=5, EPOLLIN)',
    description: 'Userspace calls epoll_ctl(3, EPOLL_CTL_ADD, 5, {EPOLLIN}). SYSCALL_DEFINE4(epoll_ctl) at line 2383 copies epoll_event from userspace and calls do_epoll_ctl(). At line 2236, do_epoll_ctl() resolves both the epoll fd and target fd to struct file pointers, validates file_can_poll (line 2255), retrieves ep = fd_file(f)->private_data (line 2288), acquires ep->mtx (line 2305), then calls ep_find() at line 2334 to check the RB tree. Since fd=5 is not found, the switch at line 2338 calls ep_insert().',
    highlights: ['do-epoll-ctl'],
    data: cloneState(state),
  });

  // Frame 5: ep_insert allocates epitem and inserts into RB tree
  state.currentFunction = 'ep_insert';
  state.rbTreeItems.push({ fd: 5, events: 'EPOLLIN' });
  state.srcRef = 'fs/eventpoll.c:1564-1613 ep_insert(): kmem_cache_zalloc(epi_cache) -> ep_rbtree_insert(ep, epi)';
  frames.push({
    step: 5,
    label: 'ep_insert() creates epitem, inserts into RB tree',
    description: 'ep_insert() at fs/eventpoll.c:1564 first checks max_user_watches limit (line 1578). It allocates struct epitem from the epi_cache slab via kmem_cache_zalloc (line 1583). Initializes: INIT_LIST_HEAD(&epi->rdllink) (line 1589), epi->ep = ep (line 1590), ep_set_ffd(&epi->ffd, tfile, fd) sets the file+fd key (line 1591), epi->event = *event copies EPOLLIN (line 1592). Then attach_epitem() links it to the target file (line 1598), and ep_rbtree_insert(ep, epi) at line 1613 inserts the epitem into the eventpoll RB tree ordered by {file*, fd}.',
    highlights: ['ep-insert', 'rb-tree'],
    data: cloneState(state),
  });

  // Frame 6: ep_rbtree_insert details + ep_item_poll for initial check
  state.currentFunction = 'ep_rbtree_insert';
  state.srcRef = 'fs/eventpoll.c:1385-1403 ep_rbtree_insert(): rb_link_node + rb_insert_color_cached into ep->rbr';
  frames.push({
    step: 6,
    label: 'ep_rbtree_insert() + initial ep_item_poll()',
    description: 'ep_rbtree_insert() at fs/eventpoll.c:1385 walks the RB tree comparing ep_cmp_ffd (line 1395) to find the insertion point, then rb_link_node (line 1402) and rb_insert_color_cached (line 1403) insert the epitem. Back in ep_insert(), ep_item_poll(epi, &epq.pt, 1) is called at line 1648 to poll the target fd for already-pending events. ep_item_poll() at line 1044 calls vfs_poll(file, pt) which triggers ep_ptable_queue_proc() to install the wait queue callback.',
    highlights: ['rb-tree', 'ep-item-poll'],
    data: cloneState(state),
  });

  // Frame 7: ep_ptable_queue_proc installs callback
  state.currentFunction = 'ep_ptable_queue_proc';
  state.srcRef = 'fs/eventpoll.c:1358-1382 ep_ptable_queue_proc(): alloc eppoll_entry, init_waitqueue_func_entry(&pwq->wait, ep_poll_callback), add_wait_queue()';
  frames.push({
    step: 7,
    label: 'ep_ptable_queue_proc() installs ep_poll_callback on target wait queue',
    description: 'ep_ptable_queue_proc() at fs/eventpoll.c:1358 is the poll_table callback invoked by vfs_poll(). It allocates struct eppoll_entry from pwq_cache (line 1368), then init_waitqueue_func_entry(&pwq->wait, ep_poll_callback) at line 1374 wires up the callback so that when the target fd (e.g., a socket) becomes ready, it calls ep_poll_callback(). add_wait_queue(whead, &pwq->wait) at line 1380 places this entry on the target file\'s wait queue. pwq->base = epi (line 1376) links back to our epitem.',
    highlights: ['wait-queue-install'],
    data: cloneState(state),
  });

  // Frame 8: ep_insert checks if already ready, adds second fd
  state.currentFunction = 'ep_insert';
  state.rbTreeItems.push({ fd: 7, events: 'EPOLLIN|EPOLLOUT' });
  state.srcRef = 'fs/eventpoll.c:1667-1673 if (revents && !ep_is_linked(epi)) list_add_tail(&epi->rdllink, &ep->rdllist)';
  frames.push({
    step: 8,
    label: 'ep_insert() checks initial readiness, add fd=7',
    description: 'After ep_item_poll() returns, ep_insert() checks at line 1667: if (revents && !ep_is_linked(epi)), meaning the fd was already readable/writable at registration time, it immediately adds the epitem to the ready list via list_add_tail(&epi->rdllink, &ep->rdllist) at line 1668 and wakes any epoll_wait() sleepers (line 1672-1673). A second fd=7 with EPOLLIN|EPOLLOUT is also added, following the same ep_insert() -> ep_rbtree_insert() -> ep_item_poll() path. The RB tree now holds two epitems keyed by {file*, fd}.',
    highlights: ['rb-tree', 'ready-check'],
    data: cloneState(state),
  });

  return frames;
}

/* ========================================================================
 * Scenario 2: ready-event-wakeup
 *
 * Traces: socket becomes readable -> ep_poll_callback() -> rdllist add
 *         -> wake_up(&ep->wq) -> ep_poll() -> ep_send_events()
 * ======================================================================== */

function generateReadyEventWakeup(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state = makeInitialState();
  state.epollFd = 3;
  state.rbTreeItems = [
    { fd: 5, events: 'EPOLLIN' },
    { fd: 7, events: 'EPOLLIN|EPOLLOUT' },
  ];

  // Frame 0: Thread calls epoll_wait, enters ep_poll
  state.phase = 'wait';
  state.currentFunction = 'do_epoll_wait';
  state.waitingThreads.push('thread-A');
  state.srcRef = 'fs/eventpoll.c:2440-2462 do_epoll_wait() -> ep = fd_file(f)->private_data -> ep_poll(ep, events, maxevents, to)';
  frames.push({
    step: 0,
    label: 'Thread-A calls epoll_wait(), enters ep_poll()',
    description: 'Thread-A calls epoll_wait(3, events, 64, -1). do_epoll_wait() at fs/eventpoll.c:2440 resolves the epoll fd to the struct eventpoll via ep = fd_file(f)->private_data (line 2459), then calls ep_poll(ep, events, maxevents, to) at line 2462. Timeout of -1 means block indefinitely.',
    highlights: ['epoll-wait-entry'],
    data: cloneState(state),
  });

  // Frame 1: ep_poll checks events, no events available, sleeps
  state.currentFunction = 'ep_poll';
  state.srcRef = 'fs/eventpoll.c:1936-2022 ep_poll(): eavail = ep_events_available(ep) -> __add_wait_queue_exclusive(&ep->wq, &wait)';
  frames.push({
    step: 1,
    label: 'ep_poll() finds no events, thread sleeps on ep->wq',
    description: 'ep_poll() at fs/eventpoll.c:1936 first calls ep_events_available(ep) at line 1966 which checks !list_empty_careful(&ep->rdllist) -- the ready list is empty. Entering the while(1) loop at line 1968, no events are available. init_wait(&wait) at line 2002 and __set_current_state(TASK_INTERRUPTIBLE) at line 2011 prepare for sleeping. ep_events_available() is rechecked under ep->lock (line 2020). Still empty, so __add_wait_queue_exclusive(&ep->wq, &wait) at line 2022 places the thread on the eventpoll wait queue, then schedule_hrtimeout_range() at line 2028 suspends the thread.',
    highlights: ['ep-poll-sleep'],
    data: cloneState(state),
  });

  // Frame 2: Socket receives data, driver calls wake_up on socket wq
  state.phase = 'callback';
  state.currentFunction = 'ep_poll_callback';
  state.srcRef = 'fs/eventpoll.c:1247-1250 ep_poll_callback(wait, mode, sync, key): epi = ep_item_from_wait(wait); ep = epi->ep';
  frames.push({
    step: 2,
    label: 'Socket fd=5 receives data, triggers ep_poll_callback()',
    description: 'A network packet arrives for socket fd=5. The socket layer calls wake_up_interruptible_poll() on the socket\'s wait queue. This invokes ep_poll_callback() at fs/eventpoll.c:1247 because ep_ptable_queue_proc() previously installed it. ep_item_from_wait(wait) at line 1250 recovers the struct epitem via container_of through the eppoll_entry. ep = epi->ep at line 1251 retrieves the parent eventpoll.',
    highlights: ['callback-entry'],
    data: cloneState(state),
  });

  // Frame 3: ep_poll_callback adds to ready list
  state.readyList.push(5);
  state.srcRef = 'fs/eventpoll.c:1256-1293 spin_lock_irqsave(&ep->lock) -> list_add_tail(&epi->rdllink, &ep->rdllist)';
  frames.push({
    step: 3,
    label: 'ep_poll_callback() adds fd=5 to rdllist (ready list)',
    description: 'ep_poll_callback() acquires spin_lock_irqsave(&ep->lock, flags) at line 1256. It checks event mask compatibility (line 1266, 1275). At line 1284, it checks if ep->ovflist != EP_UNACTIVE_PTR -- if ep_send_events() is currently running, events go to the overflow list instead. In the normal case (line 1290), !ep_is_linked(epi) verifies the epitem is not already on the ready list, then list_add_tail(&epi->rdllink, &ep->rdllist) at line 1292 adds it to the tail of the ready list.',
    highlights: ['rdllist-add'],
    data: cloneState(state),
  });

  // Frame 4: ep_poll_callback wakes the epoll_wait thread
  state.currentFunction = 'ep_poll_callback';
  state.srcRef = 'fs/eventpoll.c:1300-1321 if (waitqueue_active(&ep->wq)) wake_up(&ep->wq)';
  frames.push({
    step: 4,
    label: 'ep_poll_callback() wakes epoll_wait() sleeper',
    description: 'Still in ep_poll_callback(), at line 1300: if (waitqueue_active(&ep->wq)) checks if any threads are blocked in epoll_wait(). Thread-A is sleeping there. At line 1320, wake_up(&ep->wq) wakes the sleeping thread. spin_unlock_irqrestore(&ep->lock, flags) at line 1326 releases the lock. Thread-A is now runnable and will resume in ep_poll() after schedule_hrtimeout_range() returns.',
    highlights: ['wake-up'],
    data: cloneState(state),
  });

  // Frame 5: Thread wakes up in ep_poll, calls ep_try_send_events
  state.phase = 'send-events';
  state.currentFunction = 'ep_poll';
  state.srcRef = 'fs/eventpoll.c:2030-2037 __set_current_state(TASK_RUNNING); eavail = 1 -> ep_try_send_events()';
  frames.push({
    step: 5,
    label: 'Thread-A wakes, ep_poll() loops to ep_try_send_events()',
    description: 'Thread-A resumes in ep_poll() at line 2030: __set_current_state(TASK_RUNNING). eavail is set to 1 (line 2037). The while(1) loop at line 1968 re-enters, and since eavail is true, ep_try_send_events(ep, events, maxevents) is called at line 1970. ep_try_send_events() at line 1895 simply calls ep_send_events(ep, events, maxevents) at line 1905.',
    highlights: ['ep-poll-wake'],
    data: cloneState(state),
  });

  // Frame 6: ep_send_events scans ready list
  state.currentFunction = 'ep_send_events';
  state.srcRef = 'fs/eventpoll.c:1763-1788 ep_send_events(): ep_start_scan(ep, &txlist) -> list_for_each_entry_safe(epi, tmp, &txlist, rdllink)';
  frames.push({
    step: 6,
    label: 'ep_send_events() scans ready list via ep_start_scan()',
    description: 'ep_send_events() at fs/eventpoll.c:1763 acquires mutex_lock(&ep->mtx) at line 1781, then calls ep_start_scan(ep, &txlist) at line 1782. ep_start_scan() at line 733 takes spin_lock_irq(&ep->lock) (line 744), splices the entire rdllist into the local txlist via list_splice_init (line 745), then sets ep->ovflist = NULL (line 746) so new events during scanning go to the overflow list instead of the now-empty rdllist. list_for_each_entry_safe at line 1788 iterates over the spliced txlist.',
    highlights: ['ep-start-scan'],
    data: cloneState(state),
  });

  // Frame 7: ep_send_events re-polls and copies to userspace
  state.currentFunction = 'ep_send_events';
  state.readyList = [];
  state.waitingThreads = [];
  state.phase = 'return';
  state.srcRef = 'fs/eventpoll.c:1818-1849 revents = ep_item_poll(epi, &pt, 1) -> epoll_put_uevent() -> ep_done_scan(ep, &txlist)';
  frames.push({
    step: 7,
    label: 'ep_send_events() re-polls fd=5, copies event to userspace',
    description: 'For each epitem on txlist, list_del_init(&epi->rdllink) at line 1811 removes it. revents = ep_item_poll(epi, &pt, 1) at line 1818 re-polls the fd to get current event mask (this is why level-triggered works -- it checks actual state, not just the wakeup). If revents is non-zero, epoll_put_uevent() at line 1822 copies the event to the userspace buffer. ep_done_scan(ep, &txlist) at line 1849 re-acquires ep->lock, drains ep->ovflist back to rdllist (line 761-777), splices remaining txlist items back (line 788), and resets ovflist to EP_UNACTIVE_PTR (line 783). ep_poll() returns the event count to userspace.',
    highlights: ['ep-send-events', 'userspace-copy'],
    data: cloneState(state),
  });

  // Frame 8: summary of the complete wakeup path
  state.currentFunction = 'ep_poll';
  state.srcRef = 'fs/eventpoll.c: complete wakeup path: ep_poll_callback:1247 -> rdllist:1292 -> wake_up:1320 -> ep_poll:1970 -> ep_send_events:1763';
  frames.push({
    step: 8,
    label: 'Complete wakeup path summary',
    description: 'The full epoll wakeup path: (1) Device driver wake_up() triggers ep_poll_callback() (line 1247). (2) ep_poll_callback() adds epitem to rdllist (line 1292) and wakes ep->wq (line 1320). (3) Thread resumes in ep_poll() (line 1968), calls ep_try_send_events() (line 1970). (4) ep_send_events() (line 1763) calls ep_start_scan() to steal the ready list, re-polls each fd via ep_item_poll() (line 1818), copies events to userspace via epoll_put_uevent() (line 1822). (5) ep_done_scan() (line 1849) drains overflow list and re-injects remaining items.',
    highlights: ['summary'],
    data: cloneState(state),
  });

  return frames;
}

/* ========================================================================
 * Scenario 3: edge-vs-level-trigger
 *
 * Compares EPOLLET (edge-triggered) vs default level-triggered behavior
 * in ep_send_events(). Key: line 1833 checks !(epi->event.events & EPOLLET)
 * ======================================================================== */

function generateEdgeVsLevelTrigger(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state = makeInitialState();
  state.epollFd = 3;
  state.rbTreeItems = [
    { fd: 5, events: 'EPOLLIN' },
    { fd: 7, events: 'EPOLLIN|EPOLLET' },
  ];

  // Frame 0: Setup - two fds, one LT one ET
  state.phase = 'wait';
  state.currentFunction = 'do_epoll_ctl';
  state.srcRef = 'fs/eventpoll.c:2236 do_epoll_ctl(): fd=5 with EPOLLIN (level-triggered), fd=7 with EPOLLIN|EPOLLET (edge-triggered)';
  frames.push({
    step: 0,
    label: 'Setup: fd=5 level-triggered, fd=7 edge-triggered (EPOLLET)',
    description: 'Two fds are registered via epoll_ctl(EPOLL_CTL_ADD). fd=5 has EPOLLIN (default level-triggered). fd=7 has EPOLLIN|EPOLLET (edge-triggered). EPOLLET is defined in EP_PRIVATE_BITS at line 86 as a private epoll flag. The trigger mode difference only matters in ep_send_events() when deciding whether to re-add an epitem to the ready list after delivering an event.',
    highlights: ['setup'],
    data: cloneState(state),
  });

  // Frame 1: Both sockets get data, both on ready list
  state.phase = 'callback';
  state.currentFunction = 'ep_poll_callback';
  state.readyList = [5, 7];
  state.srcRef = 'fs/eventpoll.c:1292 list_add_tail(&epi->rdllink, &ep->rdllist) -- both fd=5 and fd=7 added to ready list';
  frames.push({
    step: 1,
    label: 'Both fds receive data, both added to rdllist',
    description: 'Both sockets receive data. ep_poll_callback() is called for each. At line 1290-1292, !ep_is_linked(epi) checks if already on the list, then list_add_tail(&epi->rdllink, &ep->rdllist) adds each epitem to the ready list. At this point, the trigger mode (EPOLLET vs level) makes no difference -- both are added identically. The difference only emerges when ep_send_events() processes them.',
    highlights: ['rdllist-both'],
    data: cloneState(state),
  });

  // Frame 2: ep_send_events begins scanning
  state.phase = 'send-events';
  state.currentFunction = 'ep_send_events';
  state.waitingThreads.push('thread-A');
  state.srcRef = 'fs/eventpoll.c:1782-1788 ep_start_scan(ep, &txlist); list_for_each_entry_safe(epi, tmp, &txlist, rdllink)';
  frames.push({
    step: 2,
    label: 'ep_send_events() starts scanning ready list',
    description: 'Thread-A wakes from ep_poll() and enters ep_send_events() at line 1763. ep_start_scan(ep, &txlist) at line 1782 splices rdllist into local txlist under ep->lock, then sets ep->ovflist = NULL. The loop at line 1788 iterates: list_for_each_entry_safe(epi, tmp, &txlist, rdllink). For each epitem, list_del_init removes it from txlist (line 1811), then revents = ep_item_poll(epi, &pt, 1) at line 1818 re-polls the actual fd.',
    highlights: ['txlist-scan'],
    data: cloneState(state),
  });

  // Frame 3: Processing fd=5 (level-triggered) - re-added to rdllist
  state.currentFunction = 'ep_send_events';
  state.triggerMode = 'level';
  state.srcRef = 'fs/eventpoll.c:1833-1845 else if (!(epi->event.events & EPOLLET)) { list_add_tail(&epi->rdllink, &ep->rdllist) }';
  frames.push({
    step: 3,
    label: 'Level-triggered fd=5: re-added to ready list',
    description: 'For fd=5 (level-triggered), ep_item_poll() returns EPOLLIN (data still available). epoll_put_uevent() copies the event to userspace. Then the critical level-trigger check at line 1833: else if (!(epi->event.events & EPOLLET)). Since fd=5 does NOT have EPOLLET set, the condition is TRUE. list_add_tail(&epi->rdllink, &ep->rdllist) at line 1845 re-inserts the epitem back into the ready list. This means the NEXT epoll_wait() call will see fd=5 again if data is still available.',
    highlights: ['level-trigger', 'readd-rdllist'],
    data: cloneState(state),
  });

  // Frame 4: Processing fd=7 (edge-triggered) - NOT re-added
  state.triggerMode = 'edge';
  state.readyList = [5];
  state.srcRef = 'fs/eventpoll.c:1833 !(epi->event.events & EPOLLET) is FALSE for fd=7 -> epitem NOT re-added to rdllist';
  frames.push({
    step: 4,
    label: 'Edge-triggered fd=7: NOT re-added to ready list',
    description: 'For fd=7 (edge-triggered with EPOLLET), ep_item_poll() returns EPOLLIN. The event is copied to userspace. At line 1833: else if (!(epi->event.events & EPOLLET)) -- since fd=7 HAS EPOLLET set, !(events & EPOLLET) is FALSE. The epitem is NOT re-added to rdllist. It simply falls through. The epitem for fd=7 is effectively "consumed" -- even if data remains in the socket buffer, epoll_wait() will NOT report it again until a NEW event (state transition) triggers ep_poll_callback() again.',
    highlights: ['edge-trigger', 'no-readd'],
    data: cloneState(state),
  });

  // Frame 5: ep_done_scan completes
  state.currentFunction = 'ep_done_scan';
  state.triggerMode = 'level';
  state.srcRef = 'fs/eventpoll.c:750-788 ep_done_scan(): drain ovflist -> rdllist, splice txlist -> rdllist';
  frames.push({
    step: 5,
    label: 'ep_done_scan() finalizes: fd=5 remains on rdllist',
    description: 'ep_done_scan() at line 750 re-acquires ep->lock (line 755). It drains ep->ovflist: any events that arrived during scanning are moved to rdllist (lines 761-777). WRITE_ONCE(ep->ovflist, EP_UNACTIVE_PTR) at line 783 re-enables direct rdllist insertion. list_splice(txlist, &ep->rdllist) at line 788 re-injects any unprocessed txlist items. After this, rdllist contains fd=5 (re-added by level-trigger logic) but NOT fd=7 (edge-triggered, not re-added).',
    highlights: ['ep-done-scan'],
    data: cloneState(state),
  });

  // Frame 6: Second epoll_wait - level sees fd=5 again, edge does not see fd=7
  state.phase = 'wait';
  state.currentFunction = 'ep_poll';
  state.srcRef = 'fs/eventpoll.c:1966-1970 eavail = ep_events_available(ep) -> ep_try_send_events(): fd=5 still on rdllist';
  frames.push({
    step: 6,
    label: 'Second epoll_wait(): fd=5 (LT) reported again, fd=7 (ET) silent',
    description: 'Thread-A calls epoll_wait() again. ep_poll() at line 1966 calls ep_events_available(ep) which checks !list_empty_careful(&ep->rdllist). fd=5 is still on rdllist (re-added by level-trigger), so eavail=true. ep_send_events() re-polls fd=5 via ep_item_poll(): if EPOLLIN is still set (data remains unread), the event is delivered again. fd=7 is NOT on rdllist, so it is invisible -- even though its socket may have unread data. This is the core edge-trigger contract: report only on state transitions.',
    highlights: ['second-wait', 'lt-repeat'],
    data: cloneState(state),
  });

  // Frame 7: New data arrives on fd=7, ep_poll_callback re-adds it
  state.phase = 'callback';
  state.currentFunction = 'ep_poll_callback';
  state.readyList = [7];
  state.triggerMode = 'edge';
  state.srcRef = 'fs/eventpoll.c:1290-1292 !ep_is_linked(epi) -> list_add_tail(&epi->rdllink, &ep->rdllist): fd=7 re-added on NEW event';
  frames.push({
    step: 7,
    label: 'New data on fd=7: ep_poll_callback() re-adds to rdllist',
    description: 'When MORE data arrives on fd=7, the socket driver calls wake_up() again, triggering ep_poll_callback() at line 1247. Since the epitem for fd=7 was removed from rdllist (not re-added by edge-trigger), !ep_is_linked(epi) at line 1290 is TRUE, so list_add_tail(&epi->rdllink, &ep->rdllist) at line 1292 adds it back. Now the next epoll_wait() WILL report fd=7. This is the "edge" -- a new state transition is required to re-arm the notification.',
    highlights: ['et-rearm'],
    data: cloneState(state),
  });

  // Frame 8: Summary of edge vs level semantics
  state.phase = 'return';
  state.currentFunction = 'ep_send_events';
  state.readyList = [];
  state.triggerMode = 'level';
  state.srcRef = 'fs/eventpoll.c:1833 the single line: else if (!(epi->event.events & EPOLLET)) controls LT vs ET behavior';
  frames.push({
    step: 8,
    label: 'Summary: EPOLLET semantics controlled by one condition in ep_send_events()',
    description: 'The entire level-trigger vs edge-trigger difference comes down to fs/eventpoll.c:1833: else if (!(epi->event.events & EPOLLET)). Level-triggered (default): after delivering an event, the epitem is re-added to rdllist via list_add_tail (line 1845), so subsequent epoll_wait() calls will re-poll and re-report if the condition persists. Edge-triggered (EPOLLET): the epitem is NOT re-added, so the fd goes silent until a new ep_poll_callback() fires from a new state transition in the underlying file. EPOLLONESHOT (line 1831) is even more aggressive: it clears the event mask entirely, requiring an explicit EPOLL_CTL_MOD to re-enable.',
    highlights: ['summary'],
    data: cloneState(state),
  });

  return frames;
}

/* ---------- SVG Rendering ---------- */

const NS = 'http://www.w3.org/2000/svg';

const PHASE_COLORS: Record<string, string> = {
  'create': '#6e40c9',
  'ctl-add': '#3fb950',
  'ctl-mod': '#d29922',
  'ctl-del': '#f85149',
  'wait': '#484f58',
  'callback': '#f0883e',
  'send-events': '#58a6ff',
  'return': '#8b949e',
};

function createText(
  x: number, y: number, text: string, cls: string, anchor: string = 'middle',
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
  x: number, y: number, w: number, h: number, fill: string, cls: string, rx: number = 4,
): SVGRectElement {
  const el = document.createElementNS(NS, 'rect');
  el.setAttribute('x', String(x));
  el.setAttribute('y', String(y));
  el.setAttribute('width', String(w));
  el.setAttribute('height', String(h));
  el.setAttribute('fill', fill);
  el.setAttribute('rx', String(rx));
  el.setAttribute('class', cls);
  return el;
}

function renderRbTree(container: SVGGElement, items: EpollState['rbTreeItems'], width: number, y: number): void {
  const startX = 20;
  const itemW = Math.min(120, (width - 40) / Math.max(items.length, 1));

  container.appendChild(createText(width / 2, y, 'RB Tree (ep->rbr)', 'anim-section-label'));

  if (items.length === 0) {
    container.appendChild(createText(width / 2, y + 30, '(empty)', 'anim-addr-marker'));
    return;
  }

  items.forEach((item, i) => {
    const x = startX + i * (itemW + 8);
    container.appendChild(createRect(x, y + 12, itemW, 28, '#3fb950', 'anim-rb-node', 4));
    container.appendChild(createText(x + itemW / 2, y + 30, `fd=${item.fd} ${item.events}`, 'anim-addr-marker'));
  });
}

function renderReadyList(container: SVGGElement, readyList: number[], width: number, y: number): void {
  container.appendChild(createText(width / 2, y, 'Ready List (ep->rdllist)', 'anim-section-label'));

  if (readyList.length === 0) {
    container.appendChild(createText(width / 2, y + 30, '(empty)', 'anim-addr-marker'));
    return;
  }

  const startX = (width - readyList.length * 60) / 2;
  readyList.forEach((fd, i) => {
    const x = startX + i * 60;
    container.appendChild(createRect(x, y + 12, 50, 28, '#f0883e', 'anim-ready-item', 4));
    container.appendChild(createText(x + 25, y + 30, `fd=${fd}`, 'anim-addr-marker'));
  });
}

function renderPhase(container: SVGGElement, data: EpollState, width: number, y: number): void {
  const color = PHASE_COLORS[data.phase] || '#484f58';
  const phaseW = 180;
  const x = (width - phaseW) / 2;
  container.appendChild(createRect(x, y, phaseW, 24, color, 'anim-phase-box', 6));
  container.appendChild(createText(width / 2, y + 16, `${data.currentFunction}()`, 'anim-addr-marker'));
}

function renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void {
  while (container.firstChild) container.removeChild(container.firstChild);
  const data = frame.data as EpollState;

  renderPhase(container, data, width, 16);
  renderRbTree(container, data.rbTreeItems, width, 60);
  renderReadyList(container, data.readyList, width, 150);

  // Waiting threads
  if (data.waitingThreads.length > 0) {
    container.appendChild(
      createText(width / 2, 220, `Waiting: ${data.waitingThreads.join(', ')}`, 'anim-addr-marker'),
    );
  }

  // Source reference
  if (data.srcRef) {
    container.appendChild(createText(width / 2, height - 8, data.srcRef, 'anim-addr-marker'));
  }
}

/* ---------- Module export ---------- */

const SCENARIOS: AnimationScenario[] = [
  { id: 'epoll-create-and-add', label: 'epoll_create + EPOLL_CTL_ADD (create & insert)' },
  { id: 'ready-event-wakeup', label: 'Ready Event Wakeup (callback -> ep_poll -> send_events)' },
  { id: 'edge-vs-level-trigger', label: 'Edge vs Level Trigger (EPOLLET semantics)' },
];

const epollInternalsModule: AnimationModule = {
  config: {
    id: 'epoll-internals',
    title: 'epoll Internals: Ready-List Wakeup',
    skillName: 'epoll-internals',
  },
  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario) {
      case 'ready-event-wakeup': return generateReadyEventWakeup();
      case 'edge-vs-level-trigger': return generateEdgeVsLevelTrigger();
      case 'epoll-create-and-add':
      default: return generateCreateAndAdd();
    }
  },
  renderFrame,
  getScenarios: () => SCENARIOS,
};

export type { EpollState };
export default epollInternalsModule;

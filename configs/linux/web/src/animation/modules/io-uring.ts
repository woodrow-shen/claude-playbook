import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

export interface IoUringState {
  sqHead: number;
  sqTail: number;
  cqHead: number;
  cqTail: number;
  sqEntries: Array<{ opcode: string; fd: number; offset: number }>;
  cqEntries: Array<{ result: number; userData: number }>;
  phase: 'setup' | 'fill-sqe' | 'submit' | 'issue' | 'io-in-flight' | 'complete' | 'fill-cqe' | 'reap';
  currentFunction: string;
  sqpollActive: boolean;
  srcRef: string;
}

function cloneState(s: IoUringState): IoUringState {
  return {
    sqHead: s.sqHead,
    sqTail: s.sqTail,
    cqHead: s.cqHead,
    cqTail: s.cqTail,
    sqEntries: s.sqEntries.map(e => ({ ...e })),
    cqEntries: s.cqEntries.map(e => ({ ...e })),
    phase: s.phase,
    currentFunction: s.currentFunction,
    sqpollActive: s.sqpollActive,
    srcRef: s.srcRef,
  };
}

// ---------------------------------------------------------------------------
// Scenario: setup-and-submit (default)
// io_uring_setup() -> ring creation -> fill SQE -> io_uring_enter() -> submit
// ---------------------------------------------------------------------------
function generateSetupAndSubmit(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: IoUringState = {
    sqHead: 0,
    sqTail: 0,
    cqHead: 0,
    cqTail: 0,
    sqEntries: [],
    cqEntries: [],
    phase: 'setup',
    currentFunction: 'io_uring_setup',
    sqpollActive: false,
    srcRef: '',
  };

  // Frame 0: SYSCALL_DEFINE2(io_uring_setup)
  state.srcRef = 'io_uring/io_uring.c:3104 (SYSCALL_DEFINE2(io_uring_setup, u32, entries, ...))';
  frames.push({
    step: 0,
    label: 'io_uring_setup() syscall entry',
    description: 'Userspace calls io_uring_setup(entries, params) to create a new io_uring instance. The syscall is defined at io_uring/io_uring.c:3104 via SYSCALL_DEFINE2(io_uring_setup, u32, entries, struct io_uring_params __user *, params). It first calls io_uring_allowed() at line 3109 to check sysctl_io_uring_disabled and CAP_SYS_ADMIN, then delegates to the static io_uring_setup() at line 3065.',
    highlights: ['phase-indicator'],
    data: cloneState(state),
  });

  // Frame 1: io_uring_setup copies params and calls io_uring_create
  state.currentFunction = 'io_uring_setup';
  state.srcRef = 'io_uring/io_uring.c:3065-3079 (io_uring_setup -> io_uring_create)';
  frames.push({
    step: 1,
    label: 'io_uring_setup() copies params from userspace',
    description: 'io_uring_setup() at io_uring/io_uring.c:3065 copies struct io_uring_params from userspace via copy_from_user() at line 3071. It validates reserved fields are zero at line 3074, sets config.p.sq_entries = entries at line 3077, and calls io_uring_create(&config) at line 3079 to build the ring context.',
    highlights: ['phase-indicator'],
    data: cloneState(state),
  });

  // Frame 2: io_ring_ctx_alloc
  state.currentFunction = 'io_ring_ctx_alloc';
  state.srcRef = 'io_uring/io_uring.c:223 (io_ring_ctx_alloc) -> line 2946 (ctx = io_ring_ctx_alloc(p))';
  frames.push({
    step: 2,
    label: 'Allocate io_ring_ctx',
    description: 'io_uring_create() calls io_ring_ctx_alloc(p) at io_uring/io_uring.c:2946. io_ring_ctx_alloc() at line 223 allocates the struct io_ring_ctx with kzalloc_obj() (line 229), initializes the cancel hash table via io_alloc_hash_table() (line 242), sets up percpu_ref for reference counting (line 244), and initializes wait queues and lists (lines 251-252). ctx->flags = p->flags at line 248.',
    highlights: ['phase-indicator'],
    data: cloneState(state),
  });

  // Frame 3: io_allocate_scq_urings - SQ and CQ ring allocation
  state.currentFunction = 'io_allocate_scq_urings';
  state.srcRef = 'io_uring/io_uring.c:2687-2732 (io_allocate_scq_urings)';
  frames.push({
    step: 3,
    label: 'Allocate SQ and CQ rings',
    description: 'io_uring_create() calls io_allocate_scq_urings(ctx, config) at io_uring/io_uring.c:3009. At line 2697-2698 it sets ctx->sq_entries and ctx->cq_entries from params. io_create_region() at line 2706 allocates the shared rings memory region. ctx->rings is set at line 2709. The SQE array is allocated separately at line 2720. Finally, lines 2728-2731 initialize ring masks and entry counts via WRITE_ONCE: sq_ring_mask = sq_entries - 1, cq_ring_mask = cq_entries - 1.',
    highlights: ['sq-ring', 'cq-ring'],
    data: cloneState(state),
  });

  // Frame 4: Userspace fills SQE
  state.phase = 'fill-sqe';
  state.currentFunction = 'userspace: fill SQE';
  state.sqTail = 1;
  state.sqEntries = [{ opcode: 'IORING_OP_READ', fd: 3, offset: 0 }];
  state.srcRef = 'include/uapi/linux/io_uring.h (struct io_uring_sqe)';
  frames.push({
    step: 4,
    label: 'Userspace fills SQE in submission ring',
    description: 'The application writes a submission queue entry (SQE) into the shared memory ring at sq_sqes[sq_tail & sq_ring_mask]. The SQE struct (defined in include/uapi/linux/io_uring.h) contains opcode=IORING_OP_READ, fd=3, off=0, addr=buf_ptr, len=4096, and user_data for correlation. The app then advances sq_tail with a store-release barrier so the kernel sees the new entry.',
    highlights: ['sq-ring', 'sqe-entry'],
    data: cloneState(state),
  });

  // Frame 5: io_uring_enter syscall
  state.phase = 'submit';
  state.currentFunction = 'io_uring_enter';
  state.srcRef = 'io_uring/io_uring.c:2542-2607 (SYSCALL_DEFINE6(io_uring_enter))';
  frames.push({
    step: 5,
    label: 'io_uring_enter() triggers submission',
    description: 'Userspace calls io_uring_enter(fd, to_submit=1, min_complete=0, flags=0). SYSCALL_DEFINE6(io_uring_enter) at io_uring/io_uring.c:2542 resolves the ring fd via fget() at line 2567, obtains ctx from file->private_data at line 2575. Since IORING_SETUP_SQPOLL is not set, it takes the else branch at line 2601, acquires mutex_lock(&ctx->uring_lock) at line 2606, and calls io_submit_sqes(ctx, to_submit) at line 2607.',
    highlights: ['sq-ring'],
    data: cloneState(state),
  });

  // Frame 6: io_submit_sqes processes the SQE
  state.currentFunction = 'io_submit_sqes';
  state.sqHead = 1;
  state.srcRef = 'io_uring/io_uring.c:2008-2057 (io_submit_sqes)';
  frames.push({
    step: 6,
    label: 'io_submit_sqes() fetches and processes SQE',
    description: 'io_submit_sqes() at io_uring/io_uring.c:2008 reads available entries via __io_sqring_entries(ctx) at line 2018, which computes smp_load_acquire(sq.tail) - ctx->cached_sq_head. The loop at line 2028 calls io_alloc_req() (line 2032) to get a request from the cache, then io_get_sqe() (line 2034) which reads ctx->sq_sqes[cached_sq_head++ & mask] at line 1979-2004. io_submit_sqe() at line 2043 initializes the request from the SQE.',
    highlights: ['sq-ring'],
    data: cloneState(state),
  });

  // Frame 7: io_issue_sqe dispatches the operation
  state.phase = 'issue';
  state.currentFunction = 'io_issue_sqe';
  state.srcRef = 'io_uring/io_uring.c:1399-1426 (io_issue_sqe) -> rw.c:1026 (io_read)';
  frames.push({
    step: 7,
    label: 'io_issue_sqe() dispatches to io_read()',
    description: 'io_issue_sqe() at io_uring/io_uring.c:1399 looks up the operation handler via io_issue_defs[req->opcode] at line 1401. io_assign_file() at line 1404 resolves the fd to a struct file. __io_issue_sqe() at line 1407 calls def->issue(req, issue_flags) at line 1384, which for IORING_OP_READ dispatches to io_read() at io_uring/rw.c:1026. If the operation completes inline (IOU_COMPLETE), io_req_complete_defer() is called at line 1411.',
    highlights: ['phase-indicator'],
    data: cloneState(state),
  });

  // Frame 8: I/O in flight
  state.phase = 'io-in-flight';
  state.currentFunction = 'io_read (async)';
  state.srcRef = 'io_uring/rw.c:1026 (io_read) -> fs/read_write.c vfs_read path';
  frames.push({
    step: 8,
    label: 'I/O operation in flight',
    description: 'io_read() at io_uring/rw.c:1026 sets up a struct kiocb from the io_uring request and calls vfs_iocb_iter_read() which enters the VFS read path. For a non-blocking path (IO_URING_F_NONBLOCK set), if the data is not immediately available the request may be punted to io-wq worker threads. When the read completes, the completion path posts a CQE to the completion ring.',
    highlights: ['phase-indicator'],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario: completion-path
// I/O complete -> io_req_complete_post -> io_fill_cqe_req -> CQE posted
// ---------------------------------------------------------------------------
function generateCompletionPath(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: IoUringState = {
    sqHead: 1,
    sqTail: 1,
    cqHead: 0,
    cqTail: 0,
    sqEntries: [{ opcode: 'IORING_OP_READ', fd: 3, offset: 0 }],
    cqEntries: [],
    phase: 'io-in-flight',
    currentFunction: 'io_read',
    sqpollActive: false,
    srcRef: '',
  };

  // Frame 0: I/O completes, request returns IOU_COMPLETE
  state.srcRef = 'io_uring/io_uring.c:1399-1415 (io_issue_sqe completion check)';
  frames.push({
    step: 0,
    label: 'I/O operation completes',
    description: 'The read operation finishes and io_read() returns IOU_COMPLETE to __io_issue_sqe(). Back in io_issue_sqe() at io_uring/io_uring.c:1409, the ret == IOU_COMPLETE check succeeds. If IO_URING_F_COMPLETE_DEFER is set (line 1410), io_req_complete_defer() adds the request to the deferred completion list. Otherwise io_req_complete_post() at line 1413 handles immediate posting.',
    highlights: ['phase-indicator'],
    data: cloneState(state),
  });

  // Frame 1: io_req_complete_post for io-wq path
  state.phase = 'complete';
  state.currentFunction = 'io_req_complete_post';
  state.srcRef = 'io_uring/io_uring.c:900-936 (io_req_complete_post)';
  frames.push({
    step: 1,
    label: 'io_req_complete_post() begins CQE posting',
    description: 'io_req_complete_post() at io_uring/io_uring.c:900 handles completion from io-wq worker threads. It first checks IO_URING_F_IOWQ at line 909. For lockless_cq contexts or requests needing reissue (line 916), it defers via io_req_task_work_add(). Otherwise it acquires io_cq_lock(ctx) at line 923 to enter the completion ring critical section.',
    highlights: ['cq-ring'],
    data: cloneState(state),
  });

  // Frame 2: io_fill_cqe_req copies CQE to ring
  state.currentFunction = 'io_fill_cqe_req';
  state.srcRef = 'io_uring/io_uring.h:294-316 (io_fill_cqe_req)';
  frames.push({
    step: 2,
    label: 'io_fill_cqe_req() writes CQE to completion ring',
    description: 'io_fill_cqe_req() at io_uring/io_uring.h:294 is called from io_req_complete_post() at line 925 of io_uring.c. It calls io_get_cqe(ctx, &cqe) at line 304 to obtain a CQE slot at the current cq.tail position. If the ring is full, it returns false and the CQE goes to the overflow list. Otherwise, memcpy(cqe, &req->cqe, sizeof(*cqe)) at line 307 copies the result, user_data, and flags into the shared ring.',
    highlights: ['cq-ring', 'cqe-entry'],
    data: cloneState(state),
  });

  // Frame 3: Deferred flush path via __io_submit_flush_completions
  state.currentFunction = '__io_submit_flush_completions';
  state.srcRef = 'io_uring/io_uring.c:1120-1154 (__io_submit_flush_completions)';
  frames.push({
    step: 3,
    label: 'Batch completion flush via __io_submit_flush_completions()',
    description: 'For the common deferred completion path, __io_submit_flush_completions() at io_uring/io_uring.c:1120 acquires __io_cq_lock(ctx) at line 1126, then iterates the completion list at line 1127. For each request, io_fill_cqe_req() at line 1137 copies the CQE to the ring. After all CQEs are written, __io_cq_unlock_post(ctx) at line 1144 commits the ring updates.',
    highlights: ['cq-ring'],
    data: cloneState(state),
  });

  // Frame 4: io_cq_unlock_post commits and wakes
  state.phase = 'fill-cqe';
  state.currentFunction = 'io_cq_unlock_post';
  state.cqTail = 1;
  state.cqEntries = [{ result: 4096, userData: 1 }];
  state.srcRef = 'io_uring/io_uring.c:513-519 (io_cq_unlock_post)';
  frames.push({
    step: 4,
    label: 'io_cq_unlock_post() commits CQ ring and wakes waiters',
    description: 'io_cq_unlock_post() at io_uring/io_uring.c:513 calls io_commit_cqring(ctx) at line 516 which executes smp_store_release(&ctx->rings->cq.tail, ctx->cached_cq_tail) at io_uring.h:414, making the new CQE visible to userspace with proper memory ordering. spin_unlock(&ctx->completion_lock) at line 517 releases the CQ lock. io_cqring_wake(ctx) at line 518 wakes any tasks waiting for completions.',
    highlights: ['cq-ring', 'cq-tail'],
    data: cloneState(state),
  });

  // Frame 5: io_commit_cqring updates tail with store-release
  state.currentFunction = 'io_commit_cqring';
  state.srcRef = 'io_uring/io_uring.h:411-415 (io_commit_cqring)';
  frames.push({
    step: 5,
    label: 'io_commit_cqring() advances CQ tail with smp_store_release',
    description: 'io_commit_cqring() at io_uring/io_uring.h:411 is the critical ordering point. smp_store_release(&ctx->rings->cq.tail, ctx->cached_cq_tail) at line 414 ensures all CQE data writes are visible before the tail pointer update. Userspace reads the tail with smp_load_acquire() to see the new entries. This store-release/load-acquire pair is the lock-free synchronization mechanism between kernel and userspace.',
    highlights: ['cq-tail'],
    data: cloneState(state),
  });

  // Frame 6: io_cqring_wake wakes waiters
  state.currentFunction = 'io_cqring_wake';
  state.srcRef = 'io_uring/io_uring.h:435 (io_cqring_wake)';
  frames.push({
    step: 6,
    label: 'io_cqring_wake() signals waiting tasks',
    description: 'io_cqring_wake() at io_uring/io_uring.h:435 checks if any tasks are sleeping on the CQ wait queue. If wq_has_sleeper() returns true, it calls __wake_up() with EPOLL_URING_WAKE | EPOLLIN as the poll key (via __io_wq_wake at line 426-427). The EPOLL_URING_WAKE flag signals recursion detection for eventfd/epoll integration, preventing multishot poll infinite loops.',
    highlights: ['cq-ring'],
    data: cloneState(state),
  });

  // Frame 7: Userspace reads CQE
  state.phase = 'reap';
  state.currentFunction = 'userspace: read CQE';
  state.cqHead = 1;
  state.srcRef = 'include/uapi/linux/io_uring.h (struct io_uring_cqe)';
  frames.push({
    step: 7,
    label: 'Userspace reaps CQE from completion ring',
    description: 'The application reads the CQ ring tail via smp_load_acquire(cq->tail). Since cq_head < cq_tail, a CQE is available at cqes[cq_head & cq_ring_mask]. The struct io_uring_cqe contains user_data (correlating to the original SQE), res=4096 (bytes read), and flags. The application advances cq_head with smp_store_release() to indicate the CQE has been consumed, freeing the slot for reuse.',
    highlights: ['cq-ring', 'cqe-entry'],
    data: cloneState(state),
  });

  // Frame 8: req_ref_put and cleanup
  state.currentFunction = 'req_ref_put / io_free_batch_list';
  state.srcRef = 'io_uring/io_uring.c:935 (req_ref_put) -> 1147 (io_free_batch_list)';
  frames.push({
    step: 8,
    label: 'Request freed and returned to cache',
    description: 'After CQE posting, req_ref_put(req) at io_uring/io_uring.c:935 drops the reference. For the batched path, io_free_batch_list() at line 1147 frees completed requests. Requests are returned to the per-ctx request cache (io_req_add_to_cache) for reuse, avoiding kmalloc overhead on subsequent submissions. The io_drain_active check at line 1151 handles serialized request ordering.',
    highlights: ['phase-indicator'],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario: sqpoll-mode
// SQPOLL kernel thread polls SQ ring without syscalls from userspace
// ---------------------------------------------------------------------------
function generateSqpollMode(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: IoUringState = {
    sqHead: 0,
    sqTail: 0,
    cqHead: 0,
    cqTail: 0,
    sqEntries: [],
    cqEntries: [],
    phase: 'setup',
    currentFunction: 'io_uring_setup',
    sqpollActive: false,
    srcRef: '',
  };

  // Frame 0: Setup with IORING_SETUP_SQPOLL
  state.srcRef = 'io_uring/io_uring.c:3065-3079 (io_uring_setup) with IORING_SETUP_SQPOLL';
  frames.push({
    step: 0,
    label: 'io_uring_setup() with IORING_SETUP_SQPOLL flag',
    description: 'Userspace calls io_uring_setup(entries, params) with params.flags including IORING_SETUP_SQPOLL. io_uring_setup() at io_uring/io_uring.c:3065 proceeds as normal: copy_from_user at line 3071, io_uring_create at line 3079. At line 2988, the SQPOLL flag sets ctx->notify_method = TWA_SIGNAL_NO_IPI since the SQPOLL thread handles submission, eliminating IPI overhead.',
    highlights: ['phase-indicator'],
    data: cloneState(state),
  });

  // Frame 1: io_sq_offload_create spawns kernel thread
  state.currentFunction = 'io_sq_offload_create';
  state.srcRef = 'io_uring/sqpoll.c:446-543 (io_sq_offload_create)';
  frames.push({
    step: 1,
    label: 'io_sq_offload_create() spawns SQPOLL thread',
    description: 'io_uring_create() calls io_sq_offload_create(ctx, p) at io_uring/io_uring.c:3013. At sqpoll.c:460, since IORING_SETUP_SQPOLL is set, it calls security_uring_sqpoll() (line 465), allocates io_sq_data via io_get_sq_data() (line 469), stores sq_creds at line 475, and sets sq_thread_idle timeout at line 477. create_io_thread(io_sq_thread, sqd) at line 517 spawns the kernel polling thread. wake_up_new_task(tsk) at line 529 starts it.',
    highlights: ['phase-indicator'],
    data: cloneState(state),
  });

  // Frame 2: io_sq_thread starts its main loop
  state.sqpollActive = true;
  state.currentFunction = 'io_sq_thread';
  state.srcRef = 'io_uring/sqpoll.c:293-412 (io_sq_thread main loop)';
  frames.push({
    step: 2,
    label: 'io_sq_thread() enters polling loop',
    description: 'The SQPOLL kernel thread io_sq_thread() at sqpoll.c:293 sets its name to "iou-sqp-<pid>" at line 311. If sq_cpu was specified (IORING_SETUP_SQ_AFF), it pins to that CPU at line 318. The main while(1) loop starts at line 333: it checks for pending events/signals at line 337, iterates all attached ring contexts at line 344, and calls __io_sq_thread() for each at line 345.',
    highlights: ['phase-indicator'],
    data: cloneState(state),
  });

  // Frame 3: Userspace fills SQE without syscall
  state.phase = 'fill-sqe';
  state.currentFunction = 'userspace: fill SQE (no syscall needed)';
  state.sqTail = 1;
  state.sqEntries = [{ opcode: 'IORING_OP_READ', fd: 3, offset: 0 }];
  state.srcRef = 'include/uapi/linux/io_uring.h (struct io_uring_sqe) -- userspace only';
  frames.push({
    step: 3,
    label: 'Userspace fills SQE -- no syscall required',
    description: 'With SQPOLL active, userspace writes the SQE directly to the shared ring memory and advances sq.tail with smp_store_release(). No io_uring_enter() syscall is needed because the kernel SQPOLL thread continuously polls sq.tail for new entries. This eliminates syscall overhead entirely for submissions, making io_uring a true zero-syscall I/O interface.',
    highlights: ['sq-ring', 'sqe-entry'],
    data: cloneState(state),
  });

  // Frame 4: __io_sq_thread detects new SQE
  state.phase = 'submit';
  state.currentFunction = '__io_sq_thread';
  state.srcRef = 'io_uring/sqpoll.c:204-243 (__io_sq_thread)';
  frames.push({
    step: 4,
    label: '__io_sq_thread() detects and submits new SQEs',
    description: '__io_sq_thread() at sqpoll.c:204 calls io_sqring_entries(ctx) at line 210 which computes smp_load_acquire(sq.tail) - ctx->cached_sq_head to find 1 pending entry. After overriding credentials at line 221, it acquires mutex_lock(&ctx->uring_lock) at line 223 and calls io_submit_sqes(ctx, to_submit) at line 233. This is the same submission path as io_uring_enter() but driven by the kernel thread.',
    highlights: ['sq-ring'],
    data: cloneState(state),
  });

  // Frame 5: io_submit_sqes processes entries
  state.currentFunction = 'io_submit_sqes';
  state.sqHead = 1;
  state.srcRef = 'io_uring/io_uring.c:2008-2057 (io_submit_sqes from sqpoll context)';
  frames.push({
    step: 5,
    label: 'io_submit_sqes() processes SQE from SQPOLL thread',
    description: 'io_submit_sqes() at io_uring/io_uring.c:2008 executes identically whether called from io_uring_enter() or __io_sq_thread(). io_alloc_req() (line 2032), io_get_sqe() (line 2034), and io_submit_sqe() (line 2043) process the entry. The request flows through io_issue_sqe() at line 1399 to the operation handler. From userspace perspective, I/O submission happened with zero syscalls.',
    highlights: ['sq-ring'],
    data: cloneState(state),
  });

  // Frame 6: Spin vs sleep decision
  state.phase = 'issue';
  state.currentFunction = 'io_sq_thread (spin/sleep)';
  state.srcRef = 'io_uring/sqpoll.c:362-411 (spin vs sleep decision)';
  frames.push({
    step: 6,
    label: 'SQPOLL thread spin/sleep decision',
    description: 'After processing, io_sq_thread() checks at sqpoll.c:362 whether to spin or sleep. If sqt_spin is true (submissions found) or the idle timeout has not expired, it continues spinning at line 371 (calling cond_resched() at line 367 if needed). When the ring is idle past sq_thread_idle jiffies, prepare_to_wait() at line 374 puts the thread to sleep. IORING_SQ_NEED_WAKEUP is set in sq_flags at line 379 to tell userspace the thread is sleeping.',
    highlights: ['phase-indicator'],
    data: cloneState(state),
  });

  // Frame 7: Wakeup via IORING_ENTER_SQ_WAKEUP
  state.currentFunction = 'io_uring_enter (SQ_WAKEUP)';
  state.srcRef = 'io_uring/io_uring.c:2590-2596 (SQPOLL wakeup path in io_uring_enter)';
  frames.push({
    step: 7,
    label: 'Userspace wakes sleeping SQPOLL thread',
    description: 'When userspace detects IORING_SQ_NEED_WAKEUP is set in the shared sq_flags, it calls io_uring_enter(fd, 0, 0, IORING_ENTER_SQ_WAKEUP). At io_uring/io_uring.c:2590, the SQPOLL branch checks for SQ_WAKEUP flag at line 2595 and calls wake_up(&ctx->sq_data->wait) at line 2596. The SQPOLL thread wakes from schedule() at sqpoll.c:401, clears IORING_SQ_NEED_WAKEUP at line 406, and resumes polling.',
    highlights: ['phase-indicator'],
    data: cloneState(state),
  });

  // Frame 8: SQPOLL resumes and processes new work
  state.phase = 'submit';
  state.currentFunction = 'io_sq_thread (resumed)';
  state.srcRef = 'io_uring/sqpoll.c:405-411 (after wakeup: clear NEED_WAKEUP, resume loop)';
  frames.push({
    step: 8,
    label: 'SQPOLL thread resumes polling after wakeup',
    description: 'After wakeup, the SQPOLL thread at sqpoll.c:405-406 clears IORING_SQ_NEED_WAKEUP via atomic_andnot(IORING_SQ_NEED_WAKEUP, &ctx->rings->sq_flags). finish_wait() at line 410 removes the thread from the wait queue. The idle timeout resets at line 411 (timeout = jiffies + sqd->sq_thread_idle). The thread re-enters the while(1) loop at line 333, resuming its poll of __io_sq_thread() for each attached context.',
    highlights: ['sq-ring'],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------
const NS = 'http://www.w3.org/2000/svg';

const PHASE_COLORS: Record<string, string> = {
  'setup': '#1f6feb',
  'fill-sqe': '#d29922',
  'submit': '#f85149',
  'issue': '#f0883e',
  'io-in-flight': '#8b949e',
  'complete': '#3fb950',
  'fill-cqe': '#58a6ff',
  'reap': '#a371f7',
};

function renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void {
  while (container.firstChild) container.removeChild(container.firstChild);
  const data = frame.data as IoUringState;
  const margin = { top: 10, left: 15, right: 15 };

  // Title
  const title = document.createElementNS(NS, 'text');
  title.setAttribute('x', String(width / 2));
  title.setAttribute('y', '18');
  title.setAttribute('text-anchor', 'middle');
  title.setAttribute('class', 'anim-title');
  title.textContent = 'io_uring Submission/Completion Rings';
  container.appendChild(title);

  // Phase indicator
  const phaseTop = margin.top + 28;
  const phaseWidth = 200;
  const phaseHeight = 28;
  const phaseColor = PHASE_COLORS[data.phase] || '#30363d';

  const phaseRect = document.createElementNS(NS, 'rect');
  phaseRect.setAttribute('x', String(margin.left));
  phaseRect.setAttribute('y', String(phaseTop));
  phaseRect.setAttribute('width', String(phaseWidth));
  phaseRect.setAttribute('height', String(phaseHeight));
  phaseRect.setAttribute('rx', '6');
  phaseRect.setAttribute('fill', phaseColor);
  phaseRect.setAttribute('class', 'anim-phase');
  container.appendChild(phaseRect);

  const phaseText = document.createElementNS(NS, 'text');
  phaseText.setAttribute('x', String(margin.left + phaseWidth / 2));
  phaseText.setAttribute('y', String(phaseTop + 19));
  phaseText.setAttribute('text-anchor', 'middle');
  phaseText.setAttribute('class', 'anim-phase');
  phaseText.setAttribute('fill', '#e6edf3');
  phaseText.textContent = data.phase.toUpperCase();
  container.appendChild(phaseText);

  // Current function label
  const fnLabel = document.createElementNS(NS, 'text');
  fnLabel.setAttribute('x', String(margin.left + phaseWidth + 20));
  fnLabel.setAttribute('y', String(phaseTop + 19));
  fnLabel.setAttribute('class', 'anim-function');
  fnLabel.setAttribute('fill', '#8b949e');
  fnLabel.textContent = data.currentFunction;
  container.appendChild(fnLabel);

  // SQ Ring visualization
  const ringTop = margin.top + 80;
  const ringWidth = (width - margin.left - margin.right - 40) / 2;
  const ringHeight = height - ringTop - 40;
  const sqX = margin.left;
  const cqX = margin.left + ringWidth + 40;

  // SQ Ring box
  const sqRingRect = document.createElementNS(NS, 'rect');
  sqRingRect.setAttribute('x', String(sqX));
  sqRingRect.setAttribute('y', String(ringTop));
  sqRingRect.setAttribute('width', String(ringWidth));
  sqRingRect.setAttribute('height', String(ringHeight));
  sqRingRect.setAttribute('rx', '8');
  sqRingRect.setAttribute('fill', '#0d1117');
  sqRingRect.setAttribute('stroke', '#d29922');
  sqRingRect.setAttribute('stroke-width', '2');
  const sqCls = frame.highlights.includes('sq-ring') ? 'anim-ring anim-highlight' : 'anim-ring';
  sqRingRect.setAttribute('class', sqCls);
  container.appendChild(sqRingRect);

  const sqLabel = document.createElementNS(NS, 'text');
  sqLabel.setAttribute('x', String(sqX + ringWidth / 2));
  sqLabel.setAttribute('y', String(ringTop + 20));
  sqLabel.setAttribute('text-anchor', 'middle');
  sqLabel.setAttribute('class', 'anim-ring');
  sqLabel.setAttribute('fill', '#d29922');
  sqLabel.textContent = `SQ Ring [head=${data.sqHead} tail=${data.sqTail}]`;
  container.appendChild(sqLabel);

  // SQ entries
  const entryHeight = 24;
  const entryTop = ringTop + 30;
  data.sqEntries.forEach((entry, i) => {
    const ey = entryTop + i * (entryHeight + 4);
    if (ey + entryHeight > ringTop + ringHeight) return;

    const eRect = document.createElementNS(NS, 'rect');
    eRect.setAttribute('x', String(sqX + 8));
    eRect.setAttribute('y', String(ey));
    eRect.setAttribute('width', String(ringWidth - 16));
    eRect.setAttribute('height', String(entryHeight));
    eRect.setAttribute('rx', '4');
    eRect.setAttribute('fill', '#161b22');
    eRect.setAttribute('stroke', '#d29922');
    eRect.setAttribute('class', 'anim-sqe');
    container.appendChild(eRect);

    const eText = document.createElementNS(NS, 'text');
    eText.setAttribute('x', String(sqX + 16));
    eText.setAttribute('y', String(ey + 16));
    eText.setAttribute('class', 'anim-sqe');
    eText.setAttribute('fill', '#e6edf3');
    eText.setAttribute('font-size', '11');
    eText.textContent = `SQE[${i}]: ${entry.opcode} fd=${entry.fd} off=${entry.offset}`;
    container.appendChild(eText);
  });

  // CQ Ring box
  const cqRingRect = document.createElementNS(NS, 'rect');
  cqRingRect.setAttribute('x', String(cqX));
  cqRingRect.setAttribute('y', String(ringTop));
  cqRingRect.setAttribute('width', String(ringWidth));
  cqRingRect.setAttribute('height', String(ringHeight));
  cqRingRect.setAttribute('rx', '8');
  cqRingRect.setAttribute('fill', '#0d1117');
  cqRingRect.setAttribute('stroke', '#3fb950');
  cqRingRect.setAttribute('stroke-width', '2');
  const cqCls = frame.highlights.includes('cq-ring') ? 'anim-ring anim-highlight' : 'anim-ring';
  cqRingRect.setAttribute('class', cqCls);
  container.appendChild(cqRingRect);

  const cqLabel = document.createElementNS(NS, 'text');
  cqLabel.setAttribute('x', String(cqX + ringWidth / 2));
  cqLabel.setAttribute('y', String(ringTop + 20));
  cqLabel.setAttribute('text-anchor', 'middle');
  cqLabel.setAttribute('class', 'anim-ring');
  cqLabel.setAttribute('fill', '#3fb950');
  cqLabel.textContent = `CQ Ring [head=${data.cqHead} tail=${data.cqTail}]`;
  container.appendChild(cqLabel);

  // CQ entries
  data.cqEntries.forEach((entry, i) => {
    const ey = entryTop + i * (entryHeight + 4);
    if (ey + entryHeight > ringTop + ringHeight) return;

    const eRect = document.createElementNS(NS, 'rect');
    eRect.setAttribute('x', String(cqX + 8));
    eRect.setAttribute('y', String(ey));
    eRect.setAttribute('width', String(ringWidth - 16));
    eRect.setAttribute('height', String(entryHeight));
    eRect.setAttribute('rx', '4');
    eRect.setAttribute('fill', '#161b22');
    eRect.setAttribute('stroke', '#3fb950');
    eRect.setAttribute('class', 'anim-cqe');
    container.appendChild(eRect);

    const eText = document.createElementNS(NS, 'text');
    eText.setAttribute('x', String(cqX + 16));
    eText.setAttribute('y', String(ey + 16));
    eText.setAttribute('class', 'anim-cqe');
    eText.setAttribute('fill', '#e6edf3');
    eText.setAttribute('font-size', '11');
    eText.textContent = `CQE[${i}]: res=${entry.result} user_data=${entry.userData}`;
    container.appendChild(eText);
  });

  // SQPOLL indicator
  if (data.sqpollActive) {
    const spRect = document.createElementNS(NS, 'rect');
    spRect.setAttribute('x', String(width - margin.right - 140));
    spRect.setAttribute('y', String(phaseTop));
    spRect.setAttribute('width', '130');
    spRect.setAttribute('height', String(phaseHeight));
    spRect.setAttribute('rx', '6');
    spRect.setAttribute('fill', '#238636');
    spRect.setAttribute('class', 'anim-phase');
    container.appendChild(spRect);

    const spText = document.createElementNS(NS, 'text');
    spText.setAttribute('x', String(width - margin.right - 75));
    spText.setAttribute('y', String(phaseTop + 19));
    spText.setAttribute('text-anchor', 'middle');
    spText.setAttribute('class', 'anim-phase');
    spText.setAttribute('fill', '#e6edf3');
    spText.textContent = 'SQPOLL ACTIVE';
    container.appendChild(spText);
  }
}

// ---------------------------------------------------------------------------
// Module export
// ---------------------------------------------------------------------------
const SCENARIOS: AnimationScenario[] = [
  { id: 'setup-and-submit', label: 'Setup and Submit (io_uring_setup + SQE)' },
  { id: 'completion-path', label: 'Completion Path (CQE posting)' },
  { id: 'sqpoll-mode', label: 'SQPOLL Mode (kernel-side polling)' },
];

const ioUringModule: AnimationModule = {
  config: {
    id: 'io-uring',
    title: 'io_uring Submission/Completion Rings',
    skillName: 'io-uring',
  },
  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario) {
      case 'completion-path': return generateCompletionPath();
      case 'sqpoll-mode': return generateSqpollMode();
      case 'setup-and-submit':
      default: return generateSetupAndSubmit();
    }
  },
  renderFrame,
  getScenarios: () => SCENARIOS,
};

export default ioUringModule;

import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

/**
 * pipe-ring-buffer Animation Module
 *
 * Traces the EXACT implementation from fs/pipe.c and fs/splice.c:
 *   - do_pipe2() (line 1032) -> __do_pipe_flags() (line 982) -> create_pipe_files() (line 926)
 *   - get_pipe_inode() (line 886) -> alloc_pipe_info() (line 792)
 *   - anon_pipe_write() (line 431) fills pipe_buffer slots in the ring
 *   - anon_pipe_read() (line 269) consumes slots, advances tail via pipe_update_tail() (line 238)
 *   - do_splice() (line 1300 in fs/splice.c) -> splice_file_to_pipe() (line 1280)
 *   - filemap_splice_read() (line 3053 in mm/filemap.c) -> splice_folio_into_pipe() (line 3004)
 *
 * Key data structures (from include/linux/pipe_fs_i.h):
 *   struct pipe_inode_info: ring buffer with head/tail indices, bufs[] array, max_usage (default 16)
 *   struct pipe_buffer: page pointer, offset, len, ops, flags
 *   PIPE_DEF_BUFFERS = 16 (line 5 in pipe_fs_i.h)
 */

/* ---------- State interface ---------- */

export interface PipeBufferSlot {
  page: string;
  offset: number;
  len: number;
  flags: string;
}

export interface PipeRingBufferState {
  head: number;
  tail: number;
  maxUsage: number;
  buffers: PipeBufferSlot[];
  currentFunction: string;
  phase: 'create' | 'write' | 'read' | 'full' | 'blocked' | 'wake' | 'splice' | 'done';
  writerBlocked: boolean;
  readerBlocked: boolean;
  srcRef: string;
}

/* ---------- Helpers ---------- */

function cloneState(s: PipeRingBufferState): PipeRingBufferState {
  return {
    head: s.head,
    tail: s.tail,
    maxUsage: s.maxUsage,
    buffers: s.buffers.map(b => ({ ...b })),
    currentFunction: s.currentFunction,
    phase: s.phase,
    writerBlocked: s.writerBlocked,
    readerBlocked: s.readerBlocked,
    srcRef: s.srcRef,
  };
}

function makeInitialState(): PipeRingBufferState {
  return {
    head: 0,
    tail: 0,
    maxUsage: 16,
    buffers: [],
    currentFunction: '',
    phase: 'create',
    writerBlocked: false,
    readerBlocked: false,
    srcRef: '',
  };
}

/* ========================================================================
 * Scenario 1: pipe-write-read
 *
 * Traces: pipe() syscall -> do_pipe2() -> __do_pipe_flags() -> create_pipe_files()
 *         -> get_pipe_inode() -> alloc_pipe_info()
 *         Writer: anon_pipe_write() fills ring slots
 *         Reader: anon_pipe_read() consumes slots via pipe_update_tail()
 * ======================================================================== */

function generatePipeWriteRead(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state = makeInitialState();

  // Frame 0: pipe() syscall entry
  state.currentFunction = 'SYSCALL_DEFINE1(pipe)';
  state.srcRef = 'fs/pipe.c:1059 SYSCALL_DEFINE1(pipe, int __user *, fildes) -> do_pipe2(fildes, 0)';
  frames.push({
    step: 0,
    label: 'pipe() syscall entry',
    description: 'Userspace calls pipe(fds). The syscall handler at fs/pipe.c:1059 (SYSCALL_DEFINE1(pipe)) calls do_pipe2(fildes, 0) with flags=0. SYSCALL_DEFINE2(pipe2) at line 1054 allows passing O_CLOEXEC|O_NONBLOCK|O_DIRECT flags.',
    highlights: ['syscall-entry'],
    data: cloneState(state),
  });

  // Frame 1: do_pipe2 -> __do_pipe_flags
  state.currentFunction = 'do_pipe2';
  state.srcRef = 'fs/pipe.c:1032-1052 do_pipe2() -> __do_pipe_flags(fd, files, flags) at line 1038';
  frames.push({
    step: 1,
    label: 'do_pipe2() delegates to __do_pipe_flags()',
    description: 'do_pipe2() at fs/pipe.c:1032 declares local arrays files[2] and fd[2], then calls __do_pipe_flags(fd, files, flags) at line 1038. On success, it copies the two file descriptors to userspace via copy_to_user(fildes, fd, sizeof(fd)) at line 1040, then installs them with fd_install() at lines 1047-1048.',
    highlights: ['do-pipe2'],
    data: cloneState(state),
  });

  // Frame 2: create_pipe_files -> get_pipe_inode
  state.currentFunction = 'create_pipe_files';
  state.srcRef = 'fs/pipe.c:926-980 create_pipe_files() calls get_pipe_inode() at line 928 -> alloc_pipe_info() at line 896';
  frames.push({
    step: 2,
    label: 'create_pipe_files() allocates pipe inode',
    description: 'create_pipe_files() at fs/pipe.c:926 calls get_pipe_inode() (line 928) which allocates a pseudo-inode via new_inode_pseudo(pipe_mnt->mnt_sb) at line 888. get_pipe_inode() calls alloc_pipe_info() at line 896 to create the pipe ring buffer, sets inode->i_pipe = pipe (line 900), pipe->files = 2, pipe->readers = pipe->writers = 1 (lines 901-902). Back in create_pipe_files(), alloc_file_pseudo() at line 944 creates the write-end file, alloc_file_clone() at line 956 creates the read-end. res[0] = read fd, res[1] = write fd (line 965).',
    highlights: ['create-pipe-files'],
    data: cloneState(state),
  });

  // Frame 3: alloc_pipe_info initializes ring buffer
  state.currentFunction = 'alloc_pipe_info';
  state.srcRef = 'fs/pipe.c:792-839 alloc_pipe_info(): kzalloc pipe, kzalloc_objs bufs[16], init_waitqueue_head rd_wait/wr_wait, max_usage=16';
  frames.push({
    step: 3,
    label: 'alloc_pipe_info() creates 16-slot ring buffer',
    description: 'alloc_pipe_info() at fs/pipe.c:792 allocates struct pipe_inode_info via kzalloc_obj (line 800). pipe_bufs defaults to PIPE_DEF_BUFFERS (16, from include/linux/pipe_fs_i.h:5). It allocates the bufs[] array via kzalloc_objs(struct pipe_buffer, 16) at line 817. Initializes: init_waitqueue_head(&pipe->rd_wait) (line 821), init_waitqueue_head(&pipe->wr_wait) (line 822), pipe->max_usage = 16 (line 824), pipe->ring_size = 16 (line 825), mutex_init(&pipe->mutex) (line 828). Head and tail start at 0 (kzalloc zeroes).',
    highlights: ['alloc-pipe-info', 'ring-buffer'],
    data: cloneState(state),
  });

  // Frame 4: Writer calls write() -> anon_pipe_write
  state.phase = 'write';
  state.currentFunction = 'anon_pipe_write';
  state.srcRef = 'fs/pipe.c:431-601 anon_pipe_write(): mutex_lock(&pipe->mutex) at line 458, head = pipe->head at line 475';
  frames.push({
    step: 4,
    label: 'Writer enters anon_pipe_write()',
    description: 'A process writes to the pipe fd. The VFS routes through pipeanon_fops.write_iter = anon_pipe_write at fs/pipe.c:431. It acquires mutex_lock(&pipe->mutex) at line 458, checks pipe->readers != 0 (line 460, sends SIGPIPE if no readers), reads head = pipe->head at line 475, and checks was_empty = pipe_empty(head, pipe->tail) at line 476. If the pipe is not empty, it first tries to merge into the last buffer (lines 478-497).',
    highlights: ['anon-pipe-write'],
    data: cloneState(state),
  });

  // Frame 5: Write fills first buffer slot
  state.head = 1;
  state.buffers = [{ page: 'page@0xa000', offset: 0, len: 4096, flags: 'CAN_MERGE' }];
  state.currentFunction = 'anon_pipe_write';
  state.srcRef = 'fs/pipe.c:509-541 anon_pipe_write() loop: !pipe_full -> anon_pipe_get_page(), copy_page_from_iter(), pipe->head = head+1 at line 530';
  frames.push({
    step: 5,
    label: 'Write fills slot 0: head advances 0 -> 1',
    description: 'In the write loop at line 500, pipe_full(head, pipe->tail, pipe->max_usage) returns false (0 < 16). anon_pipe_get_page(pipe) at line 515 obtains a page (checks pipe->tmp_page[] cache first at fs/pipe.c:114-124, falls back to alloc_page(GFP_HIGHUSER)). copy_page_from_iter(page, 0, PAGE_SIZE, from) at line 522 copies user data. pipe->head = head + 1 at line 530 advances the head. buf->ops = &anon_pipe_buf_ops (line 534), buf->flags = PIPE_BUF_FLAG_CAN_MERGE (line 539). The ring now has 1 occupied slot.',
    highlights: ['slot-0', 'head-advance'],
    data: cloneState(state),
  });

  // Frame 6: Write fills second buffer slot
  state.head = 2;
  state.buffers.push({ page: 'page@0xb000', offset: 0, len: 4096, flags: 'CAN_MERGE' });
  state.srcRef = 'fs/pipe.c:500-547 anon_pipe_write() loop continues: pipe_full(2,0,16)=false -> fill slot 1, pipe->head = 2';
  frames.push({
    step: 6,
    label: 'Write fills slot 1: head advances 1 -> 2',
    description: 'The write loop continues at line 500. pipe_full(head=1, tail=0, max_usage=16) is false (usage=1 < 16). Another page is allocated via anon_pipe_get_page(), data is copied, pipe->head increments to 2 at line 530. pipe_buf(pipe, 1) at the masked index (head & (ring_size-1)) stores the new pipe_buffer with page, offset=0, len=copied_bytes. The ring now has 2 occupied slots: indices 0 and 1.',
    highlights: ['slot-1', 'head-advance'],
    data: cloneState(state),
  });

  // Frame 7: Writer wakes reader and exits
  state.currentFunction = 'anon_pipe_write';
  state.srcRef = 'fs/pipe.c:578-599 anon_pipe_write() exit: mutex_unlock, wake_up_interruptible_sync_poll(&pipe->rd_wait, EPOLLIN) at line 596';
  frames.push({
    step: 7,
    label: 'Writer exits: wakes readers on rd_wait',
    description: 'After the write loop completes (iov_iter_count(from) == 0 at line 544), anon_pipe_write() falls through to the exit path. mutex_unlock(&pipe->mutex) at line 581 releases the pipe lock. Since was_empty was true (pipe was empty before writing), wake_up_interruptible_sync_poll(&pipe->rd_wait, EPOLLIN | EPOLLRDNORM) at line 596 wakes any sleeping readers. kill_fasync(&pipe->fasync_readers, SIGIO, POLL_IN) at line 597 signals async readers.',
    highlights: ['wake-reader'],
    data: cloneState(state),
  });

  // Frame 8: Reader calls read() -> anon_pipe_read
  state.phase = 'read';
  state.currentFunction = 'anon_pipe_read';
  state.srcRef = 'fs/pipe.c:269-404 anon_pipe_read(): mutex_lock(&pipe->mutex) at line 282, head = smp_load_acquire(&pipe->head) at line 294';
  frames.push({
    step: 8,
    label: 'Reader enters anon_pipe_read()',
    description: 'A process reads from the pipe fd. The VFS routes through pipeanon_fops.read_iter = anon_pipe_read at fs/pipe.c:269. It acquires mutex_lock(&pipe->mutex) at line 282. Inside the loop at line 292, head = smp_load_acquire(&pipe->head) at line 294 (barrier vs post_one_notification()), tail = pipe->tail at line 295. pipe_empty(head=2, tail=0) is false, so data is available.',
    highlights: ['anon-pipe-read'],
    data: cloneState(state),
  });

  // Frame 9: Reader consumes slot 0, tail advances
  state.tail = 1;
  state.buffers = [{ page: 'page@0xb000', offset: 0, len: 4096, flags: 'CAN_MERGE' }];
  state.currentFunction = 'anon_pipe_read';
  state.srcRef = 'fs/pipe.c:321-367 anon_pipe_read(): pipe_buf(pipe, tail=0), copy_page_to_iter() at line 343, pipe_update_tail() at line 361';
  frames.push({
    step: 9,
    label: 'Reader consumes slot 0: tail advances 0 -> 1',
    description: 'pipe_buf(pipe, tail=0) at line 322 retrieves the buffer at ring index 0. copy_page_to_iter(buf->page, buf->offset, chars, to) at line 343 copies data to userspace. After fully consuming the buffer (buf->len == 0 at line 359), wake_writer |= pipe_full(head, tail, pipe->max_usage) at line 360 checks if the pipe WAS full (it was not). pipe_update_tail(pipe, buf, tail) at line 361 calls pipe_buf_release(pipe, buf) at fs/pipe.c:242 (which calls anon_pipe_buf_release -> anon_pipe_put_page to recycle the page into tmp_page[]), then pipe->tail = ++tail at line 264.',
    highlights: ['slot-0-consumed', 'tail-advance'],
    data: cloneState(state),
  });

  // Frame 10: Reader consumes slot 1, pipe now empty
  state.tail = 2;
  state.buffers = [];
  state.srcRef = 'fs/pipe.c:361-366 pipe_update_tail(pipe, buf, tail=1) -> pipe->tail = 2, pipe_empty(2,2) = true -> break';
  frames.push({
    step: 10,
    label: 'Reader consumes slot 1: tail advances 1 -> 2, pipe empty',
    description: 'The read loop continues: pipe_buf(pipe, tail=1) retrieves the next buffer. copy_page_to_iter() copies data, pipe_update_tail() releases the page and advances tail to 2. Now pipe_empty(head=2, tail=2) at line 366 is true (head == tail), so the loop breaks. The pipe ring buffer is empty. pipe_is_empty(pipe) at line 394 returns true, so wake_next_reader is set to false at line 395.',
    highlights: ['pipe-empty', 'tail-advance'],
    data: cloneState(state),
  });

  // Frame 11: Reader exits, wakes writer if pipe was full
  state.currentFunction = 'anon_pipe_read';
  state.srcRef = 'fs/pipe.c:396-403 anon_pipe_read() exit: mutex_unlock, wake_up_interruptible_sync_poll(&pipe->wr_wait) at line 399 if pipe was full';
  frames.push({
    step: 11,
    label: 'Reader exits: ring buffer cycle complete',
    description: 'mutex_unlock(&pipe->mutex) at line 396 releases the lock. wake_writer was false (pipe was not full before reading), so wake_up_interruptible_sync_poll(&pipe->wr_wait) at line 399 is skipped. kill_fasync(&pipe->fasync_writers, SIGIO, POLL_OUT) at line 402 signals async writers. The complete cycle is: head/tail wrap naturally as unsigned integers, with masking only at dereference via pipe_buf(pipe, idx) which uses idx & (pipe->ring_size - 1). This avoids a dead spot in the ring.',
    highlights: ['cycle-complete'],
    data: cloneState(state),
  });

  return frames;
}

/* ========================================================================
 * Scenario 2: pipe-full-and-block
 *
 * Writer fills all 16 pipe buffer slots, then blocks on wr_wait.
 * Reader reads one slot, wakes writer.
 * ======================================================================== */

function generatePipeFullAndBlock(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state = makeInitialState();
  state.phase = 'write';

  // Frame 0: Writer starts filling the pipe
  state.currentFunction = 'anon_pipe_write';
  state.srcRef = 'fs/pipe.c:431-458 anon_pipe_write(): mutex_lock(&pipe->mutex), begin filling slots';
  frames.push({
    step: 0,
    label: 'Writer begins filling pipe ring buffer',
    description: 'anon_pipe_write() at fs/pipe.c:431 acquires mutex_lock(&pipe->mutex) at line 458. The writer has a large buffer to write, which will fill multiple pipe_buffer slots. Each iteration of the loop at line 500 allocates a page via anon_pipe_get_page() (line 515), copies up to PAGE_SIZE bytes via copy_page_from_iter() (line 522), and advances pipe->head (line 530).',
    highlights: ['write-begin'],
    data: cloneState(state),
  });

  // Frame 1: Slots filling up (show at 8/16)
  state.head = 8;
  state.buffers = Array.from({ length: 8 }, (_, i) => ({
    page: `page@0x${(0xa000 + i * 0x1000).toString(16)}`,
    offset: 0, len: 4096, flags: 'CAN_MERGE',
  }));
  state.srcRef = 'fs/pipe.c:509-530 anon_pipe_write() loop: pipe_full(8, 0, 16) = false, continue filling';
  frames.push({
    step: 1,
    label: 'Writer fills slots 0-7: head=8, 50% full',
    description: 'The write loop continues iterating. After 8 iterations, pipe->head = 8, pipe->tail = 0. pipe_full(8, 0, 16) at line 510 returns false because (head - tail) = 8 < max_usage = 16. Each pipe_buffer at the masked index (head & (ring_size-1)) stores: .page = allocated page, .ops = &anon_pipe_buf_ops (line 534), .offset = 0, .len = copied bytes, .flags = PIPE_BUF_FLAG_CAN_MERGE (line 539).',
    highlights: ['half-full'],
    data: cloneState(state),
  });

  // Frame 2: Pipe reaches 15/16 slots
  state.head = 15;
  state.buffers = Array.from({ length: 15 }, (_, i) => ({
    page: `page@0x${(0xa000 + i * 0x1000).toString(16)}`,
    offset: 0, len: 4096, flags: 'CAN_MERGE',
  }));
  state.srcRef = 'fs/pipe.c:510 pipe_full(15, 0, 16) = false: (15-0) = 15 < 16';
  frames.push({
    step: 2,
    label: 'Writer fills slots 0-14: head=15, nearly full',
    description: 'After 15 iterations, pipe->head = 15. pipe_full(15, 0, 16) returns false because (15 - 0) = 15 < max_usage (16). One more slot remains. The ring buffer uses the full range of indices: pipe_buf(pipe, head) masks with (ring_size - 1) = 15, so index 14 is the last slot filled so far.',
    highlights: ['nearly-full'],
    data: cloneState(state),
  });

  // Frame 3: Pipe becomes completely full (16/16)
  state.head = 16;
  state.phase = 'full';
  state.buffers = Array.from({ length: 16 }, (_, i) => ({
    page: `page@0x${(0xa000 + i * 0x1000).toString(16)}`,
    offset: 0, len: 4096, flags: 'CAN_MERGE',
  }));
  state.srcRef = 'fs/pipe.c:510 pipe_full(16, 0, 16) = true: (16-0) = 16 >= 16, cannot write more';
  frames.push({
    step: 3,
    label: 'Pipe full: all 16 slots occupied (head=16, tail=0)',
    description: 'The 16th slot is filled, pipe->head = 16. Now pipe_full(16, 0, 16) at line 510 returns true: (head - tail) = 16 >= max_usage = 16. The write loop falls through to the blocking path at line 550. Note: head=16 and tail=0 with ring_size=16 means every masked index (0-15) has an active pipe_buffer. The natural wrapping of unsigned integers means head can exceed ring_size.',
    highlights: ['pipe-full'],
    data: cloneState(state),
  });

  // Frame 4: Writer blocks on wr_wait
  state.phase = 'blocked';
  state.writerBlocked = true;
  state.currentFunction = 'anon_pipe_write';
  state.srcRef = 'fs/pipe.c:550-574 anon_pipe_write(): pipe full -> mutex_unlock at line 569, wait_event_interruptible_exclusive(pipe->wr_wait, pipe_writable(pipe)) at line 573';
  frames.push({
    step: 4,
    label: 'Writer blocks on pipe->wr_wait',
    description: 'Since the pipe is full and the file is not O_NONBLOCK (checked at line 551), the writer must sleep. First, mutex_unlock(&pipe->mutex) at line 569 releases the pipe lock. Then if was_empty, wake_up_interruptible_sync_poll(&pipe->rd_wait, EPOLLIN) at line 571 wakes readers. Finally, wait_event_interruptible_exclusive(pipe->wr_wait, pipe_writable(pipe)) at line 573 puts the writer to sleep on the wr_wait queue. pipe_writable() at line 421 checks !pipe_full(idx.head, idx.tail, max_usage) using READ_ONCE for lockless access.',
    highlights: ['writer-blocked', 'wr-wait'],
    data: cloneState(state),
  });

  // Frame 5: Reader arrives and reads one slot
  state.phase = 'read';
  state.tail = 1;
  state.buffers = state.buffers.slice(1);
  state.currentFunction = 'anon_pipe_read';
  state.srcRef = 'fs/pipe.c:321-361 anon_pipe_read(): pipe_buf(pipe, tail=0), copy_page_to_iter(), pipe_update_tail() -> pipe->tail = 1';
  frames.push({
    step: 5,
    label: 'Reader consumes slot 0: tail advances 0 -> 1',
    description: 'anon_pipe_read() at fs/pipe.c:269 acquires mutex_lock at line 282. pipe_empty(16, 0) is false, so data is available. pipe_buf(pipe, tail=0) retrieves slot 0. copy_page_to_iter() at line 343 copies to userspace. wake_writer |= pipe_full(head=16, tail=0, max_usage=16) at line 360 returns true -- the pipe WAS full before this read. pipe_update_tail(pipe, buf, 0) at line 361 calls pipe_buf_release() then pipe->tail = 1 at line 264. Now pipe_full(16, 1, 16) = false: space is available.',
    highlights: ['reader-frees-slot', 'tail-advance'],
    data: cloneState(state),
  });

  // Frame 6: Reader wakes writer via wr_wait
  state.phase = 'wake';
  state.currentFunction = 'anon_pipe_read';
  state.srcRef = 'fs/pipe.c:398-399 anon_pipe_read() exit: wake_writer=true -> wake_up_interruptible_sync_poll(&pipe->wr_wait, EPOLLOUT | EPOLLWRNORM)';
  frames.push({
    step: 6,
    label: 'Reader wakes blocked writer via pipe->wr_wait',
    description: 'anon_pipe_read() exits the loop (total_len satisfied or pipe empty). mutex_unlock(&pipe->mutex) at line 396. Since wake_writer is true (pipe was full before read), wake_up_interruptible_sync_poll(&pipe->wr_wait, EPOLLOUT | EPOLLWRNORM) at line 399 wakes the sleeping writer. The WF_SYNC flag ensures the writer is scheduled promptly to refill the pipe, which is critical for throughput in producer-consumer patterns.',
    highlights: ['wake-writer', 'wr-wait-signal'],
    data: cloneState(state),
  });

  // Frame 7: Writer wakes up, re-acquires lock, continues writing
  state.phase = 'write';
  state.writerBlocked = false;
  state.head = 17;
  state.buffers.push({ page: 'page@0x1a000', offset: 0, len: 4096, flags: 'CAN_MERGE' });
  state.currentFunction = 'anon_pipe_write';
  state.srcRef = 'fs/pipe.c:573-576 anon_pipe_write(): writer wakes from wr_wait, mutex_lock(&pipe->mutex) at line 574, was_empty = pipe_is_empty(pipe) at line 575';
  frames.push({
    step: 7,
    label: 'Writer wakes: re-acquires lock, fills slot 0 again (head=17)',
    description: 'The writer wakes from wait_event_interruptible_exclusive(pipe->wr_wait) at line 573. It re-acquires mutex_lock(&pipe->mutex) at line 574, sets was_empty = pipe_is_empty(pipe) at line 575 (false, 15 slots still occupied), wake_next_writer = true at line 576. The loop resumes: pipe_full(16, 1, 16) = false, so anon_pipe_get_page() and copy_page_from_iter() fill the freed slot. pipe->head = 17 at line 530. Index 17 & 15 = 1... but slot 0 (index 16 & 15 = 0) is what was freed. The pipe is full again with head=17, tail=1.',
    highlights: ['writer-resumes', 'head-advance'],
    data: cloneState(state),
  });

  // Frame 8: Summary of blocking mechanism
  state.phase = 'done';
  state.currentFunction = 'pipe_writable';
  state.srcRef = 'fs/pipe.c:421-428 pipe_writable(): lockless check via READ_ONCE(pipe->head_tail), !pipe_full() || !READ_ONCE(pipe->readers)';
  frames.push({
    step: 8,
    label: 'Summary: pipe blocking uses wait queues and lockless checks',
    description: 'The pipe blocking mechanism uses two wait queues: pipe->rd_wait for readers (when pipe is empty) and pipe->wr_wait for writers (when pipe is full). The wakeup condition pipe_writable() at fs/pipe.c:421 performs a lockless check using READ_ONCE(pipe->head_tail) which reads head and tail atomically via a union (union pipe_index at include/linux/pipe_fs_i.h). Writers also wake if !READ_ONCE(pipe->readers) at line 427, which handles the broken-pipe case. Readers use pipe_readable() at line 230 which similarly checks !pipe_empty() || !pipe->writers.',
    highlights: ['summary'],
    data: cloneState(state),
  });

  return frames;
}

/* ========================================================================
 * Scenario 3: splice-zero-copy
 *
 * splice() transfers data from file to pipe without userspace copy.
 * do_splice() -> splice_file_to_pipe() -> do_splice_read() ->
 * filemap_splice_read() -> splice_folio_into_pipe()
 * ======================================================================== */

function generateSpliceZeroCopy(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state = makeInitialState();

  // Frame 0: splice() syscall entry
  state.phase = 'splice';
  state.currentFunction = 'do_splice';
  state.srcRef = 'fs/splice.c:1300-1383 do_splice(in, off_in, out, off_out, len, flags)';
  frames.push({
    step: 0,
    label: 'splice() syscall: do_splice() determines direction',
    description: 'Userspace calls splice(fd_in, off_in, pipe_fd, NULL, len, flags). The syscall handler reaches do_splice() at fs/splice.c:1300. It calls ipipe = get_pipe_info(in, true) and opipe = get_pipe_info(out, true) at lines 1312-1313. Since the output is a pipe (opipe != NULL) and input is a regular file (ipipe == NULL), execution falls to the "else if (opipe)" branch at line 1356. After rw_verify_area(READ) at line 1367, it calls splice_file_to_pipe(in, opipe, &offset, len, flags) at line 1374.',
    highlights: ['do-splice'],
    data: cloneState(state),
  });

  // Frame 1: splice_file_to_pipe locks pipe and waits for space
  state.currentFunction = 'splice_file_to_pipe';
  state.srcRef = 'fs/splice.c:1280-1295 splice_file_to_pipe(): pipe_lock(opipe) at line 1287, wait_for_space(opipe) at line 1288';
  frames.push({
    step: 1,
    label: 'splice_file_to_pipe() locks pipe, waits for space',
    description: 'splice_file_to_pipe() at fs/splice.c:1280 first calls pipe_lock(opipe) at line 1287 to acquire the pipe mutex. Then wait_for_space(opipe, flags) at line 1288 checks if the pipe has room; if full, it sleeps on wr_wait (or returns -EAGAIN for SPLICE_F_NONBLOCK). On success, it calls do_splice_read(in, offset, opipe, len, flags) at line 1290 to actually fill the pipe from the file.',
    highlights: ['splice-file-to-pipe'],
    data: cloneState(state),
  });

  // Frame 2: do_splice_read dispatches to file's splice_read
  state.currentFunction = 'do_splice_read';
  state.srcRef = 'fs/splice.c:954-980 do_splice_read(): checks f_op->splice_read at line 972, calls it at line 980';
  frames.push({
    step: 2,
    label: 'do_splice_read() dispatches to filesystem splice_read',
    description: 'do_splice_read() at fs/splice.c:954 calculates available pipe space: p_space = pipe->max_usage - pipe_buf_usage(pipe) at line 966, caps len to p_space << PAGE_SHIFT at line 967. For regular files with page cache (not O_DIRECT, not DAX), it calls in->f_op->splice_read(in, ppos, pipe, len, flags) at line 980. For ext4/xfs/btrfs, this points to filemap_splice_read() which performs the zero-copy path by referencing page cache pages directly.',
    highlights: ['do-splice-read'],
    data: cloneState(state),
  });

  // Frame 3: filemap_splice_read fetches folios from page cache
  state.currentFunction = 'filemap_splice_read';
  state.srcRef = 'mm/filemap.c:3053-3077 filemap_splice_read(): init_sync_kiocb at line 3067, filemap_get_pages(&iocb, len, &fbatch) at line 3084';
  frames.push({
    step: 3,
    label: 'filemap_splice_read() fetches folios from page cache',
    description: 'filemap_splice_read() at mm/filemap.c:3053 computes available pipe space (lines 3071-3073), initializes a folio_batch (line 3075), and enters the main loop (line 3077). filemap_get_pages(&iocb, len, &fbatch, true) at line 3084 looks up folios in the page cache, triggering readahead if needed. This is where the I/O happens: pages are read from disk into the page cache if not already present. The folios are returned pinned in the folio_batch.',
    highlights: ['filemap-splice-read', 'page-cache'],
    data: cloneState(state),
  });

  // Frame 4: splice_folio_into_pipe - the zero-copy step
  state.head = 1;
  state.buffers = [{ page: 'pagecache@0xc000', offset: 0, len: 4096, flags: 'page_cache_pipe_buf_ops' }];
  state.currentFunction = 'splice_folio_into_pipe';
  state.srcRef = 'mm/filemap.c:3004-3031 splice_folio_into_pipe(): buf->ops = &page_cache_pipe_buf_ops at line 3019, folio_get(folio) at line 3024, pipe->head++ at line 3025';
  frames.push({
    step: 4,
    label: 'splice_folio_into_pipe(): zero-copy page reference into pipe',
    description: 'splice_folio_into_pipe() at mm/filemap.c:3004 is the core zero-copy mechanism. It iterates while spliced < size and !pipe_is_full(pipe) (line 3014). For each page-sized chunk: buf = pipe_head_buf(pipe) at line 3015 gets the next pipe_buffer slot. The pipe_buffer is set up with: .ops = &page_cache_pipe_buf_ops (line 3019), .page = page (the actual page cache page, line 3020), .offset and .len (lines 3021-3022). folio_get(folio) at line 3024 increments the folio reference count -- NO data copy occurs. pipe->head++ at line 3025 advances the ring head. The pipe_buffer now references the same physical page as the page cache.',
    highlights: ['zero-copy', 'splice-folio'],
    data: cloneState(state),
  });

  // Frame 5: More folios spliced into pipe
  state.head = 4;
  state.buffers = Array.from({ length: 4 }, (_, i) => ({
    page: `pagecache@0x${(0xc000 + i * 0x1000).toString(16)}`,
    offset: 0, len: 4096, flags: 'page_cache_pipe_buf_ops',
  }));
  state.currentFunction = 'filemap_splice_read';
  state.srcRef = 'mm/filemap.c:3107-3131 filemap_splice_read() loop: iterate folio_batch, splice_folio_into_pipe() for each folio, advance *ppos';
  frames.push({
    step: 5,
    label: 'Multiple folios spliced: head=4, 4 page cache refs in pipe',
    description: 'filemap_splice_read() iterates through the folio_batch (line 3107). For each folio: folio_mark_accessed() at line 3113 updates LRU access info, flush_dcache_folio() at line 3121 handles cache aliasing if the mapping is writably_mapped. splice_folio_into_pipe(pipe, folio, *ppos, n) at line 3124 inserts the page reference. *ppos advances (line 3129), in->f_ra.prev_pos is updated for readahead (line 3130). If pipe_is_full(pipe) at line 3131, the loop exits. All 4 pipe_buffer slots now reference page cache pages -- zero data copies so far.',
    highlights: ['multi-folio', 'head-advance'],
    data: cloneState(state),
  });

  // Frame 6: splice_file_to_pipe returns, wakes pipe readers
  state.currentFunction = 'splice_file_to_pipe';
  state.srcRef = 'fs/splice.c:1291-1293 splice_file_to_pipe(): pipe_unlock(opipe) at line 1291, wakeup_pipe_readers(opipe) at line 1293';
  frames.push({
    step: 6,
    label: 'splice_file_to_pipe() unlocks pipe, wakes readers',
    description: 'Back in splice_file_to_pipe() at fs/splice.c:1280, after do_splice_read() returns the number of bytes spliced (line 1290), pipe_unlock(opipe) at line 1291 releases the pipe mutex. If ret > 0, wakeup_pipe_readers(opipe) at line 1293 wakes any processes sleeping on pipe->rd_wait. The pipe now contains 4 slots referencing page cache pages. A subsequent read() from the pipe will copy data from those page cache pages to userspace via copy_page_to_iter().',
    highlights: ['splice-complete', 'wake-readers'],
    data: cloneState(state),
  });

  // Frame 7: Reader reads from pipe, releasing page cache refs
  state.phase = 'read';
  state.tail = 2;
  state.buffers = state.buffers.slice(2);
  state.currentFunction = 'anon_pipe_read';
  state.srcRef = 'fs/pipe.c:321-361 anon_pipe_read(): copy_page_to_iter(buf->page) at line 343, pipe_update_tail() -> page_cache_pipe_buf_ops.release()';
  frames.push({
    step: 7,
    label: 'Reader consumes spliced data: page cache refs released',
    description: 'When the reader calls read() on the pipe, anon_pipe_read() at fs/pipe.c:269 processes each pipe_buffer. copy_page_to_iter(buf->page, buf->offset, chars, to) at line 343 copies from the page cache page to userspace. When buf->len reaches 0 (line 359), pipe_update_tail() at line 361 calls pipe_buf_release(pipe, buf) at line 242, which invokes buf->ops->release -- for page cache pages, this is generic_pipe_buf_release() at fs/pipe.c:216 which calls put_page(buf->page) to drop the reference. The page remains in the page cache for future reads; only the pipe reference is released.',
    highlights: ['reader-release', 'page-cache-deref'],
    data: cloneState(state),
  });

  // Frame 8: Summary of splice zero-copy path
  state.phase = 'done';
  state.tail = 4;
  state.buffers = [];
  state.currentFunction = 'splice_folio_into_pipe';
  state.srcRef = 'mm/filemap.c:3018-3024 splice_folio_into_pipe(): .ops = &page_cache_pipe_buf_ops, .page = page, folio_get(folio) -- zero-copy by page reference';
  frames.push({
    step: 8,
    label: 'Summary: splice achieves zero-copy via page cache references',
    description: 'The splice zero-copy path avoids copying file data through userspace entirely. The flow is: do_splice() (fs/splice.c:1300) -> splice_file_to_pipe() (line 1280) -> do_splice_read() (line 954) -> filemap_splice_read() (mm/filemap.c:3053) -> splice_folio_into_pipe() (mm/filemap.c:3004). The key insight is that pipe_buffer.page points directly to the page cache page (not a copy), with folio_get() incrementing the reference count. The pipe_buffer uses page_cache_pipe_buf_ops (not anon_pipe_buf_ops), whose .release = generic_pipe_buf_release which calls put_page(). This is fundamentally different from a read()+write() which would copy data: file -> kernel buffer -> userspace -> kernel buffer -> pipe page.',
    highlights: ['summary', 'zero-copy-path'],
    data: cloneState(state),
  });

  return frames;
}

/* ---------- SVG Rendering ---------- */

const NS = 'http://www.w3.org/2000/svg';

const PHASE_COLORS: Record<string, string> = {
  'create': '#6e40c9',
  'write': '#3fb950',
  'read': '#58a6ff',
  'full': '#d29922',
  'blocked': '#f85149',
  'wake': '#f0883e',
  'splice': '#a371f7',
  'done': '#8b949e',
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

function renderRingBuffer(
  container: SVGGElement, state: PipeRingBufferState, width: number, y: number,
): void {
  const slotCount = state.maxUsage;
  const slotW = Math.min(40, (width - 80) / slotCount);
  const startX = (width - slotCount * slotW) / 2;

  for (let i = 0; i < slotCount; i++) {
    const occupied = i >= (state.tail % slotCount) && i < (state.head % slotCount)
      || (state.head - state.tail >= slotCount);
    const fill = occupied ? '#3fb950' : '#21262d';
    const stroke = i === (state.head % slotCount) ? '#f0883e' : i === (state.tail % slotCount) ? '#58a6ff' : '#484f58';

    const rect = createRect(startX + i * slotW, y, slotW - 2, 30, fill, 'ring-slot', 2);
    rect.setAttribute('stroke', stroke);
    rect.setAttribute('stroke-width', '2');
    container.appendChild(rect);

    const label = createText(startX + i * slotW + (slotW - 2) / 2, y + 19, String(i), 'slot-label');
    label.setAttribute('font-size', '10');
    label.setAttribute('fill', '#c9d1d9');
    container.appendChild(label);
  }

  // Head and tail markers
  const headX = startX + (state.head % slotCount) * slotW + (slotW - 2) / 2;
  const tailX = startX + (state.tail % slotCount) * slotW + (slotW - 2) / 2;
  container.appendChild(createText(headX, y - 5, `H=${state.head}`, 'head-marker'));
  container.appendChild(createText(tailX, y + 50, `T=${state.tail}`, 'tail-marker'));
}

function renderFrame(
  container: SVGGElement, frame: AnimationFrame, width: number, height: number,
): void {
  const state = frame.data as PipeRingBufferState;
  const phaseColor = PHASE_COLORS[state.phase] || '#8b949e';

  // Background
  container.appendChild(createRect(0, 0, width, height, '#0d1117', 'background', 0));

  // Title bar
  container.appendChild(createRect(10, 10, width - 20, 36, phaseColor + '33', 'title-bar', 6));
  const titleText = createText(width / 2, 34, frame.label, 'title');
  titleText.setAttribute('fill', phaseColor);
  titleText.setAttribute('font-size', '14');
  titleText.setAttribute('font-weight', 'bold');
  container.appendChild(titleText);

  // Current function
  const fnText = createText(width / 2, 65, state.currentFunction + '()', 'function-name');
  fnText.setAttribute('fill', '#f0883e');
  fnText.setAttribute('font-size', '12');
  container.appendChild(fnText);

  // Ring buffer visualization
  renderRingBuffer(container, state, width, 85);

  // Status indicators
  let statusY = 150;
  if (state.writerBlocked) {
    const blockedText = createText(width / 2, statusY, 'WRITER BLOCKED on wr_wait', 'status-blocked');
    blockedText.setAttribute('fill', '#f85149');
    blockedText.setAttribute('font-size', '11');
    container.appendChild(blockedText);
    statusY += 18;
  }
  if (state.readerBlocked) {
    const blockedText = createText(width / 2, statusY, 'READER BLOCKED on rd_wait', 'status-blocked');
    blockedText.setAttribute('fill', '#f85149');
    blockedText.setAttribute('font-size', '11');
    container.appendChild(blockedText);
    statusY += 18;
  }

  // Buffer info
  const usedSlots = state.head - state.tail;
  const infoText = createText(width / 2, statusY, `Used: ${usedSlots}/${state.maxUsage} slots`, 'buffer-info');
  infoText.setAttribute('fill', '#8b949e');
  infoText.setAttribute('font-size', '11');
  container.appendChild(infoText);

  // Source reference
  const srcText = createText(width / 2, height - 10, state.srcRef.substring(0, 80) + '...', 'src-ref');
  srcText.setAttribute('fill', '#484f58');
  srcText.setAttribute('font-size', '9');
  container.appendChild(srcText);
}

/* ---------- Module export ---------- */

const pipeRingBufferModule: AnimationModule = {
  config: {
    id: 'pipe-ring-buffer',
    title: 'Pipe Ring Buffer: Write, Read, and Splice',
    skillName: 'pipe-and-fifo',
  },

  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario) {
      case 'pipe-full-and-block':
        return generatePipeFullAndBlock();
      case 'splice-zero-copy':
        return generateSpliceZeroCopy();
      case 'pipe-write-read':
      default:
        return generatePipeWriteRead();
    }
  },

  renderFrame,

  getScenarios(): AnimationScenario[] {
    return [
      { id: 'pipe-write-read', label: 'Pipe Write & Read Cycle' },
      { id: 'pipe-full-and-block', label: 'Pipe Full & Writer Blocking' },
      { id: 'splice-zero-copy', label: 'Splice Zero-Copy (File to Pipe)' },
    ];
  },
};

export default pipeRingBufferModule;

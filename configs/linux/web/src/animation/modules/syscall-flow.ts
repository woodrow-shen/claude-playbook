import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

export interface SyscallState {
  mode: 'user' | 'kernel';
  currentFunction: string;
  registers: { rax: string; rdi: string; rsi: string; rdx: string };
  stack: string[];
  srcRef: string;
  phase: 'userspace' | 'entry' | 'dispatch' | 'handler' | 'vfs' | 'pagecache' | 'exit' | 'sysret' | 'error';
  errorCode: number | null;
}

function cloneState(s: SyscallState): SyscallState {
  return {
    mode: s.mode,
    currentFunction: s.currentFunction,
    registers: { ...s.registers },
    stack: [...s.stack],
    srcRef: s.srcRef,
    phase: s.phase,
    errorCode: s.errorCode,
  };
}

// ---------------------------------------------------------------------------
// Scenario: syscall-entry-exit (default)
// Complete path: userspace SYSCALL -> entry_SYSCALL_64 -> dispatch -> return
// ---------------------------------------------------------------------------
function generateSyscallEntryExit(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: SyscallState = {
    mode: 'user',
    currentFunction: 'libc:read()',
    registers: { rax: '0x0 (__NR_read)', rdi: '0x3 (fd)', rsi: '0x7ffd1000 (buf)', rdx: '0x1000 (count)' },
    stack: ['user: main()', 'user: libc:read()'],
    srcRef: '',
    phase: 'userspace',
    errorCode: null,
  };

  // Frame 0: Userspace prepares syscall
  state.srcRef = 'arch/x86/entry/syscalls/syscall_64.tbl:12 (0 common read sys_read)';
  frames.push({
    step: 0,
    label: 'Userspace prepares system call',
    description: 'The process calls read(fd, buf, 4096) in userspace. glibc sets up registers per the x86-64 ABI: RAX=0 (syscall number for read from arch/x86/entry/syscalls/syscall_64.tbl:12), RDI=fd, RSI=buf pointer, RDX=count. The SYSCALL instruction will transfer control to the kernel.',
    highlights: ['reg-rax'],
    data: cloneState(state),
  });

  // Frame 1: SYSCALL instruction executes
  state.mode = 'kernel';
  state.currentFunction = 'entry_SYSCALL_64';
  state.phase = 'entry';
  state.stack.push('kernel: entry_SYSCALL_64');
  state.srcRef = 'arch/x86/entry/entry_64.S:87 (SYM_CODE_START(entry_SYSCALL_64))';
  frames.push({
    step: 1,
    label: 'SYSCALL instruction enters kernel',
    description: 'The CPU executes SYSCALL. Hardware saves RIP into RCX and RFLAGS into R11, then loads the kernel CS/SS from MSR_STAR and RIP from MSR_LSTAR (pointing to entry_SYSCALL_64). At arch/x86/entry/entry_64.S:87, the first instruction is swapgs (line 91), which switches GS base from user to kernel per-CPU data.',
    highlights: ['mode-indicator'],
    data: cloneState(state),
  });

  // Frame 2: Stack switch and pt_regs construction
  state.currentFunction = 'entry_SYSCALL_64 (pt_regs)';
  state.srcRef = 'arch/x86/entry/entry_64.S:93-109 (SWITCH_TO_KERNEL_CR3, push pt_regs)';
  frames.push({
    step: 2,
    label: 'Switch to kernel stack, build pt_regs',
    description: 'entry_SYSCALL_64 saves RSP to tss.sp2 (line 93), switches page tables via SWITCH_TO_KERNEL_CR3 (line 94), and loads the kernel stack from cpu_current_top_of_stack (line 95). Lines 101-107 push SS, SP, RFLAGS, CS, RIP onto the stack to build struct pt_regs. PUSH_AND_CLEAR_REGS at line 109 saves and zeroes remaining registers, setting RAX to -ENOSYS as default return.',
    highlights: ['stack-frame'],
    data: cloneState(state),
  });

  // Frame 3: do_syscall_64 called
  state.currentFunction = 'do_syscall_64()';
  state.stack.push('kernel: do_syscall_64');
  state.phase = 'dispatch';
  state.srcRef = 'arch/x86/entry/entry_64.S:121 (call do_syscall_64) -> arch/x86/entry/syscall_64.c:87';
  frames.push({
    step: 3,
    label: 'do_syscall_64() dispatches syscall',
    description: 'At arch/x86/entry/entry_64.S:121, "call do_syscall_64" transfers to arch/x86/entry/syscall_64.c:87. do_syscall_64() first calls add_random_kstack_offset() (line 89) for stack randomization, then syscall_enter_from_user_mode(regs, nr) at line 90 which transitions RCU, enables IRQs (include/linux/entry-common.h:186), and runs seccomp/ptrace/audit hooks.',
    highlights: ['stack-frame'],
    data: cloneState(state),
  });

  // Frame 4: Syscall table lookup via do_syscall_x64
  state.currentFunction = 'do_syscall_x64()';
  state.stack.push('kernel: do_syscall_x64');
  state.srcRef = 'arch/x86/entry/syscall_64.c:53-66 (do_syscall_x64) -> line 63 (x64_sys_call)';
  frames.push({
    step: 4,
    label: 'Syscall table dispatch',
    description: 'do_syscall_64() calls do_syscall_x64() at arch/x86/entry/syscall_64.c:94. do_syscall_x64() at line 53 bounds-checks nr < NR_syscalls, applies array_index_nospec() at line 62 to prevent Spectre-v1 gadgets, then calls x64_sys_call(regs, unr) at line 63. x64_sys_call() at line 35 is a switch statement over all syscall numbers, dispatching to __x64_sys_read().',
    highlights: ['reg-rax'],
    data: cloneState(state),
  });

  // Frame 5: __x64_sys_read -> ksys_read
  state.currentFunction = 'ksys_read()';
  state.stack.push('kernel: ksys_read');
  state.phase = 'handler';
  state.srcRef = 'fs/read_write.c:724-726 (SYSCALL_DEFINE3 read) -> fs/read_write.c:706 (ksys_read)';
  frames.push({
    step: 5,
    label: '__x64_sys_read() -> ksys_read()',
    description: 'SYSCALL_DEFINE3(read, ...) at fs/read_write.c:724 calls ksys_read() at line 706. ksys_read() uses CLASS(fd_pos, f)(fd) at line 708 -- a scoped fd lookup via fdget_pos() (include/linux/file.h:85) that automatically releases on scope exit. It gets the file struct and position pointer (file_ppos at line 701), then calls vfs_read() at line 717.',
    highlights: ['stack-frame'],
    data: cloneState(state),
  });

  // Frame 6: vfs_read validation
  state.currentFunction = 'vfs_read()';
  state.stack.push('kernel: vfs_read');
  state.phase = 'vfs';
  state.srcRef = 'fs/read_write.c:554-583 (vfs_read)';
  frames.push({
    step: 6,
    label: 'vfs_read() validates and dispatches',
    description: 'vfs_read() at fs/read_write.c:554 performs critical checks: FMODE_READ permission (line 558), FMODE_CAN_READ capability (line 560), access_ok() for userspace buffer (line 562), and rw_verify_area() for mandatory locking and LSM hooks (line 565). Then at line 571-576 it dispatches to file->f_op->read or file->f_op->read_iter (new_sync_read) depending on the filesystem.',
    highlights: ['stack-frame'],
    data: cloneState(state),
  });

  // Frame 7: Return value propagation
  state.currentFunction = 'vfs_read() returns';
  state.registers.rax = '0x1000 (4096 bytes read)';
  state.stack.pop(); // vfs_read
  state.stack.pop(); // ksys_read
  state.phase = 'exit';
  state.srcRef = 'fs/read_write.c:577-582 (fsnotify_access, add_rchar accounting)';
  frames.push({
    step: 7,
    label: 'Read completes, return value propagated',
    description: 'vfs_read() returns the byte count. On success (ret > 0), it calls fsnotify_access() at fs/read_write.c:578 to notify inotify/fanotify watchers, and add_rchar() at line 579 to account I/O in /proc/[pid]/io. inc_syscr() at line 581 increments the syscall read counter. Return value propagates back through ksys_read() to regs->ax.',
    highlights: ['reg-rax'],
    data: cloneState(state),
  });

  // Frame 8: syscall_exit_to_user_mode
  state.currentFunction = 'syscall_exit_to_user_mode()';
  state.srcRef = 'arch/x86/entry/syscall_64.c:100 (syscall_exit_to_user_mode) -> include/linux/entry-common.h:320';
  frames.push({
    step: 8,
    label: 'syscall_exit_to_user_mode() prepares return',
    description: 'Back in do_syscall_64() at arch/x86/entry/syscall_64.c:100, syscall_exit_to_user_mode(regs) is called. At include/linux/entry-common.h:320, this runs syscall_exit_to_user_mode_work() (line 323) for ptrace/audit/signal delivery, disables IRQs (line 324), calls syscall_exit_to_user_mode_prepare() (line 325) for TIF_NEED_RESCHED checks, and exit_to_user_mode() (line 327) to transition RCU.',
    highlights: ['mode-indicator'],
    data: cloneState(state),
  });

  // Frame 9: SYSRET fast path check
  state.currentFunction = 'do_syscall_64() SYSRET check';
  state.srcRef = 'arch/x86/entry/syscall_64.c:112-140 (SYSRET validation checks)';
  frames.push({
    step: 9,
    label: 'SYSRET eligibility check',
    description: 'do_syscall_64() returns a bool indicating SYSRET vs IRET. At arch/x86/entry/syscall_64.c:112-136, it checks: RCX==RIP and R11==RFLAGS (line 113, required by SYSRET), CS/SS match MSR_STAR values (line 117), RIP < TASK_SIZE_MAX (line 128, prevents kernel-mode SYSRET #GP vulnerability), and no RF/TF flags (line 136). If all pass, the fast SYSRET path is used.',
    highlights: ['stack-frame'],
    data: cloneState(state),
  });

  // Frame 10: SYSRET returns to userspace
  state.mode = 'user';
  state.currentFunction = 'entry_64.S: sysretq';
  state.phase = 'sysret';
  state.stack = ['user: main()', 'user: libc:read()'];
  state.srcRef = 'arch/x86/entry/entry_64.S:137-166 (syscall_return_via_sysret -> sysretq)';
  frames.push({
    step: 10,
    label: 'SYSRET returns to userspace',
    description: 'At arch/x86/entry/entry_64.S:137, syscall_return_via_sysret restores registers via POP_REGS (line 139), switches to trampoline stack (lines 145-146), calls STACKLEAK_ERASE_NOCLOBBER (line 156), SWITCH_TO_USER_CR3_STACK (line 158) to restore user page tables, swapgs (line 164) to restore user GS, CLEAR_CPU_BUFFERS (line 165) for MDS mitigation, and finally sysretq (line 166) which loads RIP from RCX.',
    highlights: ['mode-indicator'],
    data: cloneState(state),
  });

  // Frame 11: Back in userspace
  state.currentFunction = 'libc:read() returns';
  state.registers.rax = '0x1000 (4096)';
  state.phase = 'userspace';
  state.srcRef = 'arch/x86/entry/entry_64.S:166 (sysretq completed)';
  frames.push({
    step: 11,
    label: 'Userspace receives return value',
    description: 'Execution resumes in userspace at the instruction after SYSCALL. RAX contains the return value (4096 bytes read). glibc checks if RAX is negative (indicating -errno); since it is positive, read() returns 4096. The full kernel round-trip: entry_SYSCALL_64 (arch/x86/entry/entry_64.S:87) -> do_syscall_64 (syscall_64.c:87) -> ksys_read (fs/read_write.c:706) -> vfs_read (line 554) -> sysretq (entry_64.S:166).',
    highlights: ['reg-rax'],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario: fast-path-read
// sys_read() fast path through VFS to page cache hit
// ---------------------------------------------------------------------------
function generateFastPathRead(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: SyscallState = {
    mode: 'user',
    currentFunction: 'libc:read()',
    registers: { rax: '0x0 (__NR_read)', rdi: '0x5 (fd)', rsi: '0x7ffd2000 (buf)', rdx: '0x200 (512)' },
    stack: ['user: main()', 'user: libc:read()'],
    srcRef: '',
    phase: 'userspace',
    errorCode: null,
  };

  // Frame 0
  state.srcRef = 'arch/x86/entry/entry_64.S:87 (entry_SYSCALL_64)';
  frames.push({
    step: 0,
    label: 'read(fd=5, buf, 512) enters kernel',
    description: 'Process calls read() on an already-opened regular file (ext4). The SYSCALL instruction enters entry_SYSCALL_64 at arch/x86/entry/entry_64.S:87, which performs swapgs, stack switch, and builds pt_regs. do_syscall_64() at arch/x86/entry/syscall_64.c:87 dispatches to __x64_sys_read.',
    highlights: ['mode-indicator'],
    data: cloneState(state),
  });

  // Frame 1: ksys_read fd lookup
  state.mode = 'kernel';
  state.currentFunction = 'ksys_read()';
  state.phase = 'handler';
  state.stack.push('kernel: entry_SYSCALL_64', 'kernel: do_syscall_64', 'kernel: ksys_read');
  state.srcRef = 'fs/read_write.c:706-721 (ksys_read)';
  frames.push({
    step: 1,
    label: 'ksys_read() looks up file descriptor',
    description: 'ksys_read() at fs/read_write.c:706 uses CLASS(fd_pos, f)(fd) at line 708 to call fdget_pos(), which looks up fd 5 in current->files->fdt (the file descriptor table). This is a lockless fast path using RCU for the common case where the fd is not shared. file_ppos() at line 712 returns &file->f_pos for the current position.',
    highlights: ['stack-frame'],
    data: cloneState(state),
  });

  // Frame 2: vfs_read checks
  state.currentFunction = 'vfs_read()';
  state.stack.push('kernel: vfs_read');
  state.phase = 'vfs';
  state.srcRef = 'fs/read_write.c:554-576 (vfs_read permission and dispatch)';
  frames.push({
    step: 2,
    label: 'vfs_read() permission checks pass',
    description: 'vfs_read() at fs/read_write.c:554 validates: FMODE_READ (line 558), FMODE_CAN_READ (line 560), access_ok() (line 562), rw_verify_area() (line 565) which calls security_file_permission() for LSM checks. All pass. Since ext4 implements read_iter, vfs_read dispatches via new_sync_read() at line 574, which sets up a kiocb and iov_iter.',
    highlights: ['stack-frame'],
    data: cloneState(state),
  });

  // Frame 3: generic_file_read_iter
  state.currentFunction = 'generic_file_read_iter()';
  state.stack.push('kernel: generic_file_read_iter');
  state.srcRef = 'mm/filemap.c:2956-2997 (generic_file_read_iter)';
  frames.push({
    step: 3,
    label: 'generic_file_read_iter() enters page cache',
    description: 'ext4 read_iter points to generic_file_read_iter() at mm/filemap.c:2956. For buffered I/O (non-IOCB_DIRECT), it falls through to filemap_read() at line 2997. This is the core page cache read path. The file mapping (address_space) maps file offsets to cached folios.',
    highlights: ['stack-frame'],
    data: cloneState(state),
  });

  // Frame 4: filemap_read page cache lookup
  state.currentFunction = 'filemap_read()';
  state.stack.push('kernel: filemap_read');
  state.phase = 'pagecache';
  state.srcRef = 'mm/filemap.c:2768 (filemap_read)';
  frames.push({
    step: 4,
    label: 'filemap_read() searches page cache',
    description: 'filemap_read() at mm/filemap.c:2768 enters a loop. It calls filemap_get_pages() which uses filemap_get_read_batch() to look up folios in the XArray (radix tree) via mapping->i_pages. For a cache HIT, the folio is already in memory with PG_uptodate set. No disk I/O needed.',
    highlights: ['stack-frame'],
    data: cloneState(state),
  });

  // Frame 5: Page cache hit - copy to user
  state.currentFunction = 'copy_folio_to_iter()';
  state.srcRef = 'mm/filemap.c:2768 (filemap_read copy loop)';
  frames.push({
    step: 5,
    label: 'Page cache HIT -- copy to userspace',
    description: 'The folio is found in the page cache with PG_uptodate set. filemap_read() at mm/filemap.c:2768 calls copy_folio_to_iter() which uses copy_to_user() to transfer 512 bytes from the kernel page to the userspace buffer. This is a single memcpy from the page frame to the user-provided address. No context switch, no disk I/O, no blocking.',
    highlights: ['reg-rsi'],
    data: cloneState(state),
  });

  // Frame 6: Mark folio accessed for LRU
  state.currentFunction = 'folio_mark_accessed()';
  state.srcRef = 'mm/filemap.c:2768 (filemap_read -> folio_mark_accessed for LRU aging)';
  frames.push({
    step: 6,
    label: 'Mark folio accessed for LRU aging',
    description: 'filemap_read() calls folio_mark_accessed() to update the folio LRU position. On first access, it sets PG_referenced. On second access, it promotes the folio to the active LRU list. This prevents frequently-read file data from being evicted by page reclaim (kswapd). Readahead may also trigger here via filemap_readahead() at mm/filemap.c:2653.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 7: Return through VFS
  state.currentFunction = 'vfs_read() returns';
  state.registers.rax = '0x200 (512 bytes read)';
  state.phase = 'exit';
  state.stack = ['user: main()', 'user: libc:read()', 'kernel: entry_SYSCALL_64', 'kernel: do_syscall_64'];
  state.srcRef = 'fs/read_write.c:577-582 (vfs_read accounting on success)';
  frames.push({
    step: 7,
    label: 'Return through VFS with byte count',
    description: 'filemap_read returns 512. generic_file_read_iter returns 512. vfs_read at fs/read_write.c:577 sees ret > 0, calls fsnotify_access() (line 578) and add_rchar(current, 512) (line 579) for /proc/[pid]/io accounting. ksys_read at line 718-719 updates f_pos. Return value lands in regs->ax.',
    highlights: ['reg-rax'],
    data: cloneState(state),
  });

  // Frame 8: Fast SYSRET return
  state.mode = 'user';
  state.currentFunction = 'sysretq';
  state.phase = 'sysret';
  state.stack = ['user: main()', 'user: libc:read()'];
  state.srcRef = 'arch/x86/entry/entry_64.S:137-166 (syscall_return_via_sysret)';
  frames.push({
    step: 8,
    label: 'SYSRET fast return to userspace',
    description: 'syscall_exit_to_user_mode() runs exit work (signals, rescheduling). do_syscall_64() returns true (SYSRET eligible). At arch/x86/entry/entry_64.S:137, POP_REGS restores registers, SWITCH_TO_USER_CR3 restores user page tables, swapgs restores user GS, sysretq at line 166 loads RIP from RCX. Total time for page cache hit: ~1-2 microseconds.',
    highlights: ['mode-indicator'],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario: error-handling
// Syscall with invalid args, error propagation to errno
// ---------------------------------------------------------------------------
function generateErrorHandling(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: SyscallState = {
    mode: 'user',
    currentFunction: 'libc:read()',
    registers: { rax: '0x0 (__NR_read)', rdi: '0xffffffff (-1, bad fd)', rsi: '0x7ffd3000 (buf)', rdx: '0x100 (256)' },
    stack: ['user: main()', 'user: libc:read()'],
    srcRef: '',
    phase: 'userspace',
    errorCode: null,
  };

  // Frame 0
  state.srcRef = 'arch/x86/entry/syscalls/syscall_64.tbl:12 (0 common read sys_read)';
  frames.push({
    step: 0,
    label: 'read() called with fd=-1 (invalid)',
    description: 'The process calls read(-1, buf, 256). RDI contains 0xffffffff (unsigned) which is -1 as signed int. This is an invalid file descriptor. The SYSCALL instruction will enter the kernel normally -- argument validation happens inside the syscall handler, not at the entry point. Syscall number 0 from arch/x86/entry/syscalls/syscall_64.tbl:12.',
    highlights: ['reg-rdi'],
    data: cloneState(state),
  });

  // Frame 1: Enter kernel
  state.mode = 'kernel';
  state.currentFunction = 'entry_SYSCALL_64';
  state.phase = 'entry';
  state.stack.push('kernel: entry_SYSCALL_64');
  state.srcRef = 'arch/x86/entry/entry_64.S:87-121 (entry through do_syscall_64 call)';
  frames.push({
    step: 1,
    label: 'Normal kernel entry via entry_SYSCALL_64',
    description: 'entry_SYSCALL_64 at arch/x86/entry/entry_64.S:87 executes identically for valid and invalid arguments. swapgs (line 91), stack switch (line 95), pt_regs construction (lines 101-109), PUSH_AND_CLEAR_REGS with RAX=-ENOSYS default (line 109). The -ENOSYS default is overwritten by the syscall return value. do_syscall_64() is called at line 121.',
    highlights: ['mode-indicator'],
    data: cloneState(state),
  });

  // Frame 2: Dispatch to ksys_read
  state.currentFunction = 'ksys_read()';
  state.phase = 'dispatch';
  state.stack.push('kernel: do_syscall_64', 'kernel: ksys_read');
  state.srcRef = 'fs/read_write.c:706-722 (ksys_read)';
  frames.push({
    step: 2,
    label: 'ksys_read() attempts fd lookup',
    description: 'do_syscall_64() dispatches to ksys_read() at fs/read_write.c:706. CLASS(fd_pos, f)(fd) at line 708 calls fdget_pos(-1 cast to unsigned int = 4294967295). The fd table lookup fails -- there is no file at that index. fd_empty(f) returns true at line 711.',
    highlights: ['reg-rdi'],
    data: cloneState(state),
  });

  // Frame 3: EBADF returned
  state.currentFunction = 'ksys_read() -> -EBADF';
  state.phase = 'error';
  state.errorCode = -9;
  state.registers.rax = '-9 (-EBADF)';
  state.srcRef = 'fs/read_write.c:709 (ret = -EBADF) -> line 721 (return ret)';
  frames.push({
    step: 3,
    label: 'fd lookup fails: -EBADF',
    description: 'At fs/read_write.c:709, ret is initialized to -EBADF (which is -9). The if(!fd_empty(f)) check at line 711 is false -- the fd does not exist. The function skips directly to return ret at line 721, returning -9. vfs_read() is NEVER called. The error is caught at the earliest possible point, before any VFS or filesystem code runs.',
    highlights: ['reg-rax'],
    data: cloneState(state),
  });

  // Frame 4: Error propagates through do_syscall_64
  state.currentFunction = 'do_syscall_64()';
  state.stack = ['user: main()', 'user: libc:read()', 'kernel: entry_SYSCALL_64', 'kernel: do_syscall_64'];
  state.srcRef = 'arch/x86/entry/syscall_64.c:63 (regs->ax = x64_sys_call return value)';
  frames.push({
    step: 4,
    label: 'Error stored in regs->ax',
    description: 'x64_sys_call() at arch/x86/entry/syscall_64.c:35 returned -9. do_syscall_x64() at line 63 stores this in regs->ax. Back in do_syscall_64() at line 94, the return value -9 is now in pt_regs. The kernel uses negative values in the range [-4095, -1] to indicate errors -- this convention is baked into the x86-64 ABI.',
    highlights: ['reg-rax'],
    data: cloneState(state),
  });

  // Frame 5: syscall_exit_to_user_mode
  state.currentFunction = 'syscall_exit_to_user_mode()';
  state.phase = 'exit';
  state.srcRef = 'arch/x86/entry/syscall_64.c:100 -> include/linux/entry-common.h:320-327';
  frames.push({
    step: 5,
    label: 'Exit work: signals, tracing, audit',
    description: 'syscall_exit_to_user_mode() at include/linux/entry-common.h:320 runs regardless of success or failure. syscall_exit_to_user_mode_work() at line 323 handles: audit_syscall_exit() logs the -EBADF if auditing is enabled, ptrace SYSCALL_EXIT_STOP if traced, and pending signal delivery. The error value in regs->ax is NOT modified by exit work.',
    highlights: ['stack-frame'],
    data: cloneState(state),
  });

  // Frame 6: SYSRET back to userspace
  state.mode = 'user';
  state.currentFunction = 'sysretq';
  state.phase = 'sysret';
  state.stack = ['user: main()', 'user: libc:read()'];
  state.srcRef = 'arch/x86/entry/entry_64.S:137-166 (syscall_return_via_sysret)';
  frames.push({
    step: 6,
    label: 'SYSRET returns with -EBADF in RAX',
    description: 'do_syscall_64() returns true (SYSRET eligible -- error values do not affect SYSRET eligibility). At arch/x86/entry/entry_64.S:137, registers are restored. RAX now contains -9 (0xfffffffffffffff7). swapgs at line 164, sysretq at line 166 returns to userspace. The CPU loads RIP from RCX, continuing after the SYSCALL instruction.',
    highlights: ['mode-indicator', 'reg-rax'],
    data: cloneState(state),
  });

  // Frame 7: glibc errno handling
  state.currentFunction = 'libc: __syscall_error';
  state.phase = 'userspace';
  state.srcRef = 'arch/x86/entry/entry_64.S:166 (returned to userspace via sysretq)';
  frames.push({
    step: 7,
    label: 'glibc detects error, sets errno',
    description: 'Back in userspace. glibc wrapper checks RAX: if the value is in [-4095, -1], it is an error. glibc negates it (9 = EBADF), stores 9 in the thread-local errno variable, and returns -1 from read(). The caller sees read() == -1 and can check errno == EBADF. The kernel never touches errno directly -- it only returns negative values in RAX.',
    highlights: ['reg-rax'],
    data: cloneState(state),
  });

  // Frame 8: Alternative error paths
  state.currentFunction = 'error path comparison';
  state.srcRef = 'fs/read_write.c:558-565 (vfs_read error checks)';
  frames.push({
    step: 8,
    label: 'Other error paths in sys_read',
    description: 'Compare with errors caught deeper in the call chain. vfs_read() at fs/read_write.c:558 returns -EBADF if !FMODE_READ, -EINVAL if !FMODE_CAN_READ (line 560), -EFAULT if !access_ok() on the buffer (line 562), and rw_verify_area() at line 565 can return -EAGAIN for mandatory locking or -EACCES from LSM hooks. Each returns a different negative errno. The fd=-1 case never reaches these deeper checks.',
    highlights: [],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// SVG Rendering
// ---------------------------------------------------------------------------
const NS = 'http://www.w3.org/2000/svg';

const MODE_COLORS: Record<string, string> = {
  user: '#3fb950',
  kernel: '#58a6ff',
};

const PHASE_LABELS = [
  { id: 'userspace', label: 'User' },
  { id: 'entry', label: 'Entry' },
  { id: 'dispatch', label: 'Dispatch' },
  { id: 'handler', label: 'Handler' },
  { id: 'vfs', label: 'VFS' },
  { id: 'pagecache', label: 'PageCache' },
  { id: 'exit', label: 'Exit' },
  { id: 'sysret', label: 'SYSRET' },
];

function getActivePhaseIndex(phase: string): number {
  switch (phase) {
    case 'userspace': return 0;
    case 'entry': return 1;
    case 'dispatch': return 2;
    case 'handler': return 3;
    case 'vfs': return 4;
    case 'pagecache': return 5;
    case 'exit': return 6;
    case 'sysret': return 7;
    case 'error': return 3;
    default: return -1;
  }
}

function renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void {
  while (container.firstChild) container.removeChild(container.firstChild);
  const data = frame.data as SyscallState;
  const margin = { top: 10, left: 15, right: 15, bottom: 10 };
  const usableWidth = width - margin.left - margin.right;

  // Title
  const title = document.createElementNS(NS, 'text');
  title.setAttribute('x', String(width / 2));
  title.setAttribute('y', '18');
  title.setAttribute('text-anchor', 'middle');
  title.setAttribute('class', 'anim-title');
  title.textContent = 'System Call Flow';
  container.appendChild(title);

  // --- Mode indicator (User / Kernel) ---
  const modeTop = margin.top + 28;
  const modeWidth = 180;
  const modeHeight = 30;
  const modeColor = MODE_COLORS[data.mode] || '#30363d';

  const modeRect = document.createElementNS(NS, 'rect');
  modeRect.setAttribute('x', String(margin.left));
  modeRect.setAttribute('y', String(modeTop));
  modeRect.setAttribute('width', String(modeWidth));
  modeRect.setAttribute('height', String(modeHeight));
  modeRect.setAttribute('rx', '6');
  modeRect.setAttribute('fill', modeColor);
  let modeCls = 'anim-mode';
  if (frame.highlights.includes('mode-indicator')) modeCls += ' anim-highlight';
  modeRect.setAttribute('class', modeCls);
  container.appendChild(modeRect);

  const modeText = document.createElementNS(NS, 'text');
  modeText.setAttribute('x', String(margin.left + modeWidth / 2));
  modeText.setAttribute('y', String(modeTop + 20));
  modeText.setAttribute('text-anchor', 'middle');
  modeText.setAttribute('class', 'anim-mode');
  modeText.setAttribute('fill', '#e6edf3');
  modeText.textContent = data.mode === 'user' ? 'USER MODE (Ring 3)' : 'KERNEL MODE (Ring 0)';
  container.appendChild(modeText);

  // --- Registers ---
  const regTop = margin.top + 28;
  const regLeft = width - margin.right - 280;

  const regTitle = document.createElementNS(NS, 'text');
  regTitle.setAttribute('x', String(regLeft));
  regTitle.setAttribute('y', String(regTop));
  regTitle.setAttribute('class', 'anim-cpu-label');
  regTitle.textContent = 'Registers';
  container.appendChild(regTitle);

  const regEntries = [
    { name: 'RAX', value: data.registers.rax, id: 'reg-rax' },
    { name: 'RDI', value: data.registers.rdi, id: 'reg-rdi' },
    { name: 'RSI', value: data.registers.rsi, id: 'reg-rsi' },
    { name: 'RDX', value: data.registers.rdx, id: 'reg-rdx' },
  ];

  regEntries.forEach((reg, i) => {
    const ry = regTop + 8 + i * 20;
    const isHighlighted = frame.highlights.includes(reg.id);

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(regLeft));
    rect.setAttribute('y', String(ry));
    rect.setAttribute('width', '270');
    rect.setAttribute('height', '16');
    rect.setAttribute('rx', '2');
    rect.setAttribute('fill', isHighlighted ? '#1f6feb' : '#21262d');
    let regCls = 'anim-register';
    if (isHighlighted) regCls += ' anim-highlight';
    rect.setAttribute('class', regCls);
    container.appendChild(rect);

    const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', String(regLeft + 4));
    label.setAttribute('y', String(ry + 12));
    label.setAttribute('fill', '#8b949e');
    label.setAttribute('font-size', '10');
    label.setAttribute('class', 'anim-register');
    label.textContent = `${reg.name}: ${reg.value}`;
    container.appendChild(label);
  });

  // --- Phase flow diagram ---
  const flowTop = modeTop + modeHeight + 25;
  const phaseCount = PHASE_LABELS.length;
  const phaseWidth = Math.min(85, (usableWidth - (phaseCount - 1) * 6) / phaseCount);
  const phaseHeight = 28;
  const activeIndex = getActivePhaseIndex(data.phase);

  PHASE_LABELS.forEach((phase, i) => {
    const px = margin.left + i * (phaseWidth + 6);
    const isActive = i === activeIndex;
    const isPast = activeIndex > 0 && i < activeIndex;
    const isError = data.phase === 'error' && i === activeIndex;

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(px));
    rect.setAttribute('y', String(flowTop));
    rect.setAttribute('width', String(phaseWidth));
    rect.setAttribute('height', String(phaseHeight));
    rect.setAttribute('rx', '4');
    let blockClass = 'anim-block';
    if (isError) {
      blockClass += ' anim-block-allocated anim-highlight';
      rect.setAttribute('fill', '#f85149');
    } else if (isActive) {
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
    label.setAttribute('class', 'anim-cpu-label');
    label.textContent = phase.label;
    container.appendChild(label);

    // Arrow between phases
    if (i < phaseCount - 1) {
      const arrowX = px + phaseWidth;
      const arrowY = flowTop + phaseHeight / 2;
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', String(arrowX));
      line.setAttribute('y1', String(arrowY));
      line.setAttribute('x2', String(arrowX + 6));
      line.setAttribute('y2', String(arrowY));
      line.setAttribute('stroke', '#8b949e');
      line.setAttribute('stroke-width', '2');
      container.appendChild(line);
    }
  });

  // --- Error indicator ---
  if (data.errorCode !== null) {
    const errText = document.createElementNS(NS, 'text');
    errText.setAttribute('x', String(width / 2));
    errText.setAttribute('y', String(flowTop - 6));
    errText.setAttribute('text-anchor', 'middle');
    errText.setAttribute('fill', '#f85149');
    errText.setAttribute('font-size', '11');
    errText.setAttribute('class', 'anim-highlight');
    errText.textContent = `ERROR: ${data.errorCode} (${data.errorCode === -9 ? 'EBADF' : data.errorCode === -14 ? 'EFAULT' : 'errno'})`;
    container.appendChild(errText);
  }

  // --- Current function ---
  const funcTop = flowTop + phaseHeight + 18;
  const funcText = document.createElementNS(NS, 'text');
  funcText.setAttribute('x', String(margin.left));
  funcText.setAttribute('y', String(funcTop));
  funcText.setAttribute('fill', '#e6edf3');
  funcText.setAttribute('font-size', '12');
  funcText.setAttribute('class', 'anim-cpu-label');
  funcText.textContent = `Current: ${data.currentFunction}`;
  container.appendChild(funcText);

  // --- Stack frames ---
  const stackTop = funcTop + 16;
  const stackLabel = document.createElementNS(NS, 'text');
  stackLabel.setAttribute('x', String(margin.left));
  stackLabel.setAttribute('y', String(stackTop));
  stackLabel.setAttribute('class', 'anim-cpu-label');
  stackLabel.textContent = 'Call Stack:';
  container.appendChild(stackLabel);

  const stackEntryHeight = 20;
  const stackEntryWidth = 200;

  data.stack.forEach((entry, i) => {
    const sy = stackTop + 8 + i * (stackEntryHeight + 2);
    const sx = margin.left + i * 10;
    const isKernel = entry.startsWith('kernel:');

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(sx));
    rect.setAttribute('y', String(sy));
    rect.setAttribute('width', String(stackEntryWidth));
    rect.setAttribute('height', String(stackEntryHeight));
    rect.setAttribute('rx', '3');
    rect.setAttribute('fill', isKernel ? '#1f4068' : '#1a3a1a');
    rect.setAttribute('opacity', '0.8');
    let stackCls = 'anim-stack-frame';
    if (frame.highlights.includes('stack-frame') && i === data.stack.length - 1) {
      stackCls += ' anim-highlight';
    }
    rect.setAttribute('class', stackCls);
    container.appendChild(rect);

    const text = document.createElementNS(NS, 'text');
    text.setAttribute('x', String(sx + 6));
    text.setAttribute('y', String(sy + stackEntryHeight / 2 + 4));
    text.setAttribute('fill', '#e6edf3');
    text.setAttribute('font-size', '10');
    text.setAttribute('class', 'anim-stack-frame');
    text.textContent = entry;
    container.appendChild(text);
  });
}

// ---------------------------------------------------------------------------
// Module export
// ---------------------------------------------------------------------------
const SCENARIOS: AnimationScenario[] = [
  { id: 'syscall-entry-exit', label: 'Syscall Entry/Exit (read)' },
  { id: 'fast-path-read', label: 'Fast Path Read (page cache hit)' },
  { id: 'error-handling', label: 'Error Handling (bad fd)' },
];

const syscallFlow: AnimationModule = {
  config: {
    id: 'syscall-flow',
    title: 'System Call Flow',
    skillName: 'system-calls',
  },
  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario) {
      case 'fast-path-read': return generateFastPathRead();
      case 'error-handling': return generateErrorHandling();
      case 'syscall-entry-exit':
      default: return generateSyscallEntryExit();
    }
  },
  renderFrame,
  getScenarios: () => SCENARIOS,
};

export default syscallFlow;

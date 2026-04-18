import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

export interface SignalDeliveryState {
  sender: { pid: number; name: string };
  receiver: { pid: number; name: string };
  signalNumber: number;
  signalName: string;
  pendingSignals: string[];
  blockedSignals: string[];
  currentFunction: string;
  phase: 'send-entry' | 'queue-signal' | 'complete' | 'wake-up' | 'get-signal' | 'handle' | 'setup-frame' | 'handler-exec' | 'sigreturn' | 'fatal';
  userStack: string[];
  srcRef: string;
}

function cloneState(s: SignalDeliveryState): SignalDeliveryState {
  return {
    sender: { ...s.sender },
    receiver: { ...s.receiver },
    signalNumber: s.signalNumber,
    signalName: s.signalName,
    pendingSignals: [...s.pendingSignals],
    blockedSignals: [...s.blockedSignals],
    currentFunction: s.currentFunction,
    phase: s.phase,
    userStack: [...s.userStack],
    srcRef: s.srcRef,
  };
}

// ---------------------------------------------------------------------------
// Scenario: signal-delivery (default)
// Process A sends SIGTERM to Process B via kill(). Trace through send path
// and receive path on return to userspace.
// ---------------------------------------------------------------------------
function generateSignalDelivery(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: SignalDeliveryState = {
    sender: { pid: 100, name: 'ProcessA' },
    receiver: { pid: 200, name: 'ProcessB' },
    signalNumber: 15,
    signalName: 'SIGTERM',
    pendingSignals: [],
    blockedSignals: [],
    currentFunction: 'kill()',
    phase: 'send-entry',
    userStack: ['user: main()', 'user: kill(200, SIGTERM)'],
    srcRef: '',
  };

  // Frame 0: Userspace calls kill() syscall
  state.srcRef = 'kernel/signal.c:3947 (SYSCALL_DEFINE2(kill, pid_t, pid, int, sig))';
  frames.push({
    step: 0,
    label: 'kill() syscall entry',
    description: 'Process A (pid 100) calls kill(200, SIGTERM). The syscall enters SYSCALL_DEFINE2(kill) at kernel/signal.c:3947. It calls prepare_kill_siginfo(sig, &info, PIDTYPE_TGID) at line 3951 to fill a kernel_siginfo struct with si_code=SI_USER, si_pid, si_uid. Then calls kill_something_info(sig, &info, pid) at line 3953.',
    highlights: ['sender'],
    data: cloneState(state),
  });

  // Frame 1: kill_something_info -> do_send_sig_info
  state.currentFunction = 'do_send_sig_info()';
  state.userStack.push('kernel: kill() -> kill_something_info()');
  state.srcRef = 'kernel/signal.c:1262 (int do_send_sig_info(int sig, struct kernel_siginfo *info, struct task_struct *p, enum pid_type type))';
  frames.push({
    step: 1,
    label: 'do_send_sig_info() acquires siglock',
    description: 'kill_something_info() at kernel/signal.c:1572 resolves the target pid and calls group_send_sig_info() which calls do_send_sig_info() at line 1262. do_send_sig_info() acquires the target task sighand->siglock via lock_task_sighand() at line 1268, then calls send_signal_locked() at line 1271.',
    highlights: ['siglock'],
    data: cloneState(state),
  });

  // Frame 2: send_signal_locked -> __send_signal_locked
  state.currentFunction = '__send_signal_locked()';
  state.phase = 'queue-signal';
  state.userStack.push('kernel: send_signal_locked()');
  state.srcRef = 'kernel/signal.c:1042 (static int __send_signal_locked(int sig, struct kernel_siginfo *info, struct task_struct *t, enum pid_type type, bool force))';
  frames.push({
    step: 2,
    label: '__send_signal_locked() allocates sigqueue',
    description: 'send_signal_locked() at kernel/signal.c:1183 performs force-signal checks and calls __send_signal_locked() at line 1042. This function selects the pending queue (per-thread t->pending or shared signal->shared_pending) at line 1045. It checks legacy_queue() at line 1063 to avoid duplicate standard signals. Then allocates a sigqueue via sigqueue_alloc() at line 1087 and adds it to pending->list via list_add_tail() at line 1090.',
    highlights: ['pending-queue'],
    data: cloneState(state),
  });

  // Frame 3: siginfo filled, signal bit set
  state.currentFunction = '__send_signal_locked() (set pending bit)';
  state.pendingSignals.push('SIGTERM');
  state.srcRef = 'kernel/signal.c:1090-1137 (list_add_tail, sigaddset(&pending->signal, sig))';
  frames.push({
    step: 3,
    label: 'sigqueue enqueued, pending bit set',
    description: 'The sigqueue info is filled at kernel/signal.c:1091-1116: for SI_USER signals from kill(), si_pid and si_uid are set at lines 1097-1103. Then sigaddset(&pending->signal, sig) at line 1137 sets the signal bit in the pending bitmask. signalfd_notify() at line 1136 wakes any signalfd waiters. Finally complete_signal() is called at line 1153.',
    highlights: ['pending-queue'],
    data: cloneState(state),
  });

  // Frame 4: complete_signal wakes receiver
  state.currentFunction = 'complete_signal()';
  state.phase = 'complete';
  state.userStack.push('kernel: complete_signal()');
  state.srcRef = 'kernel/signal.c:963 (static void complete_signal(int sig, struct task_struct *p, enum pid_type type))';
  frames.push({
    step: 4,
    label: 'complete_signal() selects target thread',
    description: 'complete_signal() at kernel/signal.c:963 selects a thread to handle the signal. It calls wants_signal() to find a thread where the signal is not blocked. For shared signals (PIDTYPE_TGID), it iterates via signal->curr_target round-robin at lines 983-996. Once a target thread t is found, signal_wake_up(t, sig == SIGKILL) is called at line 1033 (defined in include/linux/sched/signal.h:443).',
    highlights: ['receiver'],
    data: cloneState(state),
  });

  // Frame 5: signal_wake_up sets TIF_SIGPENDING
  state.currentFunction = 'signal_wake_up_state()';
  state.phase = 'wake-up';
  state.srcRef = 'kernel/signal.c:721 (void signal_wake_up_state(struct task_struct *t, unsigned int state))';
  frames.push({
    step: 5,
    label: 'signal_wake_up() sets TIF_SIGPENDING',
    description: 'signal_wake_up() (include/linux/sched/signal.h:443) calls signal_wake_up_state() at kernel/signal.c:721. This sets TIF_SIGPENDING via set_tsk_thread_flag(t, TIF_SIGPENDING) at line 725, which ensures the target thread will check for signals before returning to userspace. Then try_to_wake_up() is called at line 732 if the thread is sleeping. The send path is now complete; sender returns from kill() syscall.',
    highlights: ['tif-sigpending'],
    data: cloneState(state),
  });

  // Frame 6: Receiver returns to userspace, hits exit_to_user_mode_loop
  state.currentFunction = 'exit_to_user_mode_loop()';
  state.phase = 'get-signal';
  state.userStack = ['user: ProcessB working', 'kernel: returning from syscall/interrupt'];
  state.srcRef = 'kernel/entry/common.c:94 (exit_to_user_mode_loop) -> line 63 (_TIF_SIGPENDING check)';
  frames.push({
    step: 6,
    label: 'exit_to_user_mode_loop() checks TIF_SIGPENDING',
    description: 'When Process B returns to userspace (from a syscall, interrupt, or exception), exit_to_user_mode_loop() at kernel/entry/common.c:94 iterates __exit_to_user_mode_loop() at line 41. At line 63, if _TIF_SIGPENDING is set, arch_do_signal_or_restart() is called. On x86 this is at arch/x86/kernel/signal.c:333.',
    highlights: ['receiver'],
    data: cloneState(state),
  });

  // Frame 7: get_signal() dequeues signal
  state.currentFunction = 'get_signal()';
  state.userStack.push('kernel: arch_do_signal_or_restart() -> get_signal()');
  state.srcRef = 'kernel/signal.c:2799 (bool get_signal(struct ksignal *ksig))';
  frames.push({
    step: 7,
    label: 'get_signal() dequeues SIGTERM',
    description: 'arch_do_signal_or_restart() at arch/x86/kernel/signal.c:333 calls get_signal(&ksig) at line 337. get_signal() at kernel/signal.c:2799 acquires sighand->siglock at line 2823, then calls dequeue_signal() at line 2914 which removes the signal from the pending set and returns the signal number. For SIGTERM with a registered handler, ka->sa.sa_handler is not SIG_DFL, so get_signal() returns true with ksig populated.',
    highlights: ['pending-queue'],
    data: cloneState(state),
  });

  // Frame 8: handle_signal -> setup_rt_frame
  state.currentFunction = 'handle_signal()';
  state.phase = 'handle';
  state.pendingSignals = [];
  state.userStack.push('kernel: handle_signal()');
  state.srcRef = 'arch/x86/kernel/signal.c:255 (static void handle_signal(struct ksignal *ksig, struct pt_regs *regs))';
  frames.push({
    step: 8,
    label: 'handle_signal() prepares delivery',
    description: 'arch_do_signal_or_restart() calls handle_signal(&ksig, regs) at arch/x86/kernel/signal.c:339. handle_signal() at line 255 checks if we came from a system call (line 264) and handles restart logic. It then calls setup_rt_frame(ksig, regs) at line 303 to set up the signal frame on the user stack.',
    highlights: ['user-stack'],
    data: cloneState(state),
  });

  // Frame 9: setup_rt_frame builds signal frame on user stack
  state.currentFunction = 'setup_rt_frame()';
  state.phase = 'setup-frame';
  state.userStack.push('kernel: setup_rt_frame()');
  state.srcRef = 'arch/x86/kernel/signal.c:236 (static int setup_rt_frame(struct ksignal *ksig, struct pt_regs *regs))';
  frames.push({
    step: 9,
    label: 'setup_rt_frame() builds signal frame',
    description: 'setup_rt_frame() at arch/x86/kernel/signal.c:236 calls rseq_signal_deliver() at line 239, then dispatches to x64_setup_rt_frame() for 64-bit processes. This pushes an rt_sigframe onto the user stack containing: saved pt_regs (registers at time of interruption), the siginfo_t, ucontext with signal mask and alt-stack info, and a trampoline pointing to __kernel_rt_sigreturn in the VDSO. regs->ip is set to the handler address, regs->sp to the new frame.',
    highlights: ['user-stack'],
    data: cloneState(state),
  });

  // Frame 10: Handler executes in userspace
  state.currentFunction = 'user signal handler';
  state.phase = 'handler-exec';
  state.userStack = ['user: signal_handler(SIGTERM)', 'user: [rt_sigframe on stack]'];
  state.srcRef = 'arch/x86/kernel/signal.c:236 (setup_rt_frame set regs->ip = handler)';
  frames.push({
    step: 10,
    label: 'Signal handler executes in userspace',
    description: 'The kernel returns to userspace but with regs->ip pointing to the registered signal handler instead of the original interrupted instruction. The handler receives the signal number (and optionally siginfo_t and ucontext_t for SA_SIGINFO handlers). The rt_sigframe on the user stack preserves the original register state. When the handler returns, the VDSO trampoline __kernel_rt_sigreturn executes the rt_sigreturn syscall.',
    highlights: ['handler'],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario: signal-handler-return
// After handler executes, rt_sigreturn() restores original context.
// ---------------------------------------------------------------------------
function generateSignalHandlerReturn(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: SignalDeliveryState = {
    sender: { pid: 100, name: 'ProcessA' },
    receiver: { pid: 200, name: 'ProcessB' },
    signalNumber: 15,
    signalName: 'SIGTERM',
    pendingSignals: [],
    blockedSignals: [],
    currentFunction: 'signal_handler()',
    phase: 'handler-exec',
    userStack: ['user: signal_handler(SIGTERM)', 'user: [rt_sigframe on stack]'],
    srcRef: '',
  };

  // Frame 0: Handler is executing
  state.srcRef = 'arch/x86/kernel/signal.c:236 (setup_rt_frame previously set up this context)';
  frames.push({
    step: 0,
    label: 'Signal handler executing in userspace',
    description: 'Process B is executing its SIGTERM handler in userspace. The handler was entered via setup_rt_frame() (arch/x86/kernel/signal.c:236) which placed an rt_sigframe on the user stack. The frame contains the saved pt_regs (original register state), siginfo_t, and ucontext_t. The return address points to the VDSO __kernel_rt_sigreturn trampoline.',
    highlights: ['handler'],
    data: cloneState(state),
  });

  // Frame 1: Handler returns, VDSO trampoline
  state.currentFunction = '__kernel_rt_sigreturn (VDSO)';
  state.userStack = ['user: __kernel_rt_sigreturn (VDSO trampoline)'];
  state.srcRef = 'arch/x86/entry/syscalls/syscall_64.tbl:27 (15 64 rt_sigreturn sys_rt_sigreturn)';
  frames.push({
    step: 1,
    label: 'VDSO trampoline calls rt_sigreturn',
    description: 'When the signal handler returns, control goes to the VDSO __kernel_rt_sigreturn trampoline which executes the rt_sigreturn syscall (syscall number 15 on x86-64, from arch/x86/entry/syscalls/syscall_64.tbl:27). This enters the kernel to restore the original pre-signal context.',
    highlights: ['vdso'],
    data: cloneState(state),
  });

  // Frame 2: sys_rt_sigreturn entry
  state.currentFunction = 'sys_rt_sigreturn()';
  state.phase = 'sigreturn';
  state.userStack.push('kernel: sys_rt_sigreturn()');
  state.srcRef = 'arch/x86/kernel/signal_64.c:246 (SYSCALL_DEFINE0(rt_sigreturn))';
  frames.push({
    step: 2,
    label: 'sys_rt_sigreturn() entered',
    description: 'SYSCALL_DEFINE0(rt_sigreturn) at arch/x86/kernel/signal_64.c:246 gets the current pt_regs at line 248. It computes the rt_sigframe pointer from regs->sp at line 255. prevent_single_step_upon_eretu() is called at line 253 to handle ERETU edge cases. It then reads the saved signal mask from frame->uc.uc_sigmask at line 258 and uc_flags at line 260.',
    highlights: ['sigframe'],
    data: cloneState(state),
  });

  // Frame 3: Restore signal mask
  state.currentFunction = 'set_current_blocked()';
  state.srcRef = 'arch/x86/kernel/signal_64.c:263 (set_current_blocked(&set))';
  frames.push({
    step: 3,
    label: 'Restore signal mask',
    description: 'set_current_blocked(&set) at arch/x86/kernel/signal_64.c:263 restores the process signal mask to its pre-handler state. During handler execution, the kernel may have blocked additional signals per sa_mask; this restores the original blocked set.',
    highlights: ['sigmask'],
    data: cloneState(state),
  });

  // Frame 4: restore_altstack
  state.currentFunction = 'restore_altstack()';
  state.srcRef = 'arch/x86/kernel/signal_64.c:265 (restore_altstack(&frame->uc.uc_stack))';
  frames.push({
    step: 4,
    label: 'restore_altstack() restores alt stack',
    description: 'restore_altstack(&frame->uc.uc_stack) at arch/x86/kernel/signal_64.c:265 restores the alternate signal stack (sigaltstack) configuration from the saved ucontext. If the handler was using an alternate stack (SA_ONSTACK), this restores the original ss_sp, ss_size, and ss_flags.',
    highlights: ['altstack'],
    data: cloneState(state),
  });

  // Frame 5: restore_sigcontext
  state.currentFunction = 'restore_sigcontext()';
  state.srcRef = 'arch/x86/kernel/signal_64.c:50 (static bool restore_sigcontext(struct pt_regs *regs, struct sigcontext __user *usc, unsigned long uc_flags))';
  frames.push({
    step: 5,
    label: 'restore_sigcontext() restores registers',
    description: 'restore_sigcontext() at arch/x86/kernel/signal_64.c:50 restores all general-purpose registers from the saved sigcontext in the rt_sigframe. Called at line 268: restore_sigcontext(regs, &frame->uc.uc_mcontext, uc_flags). It uses copy_from_user() at line 59 to read the saved sigcontext struct. Registers rbx, rcx, rdx, rsi, rdi, rbp, rsp, r8-r15, rip, and flags are all restored to their pre-signal values.',
    highlights: ['registers'],
    data: cloneState(state),
  });

  // Frame 6: restore FPU and shadow stack
  state.currentFunction = 'restore_signal_shadow_stack()';
  state.srcRef = 'arch/x86/kernel/signal_64.c:271 (restore_signal_shadow_stack())';
  frames.push({
    step: 6,
    label: 'Restore shadow stack and FPU state',
    description: 'restore_signal_shadow_stack() at arch/x86/kernel/signal_64.c:271 restores the CET shadow stack state if enabled. The FPU/XSAVE state is restored as part of the sigcontext restoration. These ensure the hardware state is exactly as it was before the signal was delivered.',
    highlights: ['fpu'],
    data: cloneState(state),
  });

  // Frame 7: Return to original execution
  state.currentFunction = 'return to interrupted code';
  state.phase = 'handler-exec';
  state.userStack = ['user: main()', 'user: original_function() (resumed)'];
  state.srcRef = 'arch/x86/kernel/signal_64.c:274 (return regs->ax)';
  frames.push({
    step: 7,
    label: 'Return to pre-signal execution point',
    description: 'sys_rt_sigreturn() returns regs->ax at arch/x86/kernel/signal_64.c:274. Since all registers including rip and rsp were restored by restore_sigcontext(), the process resumes execution at the exact instruction where it was interrupted by the signal. The signal handling round-trip is complete: delivery -> handler -> rt_sigreturn -> original code.',
    highlights: ['resume'],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario: fatal-signal
// SIGKILL is unblockable and uncatchable. Shows the group-exit path.
// ---------------------------------------------------------------------------
function generateFatalSignal(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: SignalDeliveryState = {
    sender: { pid: 100, name: 'ProcessA' },
    receiver: { pid: 200, name: 'ProcessB' },
    signalNumber: 9,
    signalName: 'SIGKILL',
    pendingSignals: [],
    blockedSignals: [],
    currentFunction: 'kill()',
    phase: 'send-entry',
    userStack: ['user: main()', 'user: kill(200, SIGKILL)'],
    srcRef: '',
  };

  // Frame 0: kill() with SIGKILL
  state.srcRef = 'kernel/signal.c:3947 (SYSCALL_DEFINE2(kill, pid_t, pid, int, sig))';
  frames.push({
    step: 0,
    label: 'kill() sends SIGKILL',
    description: 'Process A calls kill(200, SIGKILL). SYSCALL_DEFINE2(kill) at kernel/signal.c:3947 enters the same path as any signal. prepare_kill_siginfo() fills siginfo with SI_USER, then kill_something_info() at line 3953 routes to do_send_sig_info().',
    highlights: ['sender'],
    data: cloneState(state),
  });

  // Frame 1: __send_signal_locked skips sigqueue for SIGKILL
  state.currentFunction = '__send_signal_locked()';
  state.phase = 'queue-signal';
  state.userStack.push('kernel: __send_signal_locked()');
  state.srcRef = 'kernel/signal.c:1070 (if ((sig == SIGKILL) || (t->flags & PF_KTHREAD)) goto out_set)';
  frames.push({
    step: 1,
    label: '__send_signal_locked() skips sigqueue for SIGKILL',
    description: '__send_signal_locked() at kernel/signal.c:1042 has a special fast path for SIGKILL. At line 1070: if ((sig == SIGKILL) || (t->flags & PF_KTHREAD)) goto out_set -- it skips sigqueue allocation entirely and jumps directly to setting the pending bit via sigaddset(&pending->signal, sig) at line 1137. This ensures SIGKILL delivery cannot fail due to memory pressure.',
    highlights: ['pending-queue'],
    data: cloneState(state),
  });

  // Frame 2: complete_signal for fatal signal
  state.currentFunction = 'complete_signal()';
  state.phase = 'complete';
  state.pendingSignals.push('SIGKILL');
  state.srcRef = 'kernel/signal.c:1003-1025 (sig_fatal check and SIGNAL_GROUP_EXIT)';
  frames.push({
    step: 2,
    label: 'complete_signal() initiates group exit',
    description: 'complete_signal() at kernel/signal.c:963 detects this is a fatal signal via sig_fatal(p, sig) at line 1003. Since SIGKILL cannot be caught or blocked, the condition at line 1006 (sig == SIGKILL || !p->ptrace) is true. Lines 1017-1024 set SIGNAL_GROUP_EXIT flag, set group_exit_code, and iterate ALL threads via __for_each_thread() adding SIGKILL to each thread pending set and calling signal_wake_up(t, 1) to wake them all.',
    highlights: ['all-threads'],
    data: cloneState(state),
  });

  // Frame 3: signal_wake_up_state with fatal=1
  state.currentFunction = 'signal_wake_up_state()';
  state.phase = 'wake-up';
  state.srcRef = 'kernel/signal.c:721 (signal_wake_up_state) + include/linux/sched/signal.h:443 (signal_wake_up(t, 1))';
  frames.push({
    step: 3,
    label: 'signal_wake_up() wakes all threads',
    description: 'signal_wake_up(t, 1) at include/linux/sched/signal.h:443 is called for EACH thread. The fatal=1 argument means signal_wake_up_state() at kernel/signal.c:721 passes TASK_WAKEKILL as the state mask, which can wake threads in TASK_KILLABLE sleep states (not just TASK_INTERRUPTIBLE). set_tsk_thread_flag(t, TIF_SIGPENDING) at line 725 ensures every thread will check signals on next return to userspace.',
    highlights: ['tif-sigpending'],
    data: cloneState(state),
  });

  // Frame 4: Receiver hits exit_to_user_mode_loop
  state.currentFunction = 'exit_to_user_mode_loop()';
  state.phase = 'get-signal';
  state.userStack = ['user: ProcessB thread', 'kernel: returning to userspace'];
  state.srcRef = 'kernel/entry/common.c:94 (exit_to_user_mode_loop) -> line 63 (_TIF_SIGPENDING)';
  frames.push({
    step: 4,
    label: 'exit_to_user_mode_loop() detects pending signal',
    description: 'When Process B threads attempt to return to userspace, exit_to_user_mode_loop() at kernel/entry/common.c:94 calls __exit_to_user_mode_loop() at line 41. The _TIF_SIGPENDING check at line 63 triggers arch_do_signal_or_restart() at arch/x86/kernel/signal.c:333, which calls get_signal().',
    highlights: ['receiver'],
    data: cloneState(state),
  });

  // Frame 5: get_signal detects SIGNAL_GROUP_EXIT
  state.currentFunction = 'get_signal()';
  state.userStack.push('kernel: get_signal()');
  state.srcRef = 'kernel/signal.c:2866-2877 (SIGNAL_GROUP_EXIT check -> goto fatal)';
  frames.push({
    step: 5,
    label: 'get_signal() detects SIGNAL_GROUP_EXIT',
    description: 'get_signal() at kernel/signal.c:2799 acquires sighand->siglock at line 2823 and enters the main loop at line 2861. At line 2866, it checks (signal->flags & SIGNAL_GROUP_EXIT) which was set by complete_signal(). This is true, so signr is set to SIGKILL at line 2868, the signal is dequeued at line 2869, and execution jumps to the fatal label at line 2877.',
    highlights: ['fatal-path'],
    data: cloneState(state),
  });

  // Frame 6: Fatal path - no handler, straight to do_group_exit
  state.currentFunction = 'do_group_exit()';
  state.phase = 'fatal';
  state.userStack.push('kernel: do_group_exit()');
  state.srcRef = 'kernel/signal.c:3034 (do_group_exit(signr)) -> kernel/exit.c:1093';
  frames.push({
    step: 6,
    label: 'do_group_exit() terminates process group',
    description: 'Since SIGKILL is sig_kernel_only(), there is no handler to invoke. get_signal() falls through to do_group_exit(signr) at kernel/signal.c:3034. do_group_exit() at kernel/exit.c:1093 sets SIGNAL_GROUP_EXIT (if not already set), calls zap_other_threads(current) at line 1113 to ensure all threads get SIGKILL, then calls do_exit(exit_code) at line 1118.',
    highlights: ['fatal-path'],
    data: cloneState(state),
  });

  // Frame 7: do_exit tears down the process
  state.currentFunction = 'do_exit()';
  state.userStack.push('kernel: do_exit()');
  state.srcRef = 'kernel/exit.c:896 (void __noreturn do_exit(long code))';
  frames.push({
    step: 7,
    label: 'do_exit() tears down the task',
    description: 'do_exit() at kernel/exit.c:896 is marked __noreturn -- the process never returns. It releases all resources: closes files, releases mm via exit_mm(), detaches from namespaces, removes from the scheduler via do_task_dead(). The exit code encodes the signal number ((SIGKILL & 0xff) << 8 = 0x0900). The parent is notified via do_notify_parent() and can collect the status with wait(). Unlike catchable signals, SIGKILL never executes any user handler.',
    highlights: ['exit'],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
const NS = 'http://www.w3.org/2000/svg';

function renderFrame(
  container: SVGGElement,
  frame: AnimationFrame,
  width: number,
  height: number,
): void {
  while (container.firstChild) container.removeChild(container.firstChild);

  const data = frame.data as SignalDeliveryState;
  const margin = { top: 20, left: 20 };

  // Title
  const title = document.createElementNS(NS, 'text');
  title.setAttribute('x', String(width / 2));
  title.setAttribute('y', String(margin.top));
  title.setAttribute('text-anchor', 'middle');
  title.setAttribute('fill', '#e6edf3');
  title.setAttribute('font-size', '14');
  title.setAttribute('font-weight', 'bold');
  title.setAttribute('class', 'anim-title');
  title.textContent = `Signal Delivery: ${data.signalName} (${data.phase})`;
  container.appendChild(title);

  // Phase indicator
  const phaseBox = document.createElementNS(NS, 'rect');
  phaseBox.setAttribute('x', String(margin.left));
  phaseBox.setAttribute('y', String(margin.top + 10));
  phaseBox.setAttribute('width', '160');
  phaseBox.setAttribute('height', '24');
  phaseBox.setAttribute('rx', '4');
  phaseBox.setAttribute('fill', data.phase === 'fatal' ? '#8b0000' : '#1a3a5c');
  phaseBox.setAttribute('class', 'anim-phase');
  container.appendChild(phaseBox);

  const phaseText = document.createElementNS(NS, 'text');
  phaseText.setAttribute('x', String(margin.left + 6));
  phaseText.setAttribute('y', String(margin.top + 27));
  phaseText.setAttribute('fill', '#e6edf3');
  phaseText.setAttribute('font-size', '11');
  phaseText.setAttribute('class', 'anim-phase');
  phaseText.textContent = `Phase: ${data.phase}`;
  container.appendChild(phaseText);

  // Process boxes
  const procY = margin.top + 50;
  const procWidth = 140;
  const procHeight = 60;

  // Sender
  const senderRect = document.createElementNS(NS, 'rect');
  senderRect.setAttribute('x', String(margin.left));
  senderRect.setAttribute('y', String(procY));
  senderRect.setAttribute('width', String(procWidth));
  senderRect.setAttribute('height', String(procHeight));
  senderRect.setAttribute('rx', '6');
  senderRect.setAttribute('fill', '#1a3a1a');
  let senderCls = 'anim-block';
  if (frame.highlights.includes('sender')) senderCls += ' anim-highlight';
  senderRect.setAttribute('class', senderCls);
  container.appendChild(senderRect);

  const senderText = document.createElementNS(NS, 'text');
  senderText.setAttribute('x', String(margin.left + 10));
  senderText.setAttribute('y', String(procY + 25));
  senderText.setAttribute('fill', '#e6edf3');
  senderText.setAttribute('font-size', '11');
  senderText.setAttribute('class', 'anim-block');
  senderText.textContent = `${data.sender.name} (pid ${data.sender.pid})`;
  container.appendChild(senderText);

  // Receiver
  const receiverX = width - margin.left - procWidth;
  const receiverRect = document.createElementNS(NS, 'rect');
  receiverRect.setAttribute('x', String(receiverX));
  receiverRect.setAttribute('y', String(procY));
  receiverRect.setAttribute('width', String(procWidth));
  receiverRect.setAttribute('height', String(procHeight));
  receiverRect.setAttribute('rx', '6');
  receiverRect.setAttribute('fill', '#1f4068');
  let receiverCls = 'anim-block';
  if (frame.highlights.includes('receiver')) receiverCls += ' anim-highlight';
  receiverRect.setAttribute('class', receiverCls);
  container.appendChild(receiverRect);

  const receiverText = document.createElementNS(NS, 'text');
  receiverText.setAttribute('x', String(receiverX + 10));
  receiverText.setAttribute('y', String(procY + 25));
  receiverText.setAttribute('fill', '#e6edf3');
  receiverText.setAttribute('font-size', '11');
  receiverText.setAttribute('class', 'anim-block');
  receiverText.textContent = `${data.receiver.name} (pid ${data.receiver.pid})`;
  container.appendChild(receiverText);

  // Pending signals display
  const pendingY = procY + procHeight + 20;
  const pendingLabel = document.createElementNS(NS, 'text');
  pendingLabel.setAttribute('x', String(margin.left));
  pendingLabel.setAttribute('y', String(pendingY));
  pendingLabel.setAttribute('fill', '#e6edf3');
  pendingLabel.setAttribute('font-size', '11');
  pendingLabel.setAttribute('class', 'anim-cpu-label');
  pendingLabel.textContent = `Pending: [${data.pendingSignals.join(', ')}]`;
  container.appendChild(pendingLabel);

  // Current function
  const funcY = pendingY + 20;
  const funcText = document.createElementNS(NS, 'text');
  funcText.setAttribute('x', String(margin.left));
  funcText.setAttribute('y', String(funcY));
  funcText.setAttribute('fill', '#58a6ff');
  funcText.setAttribute('font-size', '11');
  funcText.setAttribute('class', 'anim-function');
  funcText.textContent = `Function: ${data.currentFunction}`;
  container.appendChild(funcText);

  // Call stack
  const stackTop = funcY + 20;
  const stackLabel = document.createElementNS(NS, 'text');
  stackLabel.setAttribute('x', String(margin.left));
  stackLabel.setAttribute('y', String(stackTop));
  stackLabel.setAttribute('class', 'anim-cpu-label');
  stackLabel.setAttribute('fill', '#e6edf3');
  stackLabel.setAttribute('font-size', '11');
  stackLabel.textContent = 'Call Stack:';
  container.appendChild(stackLabel);

  const stackEntryHeight = 18;
  const stackEntryWidth = 240;

  data.userStack.forEach((entry, i) => {
    const sy = stackTop + 8 + i * (stackEntryHeight + 2);
    const sx = margin.left + i * 8;
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
    if (frame.highlights.includes('user-stack') && i === data.userStack.length - 1) {
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
  { id: 'signal-delivery', label: 'Signal Delivery (SIGTERM via kill)' },
  { id: 'signal-handler-return', label: 'Signal Handler Return (rt_sigreturn)' },
  { id: 'fatal-signal', label: 'Fatal Signal (SIGKILL)' },
];

const signalDelivery: AnimationModule = {
  config: {
    id: 'signal-delivery',
    title: 'Signal Delivery',
    skillName: 'signals-and-ipc',
  },
  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario) {
      case 'signal-handler-return': return generateSignalHandlerReturn();
      case 'fatal-signal': return generateFatalSignal();
      case 'signal-delivery':
      default: return generateSignalDelivery();
    }
  },
  renderFrame,
  getScenarios: () => SCENARIOS,
};

export default signalDelivery;

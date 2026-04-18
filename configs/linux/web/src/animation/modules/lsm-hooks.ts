import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

export interface LsmState {
  operation: string;
  hookName: string;
  lsmModules: { name: string; decision: 'pending' | 'allow' | 'deny' | 'skipped' }[];
  currentLsm: string | null;
  finalDecision: 'pending' | 'allow' | 'deny';
  phase: 'init' | 'caller' | 'security-hook' | 'iterating' | 'lsm-check' | 'blob-alloc' | 'decision' | 'complete';
  blobAllocated: boolean;
  srcRef: string;
}

function cloneState(state: LsmState): LsmState {
  return {
    ...state,
    lsmModules: state.lsmModules.map(m => ({ ...m })),
  };
}

function generateFileOpenCheckFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];

  const state: LsmState = {
    operation: 'file open',
    hookName: 'security_file_open',
    lsmModules: [
      { name: 'SELinux', decision: 'pending' },
      { name: 'AppArmor', decision: 'pending' },
      { name: 'BPF LSM', decision: 'pending' },
    ],
    currentLsm: null,
    finalDecision: 'pending',
    phase: 'init',
    blobAllocated: false,
    srcRef: 'fs/open.c:1076',
  };

  // Frame 0: vfs_open entry
  frames.push({
    step: 0,
    label: 'vfs_open() begins file open operation',
    description: `vfs_open() (fs/open.c:1076) is called to open a file. After setting up the struct file with f_op from inode->i_fop, it calls security_file_open() (fs/open.c:926) to let LSM modules enforce mandatory access control before the file is opened.`,
    highlights: ['vfs-open'],
    data: cloneState(state),
  });

  // Frame 1: Enter security_file_open
  state.phase = 'security-hook';
  state.srcRef = 'security/security.c:2635';
  frames.push({
    step: 1,
    label: 'security_file_open() dispatches to LSM hooks',
    description: `security_file_open() (security/security.c:2635) is the LSM hook entry point. It expands to call_int_hook(file_open, file) (security/security.c:2637), a macro that iterates over all registered LSM static calls for the file_open hook. Each active LSM gets a chance to allow or deny the operation.`,
    highlights: ['security-hook'],
    data: cloneState(state),
  });

  // Frame 2: call_int_hook macro expansion
  state.phase = 'iterating';
  state.srcRef = 'security/security.c:463';
  frames.push({
    step: 2,
    label: 'call_int_hook() begins LSM iteration',
    description: `call_int_hook() (security/security.c:463) initializes RC = LSM_RET_DEFAULT(file_open) = 0. It then uses LSM_LOOP_UNROLL to expand __CALL_STATIC_INT for each slot in the static call table (security/security.c:454). Each slot checks static_branch_unlikely(&SECURITY_HOOK_ACTIVE_KEY) to see if an LSM is registered at that position. If RC != 0, iteration short-circuits via goto OUT.`,
    highlights: ['call-int-hook'],
    data: cloneState(state),
  });

  // Frame 3: SELinux check
  state.phase = 'lsm-check';
  state.currentLsm = 'SELinux';
  state.srcRef = 'security/selinux/hooks.c:4144';
  state.lsmModules[0].decision = 'allow';
  frames.push({
    step: 3,
    label: 'SELinux: selinux_file_open() checks file access',
    description: `selinux_file_open() (security/selinux/hooks.c:4144) is called via static_call. It retrieves the file_security_struct from file->f_security and the inode_security_struct from the inode. It calls file_has_perm() (security/selinux/hooks.c:4141) which checks the SELinux policy for FILE__OPEN permission using the task's SID, the file's SID, and the object class. Returns 0 (allow).`,
    highlights: ['lsm-selinux'],
    data: cloneState(state),
  });

  // Frame 4: AppArmor check
  state.currentLsm = 'AppArmor';
  state.srcRef = 'security/apparmor/lsm.c:460';
  state.lsmModules[1].decision = 'allow';
  frames.push({
    step: 4,
    label: 'AppArmor: apparmor_file_open() checks profile rules',
    description: `apparmor_file_open() (security/apparmor/lsm.c:460) is called next. It retrieves the aa_file_ctx from file_ctx(file) and the current task's aa_label. It checks if the file access matches the AppArmor profile rules using aa_file_perm(). The profile allows the access, so it returns 0.`,
    highlights: ['lsm-apparmor'],
    data: cloneState(state),
  });

  // Frame 5: BPF LSM check
  state.currentLsm = 'BPF LSM';
  state.srcRef = 'kernel/bpf/bpf_lsm.c:310';
  state.lsmModules[2].decision = 'allow';
  frames.push({
    step: 5,
    label: 'BPF LSM: bpf_lsm_file_open() runs attached BPF programs',
    description: `bpf_lsm_file_open() (kernel/bpf/bpf_lsm.c:310) is called if a BPF_PROG_TYPE_LSM program is attached to the file_open hook. BPF LSM programs can inspect struct file fields and enforce custom policies. If no BPF program is attached, the static call key is inactive and this slot is skipped entirely (no overhead). Here a BPF program is attached and returns 0 (allow).`,
    highlights: ['lsm-bpf'],
    data: cloneState(state),
  });

  // Frame 6: All LSMs returned 0
  state.phase = 'decision';
  state.currentLsm = null;
  state.finalDecision = 'allow';
  state.srcRef = 'security/security.c:463';
  frames.push({
    step: 6,
    label: 'call_int_hook() returns 0 -- all LSMs allow',
    description: `call_int_hook() (security/security.c:463) reaches the OUT label with RC = 0. All three LSM modules (SELinux, AppArmor, BPF LSM) returned 0. Since no hook returned a non-default value, the file_open operation is permitted. security_file_open() returns 0 to vfs_open().`,
    highlights: ['decision-allow'],
    data: cloneState(state),
  });

  // Frame 7: Return to vfs_open
  state.phase = 'complete';
  state.srcRef = 'fs/open.c:926';
  frames.push({
    step: 7,
    label: 'vfs_open() continues -- file open permitted',
    description: `vfs_open() (fs/open.c:926) receives 0 from security_file_open(). Since there was no error, it proceeds to fsnotify_open_perm_and_set_mode() (fs/open.c:936) and then calls the filesystem's f_op->open handler. The LSM framework acted as a transparent security checkpoint -- if any single LSM had returned -EACCES, the entire open would have been denied.`,
    highlights: ['vfs-open'],
    data: cloneState(state),
  });

  // Frame 8: Summary
  frames.push({
    step: 8,
    label: 'File open LSM check complete',
    description: `The LSM hook chain for file_open demonstrates the stacking model: security_file_open() (security/security.c:2635) calls each registered LSM via call_int_hook() (security/security.c:463). LSMs use static calls (security/security.c:454) with active keys checked via static_branch_unlikely() for near-zero overhead when a slot is unused. Any LSM returning non-zero short-circuits the chain and denies the operation.`,
    highlights: [],
    data: cloneState(state),
  });

  return frames;
}

function generateTaskCreationCheckFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];

  const state: LsmState = {
    operation: 'task creation',
    hookName: 'security_task_alloc',
    lsmModules: [
      { name: 'SELinux', decision: 'pending' },
      { name: 'AppArmor', decision: 'pending' },
    ],
    currentLsm: null,
    finalDecision: 'pending',
    phase: 'init',
    blobAllocated: false,
    srcRef: 'kernel/fork.c:1964',
  };

  // Frame 0: copy_process entry
  frames.push({
    step: 0,
    label: 'copy_process() begins new task creation',
    description: `copy_process() (kernel/fork.c:1964) is the core of fork/clone. After duplicating the task_struct and copying process information via shm_init_task(), it calls security_task_alloc() (kernel/fork.c:2205) to allocate and initialize LSM security blobs for the new task.`,
    highlights: ['copy-process'],
    data: cloneState(state),
  });

  // Frame 1: Enter security_task_alloc
  state.phase = 'security-hook';
  state.srcRef = 'security/security.c:2681';
  frames.push({
    step: 1,
    label: 'security_task_alloc() allocates LSM blob first',
    description: `security_task_alloc() (security/security.c:2681) first calls lsm_task_alloc() (security/security.c:243) to allocate the composite security blob. Unlike most hooks that only check permissions, task_alloc both allocates storage and checks policy. The blob holds per-LSM data for the new task (e.g., SELinux SID, AppArmor label).`,
    highlights: ['security-hook'],
    data: cloneState(state),
  });

  // Frame 2: lsm_task_alloc blob allocation
  state.phase = 'blob-alloc';
  state.blobAllocated = true;
  state.srcRef = 'security/security.c:243';
  frames.push({
    step: 2,
    label: 'lsm_task_alloc() allocates composite blob',
    description: `lsm_task_alloc() (security/security.c:243) calls lsm_blob_alloc(&task->security, blob_sizes.lbs_task, GFP_KERNEL) (security/security.c:186). The blob is a single contiguous allocation sized to hold all registered LSMs' per-task data. Each LSM accesses its portion via an offset stored at registration time. task->security points to this shared blob.`,
    highlights: ['blob-alloc'],
    data: cloneState(state),
  });

  // Frame 3: call_int_hook for task_alloc
  state.phase = 'iterating';
  state.srcRef = 'security/security.c:2687';
  frames.push({
    step: 3,
    label: 'call_int_hook(task_alloc) iterates LSM hooks',
    description: `After successful blob allocation, security_task_alloc() calls call_int_hook(task_alloc, task, clone_flags) (security/security.c:2687). This iterates over the static call table slots for the task_alloc hook. Each registered LSM can initialize its portion of the blob and enforce creation policies.`,
    highlights: ['call-int-hook'],
    data: cloneState(state),
  });

  // Frame 4: SELinux task_alloc
  state.phase = 'lsm-check';
  state.currentLsm = 'SELinux';
  state.srcRef = 'security/selinux/hooks.c:4173';
  state.lsmModules[0].decision = 'allow';
  frames.push({
    step: 4,
    label: 'SELinux: selinux_task_alloc() checks process creation',
    description: `selinux_task_alloc() (security/selinux/hooks.c:4173) checks if the current task is allowed to create a new process under SELinux policy. It calls avc_has_perm() to verify the PROCESS__FORK permission between the current task's SID and the new task's SID. Returns 0 to allow.`,
    highlights: ['lsm-selinux'],
    data: cloneState(state),
  });

  // Frame 5: AppArmor task_alloc (skipped -- no hook registered)
  state.currentLsm = 'AppArmor';
  state.lsmModules[1].decision = 'skipped';
  state.srcRef = 'security/apparmor/lsm.c:2542';
  frames.push({
    step: 5,
    label: 'AppArmor: no task_alloc hook registered -- skipped',
    description: `AppArmor does not register a task_alloc hook in its apparmor_hooks array (security/apparmor/lsm.c:2542). When security_add_hooks() (include/linux/lsm_hooks.h:142) installed AppArmor's hooks, the task_alloc slot was left empty. The static_branch_unlikely() check (security/security.c:456) returns false, so the static call is never invoked -- zero overhead for unregistered hooks.`,
    highlights: ['lsm-apparmor'],
    data: cloneState(state),
  });

  // Frame 6: All hooks complete
  state.phase = 'decision';
  state.currentLsm = null;
  state.finalDecision = 'allow';
  state.srcRef = 'security/security.c:2687';
  frames.push({
    step: 6,
    label: 'call_int_hook() returns 0 -- task creation allowed',
    description: `call_int_hook(task_alloc) returns RC = 0. SELinux allowed the operation and AppArmor had no hook registered. If call_int_hook had returned non-zero, security_task_alloc() (security/security.c:2688) would call security_task_free(task) to release the blob before returning the error to copy_process().`,
    highlights: ['decision-allow'],
    data: cloneState(state),
  });

  // Frame 7: Return to copy_process
  state.phase = 'complete';
  state.srcRef = 'kernel/fork.c:2205';
  frames.push({
    step: 7,
    label: 'copy_process() continues -- task LSM state initialized',
    description: `copy_process() (kernel/fork.c:2205) receives 0 from security_task_alloc(). The new task_struct now has task->security pointing to an allocated blob with SELinux's security context initialized. copy_process() proceeds with copy_creds(), copy_files(), and other subsystem duplication. On error, bad_fork_cleanup_audit would clean up.`,
    highlights: ['copy-process'],
    data: cloneState(state),
  });

  // Frame 8: Summary
  frames.push({
    step: 8,
    label: 'Task creation LSM check complete',
    description: `The task_alloc hook (security/security.c:2681) is unique among LSM hooks because it combines blob allocation (lsm_task_alloc at security/security.c:243) with policy checking (call_int_hook at security/security.c:2687). The blob uses a shared allocation model: lsm_blob_alloc() (security/security.c:186) allocates one contiguous region sized by blob_sizes.lbs_task, and each LSM indexes into it at a known offset.`,
    highlights: [],
    data: cloneState(state),
  });

  return frames;
}

function generateLsmStackingFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];

  const state: LsmState = {
    operation: 'file open (deny scenario)',
    hookName: 'security_file_open',
    lsmModules: [
      { name: 'SELinux', decision: 'pending' },
      { name: 'AppArmor', decision: 'pending' },
      { name: 'BPF LSM', decision: 'pending' },
    ],
    currentLsm: null,
    finalDecision: 'pending',
    phase: 'init',
    blobAllocated: false,
    srcRef: 'include/linux/lsm_hooks.h:95',
  };

  // Frame 0: Hook list structure
  frames.push({
    step: 0,
    label: 'LSM stacking: struct security_hook_list and static calls',
    description: `LSM stacking is built on struct security_hook_list (include/linux/lsm_hooks.h:95), which pairs a static call slot (scalls) with the hook function pointer (hook) and LSM identity (lsmid). The static call table lsm_static_calls_table (include/linux/lsm_hooks.h:67) has MAX_LSM_COUNT slots per hook. Each LSM registers hooks via security_add_hooks() (include/linux/lsm_hooks.h:142).`,
    highlights: ['hook-list'],
    data: cloneState(state),
  });

  // Frame 1: Registration order
  state.phase = 'caller';
  state.srcRef = 'security/security.c:463';
  frames.push({
    step: 1,
    label: 'LSM registration order determines call order',
    description: `LSMs register during kernel boot via security_add_hooks(). SELinux registers at security/selinux/hooks.c:7744, AppArmor at security/apparmor/lsm.c:2542, and BPF LSM at security/bpf/hooks.c:25. The boot parameter "lsm=" controls ordering. Each call to security_add_hooks() fills the next available slot in the static call table. The lsm_for_each_hook() macro (security/security.c:473) iterates slots in registration order.`,
    highlights: ['registration'],
    data: cloneState(state),
  });

  // Frame 2: Enter security_file_open with stacking
  state.phase = 'security-hook';
  state.srcRef = 'security/security.c:2635';
  frames.push({
    step: 2,
    label: 'security_file_open() enters call_int_hook()',
    description: `security_file_open() (security/security.c:2635) expands call_int_hook(file_open, file). The macro initializes RC = LSM_RET_DEFAULT(file_open) = 0 (security/security.c:466). LSM_LOOP_UNROLL expands __CALL_STATIC_INT for each of the MAX_LSM_COUNT slots. The key insight: if RC != LSM_RET_DEFAULT, the macro jumps to OUT -- this is how deny short-circuits.`,
    highlights: ['security-hook'],
    data: cloneState(state),
  });

  // Frame 3: SELinux allows
  state.phase = 'lsm-check';
  state.currentLsm = 'SELinux';
  state.srcRef = 'security/selinux/hooks.c:4144';
  state.lsmModules[0].decision = 'allow';
  frames.push({
    step: 3,
    label: 'SELinux: selinux_file_open() returns 0 (allow)',
    description: `Slot 0: static_branch_unlikely(&SECURITY_HOOK_ACTIVE_KEY(file_open, 0)) is true -- SELinux registered here. static_call(LSM_STATIC_CALL(file_open, 0)) invokes selinux_file_open() (security/selinux/hooks.c:4144). SELinux policy permits this access, returning 0. Since RC (0) == LSM_RET_DEFAULT (0), iteration continues to the next slot instead of jumping to OUT.`,
    highlights: ['lsm-selinux'],
    data: cloneState(state),
  });

  // Frame 4: AppArmor denies
  state.currentLsm = 'AppArmor';
  state.srcRef = 'security/apparmor/lsm.c:460';
  state.lsmModules[1].decision = 'deny';
  frames.push({
    step: 4,
    label: 'AppArmor: apparmor_file_open() returns -EACCES (deny)',
    description: `Slot 1: static_branch_unlikely(&SECURITY_HOOK_ACTIVE_KEY(file_open, 1)) is true -- AppArmor registered here. static_call invokes apparmor_file_open() (security/apparmor/lsm.c:460). AppArmor's profile denies this file access, returning -EACCES (-13). Now RC = -EACCES != LSM_RET_DEFAULT (0), so __CALL_STATIC_INT (security/security.c:458) executes "goto OUT" -- short-circuiting remaining hooks.`,
    highlights: ['lsm-apparmor'],
    data: cloneState(state),
  });

  // Frame 5: BPF LSM skipped due to short-circuit
  state.currentLsm = 'BPF LSM';
  state.lsmModules[2].decision = 'skipped';
  state.srcRef = 'security/security.c:458';
  frames.push({
    step: 5,
    label: 'BPF LSM: skipped -- AppArmor short-circuited the chain',
    description: `Slot 2: Because AppArmor returned -EACCES, the goto OUT (security/security.c:459) jumped past all remaining __CALL_STATIC_INT expansions. BPF LSM's bpf_lsm_file_open() (kernel/bpf/bpf_lsm.c:310) was never called. This is the critical stacking behavior: any LSM returning a non-default value immediately terminates the hook chain. The deny-wins model means security is the intersection of all LSM policies.`,
    highlights: ['lsm-bpf'],
    data: cloneState(state),
  });

  // Frame 6: Final decision
  state.phase = 'decision';
  state.currentLsm = null;
  state.finalDecision = 'deny';
  state.srcRef = 'security/security.c:470';
  frames.push({
    step: 6,
    label: 'call_int_hook() returns -EACCES at OUT label',
    description: `At the OUT label (security/security.c:470), RC = -EACCES. call_int_hook() returns this value to security_file_open(). The stacking rule is: first non-zero return wins. Even though SELinux allowed the operation, AppArmor's deny takes precedence. This enforces a "most restrictive" policy -- the file open is denied.`,
    highlights: ['decision-deny'],
    data: cloneState(state),
  });

  // Frame 7: Error propagation
  state.phase = 'complete';
  state.srcRef = 'fs/open.c:927';
  frames.push({
    step: 7,
    label: 'vfs_open() receives -EACCES -- file open denied',
    description: `vfs_open() (fs/open.c:926) receives -EACCES from security_file_open(). The unlikely(error) check at fs/open.c:927 triggers, and execution jumps to cleanup_all which calls fops_put() and releases write access. The error propagates back to do_sys_open() (fs/open.c:1369) and ultimately to userspace as EACCES.`,
    highlights: ['vfs-open'],
    data: cloneState(state),
  });

  // Frame 8: Stacking summary
  frames.push({
    step: 8,
    label: 'LSM stacking complete -- deny-wins semantics',
    description: `LSM stacking uses static calls (security/security.c:454) for near-native performance. Each hook has MAX_LSM_COUNT slots in lsm_static_calls_table (include/linux/lsm_hooks.h:67). Inactive slots use static_key_false (include/linux/lsm_hooks.h:56) so the branch is predicted not-taken with zero overhead. The deny-wins model (security/security.c:458) ensures that adding an LSM can only restrict access, never grant it -- a fundamental security property.`,
    highlights: [],
    data: cloneState(state),
  });

  return frames;
}

const SCENARIOS: AnimationScenario[] = [
  { id: 'file-open-check', label: 'LSM Hook on File Open' },
  { id: 'task-creation-check', label: 'LSM Hook on Task Creation' },
  { id: 'lsm-stacking', label: 'LSM Stacking (Deny Scenario)' },
];

const NS = 'http://www.w3.org/2000/svg';

function renderLsmModules(
  container: SVGGElement,
  modules: LsmState['lsmModules'],
  currentLsm: string | null,
  highlights: string[],
  startX: number,
  startY: number,
  boxW: number,
  boxH: number,
): void {
  const gap = 20;

  for (let i = 0; i < modules.length; i++) {
    const mod = modules[i];
    const x = startX;
    const y = startY + i * (boxH + gap);

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(x));
    rect.setAttribute('y', String(y));
    rect.setAttribute('width', String(boxW));
    rect.setAttribute('height', String(boxH));
    rect.setAttribute('rx', '5');

    let cls = 'anim-lsm';
    if (mod.decision === 'allow') cls += ' anim-decision-allow';
    else if (mod.decision === 'deny') cls += ' anim-decision-deny';
    else if (mod.decision === 'skipped') cls += ' anim-decision-skipped';

    const lsmHighlightId = `lsm-${mod.name.toLowerCase().replace(/\s+/g, '-')}`;
    if (highlights.includes(lsmHighlightId)) cls += ' anim-highlight';
    if (mod.name === currentLsm) cls += ' anim-hook';

    rect.setAttribute('class', cls);

    // Color based on decision
    let fill = '#34495e'; // pending
    if (mod.decision === 'allow') fill = '#27ae60';
    else if (mod.decision === 'deny') fill = '#e74c3c';
    else if (mod.decision === 'skipped') fill = '#7f8c8d';
    rect.setAttribute('fill', fill);
    rect.setAttribute('opacity', mod.name === currentLsm ? '1' : '0.7');
    rect.setAttribute('stroke', mod.name === currentLsm ? '#f39c12' : '#555');
    rect.setAttribute('stroke-width', mod.name === currentLsm ? '3' : '1');

    container.appendChild(rect);

    // LSM name
    const nameText = document.createElementNS(NS, 'text');
    nameText.setAttribute('x', String(x + boxW / 2));
    nameText.setAttribute('y', String(y + boxH / 2 - 4));
    nameText.setAttribute('text-anchor', 'middle');
    nameText.setAttribute('class', 'anim-lsm');
    nameText.setAttribute('fill', '#fff');
    nameText.setAttribute('font-weight', 'bold');
    nameText.textContent = mod.name;
    container.appendChild(nameText);

    // Decision text
    const decText = document.createElementNS(NS, 'text');
    decText.setAttribute('x', String(x + boxW / 2));
    decText.setAttribute('y', String(y + boxH / 2 + 14));
    decText.setAttribute('text-anchor', 'middle');
    decText.setAttribute('class', 'anim-decision');
    decText.setAttribute('fill', '#ddd');
    decText.setAttribute('font-size', '11');
    decText.textContent = mod.decision === 'pending' ? '...' : mod.decision.toUpperCase();
    container.appendChild(decText);

    // Arrow from previous module
    if (i > 0) {
      const prevY = startY + (i - 1) * (boxH + gap) + boxH;
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', String(x + boxW / 2));
      line.setAttribute('y1', String(prevY));
      line.setAttribute('x2', String(x + boxW / 2));
      line.setAttribute('y2', String(y));
      line.setAttribute('stroke', '#888');
      line.setAttribute('stroke-width', '1.5');
      line.setAttribute('stroke-dasharray', '4,3');
      container.appendChild(line);
    }
  }
}

function renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void {
  while (container.firstChild) container.removeChild(container.firstChild);

  const data = frame.data as LsmState;
  const margin = { top: 10, right: 10, bottom: 10, left: 10 };

  // Arrowhead marker
  const defs = document.createElementNS(NS, 'defs');
  const marker = document.createElementNS(NS, 'marker');
  marker.setAttribute('id', 'lsm-arrow');
  marker.setAttribute('markerWidth', '10');
  marker.setAttribute('markerHeight', '7');
  marker.setAttribute('refX', '10');
  marker.setAttribute('refY', '3.5');
  marker.setAttribute('orient', 'auto');
  const arrowPath = document.createElementNS(NS, 'polygon');
  arrowPath.setAttribute('points', '0 0, 10 3.5, 0 7');
  arrowPath.setAttribute('fill', '#888');
  marker.appendChild(arrowPath);
  defs.appendChild(marker);
  container.appendChild(defs);

  // Title
  const titleEl = document.createElementNS(NS, 'text');
  titleEl.setAttribute('x', String(width / 2));
  titleEl.setAttribute('y', String(margin.top + 14));
  titleEl.setAttribute('text-anchor', 'middle');
  titleEl.setAttribute('class', 'anim-title');
  titleEl.textContent = 'LSM Security Hook Flow';
  container.appendChild(titleEl);

  // Operation label (top-left)
  const opY = margin.top + 40;
  const opLabel = document.createElementNS(NS, 'text');
  opLabel.setAttribute('x', String(margin.left + 10));
  opLabel.setAttribute('y', String(opY));
  opLabel.setAttribute('class', 'anim-hook');
  opLabel.textContent = `Operation: ${data.operation}`;
  container.appendChild(opLabel);

  // Hook name (below operation)
  const hookLabel = document.createElementNS(NS, 'text');
  hookLabel.setAttribute('x', String(margin.left + 10));
  hookLabel.setAttribute('y', String(opY + 18));
  hookLabel.setAttribute('class', 'anim-hook');
  hookLabel.setAttribute('fill', '#3498db');
  hookLabel.textContent = `Hook: ${data.hookName}()`;
  container.appendChild(hookLabel);

  // Left side: Caller box (VFS/fork)
  const callerBoxX = margin.left + 20;
  const callerBoxY = margin.top + 75;
  const callerBoxW = 140;
  const callerBoxH = 40;

  const callerRect = document.createElementNS(NS, 'rect');
  callerRect.setAttribute('x', String(callerBoxX));
  callerRect.setAttribute('y', String(callerBoxY));
  callerRect.setAttribute('width', String(callerBoxW));
  callerRect.setAttribute('height', String(callerBoxH));
  callerRect.setAttribute('rx', '5');
  let callerCls = 'anim-lsm';
  if (frame.highlights.includes('vfs-open') || frame.highlights.includes('copy-process')) {
    callerCls += ' anim-highlight';
  }
  callerRect.setAttribute('class', callerCls);
  callerRect.setAttribute('fill', '#2c3e50');
  callerRect.setAttribute('stroke', frame.highlights.includes('vfs-open') || frame.highlights.includes('copy-process') ? '#f39c12' : '#555');
  callerRect.setAttribute('stroke-width', frame.highlights.includes('vfs-open') || frame.highlights.includes('copy-process') ? '2' : '1');
  container.appendChild(callerRect);

  const callerText = document.createElementNS(NS, 'text');
  callerText.setAttribute('x', String(callerBoxX + callerBoxW / 2));
  callerText.setAttribute('y', String(callerBoxY + callerBoxH / 2 + 4));
  callerText.setAttribute('text-anchor', 'middle');
  callerText.setAttribute('class', 'anim-lsm');
  callerText.setAttribute('fill', '#ecf0f1');
  callerText.textContent = data.hookName === 'security_task_alloc' ? 'copy_process()' : 'vfs_open()';
  container.appendChild(callerText);

  // Arrow from caller to security hook
  const secHookX = callerBoxX + callerBoxW + 30;
  const secHookY = callerBoxY;
  const secHookW = 180;
  const secHookH = 40;

  const arrow1 = document.createElementNS(NS, 'line');
  arrow1.setAttribute('x1', String(callerBoxX + callerBoxW));
  arrow1.setAttribute('y1', String(callerBoxY + callerBoxH / 2));
  arrow1.setAttribute('x2', String(secHookX));
  arrow1.setAttribute('y2', String(secHookY + secHookH / 2));
  arrow1.setAttribute('stroke', '#888');
  arrow1.setAttribute('stroke-width', '2');
  arrow1.setAttribute('marker-end', 'url(#lsm-arrow)');
  container.appendChild(arrow1);

  // Security hook box
  const secRect = document.createElementNS(NS, 'rect');
  secRect.setAttribute('x', String(secHookX));
  secRect.setAttribute('y', String(secHookY));
  secRect.setAttribute('width', String(secHookW));
  secRect.setAttribute('height', String(secHookH));
  secRect.setAttribute('rx', '5');
  let secCls = 'anim-hook';
  if (frame.highlights.includes('security-hook') || frame.highlights.includes('call-int-hook')) {
    secCls += ' anim-highlight';
  }
  secRect.setAttribute('class', secCls);
  secRect.setAttribute('fill', '#8e44ad');
  secRect.setAttribute('stroke', frame.highlights.includes('security-hook') || frame.highlights.includes('call-int-hook') ? '#f39c12' : '#555');
  secRect.setAttribute('stroke-width', frame.highlights.includes('security-hook') || frame.highlights.includes('call-int-hook') ? '2' : '1');
  container.appendChild(secRect);

  const secText = document.createElementNS(NS, 'text');
  secText.setAttribute('x', String(secHookX + secHookW / 2));
  secText.setAttribute('y', String(secHookY + secHookH / 2 + 4));
  secText.setAttribute('text-anchor', 'middle');
  secText.setAttribute('class', 'anim-hook');
  secText.setAttribute('fill', '#ecf0f1');
  secText.setAttribute('font-size', '12');
  secText.textContent = `${data.hookName}()`;
  container.appendChild(secText);

  // Blob allocation indicator (for task-creation-check)
  if (data.blobAllocated) {
    const blobX = secHookX;
    const blobY = secHookY + secHookH + 5;
    const blobRect = document.createElementNS(NS, 'rect');
    blobRect.setAttribute('x', String(blobX));
    blobRect.setAttribute('y', String(blobY));
    blobRect.setAttribute('width', String(secHookW));
    blobRect.setAttribute('height', '20');
    blobRect.setAttribute('rx', '3');
    blobRect.setAttribute('class', frame.highlights.includes('blob-alloc') ? 'anim-lsm anim-highlight' : 'anim-lsm');
    blobRect.setAttribute('fill', '#16a085');
    blobRect.setAttribute('opacity', '0.8');
    container.appendChild(blobRect);

    const blobText = document.createElementNS(NS, 'text');
    blobText.setAttribute('x', String(blobX + secHookW / 2));
    blobText.setAttribute('y', String(blobY + 14));
    blobText.setAttribute('text-anchor', 'middle');
    blobText.setAttribute('fill', '#fff');
    blobText.setAttribute('font-size', '10');
    blobText.textContent = 'task->security blob allocated';
    container.appendChild(blobText);
  }

  // Center: LSM module chain
  const lsmBoxW = 130;
  const lsmBoxH = 50;
  const lsmStartX = secHookX + (secHookW - lsmBoxW) / 2;
  const lsmStartY = secHookY + secHookH + (data.blobAllocated ? 35 : 15);

  // Arrow from security hook to first LSM
  const hookToLsmArrow = document.createElementNS(NS, 'line');
  hookToLsmArrow.setAttribute('x1', String(secHookX + secHookW / 2));
  hookToLsmArrow.setAttribute('y1', String(secHookY + secHookH));
  hookToLsmArrow.setAttribute('x2', String(lsmStartX + lsmBoxW / 2));
  hookToLsmArrow.setAttribute('y2', String(lsmStartY));
  hookToLsmArrow.setAttribute('stroke', '#888');
  hookToLsmArrow.setAttribute('stroke-width', '1.5');
  hookToLsmArrow.setAttribute('marker-end', 'url(#lsm-arrow)');
  container.appendChild(hookToLsmArrow);

  renderLsmModules(container, data.lsmModules, data.currentLsm, frame.highlights, lsmStartX, lsmStartY, lsmBoxW, lsmBoxH);

  // Right side: Info panel
  const panelX = width - 200;
  const panelY = margin.top + 75;

  // Phase indicator
  const phaseLabel = document.createElementNS(NS, 'text');
  phaseLabel.setAttribute('x', String(panelX));
  phaseLabel.setAttribute('y', String(panelY));
  phaseLabel.setAttribute('class', 'anim-decision');
  phaseLabel.textContent = `Phase: ${data.phase}`;
  container.appendChild(phaseLabel);

  // Current LSM
  const currentLabel = document.createElementNS(NS, 'text');
  currentLabel.setAttribute('x', String(panelX));
  currentLabel.setAttribute('y', String(panelY + 20));
  currentLabel.setAttribute('class', 'anim-decision');
  currentLabel.textContent = `Current: ${data.currentLsm || 'none'}`;
  container.appendChild(currentLabel);

  // Final decision
  const decisionLabel = document.createElementNS(NS, 'text');
  decisionLabel.setAttribute('x', String(panelX));
  decisionLabel.setAttribute('y', String(panelY + 40));
  decisionLabel.setAttribute('class', 'anim-decision');
  let decColor = '#888';
  if (data.finalDecision === 'allow') decColor = '#27ae60';
  else if (data.finalDecision === 'deny') decColor = '#e74c3c';
  decisionLabel.setAttribute('fill', decColor);
  decisionLabel.setAttribute('font-weight', 'bold');
  decisionLabel.textContent = `Decision: ${data.finalDecision.toUpperCase()}`;
  container.appendChild(decisionLabel);

  // Decision box highlight
  if (frame.highlights.includes('decision-allow') || frame.highlights.includes('decision-deny')) {
    const decBox = document.createElementNS(NS, 'rect');
    decBox.setAttribute('x', String(panelX - 5));
    decBox.setAttribute('y', String(panelY + 27));
    decBox.setAttribute('width', '170');
    decBox.setAttribute('height', '20');
    decBox.setAttribute('rx', '3');
    decBox.setAttribute('class', data.finalDecision === 'allow' ? 'anim-decision anim-highlight' : 'anim-decision anim-highlight');
    decBox.setAttribute('fill', data.finalDecision === 'allow' ? '#27ae60' : '#e74c3c');
    decBox.setAttribute('opacity', '0.2');
    container.appendChild(decBox);
  }

  // Source reference
  const srcRefLabel = document.createElementNS(NS, 'text');
  srcRefLabel.setAttribute('x', String(panelX));
  srcRefLabel.setAttribute('y', String(panelY + 65));
  srcRefLabel.setAttribute('class', 'anim-hook');
  srcRefLabel.setAttribute('fill', '#888');
  srcRefLabel.textContent = `Src: ${data.srcRef}`;
  container.appendChild(srcRefLabel);

  // Bottom: Step label bar
  const descY = height - margin.bottom - 15;
  const descBg = document.createElementNS(NS, 'rect');
  descBg.setAttribute('x', String(margin.left));
  descBg.setAttribute('y', String(descY - 14));
  descBg.setAttribute('width', String(width - margin.left - margin.right));
  descBg.setAttribute('height', '22');
  descBg.setAttribute('rx', '3');
  descBg.setAttribute('class', 'anim-lsm');
  descBg.setAttribute('opacity', '0.15');
  container.appendChild(descBg);

  const descText = document.createElementNS(NS, 'text');
  descText.setAttribute('x', String(margin.left + 5));
  descText.setAttribute('y', String(descY));
  descText.setAttribute('class', 'anim-hook');
  const shortLabel = frame.label.length > 90 ? frame.label.substring(0, 87) + '...' : frame.label;
  descText.textContent = shortLabel;
  container.appendChild(descText);
}

const lsmHooks: AnimationModule = {
  config: {
    id: 'lsm-hooks',
    title: 'LSM Security Hook Flow',
    skillName: 'lsm-framework',
  },

  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario) {
      case 'task-creation-check':
        return generateTaskCreationCheckFrames();
      case 'lsm-stacking':
        return generateLsmStackingFrames();
      case 'file-open-check':
      default:
        return generateFileOpenCheckFrames();
    }
  },

  renderFrame,
  getScenarios: () => SCENARIOS,
};

export default lsmHooks;

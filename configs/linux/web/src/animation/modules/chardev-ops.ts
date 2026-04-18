import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

export interface ChardevState {
  phase: string;
  majorMinor: { major: number; minor: number } | null;
  cdevRegistered: boolean;
  deviceNode: string | null;
  currentOp: string | null;
  fileOps: string[];
  srcRef: string;
}

function cloneState(s: ChardevState): ChardevState {
  return {
    phase: s.phase,
    majorMinor: s.majorMinor ? { ...s.majorMinor } : null,
    cdevRegistered: s.cdevRegistered,
    deviceNode: s.deviceNode,
    currentOp: s.currentOp,
    fileOps: [...s.fileOps],
    srcRef: s.srcRef,
  };
}

// ---------------------------------------------------------------------------
// Scenario: register-chardev
// Driver registration: alloc_chrdev_region -> cdev_init -> cdev_add -> device_create
// ---------------------------------------------------------------------------
function generateRegisterChardev(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: ChardevState = {
    phase: 'init',
    majorMinor: null,
    cdevRegistered: false,
    deviceNode: null,
    currentOp: null,
    fileOps: [],
    srcRef: '',
  };

  // Frame 0: Module init entry
  state.srcRef = 'include/linux/module.h (module_init macro)';
  frames.push({
    step: 0,
    label: 'Driver module_init() called',
    description: 'The kernel calls the driver init function registered via module_init(). The driver needs to: (1) allocate a major/minor number range, (2) initialize a cdev structure linking to its file_operations, (3) add the cdev to the system, and (4) create a device node in /dev. [include/linux/module.h -- module_init macro]',
    highlights: ['driver'],
    data: cloneState(state),
  });

  // Frame 1: alloc_chrdev_region
  state.phase = 'alloc-region';
  state.currentOp = 'alloc_chrdev_region';
  state.srcRef = 'fs/char_dev.c:233 (alloc_chrdev_region)';
  frames.push({
    step: 1,
    label: 'alloc_chrdev_region() reserves dev_t',
    description: 'The driver calls alloc_chrdev_region(&dev, 0, 1, "mychardev") at fs/char_dev.c:233. This calls __register_chrdev_region(0, baseminor, count, name) at line 237 with major=0, requesting dynamic allocation. The function acquires chrdevs_lock (line 122) and calls find_dynamic_major() at line 66 to search the chrdevs[] hash table for an unused major number.',
    highlights: ['vfs', 'chardev-table'],
    data: cloneState(state),
  });

  // Frame 2: Dynamic major found
  state.majorMinor = { major: 240, minor: 0 };
  state.srcRef = 'fs/char_dev.c:66 (find_dynamic_major) -> line 240 (MKDEV)';
  frames.push({
    step: 2,
    label: 'Dynamic major 240 assigned',
    description: 'find_dynamic_major() at fs/char_dev.c:66 scans chrdevs[] from index 254 downward (CHRDEV_MAJOR_DYN_END) looking for a NULL slot. It finds major 240 is free. Back in __register_chrdev_region(), a char_device_struct is allocated with kzalloc at line 118, populated with major=240, baseminor=0, minorct=1, and inserted into the chrdevs[] hash chain at line 157-163. alloc_chrdev_region() stores MKDEV(240, 0) into *dev at line 240.',
    highlights: ['chardev-table'],
    data: cloneState(state),
  });

  // Frame 3: cdev_init
  state.phase = 'cdev-init';
  state.currentOp = 'cdev_init';
  state.fileOps = ['.open', '.read', '.write', '.unlocked_ioctl', '.release'];
  state.srcRef = 'fs/char_dev.c:655 (cdev_init)';
  frames.push({
    step: 3,
    label: 'cdev_init() links cdev to file_operations',
    description: 'The driver calls cdev_init(&cdev, &my_fops) at fs/char_dev.c:655. This zeroes the cdev structure with memset at line 657, initializes cdev->list with INIT_LIST_HEAD at line 658, sets up the embedded kobject with kobject_init(&cdev->kobj, &ktype_cdev_default) at line 659, and stores the file_operations pointer: cdev->ops = fops at line 660. The struct cdev (include/linux/cdev.h:14) now holds: kobj, owner, ops, list, dev, count.',
    highlights: ['driver', 'cdev'],
    data: cloneState(state),
  });

  // Frame 4: cdev_add
  state.phase = 'cdev-add';
  state.currentOp = 'cdev_add';
  state.cdevRegistered = true;
  state.srcRef = 'fs/char_dev.c:476 (cdev_add)';
  frames.push({
    step: 4,
    label: 'cdev_add() registers cdev in kobj_map',
    description: 'The driver calls cdev_add(&cdev, dev, 1) at fs/char_dev.c:476. This stores dev and count into the cdev (lines 480-481), validates the device is not WHITEOUT_DEV (line 483), then calls kobj_map(cdev_map, dev, count, NULL, exact_match, exact_lock, p) at line 488. kobj_map inserts the cdev into a probe array keyed by major/minor. The device is NOW LIVE -- userspace open() calls can reach it immediately.',
    highlights: ['vfs', 'cdev'],
    data: cloneState(state),
  });

  // Frame 5: cdev is live
  state.srcRef = 'fs/char_dev.c:488 (kobj_map makes device discoverable)';
  frames.push({
    step: 5,
    label: 'cdev is live in kobj_map',
    description: 'After kobj_map() succeeds, kobject_get(p->kobj.parent) at line 493 takes a reference on the parent kobject. The cdev_map now contains a mapping from dev_t(240,0) to this cdev. When chrdev_open() at line 370 handles an open on a char device, it calls kobj_lookup(cdev_map, inode->i_rdev, &idx) at line 383 which will find this entry.',
    highlights: ['cdev', 'chardev-table'],
    data: cloneState(state),
  });

  // Frame 6: class_create + device_create
  state.phase = 'device-create';
  state.currentOp = 'device_create';
  state.deviceNode = '/dev/mychardev';
  state.srcRef = 'drivers/base/core.c (device_create) -> udev creates /dev node';
  frames.push({
    step: 6,
    label: 'device_create() triggers /dev node',
    description: 'The driver calls device_create(myclass, NULL, dev, NULL, "mychardev"). This creates a struct device, sets dev->devt = MKDEV(240, 0), and calls device_add() which registers it in sysfs at /sys/class/myclass/mychardev. The uevent sent to userspace triggers udevd to create /dev/mychardev as a character special file with major 240, minor 0.',
    highlights: ['driver', 'devnode'],
    data: cloneState(state),
  });

  // Frame 7: def_chr_fops linkage
  state.phase = 'ready';
  state.currentOp = null;
  state.srcRef = 'fs/char_dev.c:449 (def_chr_fops) -> line 450 (.open = chrdev_open)';
  frames.push({
    step: 7,
    label: 'def_chr_fops binds chrdev_open()',
    description: 'The /dev/mychardev inode has i_fop = &def_chr_fops (set by init_special_inode). def_chr_fops at fs/char_dev.c:449 has .open = chrdev_open at line 450. When userspace calls open("/dev/mychardev"), the VFS will call chrdev_open() which performs kobj_lookup() on cdev_map to find our cdev, then replaces f_op with our driver file_operations. Registration is complete.',
    highlights: ['vfs', 'driver'],
    data: cloneState(state),
  });

  // Frame 8: Summary
  state.srcRef = 'fs/char_dev.c:233,655,476 (alloc_chrdev_region, cdev_init, cdev_add)';
  frames.push({
    step: 8,
    label: 'Registration complete',
    description: 'The full registration chain: alloc_chrdev_region() at fs/char_dev.c:233 reserves major/minor -> cdev_init() at line 655 links cdev to file_operations -> cdev_add() at line 476 inserts into kobj_map -> device_create() creates /dev node via udev. The cdev (include/linux/cdev.h:14) ties together: kobject lifecycle, module ownership, file_operations dispatch, and dev_t identity.',
    highlights: ['driver', 'vfs', 'cdev', 'devnode'],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario: open-read-write
// I/O flow: open -> chrdev_open -> driver .open; read -> vfs_read -> driver .read
// ---------------------------------------------------------------------------
function generateOpenReadWrite(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: ChardevState = {
    phase: 'idle',
    majorMinor: { major: 240, minor: 0 },
    cdevRegistered: true,
    deviceNode: '/dev/mychardev',
    currentOp: null,
    fileOps: ['.open', '.read', '.write', '.unlocked_ioctl', '.release'],
    srcRef: '',
  };

  // Frame 0: Userspace calls open()
  state.phase = 'syscall-open';
  state.currentOp = 'open';
  state.srcRef = 'fs/open.c (do_sys_openat2) -> fs/namei.c (path_openat)';
  frames.push({
    step: 0,
    label: 'Userspace: fd = open("/dev/mychardev", O_RDWR)',
    description: 'A userspace process calls open("/dev/mychardev", O_RDWR). The syscall enters do_sys_openat2() which calls path_openat() in fs/namei.c. Path lookup resolves "/dev/mychardev" to an inode with i_mode S_IFCHR. Since this is a character device, the inode has i_fop = &def_chr_fops set by init_special_inode().',
    highlights: ['vfs'],
    data: cloneState(state),
  });

  // Frame 1: chrdev_open called
  state.phase = 'chrdev-open';
  state.currentOp = 'chrdev_open';
  state.srcRef = 'fs/char_dev.c:370 (chrdev_open)';
  frames.push({
    step: 1,
    label: 'VFS calls chrdev_open()',
    description: 'The VFS calls inode->i_fop->open(), which is chrdev_open() at fs/char_dev.c:370. It acquires cdev_lock (spin_lock at line 377) and checks inode->i_cdev (line 378). On first open, i_cdev is NULL, so it drops the lock (line 382) and calls kobj_lookup(cdev_map, inode->i_rdev, &idx) at line 383 to find the cdev registered for major 240, minor 0.',
    highlights: ['vfs', 'chardev-table'],
    data: cloneState(state),
  });

  // Frame 2: kobj_lookup finds cdev
  state.srcRef = 'fs/char_dev.c:383 (kobj_lookup) -> line 386 (container_of)';
  frames.push({
    step: 2,
    label: 'kobj_lookup() finds cdev in cdev_map',
    description: 'kobj_lookup() searches cdev_map using the dev_t and returns a kobject pointer. container_of(kobj, struct cdev, kobj) at line 386 recovers the full cdev structure. The code re-acquires cdev_lock (line 387), re-checks inode->i_cdev (line 390 -- someone may have beat us), sets inode->i_cdev = p at line 392, and adds the inode to cdev->list at line 393.',
    highlights: ['cdev', 'chardev-table'],
    data: cloneState(state),
  });

  // Frame 3: fops replaced
  state.srcRef = 'fs/char_dev.c:405 (fops_get) -> line 409 (replace_fops)';
  frames.push({
    step: 3,
    label: 'replace_fops() installs driver ops',
    description: 'chrdev_open() calls fops = fops_get(p->ops) at line 405 which does try_module_get() on the driver module (include/linux/fs.h:2337) to prevent module unload during operation. Then replace_fops(filp, fops) at line 409 swaps filp->f_op from def_chr_fops to the driver file_operations. The struct file now points directly at the driver ops.',
    highlights: ['vfs', 'driver'],
    data: cloneState(state),
  });

  // Frame 4: Driver .open called
  state.phase = 'driver-open';
  state.currentOp = '.open';
  state.srcRef = 'fs/char_dev.c:410 (filp->f_op->open)';
  frames.push({
    step: 4,
    label: 'Driver .open() callback invoked',
    description: 'chrdev_open() checks if filp->f_op->open is non-NULL at line 410, then calls filp->f_op->open(inode, filp) at line 411. This is the driver .open callback (include/linux/fs.h:1941). The driver can allocate per-file private data (filp->private_data), check permissions, or initialize hardware. If .open returns 0 (success), chrdev_open returns 0 and open() returns a valid fd.',
    highlights: ['driver'],
    data: cloneState(state),
  });

  // Frame 5: Userspace calls read()
  state.phase = 'syscall-read';
  state.currentOp = 'read';
  state.srcRef = 'fs/read_write.c:554 (vfs_read)';
  frames.push({
    step: 5,
    label: 'Userspace: read(fd, buf, count)',
    description: 'The process calls read(fd, buf, count). The syscall enters ksys_read() which calls vfs_read() at fs/read_write.c:554. vfs_read() checks f_mode for FMODE_READ (line 558) and FMODE_CAN_READ (line 560), verifies user buffer access with access_ok() at line 562, calls rw_verify_area() at line 565 for mandatory locking and LSM checks, then dispatches to file->f_op->read at line 571-572.',
    highlights: ['vfs'],
    data: cloneState(state),
  });

  // Frame 6: Driver .read callback
  state.phase = 'driver-read';
  state.currentOp = '.read';
  state.srcRef = 'fs/read_write.c:571 (file->f_op->read)';
  frames.push({
    step: 6,
    label: 'Driver .read() callback invoked',
    description: 'vfs_read() at fs/read_write.c:571 checks if file->f_op->read exists. If so, it calls file->f_op->read(file, buf, count, pos) at line 572. This is the driver .read handler (include/linux/fs.h:1930). The driver uses copy_to_user() to transfer data from kernel space to the user buffer. If .read_iter exists instead (line 573), vfs_read calls new_sync_read() which wraps it in a kiocb.',
    highlights: ['driver'],
    data: cloneState(state),
  });

  // Frame 7: Userspace calls write()
  state.phase = 'syscall-write';
  state.currentOp = 'write';
  state.srcRef = 'fs/read_write.c:668 (vfs_write)';
  frames.push({
    step: 7,
    label: 'Userspace: write(fd, buf, count)',
    description: 'The process calls write(fd, buf, count). ksys_write() calls vfs_write() at fs/read_write.c:668. vfs_write() checks FMODE_WRITE, verifies the buffer, calls rw_verify_area(WRITE, ...), then dispatches to file->f_op->write at line 685 if present, or file->f_op->write_iter via new_sync_write() at line 687. The driver .write callback (include/linux/fs.h:1931) uses copy_from_user() to read data from userspace.',
    highlights: ['vfs', 'driver'],
    data: cloneState(state),
  });

  // Frame 8: Return path and fsnotify
  state.phase = 'complete';
  state.currentOp = null;
  state.srcRef = 'fs/read_write.c:577 (fsnotify_access) -> line 579 (add_rchar)';
  frames.push({
    step: 8,
    label: 'I/O complete, return to userspace',
    description: 'After the driver callback returns, vfs_read() at fs/read_write.c:577 calls fsnotify_access() to notify inotify/fanotify watchers, and add_rchar() at line 579 to account I/O bytes in /proc/PID/io. inc_syscr() at line 581 increments the syscall read counter. The return value (bytes transferred or negative errno) propagates back through the syscall to userspace. The file_operations dispatch is the core VFS mechanism for char device I/O.',
    highlights: ['vfs'],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario: ioctl-flow
// ioctl path: ioctl() -> do_vfs_ioctl() -> vfs_ioctl() -> driver .unlocked_ioctl
// ---------------------------------------------------------------------------
function generateIoctlFlow(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: ChardevState = {
    phase: 'idle',
    majorMinor: { major: 240, minor: 0 },
    cdevRegistered: true,
    deviceNode: '/dev/mychardev',
    currentOp: null,
    fileOps: ['.open', '.read', '.write', '.unlocked_ioctl', '.release'],
    srcRef: '',
  };

  // Frame 0: Userspace ioctl
  state.phase = 'syscall-ioctl';
  state.currentOp = 'ioctl';
  state.srcRef = 'fs/ioctl.c:583 (SYSCALL_DEFINE3 ioctl)';
  frames.push({
    step: 0,
    label: 'Userspace: ioctl(fd, MY_IOCTL_CMD, arg)',
    description: 'A userspace process calls ioctl(fd, MY_IOCTL_CMD, arg). The syscall enters SYSCALL_DEFINE3(ioctl, ...) at fs/ioctl.c:583. It resolves the fd to a struct file using CLASS(fd, f)(fd) at line 585, checks fd_empty() at line 588, then calls security_file_ioctl() at line 591 for LSM permission checks (SELinux, AppArmor).',
    highlights: ['vfs'],
    data: cloneState(state),
  });

  // Frame 1: do_vfs_ioctl
  state.phase = 'do-vfs-ioctl';
  state.currentOp = 'do_vfs_ioctl';
  state.srcRef = 'fs/ioctl.c:492 (do_vfs_ioctl) -> line 595';
  frames.push({
    step: 1,
    label: 'do_vfs_ioctl() checks common ioctls',
    description: 'The syscall calls do_vfs_ioctl() at fs/ioctl.c:595 (line 492 for the function). do_vfs_ioctl() handles generic ioctls via a switch statement: FIOCLEX (line 499), FIONCLEX (line 503), FIONBIO (line 507), FIOASYNC (line 510), FIFREEZE/FITHAW, FS_IOC_FIEMAP, FICLONE, etc. These are VFS-level commands that apply to all file types. If the cmd does not match any, it falls through.',
    highlights: ['vfs'],
    data: cloneState(state),
  });

  // Frame 2: Falls through to vfs_ioctl
  state.phase = 'vfs-ioctl';
  state.currentOp = 'vfs_ioctl';
  state.srcRef = 'fs/ioctl.c:551 (default case) -> line 597 (vfs_ioctl fallback)';
  frames.push({
    step: 2,
    label: 'vfs_ioctl() dispatches to driver',
    description: 'MY_IOCTL_CMD is not a generic VFS ioctl, so do_vfs_ioctl() returns -ENOIOCTLCMD. Back in the syscall at fs/ioctl.c:596, the code checks: if (error == -ENOIOCTLCMD) error = vfs_ioctl(fd_file(f), cmd, arg) at line 597. vfs_ioctl() at line 44 is the final dispatch to the driver.',
    highlights: ['vfs'],
    data: cloneState(state),
  });

  // Frame 3: vfs_ioctl checks unlocked_ioctl
  state.srcRef = 'fs/ioctl.c:44 (vfs_ioctl) -> line 48 (unlocked_ioctl check)';
  frames.push({
    step: 3,
    label: 'vfs_ioctl() checks f_op->unlocked_ioctl',
    description: 'vfs_ioctl() at fs/ioctl.c:44 initializes error = -ENOTTY at line 46. It checks if filp->f_op->unlocked_ioctl is non-NULL at line 48. If the driver did not implement .unlocked_ioctl (include/linux/fs.h:1938), vfs_ioctl returns -ENOTTY and the syscall returns -ENOTTY to userspace. Our driver has it, so we proceed.',
    highlights: ['vfs', 'driver'],
    data: cloneState(state),
  });

  // Frame 4: Driver unlocked_ioctl called
  state.phase = 'driver-ioctl';
  state.currentOp = '.unlocked_ioctl';
  state.srcRef = 'fs/ioctl.c:51 (filp->f_op->unlocked_ioctl)';
  frames.push({
    step: 4,
    label: 'Driver .unlocked_ioctl() invoked',
    description: 'vfs_ioctl() calls filp->f_op->unlocked_ioctl(filp, cmd, arg) at fs/ioctl.c:51. This is the driver ioctl handler (include/linux/fs.h:1938: long (*unlocked_ioctl)(struct file *, unsigned int, unsigned long)). The "unlocked" name is historical -- it replaced the old ioctl() that held the BKL. The driver typically uses a switch on cmd to handle device-specific commands.',
    highlights: ['driver'],
    data: cloneState(state),
  });

  // Frame 5: Driver processes command
  state.phase = 'driver-processing';
  state.srcRef = 'include/linux/fs.h:1938 (unlocked_ioctl prototype)';
  frames.push({
    step: 5,
    label: 'Driver processes ioctl command',
    description: 'Inside the driver .unlocked_ioctl handler, the driver switches on cmd. For commands that pass data, the driver uses copy_from_user()/copy_to_user() with the arg parameter (cast to void __user *). The driver validates cmd values and arg pointers. The _IOC_TYPE/_IOC_NR/_IOC_SIZE macros (include/uapi/asm-generic/ioctl.h) decode the encoded ioctl number.',
    highlights: ['driver'],
    data: cloneState(state),
  });

  // Frame 6: ENOIOCTLCMD handling
  state.phase = 'enoioctlcmd';
  state.currentOp = 'error-mapping';
  state.srcRef = 'fs/ioctl.c:52 (ENOIOCTLCMD -> ENOTTY mapping)';
  frames.push({
    step: 6,
    label: 'ENOIOCTLCMD mapped to ENOTTY',
    description: 'If the driver returns -ENOIOCTLCMD (not a userspace-visible error), vfs_ioctl() at fs/ioctl.c:52 maps it to -ENOTTY, the standard "inappropriate ioctl for device" errno. This two-level dispatch (do_vfs_ioctl for generic, vfs_ioctl for driver-specific) means drivers never see generic VFS ioctls like FIOCLEX, and the kernel has a clean error mapping.',
    highlights: ['vfs'],
    data: cloneState(state),
  });

  // Frame 7: compat_ioctl for 32-bit
  state.phase = 'compat';
  state.currentOp = 'compat_ioctl';
  state.srcRef = 'include/linux/fs.h:1939 (compat_ioctl)';
  frames.push({
    step: 7,
    label: 'compat_ioctl handles 32-bit userspace',
    description: 'On 64-bit kernels with 32-bit userspace (CONFIG_COMPAT), compat_sys_ioctl() at fs/ioctl.c:684 handles ioctl translation. If the driver provides .compat_ioctl (include/linux/fs.h:1939), it is called for 32-bit processes. This handles pointer size differences and structure layout changes. Without .compat_ioctl, 32-bit ioctls with pointer arguments will fail.',
    highlights: ['vfs', 'driver'],
    data: cloneState(state),
  });

  // Frame 8: Return to userspace
  state.phase = 'complete';
  state.currentOp = null;
  state.srcRef = 'fs/ioctl.c:583-600 (SYSCALL_DEFINE3 ioctl full path)';
  frames.push({
    step: 8,
    label: 'ioctl returns to userspace',
    description: 'The ioctl syscall at fs/ioctl.c:583 returns the error code to userspace. The full path: SYSCALL_DEFINE3(ioctl) -> security_file_ioctl() (LSM check) -> do_vfs_ioctl() (generic ioctls like FIOCLEX/FIONBIO) -> vfs_ioctl() at line 44 -> filp->f_op->unlocked_ioctl() at line 51 -> driver handler. The ioctl mechanism provides extensible device control beyond read/write semantics.',
    highlights: ['vfs', 'driver'],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// SVG Rendering
// ---------------------------------------------------------------------------
const NS = 'http://www.w3.org/2000/svg';

const LAYER_COLORS: Record<string, string> = {
  userspace: '#3fb950',
  vfs: '#58a6ff',
  chardev: '#d29922',
  driver: '#bc8cff',
};

const FLOW_LAYERS = [
  { id: 'userspace', label: 'Userspace' },
  { id: 'vfs', label: 'VFS Layer' },
  { id: 'chardev', label: 'char_dev.c' },
  { id: 'driver', label: 'Driver fops' },
];

function getActiveLayerIndex(phase: string): number {
  switch (phase) {
    case 'init':
    case 'idle': return -1;
    case 'alloc-region': return 2; // chardev
    case 'cdev-init':
    case 'cdev-add': return 2;
    case 'device-create': return 3; // driver
    case 'ready': return 1; // vfs
    case 'syscall-open':
    case 'syscall-read':
    case 'syscall-write':
    case 'syscall-ioctl': return 0; // userspace
    case 'chrdev-open': return 2;
    case 'driver-open':
    case 'driver-read':
    case 'driver-ioctl':
    case 'driver-processing': return 3;
    case 'do-vfs-ioctl':
    case 'vfs-ioctl':
    case 'enoioctlcmd':
    case 'compat': return 1;
    case 'complete': return -1;
    default: return -1;
  }
}

function renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void {
  while (container.firstChild) container.removeChild(container.firstChild);
  const data = frame.data as ChardevState;
  const margin = { top: 10, left: 15, right: 15, bottom: 10 };
  const usableWidth = width - margin.left - margin.right;

  // Title
  const title = document.createElementNS(NS, 'text');
  title.setAttribute('x', String(width / 2));
  title.setAttribute('y', '18');
  title.setAttribute('text-anchor', 'middle');
  title.setAttribute('class', 'anim-title');
  title.textContent = 'Character Device Operations';
  container.appendChild(title);

  // --- Layer flow diagram (left area) ---
  const layerTop = margin.top + 30;
  const layerWidth = Math.min(140, usableWidth / 3);
  const layerHeight = 36;
  const layerGap = 20;
  const activeLayer = getActiveLayerIndex(data.phase);

  FLOW_LAYERS.forEach((layer, i) => {
    const ly = layerTop + i * (layerHeight + layerGap);
    const lx = margin.left;
    const isActive = i === activeLayer;

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(lx));
    rect.setAttribute('y', String(ly));
    rect.setAttribute('width', String(layerWidth));
    rect.setAttribute('height', String(layerHeight));
    rect.setAttribute('rx', '5');
    const color = LAYER_COLORS[layer.id] || '#30363d';
    rect.setAttribute('fill', isActive ? color : '#21262d');
    rect.setAttribute('stroke', color);
    rect.setAttribute('stroke-width', isActive ? '2' : '1');
    let cls = `anim-${layer.id === 'chardev' ? 'chardev' : layer.id === 'vfs' ? 'vfs' : layer.id === 'driver' ? 'driver' : 'chardev'}`;
    if (isActive) cls += ' anim-highlight';
    rect.setAttribute('class', cls);
    container.appendChild(rect);

    const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', String(lx + layerWidth / 2));
    label.setAttribute('y', String(ly + layerHeight / 2 + 4));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('fill', '#e6edf3');
    label.setAttribute('font-size', '11');
    label.setAttribute('class', `anim-${layer.id === 'chardev' ? 'chardev' : layer.id === 'vfs' ? 'vfs' : 'driver'}`);
    label.textContent = layer.label;
    container.appendChild(label);

    // Arrow to next layer
    if (i < FLOW_LAYERS.length - 1) {
      const arrowX = lx + layerWidth / 2;
      const arrowY1 = ly + layerHeight;
      const arrowY2 = arrowY1 + layerGap;
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', String(arrowX));
      line.setAttribute('y1', String(arrowY1));
      line.setAttribute('x2', String(arrowX));
      line.setAttribute('y2', String(arrowY2));
      line.setAttribute('stroke', '#8b949e');
      line.setAttribute('stroke-width', '1');
      container.appendChild(line);
    }
  });

  // --- Device info panel (right area) ---
  const infoLeft = margin.left + layerWidth + 30;
  const infoTop = layerTop;

  // Major/Minor
  const devText = document.createElementNS(NS, 'text');
  devText.setAttribute('x', String(infoLeft));
  devText.setAttribute('y', String(infoTop + 14));
  devText.setAttribute('fill', '#8b949e');
  devText.setAttribute('font-size', '11');
  devText.setAttribute('class', 'anim-chardev');
  devText.textContent = data.majorMinor
    ? `dev_t: MKDEV(${data.majorMinor.major}, ${data.majorMinor.minor})`
    : 'dev_t: (unassigned)';
  container.appendChild(devText);

  // cdev status
  const cdevText = document.createElementNS(NS, 'text');
  cdevText.setAttribute('x', String(infoLeft));
  cdevText.setAttribute('y', String(infoTop + 32));
  cdevText.setAttribute('fill', data.cdevRegistered ? '#3fb950' : '#8b949e');
  cdevText.setAttribute('font-size', '11');
  cdevText.setAttribute('class', 'anim-chardev');
  cdevText.textContent = data.cdevRegistered ? 'cdev: registered in kobj_map' : 'cdev: not registered';
  container.appendChild(cdevText);

  // Device node
  const nodeText = document.createElementNS(NS, 'text');
  nodeText.setAttribute('x', String(infoLeft));
  nodeText.setAttribute('y', String(infoTop + 50));
  nodeText.setAttribute('fill', data.deviceNode ? '#3fb950' : '#8b949e');
  nodeText.setAttribute('font-size', '11');
  nodeText.setAttribute('class', 'anim-chardev');
  nodeText.textContent = data.deviceNode ? `node: ${data.deviceNode}` : 'node: (none)';
  container.appendChild(nodeText);

  // Current operation
  if (data.currentOp) {
    const opRect = document.createElementNS(NS, 'rect');
    opRect.setAttribute('x', String(infoLeft));
    opRect.setAttribute('y', String(infoTop + 62));
    opRect.setAttribute('width', '160');
    opRect.setAttribute('height', '24');
    opRect.setAttribute('rx', '4');
    opRect.setAttribute('fill', '#1f6feb');
    opRect.setAttribute('class', 'anim-vfs anim-highlight');
    container.appendChild(opRect);

    const opText = document.createElementNS(NS, 'text');
    opText.setAttribute('x', String(infoLeft + 80));
    opText.setAttribute('y', String(infoTop + 78));
    opText.setAttribute('text-anchor', 'middle');
    opText.setAttribute('fill', '#e6edf3');
    opText.setAttribute('font-size', '11');
    opText.setAttribute('class', 'anim-vfs');
    opText.textContent = data.currentOp;
    container.appendChild(opText);
  }

  // --- file_operations list (bottom right) ---
  if (data.fileOps.length > 0) {
    const fopsTop = infoTop + 100;
    const fopsLabel = document.createElementNS(NS, 'text');
    fopsLabel.setAttribute('x', String(infoLeft));
    fopsLabel.setAttribute('y', String(fopsTop));
    fopsLabel.setAttribute('fill', '#8b949e');
    fopsLabel.setAttribute('font-size', '10');
    fopsLabel.setAttribute('class', 'anim-driver');
    fopsLabel.textContent = 'file_operations:';
    container.appendChild(fopsLabel);

    data.fileOps.forEach((op, i) => {
      const fy = fopsTop + 14 + i * 16;
      const isActive = data.currentOp === op;

      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', String(infoLeft));
      rect.setAttribute('y', String(fy));
      rect.setAttribute('width', '120');
      rect.setAttribute('height', '14');
      rect.setAttribute('rx', '2');
      rect.setAttribute('fill', isActive ? '#bc8cff' : '#21262d');
      rect.setAttribute('class', 'anim-driver');
      container.appendChild(rect);

      const text = document.createElementNS(NS, 'text');
      text.setAttribute('x', String(infoLeft + 6));
      text.setAttribute('y', String(fy + 11));
      text.setAttribute('fill', isActive ? '#ffffff' : '#8b949e');
      text.setAttribute('font-size', '10');
      text.setAttribute('class', 'anim-driver');
      text.textContent = op;
      container.appendChild(text);
    });
  }

  // --- Source reference (bottom) ---
  if (data.srcRef) {
    const srcText = document.createElementNS(NS, 'text');
    srcText.setAttribute('x', String(margin.left));
    srcText.setAttribute('y', String(height - margin.bottom - 4));
    srcText.setAttribute('fill', '#484f58');
    srcText.setAttribute('font-size', '9');
    srcText.setAttribute('class', 'anim-chardev');
    srcText.textContent = data.srcRef;
    container.appendChild(srcText);
  }
}

// ---------------------------------------------------------------------------
// Module export
// ---------------------------------------------------------------------------
const SCENARIOS: AnimationScenario[] = [
  { id: 'register-chardev', label: 'Driver Registration (alloc/init/add)' },
  { id: 'open-read-write', label: 'Open/Read/Write I/O Flow' },
  { id: 'ioctl-flow', label: 'ioctl Dispatch Path' },
];

const chardevOps: AnimationModule = {
  config: {
    id: 'chardev-ops',
    title: 'Character Device Operations',
    skillName: 'character-devices',
  },
  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario) {
      case 'open-read-write': return generateOpenReadWrite();
      case 'ioctl-flow': return generateIoctlFlow();
      case 'register-chardev':
      default: return generateRegisterChardev();
    }
  },
  renderFrame,
  getScenarios: () => SCENARIOS,
};

export default chardevOps;

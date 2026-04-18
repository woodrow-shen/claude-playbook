import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

export interface DeviceSysfsState {
  phase: 'init' | 'register' | 'kobject' | 'bus-add' | 'probe' | 'bind' | 'sysfs-create' | 'sysfs-read' | 'complete';
  devices: string[];
  drivers: string[];
  buses: string[];
  kobjectTree: string[];
  sysfsPath: string;
  srcRef: string;
}

function cloneState(s: DeviceSysfsState): DeviceSysfsState {
  return {
    phase: s.phase,
    devices: [...s.devices],
    drivers: [...s.drivers],
    buses: [...s.buses],
    kobjectTree: [...s.kobjectTree],
    sysfsPath: s.sysfsPath,
    srcRef: s.srcRef,
  };
}

// ---------------------------------------------------------------------------
// Scenario: device-registration
// Registering a device with the driver model: device_register -> device_add
// -> kobject_add -> bus_add_device -> bus_probe_device
// ---------------------------------------------------------------------------
function generateDeviceRegistration(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: DeviceSysfsState = {
    phase: 'init',
    devices: [],
    drivers: [],
    buses: ['platform'],
    kobjectTree: ['/sys/devices'],
    sysfsPath: '',
    srcRef: '',
  };

  // Frame 0: device_register called
  state.srcRef = 'drivers/base/core.c:3770 (device_register)';
  frames.push({
    step: 0,
    label: 'device_register() called for new device',
    description: 'A subsystem calls device_register() at drivers/base/core.c:3770 to register a new platform device. device_register() is a convenience wrapper that calls device_initialize() at line 3772 followed by device_add() at line 3773. device_initialize() sets up the device kobject, initializes the devres list, and sets the initial reference count via kobject_init().',
    highlights: ['phase-indicator'],
    data: cloneState(state),
  });

  // Frame 1: device_initialize sets up kobject
  state.phase = 'register';
  state.srcRef = 'drivers/base/core.c:3143-3170 (device_initialize)';
  frames.push({
    step: 1,
    label: 'device_initialize() sets up kobject and internals',
    description: 'device_initialize() at drivers/base/core.c:3143 calls kobject_init() to initialize the embedded kobject with ktype device_ktype. It initializes dev->devres_head (managed resources list), dev->mutex (device lock), spin_lock_init for dev->devres_lock, INIT_LIST_HEAD for dev->dma_pools, and sets dev->power state for runtime PM. The device is not yet visible to the system.',
    highlights: ['kobject-tree'],
    data: cloneState(state),
  });

  // Frame 2: device_add begins - name and parent
  state.phase = 'register';
  state.srcRef = 'drivers/base/core.c:3573-3621 (device_add name and parent setup)';
  state.kobjectTree.push('/sys/devices/platform');
  frames.push({
    step: 2,
    label: 'device_add() sets name and parent kobject',
    description: 'device_add() at drivers/base/core.c:3573 begins device registration. It calls device_private_init() at line 3587 to allocate dev->p (struct device_private). At line 3597, if dev->init_name is set, dev_set_name() copies it to dev->kobj.name. get_device_parent() at line 3615 finds the parent kobject in the sysfs hierarchy -- for a platform device this is /sys/devices/platform/.',
    highlights: ['kobject-tree'],
    data: cloneState(state),
  });

  // Frame 3: kobject_add creates sysfs directory
  state.phase = 'kobject';
  state.kobjectTree.push('/sys/devices/platform/my_device');
  state.sysfsPath = '/sys/devices/platform/my_device';
  state.srcRef = 'drivers/base/core.c:3629 (kobject_add) -> lib/kobject.c';
  frames.push({
    step: 3,
    label: 'kobject_add() creates sysfs directory',
    description: 'At drivers/base/core.c:3629, kobject_add(&dev->kobj, dev->kobj.parent, NULL) registers the kobject in the hierarchy. Internally, kobject_add_internal() calls create_dir() which calls sysfs_create_dir_ns() to create the /sys/devices/platform/my_device/ directory. The kobject is now linked into its parent kset. device_create_file() at line 3638 adds the uevent attribute.',
    highlights: ['kobject-tree'],
    data: cloneState(state),
  });

  // Frame 4: device_add_attrs and class symlinks
  state.srcRef = 'drivers/base/core.c:3642-3645 (device_add_class_symlinks, device_add_attrs)';
  frames.push({
    step: 4,
    label: 'Create sysfs attributes and class symlinks',
    description: 'device_add_class_symlinks() at drivers/base/core.c:3642 creates symbolic links between the device directory and its class (e.g., /sys/class/input/event0 -> /sys/devices/platform/my_device). device_add_attrs() at line 3645 creates device-type and device-class attribute files. These attributes expose device properties like power state and uevent to userspace via sysfs.',
    highlights: ['phase-indicator'],
    data: cloneState(state),
  });

  // Frame 5: bus_add_device
  state.phase = 'bus-add';
  state.devices.push('my_device');
  state.srcRef = 'drivers/base/core.c:3648 (bus_add_device) -> drivers/base/bus.c:545';
  frames.push({
    step: 5,
    label: 'bus_add_device() links device to bus',
    description: 'bus_add_device() at drivers/base/bus.c:545 adds the device to the bus subsystem. It calls device_add_groups() at line 566 for bus-specific device attributes, creates a sysfs link from the bus devices directory to the device (sysfs_create_link at line 576), and a "subsystem" symlink on the device pointing back to the bus (line 580). Finally, klist_add_tail() at line 584 adds the device to the bus device list.',
    highlights: ['phase-indicator'],
    data: cloneState(state),
  });

  // Frame 6: kobject_uevent and fw_devlink
  state.srcRef = 'drivers/base/core.c:3672-3691 (kobject_uevent, fw_devlink, bus_probe_device)';
  frames.push({
    step: 6,
    label: 'kobject_uevent() notifies userspace',
    description: 'bus_notify() at drivers/base/core.c:3671 sends BUS_NOTIFY_ADD_DEVICE to bus notifiers. kobject_uevent() at line 3672 broadcasts a KOBJ_ADD uevent via netlink to userspace (udev/systemd-udevd). If dev->fwnode is set (lines 3686-3689), fw_devlink_link_device() creates device links to track supplier-consumer relationships from firmware (DT/ACPI).',
    highlights: ['phase-indicator'],
    data: cloneState(state),
  });

  // Frame 7: bus_probe_device triggers matching
  state.phase = 'probe';
  state.srcRef = 'drivers/base/core.c:3691 (bus_probe_device) -> drivers/base/bus.c:605';
  frames.push({
    step: 7,
    label: 'bus_probe_device() initiates driver matching',
    description: 'bus_probe_device() at drivers/base/bus.c:605 is called from device_add() at drivers/base/core.c:3691. It calls device_initial_probe() which triggers __device_attach() to iterate over all registered drivers on the bus. For each driver, driver_match_device() checks if the driver and device match via the bus match function (e.g., platform_match). If a match is found, driver_probe_device() is called.',
    highlights: ['phase-indicator'],
    data: cloneState(state),
  });

  // Frame 8: device added to parent klist
  state.phase = 'complete';
  state.kobjectTree.push('/sys/bus/platform/devices/my_device');
  state.srcRef = 'drivers/base/core.c:3701-3717 (klist_add_tail, class subsys)';
  frames.push({
    step: 8,
    label: 'Device registration complete',
    description: 'At drivers/base/core.c:3701, klist_add_tail() adds the device to its parent children list (parent->p->klist_children). If the device has a class (line 3705), it is added to the class device list. Class interfaces are notified via class_intf->add_dev (line 3714). The device is now fully registered: visible in /sys/devices/platform/my_device/, linked from /sys/bus/platform/devices/, and ready for driver binding.',
    highlights: ['kobject-tree'],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario: driver-binding
// Driver-device binding: driver_register -> bus_add_driver -> driver_attach
// -> __driver_probe_device -> really_probe
// ---------------------------------------------------------------------------
function generateDriverBinding(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: DeviceSysfsState = {
    phase: 'init',
    devices: ['my_device'],
    drivers: [],
    buses: ['platform'],
    kobjectTree: ['/sys/devices', '/sys/devices/platform', '/sys/devices/platform/my_device'],
    sysfsPath: '',
    srcRef: '',
  };

  // Frame 0: driver_register called
  state.srcRef = 'drivers/base/driver.c:225 (driver_register)';
  frames.push({
    step: 0,
    label: 'driver_register() called for new driver',
    description: 'A kernel module calls driver_register() at drivers/base/driver.c:225 to register a new device driver. It first checks that the bus is registered via bus_is_registered() at line 230. At line 236, it warns if both bus and driver define probe/remove/shutdown (drivers should use bus methods). driver_find() at line 242 checks for duplicate names -- returning -EBUSY if a driver with the same name already exists on this bus.',
    highlights: ['phase-indicator'],
    data: cloneState(state),
  });

  // Frame 1: bus_add_driver
  state.phase = 'register';
  state.srcRef = 'drivers/base/driver.c:249 (bus_add_driver) -> drivers/base/bus.c:725';
  frames.push({
    step: 1,
    label: 'bus_add_driver() adds driver to bus',
    description: 'driver_register() calls bus_add_driver() at drivers/base/driver.c:249, which is implemented at drivers/base/bus.c:725. bus_add_driver() allocates a driver_private struct at line 740, initializes a klist for devices (line 745), and calls kobject_init_and_add() at line 749 to create a kobject for the driver under /sys/bus/platform/drivers/my_driver. klist_add_tail() at line 754 adds the driver to the bus driver list.',
    highlights: ['phase-indicator'],
    data: cloneState(state),
  });

  // Frame 2: drivers_autoprobe triggers driver_attach
  state.phase = 'bind';
  state.srcRef = 'drivers/base/bus.c:755-756 (drivers_autoprobe -> driver_attach)';
  state.kobjectTree.push('/sys/bus/platform/drivers/my_driver');
  frames.push({
    step: 2,
    label: 'Autoprobe triggers driver_attach()',
    description: 'If sp->drivers_autoprobe is true (the default, set via /sys/bus/platform/drivers_autoprobe), bus_add_driver() calls driver_attach() at drivers/base/bus.c:756. driver_attach() at drivers/base/dd.c:1290 calls bus_for_each_dev() to iterate all devices on the bus, invoking __driver_attach() for each device. This is where the matching process begins.',
    highlights: ['phase-indicator'],
    data: cloneState(state),
  });

  // Frame 3: __driver_attach matches device
  state.srcRef = 'drivers/base/dd.c:1215-1251 (__driver_attach match check)';
  frames.push({
    step: 3,
    label: '__driver_attach() finds matching device',
    description: '__driver_attach() at drivers/base/dd.c:1215 calls driver_match_device() at line 1231. For platform devices, this calls platform_match() which checks: (1) driver_override, (2) OF device tree compatible, (3) ACPI matching, (4) id_table matching, (5) name string comparison. A positive return means a match was found. If ret == -EPROBE_DEFER (line 1235), the device is added to the deferred probe list.',
    highlights: ['phase-indicator'],
    data: cloneState(state),
  });

  // Frame 4: driver_probe_device
  state.srcRef = 'drivers/base/dd.c:1274-1276 (__device_driver_lock, driver_probe_device)';
  frames.push({
    step: 4,
    label: 'driver_probe_device() begins probing',
    description: '__driver_attach() acquires the device lock via __device_driver_lock() at drivers/base/dd.c:1274, then calls driver_probe_device() at line 1275. driver_probe_device() at line 875 increments the probe counter, calls __driver_probe_device() at line 881. If probing returns -EPROBE_DEFER, the device is added to the deferred probe list (line 883) for later retry.',
    highlights: ['phase-indicator'],
    data: cloneState(state),
  });

  // Frame 5: __driver_probe_device checks
  state.phase = 'probe';
  state.srcRef = 'drivers/base/dd.c:830-858 (__driver_probe_device)';
  frames.push({
    step: 5,
    label: '__driver_probe_device() validates and probes',
    description: '__driver_probe_device() at drivers/base/dd.c:830 checks if the device is dead or unregistered (line 834, returns -ENODEV), and whether it already has a driver (line 836, returns -EBUSY). It sets dev->can_match = true at line 839. pm_runtime_get_suppliers() at line 843 and pm_runtime_get_sync(dev->parent) at line 845 ensure power dependencies are active. Then really_probe() is called at line 851.',
    highlights: ['phase-indicator'],
    data: cloneState(state),
  });

  // Frame 6: really_probe executes probe callback
  state.srcRef = 'drivers/base/dd.c:655-726 (really_probe)';
  state.drivers.push('my_driver');
  frames.push({
    step: 6,
    label: 'really_probe() executes driver probe callback',
    description: 'really_probe() at drivers/base/dd.c:655 first checks device_links_check_suppliers() at line 671 to verify supplier devices are ready. device_set_driver() at line 684 sets dev->driver. pinctrl_bind_pins() at line 687 configures pin muxing. driver_sysfs_add() at line 697 creates the sysfs "driver" symlink. call_driver_probe() at line 709 invokes the actual driver probe function (bus->probe or drv->probe).',
    highlights: ['phase-indicator'],
    data: cloneState(state),
  });

  // Frame 7: probe success, sysfs and uevent
  state.srcRef = 'drivers/base/dd.c:728-740 (device_add_groups, state_synced)';
  state.kobjectTree.push('/sys/devices/platform/my_device/driver');
  frames.push({
    step: 7,
    label: 'Probe success: sysfs links and uevent',
    description: 'After a successful probe, really_probe() calls device_add_groups() at drivers/base/dd.c:728 to create driver-specific device attributes. device_create_file() at line 735 adds the state_synced attribute. driver_bound() is called to finalize: it adds the device to the driver klist, sends a KOBJ_BIND uevent via kobject_uevent(), and notifies the bus via BUS_NOTIFY_BOUND_DRIVER.',
    highlights: ['kobject-tree'],
    data: cloneState(state),
  });

  // Frame 8: driver registration complete
  state.phase = 'complete';
  state.srcRef = 'drivers/base/driver.c:252-258 (driver_add_groups, kobject_uevent)';
  frames.push({
    step: 8,
    label: 'Driver registration and binding complete',
    description: 'Back in driver_register() at drivers/base/driver.c:252, driver_add_groups() creates driver attribute files (e.g., bind/unbind). kobject_uevent() at line 257 sends KOBJ_ADD for the driver. deferred_probe_extend_timeout() at line 258 extends the deferred probe timeout. The driver is now fully registered, bound to matching devices, visible at /sys/bus/platform/drivers/my_driver/, with symlinks to bound devices.',
    highlights: ['kobject-tree'],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario: sysfs-attribute-read
// Reading a sysfs attribute: open /sys/... -> sysfs_kf_seq_show ->
// dev_attr_show -> driver show callback
// ---------------------------------------------------------------------------
function generateSysfsAttributeRead(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: DeviceSysfsState = {
    phase: 'init',
    devices: ['my_device'],
    drivers: ['my_driver'],
    buses: ['platform'],
    kobjectTree: ['/sys/devices', '/sys/devices/platform', '/sys/devices/platform/my_device'],
    sysfsPath: '',
    srcRef: '',
  };

  // Frame 0: sysfs_create_group registers attributes
  state.srcRef = 'fs/sysfs/group.c:212-216 (sysfs_create_group)';
  frames.push({
    step: 0,
    label: 'sysfs_create_group() registers attributes',
    description: 'During device/driver registration, sysfs_create_group() at fs/sysfs/group.c:212 is called to create a group of sysfs attributes. It delegates to internal_create_group() at line 215. internal_create_group() at line 129 validates the kobject, calls kernfs_create_dir_ns() at line 176 if the group has a name (creating a subdirectory), then create_files() at line 189 to create individual attribute files in the kernfs tree.',
    highlights: ['phase-indicator'],
    data: cloneState(state),
  });

  // Frame 1: Attribute files created in kernfs
  state.phase = 'sysfs-create';
  state.kobjectTree.push('/sys/devices/platform/my_device/power');
  state.kobjectTree.push('/sys/devices/platform/my_device/uevent');
  state.srcRef = 'fs/sysfs/group.c:189 (create_files) -> fs/sysfs/file.c';
  frames.push({
    step: 1,
    label: 'Attribute files created in kernfs',
    description: 'create_files() iterates the attribute_group arrays. For each struct attribute, it calls sysfs_add_file_mode_ns() which creates a kernfs_node. Each kernfs_node stores a pointer to the attribute and its sysfs_ops (show/store callbacks). The kernfs tree mirrors the kobject hierarchy: /sys/devices/platform/my_device/ contains uevent, power/, subsystem, driver symlinks, and device-specific attributes.',
    highlights: ['kobject-tree'],
    data: cloneState(state),
  });

  // Frame 2: Userspace opens /sys/... file
  state.phase = 'sysfs-read';
  state.sysfsPath = '/sys/devices/platform/my_device/uevent';
  state.srcRef = 'fs/kernfs/file.c (kernfs_fop_open)';
  frames.push({
    step: 2,
    label: 'Userspace opens sysfs attribute file',
    description: 'A userspace process calls open("/sys/devices/platform/my_device/uevent"). The VFS resolves the path through the kernfs filesystem. kernfs_fop_open() allocates a kernfs_open_file, checks permissions, and sets up seq_file for buffered reads. The kernfs_node priv pointer links back to the struct attribute that was registered during sysfs_create_group().',
    highlights: ['phase-indicator'],
    data: cloneState(state),
  });

  // Frame 3: read() triggers seq_file
  state.srcRef = 'fs/kernfs/file.c (kernfs_fop_read_iter -> kernfs_seq_show)';
  frames.push({
    step: 3,
    label: 'read() dispatches through seq_file',
    description: 'The read() syscall enters kernfs_fop_read_iter(). For non-bin attributes, this uses the seq_file interface. seq_read_iter() calls seq_file->op->show, which is kernfs_seq_show(). kernfs_seq_show() looks up the kernfs_ops for this node type -- for sysfs attributes, this is sysfs_file_kfops_ro with seq_show = sysfs_kf_seq_show.',
    highlights: ['phase-indicator'],
    data: cloneState(state),
  });

  // Frame 4: sysfs_kf_seq_show gets buffer
  state.srcRef = 'fs/sysfs/file.c:46-79 (sysfs_kf_seq_show)';
  frames.push({
    step: 4,
    label: 'sysfs_kf_seq_show() calls ops->show()',
    description: 'sysfs_kf_seq_show() at fs/sysfs/file.c:46 retrieves the kobject via sysfs_file_kobj() at line 49 and the sysfs_ops via sysfs_file_ops() at line 50. It acquires a PAGE_SIZE buffer via seq_get_buf() at line 58, clears it with memset at line 63, then calls ops->show(kobj, attr, buf) at line 65. For device attributes, ops points to dev_sysfs_ops whose show function is dev_attr_show().',
    highlights: ['phase-indicator'],
    data: cloneState(state),
  });

  // Frame 5: dev_attr_show dispatches to driver
  state.srcRef = 'drivers/base/core.c:2413-2427 (dev_attr_show)';
  frames.push({
    step: 5,
    label: 'dev_attr_show() calls attribute show function',
    description: 'dev_attr_show() at drivers/base/core.c:2413 uses container_of (to_dev_attr macro at line 2411) to get the device_attribute from the generic attribute. kobj_to_dev() at line 2417 converts the kobject to struct device. If dev_attr->show is non-NULL (line 2420), it calls the specific show callback with (dev, dev_attr, buf). This is where the driver-specific attribute handler runs, formatting data into the page buffer.',
    highlights: ['phase-indicator'],
    data: cloneState(state),
  });

  // Frame 6: show callback writes to buffer
  state.sysfsPath = '/sys/devices/platform/my_device/uevent -> DRIVER=my_driver';
  state.srcRef = 'drivers/base/core.c:2441-2443 (dev_sysfs_ops)';
  frames.push({
    step: 6,
    label: 'Show callback writes data to buffer',
    description: 'The attribute show function (e.g., uevent_show or a custom driver attribute) writes formatted data into the PAGE_SIZE buffer using scnprintf(). dev_sysfs_ops at drivers/base/core.c:2441 defines .show = dev_attr_show and .store = dev_attr_store. The show callback returns the number of bytes written. If the return value exceeds PAGE_SIZE, dev_attr_show() logs a warning at line 2423.',
    highlights: ['kobject-tree'],
    data: cloneState(state),
  });

  // Frame 7: seq_commit returns data to userspace
  state.srcRef = 'fs/sysfs/file.c:73-79 (seq_commit, return to userspace)';
  frames.push({
    step: 7,
    label: 'Data returned to userspace via seq_file',
    description: 'Back in sysfs_kf_seq_show() at fs/sysfs/file.c:73, if count >= PAGE_SIZE, a truncation warning is printed. seq_commit() at line 79 marks the data available in the seq_file buffer. seq_read_iter() then calls copy_to_iter() to transfer the data to the userspace read buffer. The kobject hierarchy (/sys/devices/platform/my_device/) directly maps to the kernfs directory tree.',
    highlights: ['phase-indicator'],
    data: cloneState(state),
  });

  // Frame 8: kobject hierarchy mapping
  state.phase = 'complete';
  state.sysfsPath = '/sys/devices/platform/my_device/ (complete hierarchy)';
  state.srcRef = 'drivers/base/core.c:3629 (kobject_add creates /sys/ hierarchy)';
  frames.push({
    step: 8,
    label: 'Kobject hierarchy maps to /sys/ filesystem',
    description: 'The entire /sys/ filesystem is a projection of the kernel kobject hierarchy. Each kobject_add() at drivers/base/core.c:3629 creates a directory. Each attribute creates a file. Symlinks connect related objects: /sys/bus/platform/devices/my_device -> /sys/devices/platform/my_device, /sys/devices/platform/my_device/driver -> /sys/bus/platform/drivers/my_driver. This unified view gives userspace (udev, lspci, sysfs tools) access to the kernel device model.',
    highlights: ['kobject-tree'],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// SVG Rendering
// ---------------------------------------------------------------------------
const NS = 'http://www.w3.org/2000/svg';

const PHASE_COLORS: Record<string, string> = {
  init: '#8b949e',
  register: '#58a6ff',
  kobject: '#3fb950',
  'bus-add': '#d29922',
  probe: '#f0883e',
  bind: '#a371f7',
  'sysfs-create': '#3fb950',
  'sysfs-read': '#58a6ff',
  complete: '#3fb950',
};

const PHASE_LABELS = [
  { id: 'init', label: 'Init' },
  { id: 'register', label: 'Register' },
  { id: 'kobject', label: 'Kobject' },
  { id: 'bus-add', label: 'Bus Add' },
  { id: 'probe', label: 'Probe' },
  { id: 'bind', label: 'Bind' },
  { id: 'sysfs-create', label: 'Sysfs' },
  { id: 'sysfs-read', label: 'Read' },
  { id: 'complete', label: 'Done' },
];

function getActivePhaseIndex(phase: string): number {
  switch (phase) {
    case 'init': return 0;
    case 'register': return 1;
    case 'kobject': return 2;
    case 'bus-add': return 3;
    case 'probe': return 4;
    case 'bind': return 5;
    case 'sysfs-create': return 6;
    case 'sysfs-read': return 7;
    case 'complete': return 8;
    default: return -1;
  }
}

function renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void {
  while (container.firstChild) container.removeChild(container.firstChild);
  const data = frame.data as DeviceSysfsState;
  const margin = { top: 10, left: 15, right: 15, bottom: 10 };
  const usableWidth = width - margin.left - margin.right;

  // Title
  const title = document.createElementNS(NS, 'text');
  title.setAttribute('x', String(width / 2));
  title.setAttribute('y', '18');
  title.setAttribute('text-anchor', 'middle');
  title.setAttribute('class', 'anim-title');
  title.textContent = 'Unified Device Model & Sysfs';
  container.appendChild(title);

  // --- Phase indicator ---
  const phaseTop = margin.top + 28;
  const phaseCount = PHASE_LABELS.length;
  const phaseWidth = Math.min(75, (usableWidth - (phaseCount - 1) * 4) / phaseCount);
  const phaseHeight = 24;
  const activeIndex = getActivePhaseIndex(data.phase);

  PHASE_LABELS.forEach((phase, i) => {
    const px = margin.left + i * (phaseWidth + 4);
    const isActive = i === activeIndex;
    const isPast = activeIndex > 0 && i < activeIndex;

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(px));
    rect.setAttribute('y', String(phaseTop));
    rect.setAttribute('width', String(phaseWidth));
    rect.setAttribute('height', String(phaseHeight));
    rect.setAttribute('rx', '4');
    let blockClass = 'anim-block anim-phase';
    if (isActive) {
      blockClass += ' anim-block-allocated anim-highlight';
      rect.setAttribute('fill', PHASE_COLORS[phase.id] || '#58a6ff');
    } else if (isPast) {
      blockClass += ' anim-block-allocated';
      rect.setAttribute('fill', '#21262d');
    } else {
      blockClass += ' anim-block-free';
      rect.setAttribute('fill', '#161b22');
    }
    rect.setAttribute('class', blockClass);
    container.appendChild(rect);

    const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', String(px + phaseWidth / 2));
    label.setAttribute('y', String(phaseTop + phaseHeight / 2 + 4));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('font-size', '9');
    label.setAttribute('class', 'anim-cpu-label anim-phase');
    label.textContent = phase.label;
    container.appendChild(label);

    // Arrow between phases
    if (i < phaseCount - 1) {
      const arrowX = px + phaseWidth;
      const arrowY = phaseTop + phaseHeight / 2;
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

  // --- Kobject tree ---
  const treeTop = phaseTop + phaseHeight + 20;
  const treeLabel = document.createElementNS(NS, 'text');
  treeLabel.setAttribute('x', String(margin.left));
  treeLabel.setAttribute('y', String(treeTop));
  treeLabel.setAttribute('class', 'anim-cpu-label');
  treeLabel.textContent = 'Kobject Hierarchy:';
  container.appendChild(treeLabel);

  const nodeHeight = 20;
  const nodeWidth = 220;

  data.kobjectTree.forEach((node, i) => {
    const ny = treeTop + 8 + i * (nodeHeight + 2);
    const indent = (node.split('/').length - 2) * 12;
    const nx = margin.left + indent;
    const isLast = i === data.kobjectTree.length - 1;

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(nx));
    rect.setAttribute('y', String(ny));
    rect.setAttribute('width', String(nodeWidth));
    rect.setAttribute('height', String(nodeHeight));
    rect.setAttribute('rx', '3');
    rect.setAttribute('fill', isLast && frame.highlights.includes('kobject-tree') ? '#1f6feb' : '#21262d');
    let nodeCls = 'anim-kobject';
    if (isLast && frame.highlights.includes('kobject-tree')) nodeCls += ' anim-highlight';
    rect.setAttribute('class', nodeCls);
    container.appendChild(rect);

    const text = document.createElementNS(NS, 'text');
    text.setAttribute('x', String(nx + 6));
    text.setAttribute('y', String(ny + nodeHeight / 2 + 4));
    text.setAttribute('fill', '#e6edf3');
    text.setAttribute('font-size', '10');
    text.setAttribute('class', 'anim-kobject');
    text.textContent = node;
    container.appendChild(text);
  });

  // --- Devices and Drivers columns ---
  const colTop = treeTop + 8 + data.kobjectTree.length * (nodeHeight + 2) + 10;
  const colWidth = usableWidth / 2 - 10;

  // Devices column
  const devLabel = document.createElementNS(NS, 'text');
  devLabel.setAttribute('x', String(margin.left));
  devLabel.setAttribute('y', String(colTop));
  devLabel.setAttribute('class', 'anim-cpu-label');
  devLabel.textContent = 'Devices:';
  container.appendChild(devLabel);

  data.devices.forEach((dev, i) => {
    const dy = colTop + 8 + i * (nodeHeight + 2);
    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(margin.left));
    rect.setAttribute('y', String(dy));
    rect.setAttribute('width', String(Math.min(colWidth, 180)));
    rect.setAttribute('height', String(nodeHeight));
    rect.setAttribute('rx', '3');
    rect.setAttribute('fill', '#1a3a1a');
    rect.setAttribute('class', 'anim-block anim-block-allocated');
    container.appendChild(rect);

    const text = document.createElementNS(NS, 'text');
    text.setAttribute('x', String(margin.left + 6));
    text.setAttribute('y', String(dy + nodeHeight / 2 + 4));
    text.setAttribute('fill', '#e6edf3');
    text.setAttribute('font-size', '10');
    text.setAttribute('class', 'anim-block');
    text.textContent = dev;
    container.appendChild(text);
  });

  // Drivers column
  const drvLeft = margin.left + colWidth + 20;
  const drvLabel = document.createElementNS(NS, 'text');
  drvLabel.setAttribute('x', String(drvLeft));
  drvLabel.setAttribute('y', String(colTop));
  drvLabel.setAttribute('class', 'anim-cpu-label');
  drvLabel.textContent = 'Drivers:';
  container.appendChild(drvLabel);

  data.drivers.forEach((drv, i) => {
    const dy = colTop + 8 + i * (nodeHeight + 2);
    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(drvLeft));
    rect.setAttribute('y', String(dy));
    rect.setAttribute('width', String(Math.min(colWidth, 180)));
    rect.setAttribute('height', String(nodeHeight));
    rect.setAttribute('rx', '3');
    rect.setAttribute('fill', '#1f4068');
    rect.setAttribute('class', 'anim-block anim-block-allocated');
    container.appendChild(rect);

    const text = document.createElementNS(NS, 'text');
    text.setAttribute('x', String(drvLeft + 6));
    text.setAttribute('y', String(dy + nodeHeight / 2 + 4));
    text.setAttribute('fill', '#e6edf3');
    text.setAttribute('font-size', '10');
    text.setAttribute('class', 'anim-block');
    text.textContent = drv;
    container.appendChild(text);
  });

  // --- Sysfs path display ---
  if (data.sysfsPath) {
    const pathTop = Math.min(height - 30, colTop + 8 + Math.max(data.devices.length, data.drivers.length) * (nodeHeight + 2) + 15);
    const pathText = document.createElementNS(NS, 'text');
    pathText.setAttribute('x', String(margin.left));
    pathText.setAttribute('y', String(pathTop));
    pathText.setAttribute('fill', '#58a6ff');
    pathText.setAttribute('font-size', '11');
    let pathCls = 'anim-cpu-label';
    if (data.sysfsPath.includes('/sys/')) pathCls += ' anim-highlight';
    pathText.setAttribute('class', pathCls);
    pathText.textContent = `sysfs: ${data.sysfsPath}`;
    container.appendChild(pathText);
  }
}

// ---------------------------------------------------------------------------
// Module export
// ---------------------------------------------------------------------------
const SCENARIOS: AnimationScenario[] = [
  { id: 'device-registration', label: 'Device Registration (device_add)' },
  { id: 'driver-binding', label: 'Driver Binding (really_probe)' },
  { id: 'sysfs-attribute-read', label: 'Sysfs Attribute Read (dev_attr_show)' },
];

const deviceSysfs: AnimationModule = {
  config: {
    id: 'device-sysfs',
    title: 'Unified Device Model & Sysfs',
    skillName: 'device-model-and-sysfs',
  },
  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario) {
      case 'driver-binding': return generateDriverBinding();
      case 'sysfs-attribute-read': return generateSysfsAttributeRead();
      case 'device-registration':
      default: return generateDeviceRegistration();
    }
  },
  renderFrame,
  getScenarios: () => SCENARIOS,
};

export default deviceSysfs;

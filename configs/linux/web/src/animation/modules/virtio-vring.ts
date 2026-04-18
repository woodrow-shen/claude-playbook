import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

export interface VirtioStep {
  id: string;
  name: string;
  function: string;
  srcRef: string;
  state: 'pending' | 'active' | 'completed';
}

export interface VirtioVringState {
  phase: string;
  completedSteps: string[];
  currentFunction: string;
  srcRef: string;
  steps: VirtioStep[];
}

function cloneSteps(steps: VirtioStep[]): VirtioStep[] {
  return steps.map(s => ({ ...s }));
}

function makeFrame(
  step: number,
  label: string,
  description: string,
  highlights: string[],
  steps: VirtioStep[],
  currentFunction: string,
  srcRef: string,
): AnimationFrame {
  const completedSteps = steps.filter(s => s.state === 'completed').map(s => s.id);
  const activeStep = steps.find(s => s.state === 'active');
  return {
    step,
    label,
    description,
    highlights,
    data: {
      phase: activeStep?.id ?? '',
      completedSteps,
      currentFunction,
      srcRef,
      steps: cloneSteps(steps),
    } satisfies VirtioVringState,
  };
}

function generateAddAndKickFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const steps: VirtioStep[] = [
    { id: 'add_sgs', name: 'virtqueue_add_sgs()', function: 'virtqueue_add_sgs', srcRef: 'drivers/virtio/virtio_ring.c:2819', state: 'pending' },
    { id: 'count_sg', name: 'Count scatterlists', function: 'virtqueue_add_sgs', srcRef: 'drivers/virtio/virtio_ring.c:2829', state: 'pending' },
    { id: 'virtqueue_add', name: 'virtqueue_add()', function: 'virtqueue_add', srcRef: 'drivers/virtio/virtio_ring.c:2783', state: 'pending' },
    { id: 'add_split', name: 'virtqueue_add_split()', function: 'virtqueue_add_split', srcRef: 'drivers/virtio/virtio_ring.c:599', state: 'pending' },
    { id: 'populate_desc', name: 'Populate descriptor table', function: 'virtqueue_add_split', srcRef: 'drivers/virtio/virtio_ring.c:633', state: 'pending' },
    { id: 'update_avail', name: 'Update available ring', function: 'virtqueue_add_split', srcRef: 'drivers/virtio/virtio_ring.c:599', state: 'pending' },
    { id: 'kick', name: 'virtqueue_kick()', function: 'virtqueue_kick', srcRef: 'drivers/virtio/virtio_ring.c:3056', state: 'pending' },
    { id: 'kick_prepare', name: 'virtqueue_kick_prepare()', function: 'virtqueue_kick_prepare', srcRef: 'drivers/virtio/virtio_ring.c:3012', state: 'pending' },
    { id: 'notify', name: 'virtqueue_notify()', function: 'virtqueue_notify', srcRef: 'drivers/virtio/virtio_ring.c:3028', state: 'pending' },
  ];

  // Frame 0: Entry - virtqueue_add_sgs
  steps[0].state = 'active';
  frames.push(makeFrame(
    0,
    'Entry: virtqueue_add_sgs()',
    'A virtio driver submits I/O buffers by calling virtqueue_add_sgs() at drivers/virtio/virtio_ring.c:2819. This is the primary interface for exposing scatter-gather lists to the host. It accepts an array of terminated scatterlists with out_sgs readable by the host and in_sgs writable by the host. The function counts total scatter-gather entries before delegating to the internal virtqueue_add().',
    ['add_sgs'],
    steps,
    'virtqueue_add_sgs',
    'drivers/virtio/virtio_ring.c:2819 virtqueue_add_sgs()',
  ));

  // Frame 1: Count scatter-gather entries
  steps[0].state = 'completed';
  steps[1].state = 'active';
  frames.push(makeFrame(
    1,
    'Count scatter-gather entries',
    'virtqueue_add_sgs() iterates over the scatterlist array at drivers/virtio/virtio_ring.c:2829-2833 to count total_sg entries. The loop walks each scatterlist chain with sg_next(sg), counting all segments across both output and input scatter-gather lists. This total is passed to virtqueue_add() to determine how many vring descriptors are needed.',
    ['count_sg'],
    steps,
    'virtqueue_add_sgs',
    'drivers/virtio/virtio_ring.c:2829 sg count loop',
  ));

  // Frame 2: virtqueue_add dispatch
  steps[1].state = 'completed';
  steps[2].state = 'active';
  frames.push(makeFrame(
    2,
    'Dispatch: virtqueue_add()',
    'virtqueue_add() at drivers/virtio/virtio_ring.c:2783 is an inline dispatch function. It calls VIRTQUEUE_CALL(vq, add, ...) at line 2796, which dispatches to the correct implementation based on whether the vring uses split or packed layout. For split vrings (the classic format), this calls virtqueue_add_split(). For packed vrings (VIRTIO_F_RING_PACKED), it calls virtqueue_add_packed().',
    ['virtqueue_add'],
    steps,
    'virtqueue_add',
    'drivers/virtio/virtio_ring.c:2783 virtqueue_add()',
  ));

  // Frame 3: virtqueue_add_split entry
  steps[2].state = 'completed';
  steps[3].state = 'active';
  frames.push(makeFrame(
    3,
    'Split vring: virtqueue_add_split()',
    'virtqueue_add_split() at drivers/virtio/virtio_ring.c:599 implements buffer addition for the split vring layout. It first acquires the free descriptor head at line 633 via vq->free_head. It checks if indirect descriptors should be used via virtqueue_use_indirect() at line 635 -- indirect descriptors allow a single vring entry to point to a separate descriptor table, conserving main ring space for large I/O requests.',
    ['add_split'],
    steps,
    'virtqueue_add_split',
    'drivers/virtio/virtio_ring.c:599 virtqueue_add_split()',
  ));

  // Frame 4: Populate descriptor table
  steps[3].state = 'completed';
  steps[4].state = 'active';
  frames.push(makeFrame(
    4,
    'Populate descriptor table entries',
    'virtqueue_add_split() populates the split vring descriptor table starting from the free head at drivers/virtio/virtio_ring.c:633. Each descriptor entry contains: addr (physical address of the buffer), len (buffer length), flags (VRING_DESC_F_NEXT to chain descriptors, VRING_DESC_F_WRITE for host-writable buffers), and next (index of next descriptor in the chain). Output buffers come first, followed by input buffers.',
    ['populate_desc'],
    steps,
    'virtqueue_add_split',
    'drivers/virtio/virtio_ring.c:633 descriptor population',
  ));

  // Frame 5: Update available ring
  steps[4].state = 'completed';
  steps[5].state = 'active';
  frames.push(makeFrame(
    5,
    'Update available ring',
    'After populating descriptors, virtqueue_add_split() updates the available ring in drivers/virtio/virtio_ring.c. The available ring is a simple array where the driver publishes descriptor chain heads for the host to consume. The avail->ring[avail->idx % num] entry is set to the head descriptor index, then avail->idx is incremented with a memory barrier (virtio_wmb) to ensure the host sees the descriptors before the index update.',
    ['update_avail'],
    steps,
    'virtqueue_add_split',
    'drivers/virtio/virtio_ring.c:599 available ring update',
  ));

  // Frame 6: virtqueue_kick
  steps[5].state = 'completed';
  steps[6].state = 'active';
  frames.push(makeFrame(
    6,
    'Kick: virtqueue_kick()',
    'After adding buffers, the driver calls virtqueue_kick() at drivers/virtio/virtio_ring.c:3056 to notify the host. virtqueue_kick() is a convenience wrapper that calls virtqueue_kick_prepare(vq) at line 3058 to check if notification is needed, and if so, calls virtqueue_notify(vq) at line 3059. This two-phase design allows batching: multiple add operations can share a single kick.',
    ['kick'],
    steps,
    'virtqueue_kick',
    'drivers/virtio/virtio_ring.c:3056 virtqueue_kick()',
  ));

  // Frame 7: virtqueue_kick_prepare
  steps[6].state = 'completed';
  steps[7].state = 'active';
  frames.push(makeFrame(
    7,
    'Check notification: virtqueue_kick_prepare()',
    'virtqueue_kick_prepare() at drivers/virtio/virtio_ring.c:3012 dispatches to virtqueue_kick_prepare_split() at line 794. It computes old and new avail_idx values at lines 804-805 and checks if the host needs notification. With event indexing (vq->event), it uses vring_need_event() at line 812 to compare against the used_event value. Without events, it checks VRING_USED_F_NO_NOTIFY in the used ring flags at line 816. This suppression mechanism avoids redundant MMIO writes.',
    ['kick_prepare'],
    steps,
    'virtqueue_kick_prepare',
    'drivers/virtio/virtio_ring.c:3012 virtqueue_kick_prepare()',
  ));

  // Frame 8: virtqueue_notify
  steps[7].state = 'completed';
  steps[8].state = 'active';
  frames.push(makeFrame(
    8,
    'Notify host: virtqueue_notify()',
    'virtqueue_notify() at drivers/virtio/virtio_ring.c:3028 performs the actual host notification. It checks vq->broken at line 3032, then calls vq->notify(_vq) at line 3036 -- a callback set during vring creation that performs a PCI MMIO write to the device notification register. For PCI virtio devices, this writes to the queue-specific notify offset in the device BAR, triggering a VM exit (for KVM guests) so the host can process the virtqueue.',
    ['notify'],
    steps,
    'virtqueue_notify',
    'drivers/virtio/virtio_ring.c:3028 virtqueue_notify()',
  ));

  return frames;
}

function generateCompletionFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const steps: VirtioStep[] = [
    { id: 'host_process', name: 'Host processes request', function: 'host_processing', srcRef: 'drivers/virtio/virtio_ring.c:3229', state: 'pending' },
    { id: 'used_ring_update', name: 'Host updates used ring', function: 'host_used_ring', srcRef: 'drivers/virtio/virtio_ring.c:941', state: 'pending' },
    { id: 'vring_interrupt', name: 'vring_interrupt()', function: 'vring_interrupt', srcRef: 'drivers/virtio/virtio_ring.c:3229', state: 'pending' },
    { id: 'check_more_used', name: 'Check more_used()', function: 'more_used_split', srcRef: 'drivers/virtio/virtio_ring.c:904', state: 'pending' },
    { id: 'callback', name: 'Virtqueue callback', function: 'vring_interrupt', srcRef: 'drivers/virtio/virtio_ring.c:3253', state: 'pending' },
    { id: 'get_buf', name: 'virtqueue_get_buf()', function: 'virtqueue_get_buf', srcRef: 'drivers/virtio/virtio_ring.c:3090', state: 'pending' },
    { id: 'get_buf_split', name: 'virtqueue_get_buf_ctx_split()', function: 'virtqueue_get_buf_ctx_split', srcRef: 'drivers/virtio/virtio_ring.c:917', state: 'pending' },
    { id: 'detach_buf', name: 'detach_buf_split()', function: 'detach_buf_split', srcRef: 'drivers/virtio/virtio_ring.c:888', state: 'pending' },
    { id: 'advance_used', name: 'Advance last_used_idx', function: 'virtqueue_get_buf_ctx_split', srcRef: 'drivers/virtio/virtio_ring.c:959', state: 'pending' },
  ];

  // Frame 0: Host processes the request
  steps[0].state = 'active';
  frames.push(makeFrame(
    0,
    'Host processes I/O request',
    'The host (hypervisor or device backend) reads the available ring to find new descriptor chain heads published by the guest driver. It processes each request by reading output buffers (guest-to-host data) and writing results into input buffers (host-to-guest data). For block devices, this means reading a virtio_blk_req header, performing the I/O, and writing the status byte back. The host then updates the used ring in guest memory.',
    ['host_process'],
    steps,
    'host_processing',
    'drivers/virtio/virtio_ring.c:3229 (interrupt entry)',
  ));

  // Frame 1: Host updates used ring
  steps[0].state = 'completed';
  steps[1].state = 'active';
  frames.push(makeFrame(
    1,
    'Host updates used ring',
    'The host writes completed descriptor chain heads into the used ring. Each used ring entry at drivers/virtio/virtio_ring.c contains a vring_used_elem with id (the head descriptor index) and len (bytes written by the host). The host writes used->ring[used->idx % num], then increments used->idx with a memory barrier so the guest sees data before the index update. The used ring at line 941 is read by the guest to retrieve completed buffers.',
    ['used_ring_update'],
    steps,
    'host_used_ring',
    'drivers/virtio/virtio_ring.c:941 used ring read',
  ));

  // Frame 2: vring_interrupt fires
  steps[1].state = 'completed';
  steps[2].state = 'active';
  frames.push(makeFrame(
    2,
    'Interrupt: vring_interrupt()',
    'After updating the used ring, the host injects an interrupt into the guest. vring_interrupt() at drivers/virtio/virtio_ring.c:3229 is the IRQ handler. It receives the IRQ number and the virtqueue pointer (_vq). It first converts to the internal vring_virtqueue via to_vvq(_vq) at line 3231. If CONFIG_VIRTIO_HARDEN_NOTIFICATION is set, it validates the interrupt is not arriving before DRIVER_OK at line 3240.',
    ['vring_interrupt'],
    steps,
    'vring_interrupt',
    'drivers/virtio/virtio_ring.c:3229 vring_interrupt()',
  ));

  // Frame 3: Check if work is pending
  steps[2].state = 'completed';
  steps[3].state = 'active';
  frames.push(makeFrame(
    3,
    'Check for used buffers: more_used()',
    'vring_interrupt() calls more_used(vq) at drivers/virtio/virtio_ring.c:3233 which dispatches to more_used_split() at line 904. This function compares vq->last_used_idx against the current used->idx from the host. If they differ, there are completed buffers to process. If no work is pending, vring_interrupt() returns IRQ_NONE at line 3235 to allow shared IRQ handling.',
    ['check_more_used'],
    steps,
    'more_used_split',
    'drivers/virtio/virtio_ring.c:904 more_used_split()',
  ));

  // Frame 4: Invoke virtqueue callback
  steps[3].state = 'completed';
  steps[4].state = 'active';
  frames.push(makeFrame(
    4,
    'Invoke virtqueue callback',
    'When used buffers are present, vring_interrupt() invokes the driver-registered callback via vq->vq.callback(&vq->vq) at drivers/virtio/virtio_ring.c:3253. Before calling, if event indexing is active (vq->event), it sets event_triggered = true at line 3250 as a performance hint. The callback was registered during vring_create_virtqueue() and typically schedules a tasklet or workqueue to process completions outside IRQ context.',
    ['callback'],
    steps,
    'vring_interrupt',
    'drivers/virtio/virtio_ring.c:3253 vq->vq.callback()',
  ));

  // Frame 5: virtqueue_get_buf
  steps[4].state = 'completed';
  steps[5].state = 'active';
  frames.push(makeFrame(
    5,
    'Retrieve buffer: virtqueue_get_buf()',
    'The driver callback calls virtqueue_get_buf() at drivers/virtio/virtio_ring.c:3090 to retrieve completed buffers. This is a convenience wrapper around virtqueue_get_buf_ctx() at line 3081, which uses VIRTQUEUE_CALL(vq, get, ...) at line 3086 to dispatch to the correct split or packed implementation. It returns the data token originally passed to virtqueue_add_sgs() and sets *len to the number of bytes written by the host.',
    ['get_buf'],
    steps,
    'virtqueue_get_buf',
    'drivers/virtio/virtio_ring.c:3090 virtqueue_get_buf()',
  ));

  // Frame 6: virtqueue_get_buf_ctx_split
  steps[5].state = 'completed';
  steps[6].state = 'active';
  frames.push(makeFrame(
    6,
    'Split path: virtqueue_get_buf_ctx_split()',
    'virtqueue_get_buf_ctx_split() at drivers/virtio/virtio_ring.c:917 reads the used ring. At line 941, it computes last_used = vq->last_used_idx & (num - 1), then reads the descriptor id from used->ring[last_used].id at line 942 and the length from used->ring[last_used].len at line 944. A virtio_rmb() barrier at line 939 ensures descriptor data is visible before reading. It validates the id is in range at line 947 and has valid data at line 951.',
    ['get_buf_split'],
    steps,
    'virtqueue_get_buf_ctx_split',
    'drivers/virtio/virtio_ring.c:917 virtqueue_get_buf_ctx_split()',
  ));

  // Frame 7: detach_buf_split
  steps[6].state = 'completed';
  steps[7].state = 'active';
  frames.push(makeFrame(
    7,
    'Detach buffer: detach_buf_split()',
    'detach_buf_split() at drivers/virtio/virtio_ring.c:888 frees the descriptor chain back to the free list. It delegates to detach_buf_split_in_order() at line 854, which clears desc_state[head].data at line 863, then walks the chain via VRING_DESC_F_NEXT flags at line 870, calling vring_unmap_one_split() to unmap DMA for each descriptor at line 871 and incrementing num_free. Finally, detach_buf_split() relinks the chain tail to the free_head at line 893.',
    ['detach_buf'],
    steps,
    'detach_buf_split',
    'drivers/virtio/virtio_ring.c:888 detach_buf_split()',
  ));

  // Frame 8: Advance last_used_idx
  steps[7].state = 'completed';
  steps[8].state = 'active';
  frames.push(makeFrame(
    8,
    'Advance used index',
    'Back in virtqueue_get_buf_ctx_split() at drivers/virtio/virtio_ring.c:959, vq->last_used_idx is incremented to advance past the consumed entry. If interrupt suppression is not active (VRING_AVAIL_F_NO_INTERRUPT not set), the driver writes the new last_used_idx into vring_used_event() at line 965 to tell the host when to inject the next interrupt. This event index mechanism reduces interrupt overhead by allowing the host to batch completions.',
    ['advance_used'],
    steps,
    'virtqueue_get_buf_ctx_split',
    'drivers/virtio/virtio_ring.c:959 last_used_idx++',
  ));

  return frames;
}

function generateDeviceNegotiationFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const steps: VirtioStep[] = [
    { id: 'register', name: 'register_virtio_device()', function: 'register_virtio_device', srcRef: 'drivers/virtio/virtio.c:517', state: 'pending' },
    { id: 'reset_ack', name: 'Reset & ACKNOWLEDGE', function: 'register_virtio_device', srcRef: 'drivers/virtio/virtio.c:548', state: 'pending' },
    { id: 'dev_probe', name: 'virtio_dev_probe()', function: 'virtio_dev_probe', srcRef: 'drivers/virtio/virtio.c:270', state: 'pending' },
    { id: 'driver_status', name: 'Set DRIVER status', function: 'virtio_dev_probe', srcRef: 'drivers/virtio/virtio.c:280', state: 'pending' },
    { id: 'feature_neg', name: 'Feature negotiation', function: 'virtio_dev_probe', srcRef: 'drivers/virtio/virtio.c:283', state: 'pending' },
    { id: 'features_ok', name: 'FEATURES_OK status', function: 'virtio_features_ok', srcRef: 'drivers/virtio/virtio.c:204', state: 'pending' },
    { id: 'find_vqs', name: 'vp_find_vqs()', function: 'vp_find_vqs', srcRef: 'drivers/virtio/virtio_pci_common.c:515', state: 'pending' },
    { id: 'setup_vq', name: 'vp_setup_vq()', function: 'vp_setup_vq', srcRef: 'drivers/virtio/virtio_pci_common.c:203', state: 'pending' },
    { id: 'create_vq', name: 'vring_create_virtqueue()', function: 'vring_create_virtqueue', srcRef: 'drivers/virtio/virtio_ring.c:3260', state: 'pending' },
    { id: 'driver_ok', name: 'DRIVER_OK status', function: 'virtio_dev_probe', srcRef: 'drivers/virtio/virtio.c:352', state: 'pending' },
  ];

  // Frame 0: register_virtio_device
  steps[0].state = 'active';
  frames.push(makeFrame(
    0,
    'Register: register_virtio_device()',
    'The virtio bus transport (e.g., virtio-pci) discovers a device and calls register_virtio_device() at drivers/virtio/virtio.c:517. It sets dev->dev.bus = &virtio_bus at line 521, assigns a unique index via ida_alloc() at line 525 (producing names like "virtio0", "virtio1"), and initializes the VQ list with INIT_LIST_HEAD(&dev->vqs) at line 543.',
    ['register'],
    steps,
    'register_virtio_device',
    'drivers/virtio/virtio.c:517 register_virtio_device()',
  ));

  // Frame 1: Reset and ACKNOWLEDGE
  steps[0].state = 'completed';
  steps[1].state = 'active';
  frames.push(makeFrame(
    1,
    'Reset device and set ACKNOWLEDGE',
    'register_virtio_device() resets the device via virtio_reset_device(dev) at drivers/virtio/virtio.c:548 to clear any state from a previous driver. Then it sets the ACKNOWLEDGE status bit via virtio_add_status(dev, VIRTIO_CONFIG_S_ACKNOWLEDGE) at line 551. This tells the device that the guest OS has found it and recognized it as a virtio device. The device status is now: ACKNOWLEDGE.',
    ['reset_ack'],
    steps,
    'register_virtio_device',
    'drivers/virtio/virtio.c:548 virtio_reset_device() + line 551 ACKNOWLEDGE',
  ));

  // Frame 2: device_add triggers probe
  steps[1].state = 'completed';
  steps[2].state = 'active';
  frames.push(makeFrame(
    2,
    'Bus probe: virtio_dev_probe()',
    'device_add() at drivers/virtio/virtio.c:559 triggers the bus infrastructure to match the device against registered virtio drivers. When a match is found (via virtio_dev_match()), the bus calls virtio_dev_probe() at line 270. The probe function orchestrates the complete feature negotiation and driver initialization sequence.',
    ['dev_probe'],
    steps,
    'virtio_dev_probe',
    'drivers/virtio/virtio.c:270 virtio_dev_probe()',
  ));

  // Frame 3: Set DRIVER status
  steps[2].state = 'completed';
  steps[3].state = 'active';
  frames.push(makeFrame(
    3,
    'Set DRIVER status',
    'virtio_dev_probe() calls virtio_add_status(dev, VIRTIO_CONFIG_S_DRIVER) at drivers/virtio/virtio.c:280 to signal that a driver has been found for this device. The device status is now: ACKNOWLEDGE | DRIVER. This is the second step of the virtio initialization state machine defined in the virtio specification.',
    ['driver_status'],
    steps,
    'virtio_dev_probe',
    'drivers/virtio/virtio.c:280 VIRTIO_CONFIG_S_DRIVER',
  ));

  // Frame 4: Feature negotiation
  steps[3].state = 'completed';
  steps[4].state = 'active';
  frames.push(makeFrame(
    4,
    'Feature negotiation',
    'virtio_dev_probe() reads device-offered features via virtio_get_features() at drivers/virtio/virtio.c:283, then intersects them with driver-supported features from drv->feature_table at lines 287-291. The result in dev->features_array is the agreed feature set. virtio_check_driver_offered_feature() at line 106 validates that the driver actually offered any feature it tries to use, BUG()ing otherwise at line 122. Transport features (VIRTIO_TRANSPORT_F_START..END) are always preserved at lines 319-321.',
    ['feature_neg'],
    steps,
    'virtio_dev_probe',
    'drivers/virtio/virtio.c:283 feature negotiation',
  ));

  // Frame 5: FEATURES_OK
  steps[4].state = 'completed';
  steps[5].state = 'active';
  frames.push(makeFrame(
    5,
    'Confirm features: FEATURES_OK',
    'virtio_features_ok() at drivers/virtio/virtio.c:204 sets the FEATURES_OK status bit via virtio_add_status() at line 227. It then reads back the status at line 228 and verifies the device accepted the features at line 229. If FEATURES_OK is not reflected, the device rejected the negotiated feature set and probe fails. The device status is now: ACKNOWLEDGE | DRIVER | FEATURES_OK. For legacy devices without VIRTIO_F_VERSION_1, this step is skipped.',
    ['features_ok'],
    steps,
    'virtio_features_ok',
    'drivers/virtio/virtio.c:204 virtio_features_ok()',
  ));

  // Frame 6: Find and setup virtqueues
  steps[5].state = 'completed';
  steps[6].state = 'active';
  frames.push(makeFrame(
    6,
    'Find virtqueues: vp_find_vqs()',
    'The device driver calls find_vqs() which routes to vp_find_vqs() at drivers/virtio/virtio_pci_common.c:515 for PCI transport. It tries progressively simpler interrupt strategies: first MSI-X with one vector per queue (line 522), then shared slow-path vectors (line 529), then fully shared MSI-X (line 534), and finally legacy INTx interrupts (line 542). Each attempt allocates interrupt vectors and calls vp_setup_vq() for each virtqueue.',
    ['find_vqs'],
    steps,
    'vp_find_vqs',
    'drivers/virtio/virtio_pci_common.c:515 vp_find_vqs()',
  ));

  // Frame 7: Setup individual virtqueue
  steps[6].state = 'completed';
  steps[7].state = 'active';
  frames.push(makeFrame(
    7,
    'Setup virtqueue: vp_setup_vq()',
    'vp_setup_vq() at drivers/virtio/virtio_pci_common.c:203 allocates a virtio_pci_vq_info structure at line 211, then calls vp_dev->setup_vq() at line 219 -- the PCI-specific setup that configures the queue address in the device BAR. The info structure is linked into vp_dev->virtqueues at line 228. Each virtqueue gets its own callback and MSI-X vector for interrupt delivery.',
    ['setup_vq'],
    steps,
    'vp_setup_vq',
    'drivers/virtio/virtio_pci_common.c:203 vp_setup_vq()',
  ));

  // Frame 8: Create the vring
  steps[7].state = 'completed';
  steps[8].state = 'active';
  frames.push(makeFrame(
    8,
    'Create vring: vring_create_virtqueue()',
    'vring_create_virtqueue() at drivers/virtio/virtio_ring.c:3260 allocates the actual vring memory. It checks VIRTIO_F_RING_PACKED at line 3274: if set, it creates a packed vring via vring_create_virtqueue_packed() at line 3275; otherwise, it creates a split vring via vring_create_virtqueue_split() at line 3279. The split path calls vring_alloc_queue_split() at line 1374 for DMA-coherent allocation and __vring_new_virtqueue_split() at line 1379 to initialize the vring_virtqueue structure.',
    ['create_vq'],
    steps,
    'vring_create_virtqueue',
    'drivers/virtio/virtio_ring.c:3260 vring_create_virtqueue()',
  ));

  // Frame 9: DRIVER_OK
  steps[8].state = 'completed';
  steps[9].state = 'active';
  frames.push(makeFrame(
    9,
    'Device live: DRIVER_OK',
    'After the driver probe() callback succeeds at drivers/virtio/virtio.c:347, virtio_dev_probe() checks if the driver already set DRIVER_OK at line 352. If not, it calls virtio_device_ready(dev) at line 353 to set the DRIVER_OK status bit. The device status is now: ACKNOWLEDGE | DRIVER | FEATURES_OK | DRIVER_OK. The device is now fully operational -- the host can start processing virtqueue requests, and the driver can submit I/O via virtqueue_add_sgs() and virtqueue_kick().',
    ['driver_ok'],
    steps,
    'virtio_dev_probe',
    'drivers/virtio/virtio.c:352 DRIVER_OK',
  ));

  return frames;
}

const SCENARIOS: AnimationScenario[] = [
  { id: 'virtqueue-add-and-kick', label: 'Virtqueue Add Buffer and Kick' },
  { id: 'virtqueue-completion', label: 'Virtqueue Completion Path' },
  { id: 'device-negotiation', label: 'Virtio Device Negotiation and Setup' },
];

const NS = 'http://www.w3.org/2000/svg';

function renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void {
  while (container.firstChild) container.removeChild(container.firstChild);

  const data = frame.data as VirtioVringState;
  const { steps } = data;
  const margin = { top: 24, right: 16, bottom: 16, left: 16 };
  const usableWidth = width - margin.left - margin.right;
  const usableHeight = height - margin.top - margin.bottom;

  // Title
  const titleEl = document.createElementNS(NS, 'text');
  titleEl.setAttribute('x', String(width / 2));
  titleEl.setAttribute('y', '16');
  titleEl.setAttribute('text-anchor', 'middle');
  titleEl.setAttribute('class', 'anim-title');
  titleEl.textContent = 'Virtio Vring Transport';
  container.appendChild(titleEl);

  // Draw steps as a vertical timeline
  const stepCount = steps.length;
  const rowHeight = Math.min(28, usableHeight / stepCount);
  const boxWidth = Math.min(usableWidth * 0.6, 260);
  const boxX = margin.left + (usableWidth - boxWidth) / 2;

  for (let i = 0; i < stepCount; i++) {
    const s = steps[i];
    const y = margin.top + i * rowHeight;

    // Connector line to next step
    if (i < stepCount - 1) {
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', String(boxX + boxWidth / 2));
      line.setAttribute('y1', String(y + rowHeight * 0.6));
      line.setAttribute('x2', String(boxX + boxWidth / 2));
      line.setAttribute('y2', String(y + rowHeight));
      line.setAttribute('class', 'anim-connector');
      line.setAttribute('stroke', '#666');
      line.setAttribute('stroke-width', '1');
      container.appendChild(line);
    }

    // Step box
    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(boxX));
    rect.setAttribute('y', String(y));
    rect.setAttribute('width', String(boxWidth));
    rect.setAttribute('height', String(rowHeight * 0.6));
    rect.setAttribute('rx', '4');

    let cls = `anim-phase anim-phase-${s.state}`;
    if (frame.highlights.includes(s.id)) cls += ' anim-highlight';
    rect.setAttribute('class', cls);
    container.appendChild(rect);

    // Step label
    const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', String(boxX + boxWidth / 2));
    label.setAttribute('y', String(y + rowHeight * 0.38));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('class', 'anim-function');
    label.textContent = s.name;
    container.appendChild(label);

    // Source reference on the right
    const srcLabel = document.createElementNS(NS, 'text');
    srcLabel.setAttribute('x', String(boxX + boxWidth + 8));
    srcLabel.setAttribute('y', String(y + rowHeight * 0.38));
    srcLabel.setAttribute('class', 'anim-srcref');
    srcLabel.textContent = s.srcRef;
    container.appendChild(srcLabel);
  }

  // Current function indicator
  const fnLabel = document.createElementNS(NS, 'text');
  fnLabel.setAttribute('x', String(margin.left));
  fnLabel.setAttribute('y', String(margin.top + stepCount * rowHeight + 12));
  fnLabel.setAttribute('class', 'anim-function');
  fnLabel.textContent = `Current: ${data.currentFunction}()`;
  container.appendChild(fnLabel);
}

const virtioVring: AnimationModule = {
  config: {
    id: 'virtio-vring',
    title: 'Virtio Vring Transport',
    skillName: 'virtio-framework',
  },

  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario) {
      case 'virtqueue-completion':
        return generateCompletionFrames();
      case 'device-negotiation':
        return generateDeviceNegotiationFrames();
      case 'virtqueue-add-and-kick':
      default:
        return generateAddAndKickFrames();
    }
  },

  renderFrame,
  getScenarios: () => SCENARIOS,
};

export default virtioVring;

---
name: virtio-framework
description: Understand virtio transport, virtqueues, vring descriptors, and device negotiation
realm: virtualization
category: virtio
difficulty: intermediate
xp: 200
estimated_minutes: 90
prerequisites:
  - kvm-fundamentals
  - device-model-and-sysfs
unlocks: []
kernel_files:
  - drivers/virtio/virtio.c
  - drivers/virtio/virtio_ring.c
  - include/linux/virtio.h
  - include/uapi/linux/virtio_ring.h
doc_files:
  - Documentation/driver-api/virtio/virtio.rst
badge: Virtio Virtuoso
tags:
  - virtio
  - virtqueue
  - vring
  - paravirt
---

# Virtio Framework

## Quest Briefing

Full hardware emulation is slow -- every I/O operation from a guest
triggers a VM exit, crosses into the hypervisor, emulates the hardware
behavior, and returns. Virtio eliminates this overhead through
paravirtualization: the guest knows it is virtualized and cooperates
with the hypervisor using a simple, efficient protocol based on shared
memory ring buffers called virtqueues.

Virtio is the standard paravirtual I/O framework for Linux. It defines a
common transport layer (virtqueues) and a device negotiation protocol
(feature bits, status flags). Specific device types (network, block,
console, GPU, etc.) build on this transport. The guest side is in
drivers/virtio/, and the host side is typically in QEMU or vhost.

The efficiency comes from batching: the guest can submit multiple I/O
requests to the virtqueue without any VM exits, then notify the host
with a single doorbell write. The host processes the batch and signals
completion through an interrupt.


## Learning Objectives

- Explain the virtio device model: device, driver, transport, virtqueue.
- Trace virtio device probe and feature negotiation in virtio.c.
- Describe the split and packed virtqueue ring buffer formats.
- Follow a virtqueue operation: add buffer, kick, get buffer.
- Understand the vhost optimization for in-kernel virtio backends.


## Core Concepts

### Virtio Device Model

A virtio device is represented by struct virtio_device (include/linux/virtio.h).
It has a device ID (e.g., VIRTIO_ID_NET = 1), feature bits negotiated
between guest and host, and one or more virtqueues. The probe path:

1. The transport (PCI, MMIO, or platform) discovers the device.
2. virtio_dev_probe() in drivers/virtio/virtio.c matches the device ID
   to a registered virtio_driver.
3. Feature negotiation: the driver reads offered features, selects the
   ones it supports, and writes back the accepted set.
4. The driver's probe callback initializes device-specific state and
   creates virtqueues via virtio_find_vqs().

### Virtqueue Ring Buffer (Split Format)

The classic split virtqueue format (include/uapi/linux/virtio_ring.h)
consists of three areas in shared memory:

- **Descriptor table**: array of struct vring_desc, each pointing to
  a guest-physical buffer with address, length, flags (NEXT, WRITE).
  Descriptors chain together to form scatter-gather lists.
- **Available ring**: a ring of descriptor indices that the driver has
  made available to the device. The driver writes indices and advances
  avail->idx.
- **Used ring**: a ring of descriptor indices that the device has
  consumed. The device writes indices with length and advances used->idx.

### Virtqueue Operations

virtqueue_add_split() at drivers/virtio/virtio_ring.c:599 is the core
operation for submitting buffers:

1. Allocate descriptors from the free list.
2. Fill in scatter-gather entries (address, length, flags).
3. Chain descriptors with NEXT flag.
4. Write the head descriptor index to the available ring.
5. Advance avail->idx.

virtqueue_kick() notifies the host by writing to a doorbell register
(MMIO write or PCI config write), triggering a VM exit that alerts the
host to process the available ring.

virtqueue_get_buf() checks the used ring for completed descriptors.
If used->idx has advanced, it reads the descriptor index and length,
frees the descriptors back to the free list, and returns the completed
buffer to the caller.

### Interrupts and Notifications

When the host completes a request, it writes to the used ring and
optionally sends an interrupt to the guest. The guest's virtqueue
callback (registered during setup) processes completed buffers.

Notification suppression avoids excessive interrupts: the guest can
set VRING_AVAIL_F_NO_INTERRUPT to tell the host not to interrupt
after each completion (the guest will poll instead). Similarly, the
host can suppress kick notifications when it is already processing.

### Packed Virtqueue

The packed virtqueue format (newer, optional) uses a single descriptor
ring instead of separate available/used rings. Each descriptor has a
AVAIL and USED flag bit. The driver sets AVAIL when submitting, the
device sets USED when completing. This reduces cache pressure by keeping
all state in one contiguous memory region.


## Code Walkthrough

Trace a virtio-net packet transmit:

1. **Driver submits buffer** -- The virtio-net driver calls
   virtqueue_add_outbuf() with the sk_buff data. This calls
   virtqueue_add_split() at virtio_ring.c:599, which fills descriptors
   for the packet header and data, writes to the available ring.

2. **Kick** -- virtqueue_kick() writes to the doorbell MMIO register.
   On KVM, this causes a VM exit. The host (QEMU or vhost-net) is
   notified.

3. **Host processing** -- The host reads the available ring, finds
   the new descriptor chain, reads the guest memory buffers (via
   iovec mapping), and sends the packet out through the host network.

4. **Completion** -- The host writes the descriptor index to the used
   ring and sends an interrupt (virtio MSI-X or INTx). The guest's
   vring_interrupt() fires, calling the virtqueue callback.

5. **Driver reclaims** -- virtqueue_get_buf() reads the used ring
   entry, frees the descriptors, and the driver frees the sk_buff.


## Hands-On Challenges

### Challenge 1: Virtqueue Data Structures (50 XP)

Read include/uapi/linux/virtio_ring.h and drivers/virtio/virtio_ring.c:
1. Draw the memory layout of a split virtqueue (descriptor table,
   available ring, used ring).
2. Find virtqueue_add_split() and trace how descriptors are chained.
3. What is the free_head and how is the free list maintained?

Verification: Diagram the ring layout with field sizes and offsets.

### Challenge 2: Feature Negotiation (75 XP)

Read drivers/virtio/virtio.c and:
1. Trace virtio_dev_probe() through feature negotiation.
2. What happens if the driver does not accept a feature the host offers?
3. Find the VIRTIO_F_VERSION_1 feature and explain its significance.
4. How does the status register track device initialization stages?

Verification: List the negotiation steps with function names.

### Challenge 3: Vhost Bypass (75 XP)

The vhost framework (drivers/vhost/) moves virtio backend processing
into the kernel, avoiding QEMU context switches:
1. Read drivers/vhost/net.c and explain how it processes the virtqueue.
2. How does vhost-net get notified when the guest kicks?
3. What performance advantage does this provide over userspace QEMU?

Verification: Compare the vhost path vs QEMU path for packet TX.


## Verification Criteria

- [ ] Explain the virtio device model: device, driver, transport, features.
- [ ] Trace virtio_dev_probe() through feature negotiation in virtio.c.
- [ ] Describe the split virtqueue format: descriptor table, available ring,
      used ring.
- [ ] Follow virtqueue_add_split() at virtio_ring.c:599 through descriptor
      setup and available ring update.
- [ ] Explain kick and interrupt mechanisms for host-guest communication.
- [ ] Describe notification suppression and its performance benefits.
- [ ] Explain packed virtqueues vs split virtqueues.

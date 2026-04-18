---
name: pci-and-dma
description: Master PCI device enumeration, BAR mapping, and DMA memory management
realm: devices
category: pci
difficulty: advanced
xp: 300
estimated_minutes: 120
prerequisites:
  - device-model-and-sysfs
  - page-allocation
unlocks: []
kernel_files:
  - drivers/pci/probe.c
  - drivers/pci/pci.c
  - kernel/dma/mapping.c
  - include/linux/dma-mapping.h
doc_files:
  - Documentation/PCI/pci.rst
  - Documentation/core-api/dma-api.rst
badge: DMA Architect
tags:
  - pci
  - dma
  - bar
  - iommu
---

# PCI and DMA

PCI (Peripheral Component Interconnect) is the dominant bus for high-performance
devices: GPUs, network cards, NVMe drives, and more. Understanding PCI
enumeration -- how the kernel discovers devices, reads their configuration space,
and maps their memory regions -- is essential for driver development. Paired with
DMA (Direct Memory Access), PCI devices can transfer data directly to and from
system memory without CPU intervention, enabling the high throughput that modern
hardware demands.

This is an advanced skill because it spans multiple subsystems: the PCI core for
enumeration and resource management, the DMA mapping layer for address
translation, and the IOMMU for hardware-enforced isolation. Mastering these
concepts unlocks the ability to write drivers for any PCI device.

## Quest Briefing

PCI is the backbone of modern hardware connectivity. Every GPU, NVMe SSD, and
high-speed NIC sits on a PCI bus. The kernel must discover these devices at boot,
map their registers into kernel address space, and set up DMA so devices can
read and write system memory at full speed. This skill teaches you the
enumeration and DMA machinery that makes all of this possible.

## Learning Objectives

After completing this skill, you will be able to:

- Describe PCI enumeration from host bridge scanning to device discovery
- Explain Base Address Registers (BARs) and how the kernel sizes and maps them
- Use the DMA mapping API to allocate and map memory for device access
- Distinguish streaming vs. coherent DMA mappings and their use cases
- Understand IOMMU integration and its role in DMA address translation

## Core Concepts

### PCI Enumeration

PCI enumeration begins with the host bridge and recursively scans all buses.
The entry point is in drivers/pci/probe.c:

The global list pci_root_buses tracks all root buses in the system. For each
bus, pci_scan_slot() probes each device/function combination by reading the
PCI configuration space (vendor and device IDs).

Key functions in drivers/pci/probe.c:
- pci_alloc_host_bridge(): allocates and initializes a host bridge structure
  with pci_init_host_bridge() which sets up resource lists and default ops
- pci_scan_child_bus(): scans all slots on a bus
- pci_scan_slot(): probes one slot, detecting multi-function devices
- pci_scan_bridge(): follows bridges to enumerate subordinate buses
- __pci_read_base(): reads and sizes a single BAR register

The pcibus_class (line 100) provides the sysfs class for PCI buses, and
release_pcibus_dev() cleans up bus resources when the last reference drops.

### Base Address Registers (BARs)

BARs define the memory or I/O regions a PCI device exposes. The kernel must
determine the size and type of each BAR during enumeration.

The BAR sizing algorithm in __pci_read_base() (drivers/pci/probe.c line 218):
1. Save the original BAR value with pci_read_config_dword()
2. Write all 1s to the BAR register
3. Read back the value; the device masks bits it does not decode
4. pci_size() (line 112) computes the region size from the mask
5. Restore the original BAR value

decode_bar() (line 134) determines the BAR type:
- IORESOURCE_IO: I/O port space
- IORESOURCE_MEM: memory-mapped space
- 64-bit: BAR spans two consecutive registers

pci_read_bridge_windows() (line 516) sizes bridge I/O, MMIO, and prefetchable
MMIO windows by reading PCI_IO_BASE, PCI_MEMORY_BASE, and PCI_PREF_MEMORY_BASE
registers to determine the address ranges forwarded to subordinate buses.

### PCI Power Management

PCI defines power states D0 through D3cold (drivers/pci/pci.c). The
pci_power_names array maps states to human-readable strings: "D0", "D1", "D2",
"D3hot", "D3cold". Key timing constants:
- PCI_RESET_WAIT (1000ms): time after Conventional Reset per PCIe r6.0 sec 6.6.1
- PCIE_RESET_READY_POLL_MS (60000ms): maximum polling for device readiness
- pci_dev_d3_sleep(): manages the D3hot transition delay with usleep_range

pci_reset_supported() checks dev->reset_methods[0] to determine if any reset
method is available for the device.

### DMA Mapping API

The DMA mapping layer (kernel/dma/mapping.c) provides architecture-independent
functions for managing device-accessible memory.

**Coherent (consistent) DMA mappings**:
- dma_alloc_attrs() (kernel/dma/mapping.c line 622): allocates memory
  simultaneously accessible by CPU and device with coherent caching
- Returns both a kernel virtual address and a dma_addr_t for the device
- dmam_alloc_attrs() (line 93): managed version using devres that auto-frees
  on driver detach via the dmam_release() callback
- dmam_free_coherent() (line 69): managed free with devres_destroy()

**Streaming DMA mappings**:
- dma_map_page_attrs() (line 187): maps an existing page for device access
- dma_unmap_page_attrs() (line 223): unmaps after transfer completes
- dma_map_sgtable() (line 324): maps a scatter-gather table
- Direction must be specified: DMA_TO_DEVICE, DMA_FROM_DEVICE, DMA_BIDIRECTIONAL

**Synchronization for non-coherent platforms**:
- __dma_sync_single_for_cpu() (line 375): sync before CPU reads DMA buffer
- __dma_sync_single_for_device() (line 392): sync before device reads buffer
- __dma_sync_sg_for_cpu() / __dma_sync_sg_for_device(): scatter-gather variants

The dma_go_direct() helper (line 120) determines whether DMA operations can
bypass the IOMMU and use direct physical addresses. dma_need_unmap() (line 466)
checks if explicit unmapping is required for the device.

## Code Walkthrough

### Tracing PCI Device Discovery

1. ACPI or device tree provides the host bridge description
2. pci_host_probe() calls pci_scan_root_bus_bridge()
3. For each slot, pci_scan_slot() reads config space at offset 0
4. If vendor ID != 0xFFFF, a device exists; pci_scan_single_device() allocates
   a pci_dev structure
5. pci_setup_device() reads the header type (endpoint, bridge, cardbus)
6. pci_read_bases() calls __pci_read_base() for each BAR
7. __pci_read_base() uses the write-all-ones-read-back trick to size the BAR
8. Resources are assigned from the bridge's forwarding window
9. The device appears in /sys/bus/pci/devices/ via device_add()
10. PCI driver matching triggers probe() on the bound driver

### Writing a Minimal PCI Driver

```c
static int my_probe(struct pci_dev *pdev, const struct pci_device_id *id)
{
    int err;
    void __iomem *bar0;
    dma_addr_t dma_handle;
    void *dma_buf;

    err = pcim_enable_device(pdev);
    err = pcim_iomap_regions(pdev, BIT(0), "mydrv");
    bar0 = pcim_iomap_table(pdev)[0];

    dma_buf = dmam_alloc_attrs(&pdev->dev, 4096, &dma_handle,
                               GFP_KERNEL, 0);
    /* dma_buf = CPU address; dma_handle = device-visible address */
    return 0;
}

static const struct pci_device_id my_ids[] = {
    { PCI_DEVICE(0x1234, 0x5678) },
    { }
};

static struct pci_driver my_driver = {
    .name     = "mydrv",
    .id_table = my_ids,
    .probe    = my_probe,
};
module_pci_driver(my_driver);
```

## Hands-On Challenges

### Challenge 1: PCI Topology Map (XP: 80)

Use lspci -tv to display the PCI tree on your system. For each bridge:
- Identify the bus number range it forwards
- Explain the primary, secondary, and subordinate bus numbers
- Find one endpoint device and trace its path through bridges to the root
Then read pci_scan_bridge() in drivers/pci/probe.c and explain how the kernel
assigns bus numbers during enumeration.

### Challenge 2: BAR Analysis (XP: 100)

Pick a PCI device and read its BARs from sysfs:
```
cat /sys/bus/pci/devices/0000:XX:YY.Z/resource
```
For each BAR, determine: start address, size, memory vs. I/O, 32-bit vs. 64-bit,
prefetchable vs. non-prefetchable. Then trace __pci_read_base() and explain
how the kernel computed each size by writing all-ones and reading back the mask.

### Challenge 3: DMA Buffer Lifecycle (XP: 120)

Write a kernel module that:
- Allocates a 4KB coherent DMA buffer with dma_alloc_coherent()
- Logs the kernel virtual address and dma_addr_t
- Compares the dma_addr_t with the physical address (virt_to_phys)
- If they differ, explain why (IOMMU remapping)
- Frees the buffer on module unload with dma_free_coherent()
Explain the difference between coherent and streaming DMA mappings.

## Verification Criteria

You have mastered this skill when you can:

- [ ] Describe the PCI enumeration process from host bridge to endpoint
- [ ] Explain how BARs are sized using the write-all-ones technique
- [ ] Use dma_alloc_coherent() and dma_map_single() correctly in a driver
- [ ] Distinguish coherent and streaming DMA and choose the right one
- [ ] Explain the role of the IOMMU in DMA address translation
- [ ] Read a device's resources from sysfs and interpret BAR types and sizes
- [ ] Write a PCI driver skeleton with managed resource allocation

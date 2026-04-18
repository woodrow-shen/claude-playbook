import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

export interface PciDevice {
  bdf: string; // bus:device.function
  vendor: number;
  device: number;
  class: string;
  headerType: number;
}

export interface BarMapping {
  bar: number;
  type: 'mem32' | 'mem64' | 'io';
  base: string;
  size: string;
  prefetchable: boolean;
}

export interface DmaRegion {
  physAddr: string;
  dmaAddr: string;
  size: string;
  direction: 'to-device' | 'from-device' | 'bidirectional';
  type: 'streaming' | 'coherent';
  bounced: boolean;
}

export interface IommuState {
  enabled: boolean;
  domain: string;
  mappedPages: number;
}

export interface BusHierarchy {
  busNr: number;
  parentBus: number | null;
  bridge: string | null;
  devices: string[];
}

export interface PciDmaState {
  phase: 'scan' | 'detect' | 'bar-read' | 'setup' | 'register' |
         'map' | 'dma-direct' | 'swiotlb' | 'unmap' |
         'alloc' | 'alloc-direct' | 'alloc-iommu' | 'alloc-complete';
  currentFunction: string;
  pciDevices: PciDevice[];
  barMappings: BarMapping[];
  dmaRegions: DmaRegion[];
  iommuState: IommuState;
  busHierarchy: BusHierarchy[];
  srcRef: string;
}

function cloneState(s: PciDmaState): PciDmaState {
  return {
    phase: s.phase,
    currentFunction: s.currentFunction,
    pciDevices: s.pciDevices.map(d => ({ ...d })),
    barMappings: s.barMappings.map(b => ({ ...b })),
    dmaRegions: s.dmaRegions.map(r => ({ ...r })),
    iommuState: { ...s.iommuState },
    busHierarchy: s.busHierarchy.map(b => ({ ...b, devices: [...b.devices] })),
    srcRef: s.srcRef,
  };
}

// ---------------------------------------------------------------------------
// Scenario: pci-enumeration
// PCI bus enumeration, device detection, BAR mapping
// ---------------------------------------------------------------------------
function generatePciEnumeration(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: PciDmaState = {
    phase: 'scan',
    currentFunction: 'pci_scan_slot()',
    pciDevices: [],
    barMappings: [],
    dmaRegions: [],
    iommuState: { enabled: false, domain: '', mappedPages: 0 },
    busHierarchy: [{ busNr: 0, parentBus: null, bridge: 'Host Bridge', devices: [] }],
    srcRef: '',
  };

  // Frame 0: pci_scan_slot begins scanning
  state.srcRef = 'drivers/pci/probe.c:2871 (pci_scan_slot)';
  frames.push({
    step: 0,
    label: 'pci_scan_slot() begins bus scan',
    description: 'pci_scan_slot() at drivers/pci/probe.c:2871 scans a PCI slot on bus 0. It checks only_one_child(bus) at line 2876 for PCIe slots that support a single device. It enters a do-while loop at line 2879, calling pci_scan_single_device(bus, devfn + fn) at line 2880 for each function. For a multifunction device, next_fn() at line 2895 iterates functions 0-7.',
    highlights: ['phase-scan'],
    data: cloneState(state),
  });

  // Frame 1: pci_scan_single_device checks slot
  state.phase = 'detect';
  state.currentFunction = 'pci_scan_single_device()';
  state.srcRef = 'drivers/pci/probe.c:2783 (pci_scan_single_device)';
  frames.push({
    step: 1,
    label: 'pci_scan_single_device() probes device',
    description: 'pci_scan_single_device() at drivers/pci/probe.c:2783 first calls pci_get_slot(bus, devfn) at line 2787 to check if the device was already discovered. If not, it calls pci_scan_device(bus, devfn) at line 2793 which reads the vendor/device ID via pci_bus_read_dev_vendor_id() at line 2607. A return of 0xFFFFFFFF means no device present.',
    highlights: ['phase-detect'],
    data: cloneState(state),
  });

  // Frame 2: pci_scan_device reads vendor/device
  state.currentFunction = 'pci_scan_device()';
  state.pciDevices.push({
    bdf: '00:02.0',
    vendor: 0x8086,
    device: 0x1533,
    class: 'Network controller',
    headerType: 0,
  });
  state.busHierarchy[0].devices.push('00:02.0');
  state.srcRef = 'drivers/pci/probe.c:2602-2624 (pci_scan_device)';
  frames.push({
    step: 2,
    label: 'Device detected: vendor/device ID read',
    description: 'pci_scan_device() at drivers/pci/probe.c:2602 calls pci_bus_read_dev_vendor_id(bus, devfn, &l, 60*1000) at line 2607 with a 60-second timeout for CRS (Configuration Request Retry Status). The vendor ID 0x8086 (Intel) is in the low 16 bits, device ID 0x1533 in the high 16 bits. pci_alloc_dev(bus) at line 2610 allocates a struct pci_dev via kzalloc.',
    highlights: ['device-00:02.0'],
    data: cloneState(state),
  });

  // Frame 3: pci_setup_device fills in class/header
  state.phase = 'setup';
  state.currentFunction = 'pci_setup_device()';
  state.srcRef = 'drivers/pci/probe.c:2021-2092 (pci_setup_device)';
  frames.push({
    step: 3,
    label: 'pci_setup_device() reads header type and class',
    description: 'pci_setup_device() at drivers/pci/probe.c:2021 reads the header type via pci_hdr_type(dev) at line 2030. It extracts PCI_HEADER_TYPE_MASK (line 2035) and PCI_HEADER_TYPE_MFD (multifunction, line 2036). dev_set_name() at line 2060 formats the BDF as "0000:00:02.0". pci_class() at line 2064 reads the 24-bit class code. pci_fixup_device(pci_fixup_early, dev) at line 2089 applies quirks.',
    highlights: ['phase-setup'],
    data: cloneState(state),
  });

  // Frame 4: pci_setup_device switches on header type
  state.currentFunction = 'pci_setup_device() (header type 0)';
  state.srcRef = 'drivers/pci/probe.c:2103-2120 (header type 0: normal device)';
  frames.push({
    step: 4,
    label: 'Header type 0: read BARs and IRQ',
    description: 'pci_setup_device() switches on dev->hdr_type at line 2103. For PCI_HEADER_TYPE_NORMAL (type 0) at line 2105, it reads the interrupt pin at line 2109, reads the subsystem vendor/device IDs at lines 2113-2114, and then calls pci_read_bases(dev, PCI_STD_NUM_BARS, PCI_ROM_ADDRESS) at line 2117 to decode all 6 standard BARs and the ROM BAR.',
    highlights: ['phase-setup'],
    data: cloneState(state),
  });

  // Frame 5: pci_read_bases iterates BARs
  state.phase = 'bar-read';
  state.currentFunction = 'pci_read_bases()';
  state.srcRef = 'drivers/pci/probe.c:325-372 (pci_read_bases)';
  frames.push({
    step: 5,
    label: 'pci_read_bases() sizes all BARs',
    description: 'pci_read_bases() at drivers/pci/probe.c:325 disables decode (PCI_COMMAND_DECODE_ENABLE, line 344-346) to safely size BARs. __pci_size_stdbars() at line 350 writes 0xFFFFFFFF to each BAR register and reads back the mask to determine size. The loop at line 358-363 calls __pci_read_base() for each BAR. If rom is set, __pci_read_base() is called for PCI_ROM_RESOURCE at line 370.',
    highlights: ['phase-bar-read'],
    data: cloneState(state),
  });

  // Frame 6: __pci_read_base decodes a single BAR
  state.currentFunction = '__pci_read_base()';
  state.barMappings.push({
    bar: 0,
    type: 'mem64',
    base: '0xFE000000',
    size: '128KB',
    prefetchable: false,
  });
  state.srcRef = 'drivers/pci/probe.c:201-324 (__pci_read_base)';
  frames.push({
    step: 6,
    label: '__pci_read_base() decodes BAR 0',
    description: '__pci_read_base() at drivers/pci/probe.c:201 reads the BAR value with pci_read_config_dword(dev, pos, &l) at line 211. It checks for PCI_POSSIBLE_ERROR at lines 220 and 227. decode_bar() at line 231 determines if the BAR is I/O or memory, 32-bit or 64-bit. For a 64-bit memory BAR (IORESOURCE_MEM_64, line 250), it reads the upper 32 bits. pci_size() computes the actual region size from the mask.',
    highlights: ['bar-0'],
    data: cloneState(state),
  });

  // Frame 7: Second BAR decoded
  state.barMappings.push({
    bar: 2,
    type: 'mem32',
    base: '0xFE100000',
    size: '4KB',
    prefetchable: false,
  });
  state.srcRef = 'drivers/pci/probe.c:276-315 (__pci_read_base region calculation)';
  frames.push({
    step: 7,
    label: 'Additional BARs decoded and registered',
    description: '__pci_read_base() at line 276 converts the raw BAR address to a struct pci_bus_region, then pcibios_bus_to_resource() at line 308 converts bus addresses to CPU physical addresses. The resource is validated: if the region is invalid (inverted_region check at line 291), or a known firmware bug (line 298), the BAR is disabled. Valid BARs are stored in dev->resource[].',
    highlights: ['bar-2'],
    data: cloneState(state),
  });

  // Frame 8: pci_device_add registers the device
  state.phase = 'register';
  state.currentFunction = 'pci_device_add()';
  state.srcRef = 'drivers/pci/probe.c:2797 (pci_device_add in pci_scan_single_device)';
  frames.push({
    step: 8,
    label: 'pci_device_add() registers device on bus',
    description: 'Back in pci_scan_single_device() at drivers/pci/probe.c:2797, pci_device_add(dev, bus) is called. This adds the device to bus->devices list, registers it with the device model (device_add), and triggers uevent for userspace. The PCI core now knows about device 0000:00:02.0 with 2 valid BARs mapped into the physical address space.',
    highlights: ['device-00:02.0'],
    data: cloneState(state),
  });

  // Frame 9: Scan continues for more functions
  state.phase = 'scan';
  state.currentFunction = 'pci_scan_slot() (next function)';
  state.pciDevices.push({
    bdf: '00:1f.0',
    vendor: 0x8086,
    device: 0xA143,
    class: 'ISA bridge',
    headerType: 0,
  });
  state.busHierarchy[0].devices.push('00:1f.0');
  state.srcRef = 'drivers/pci/probe.c:2895-2903 (pci_scan_slot loop and ASPM init)';
  frames.push({
    step: 9,
    label: 'Slot scan completes, ASPM initialized',
    description: 'pci_scan_slot() continues the do-while loop at line 2879. next_fn() at line 2895 checks pci_ari_enabled(bus) for ARI (Alternative Routing-ID Interpretation) at line 2826, otherwise iterates functions 0-7 if dev->multifunction is set (line 2832). When the loop ends, pcie_aspm_init_link_state() at line 2900 configures PCIe Active State Power Management for the discovered devices.',
    highlights: ['phase-scan'],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario: dma-streaming-map
// Streaming DMA mapping for device I/O
// ---------------------------------------------------------------------------
function generateDmaStreamingMap(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: PciDmaState = {
    phase: 'map',
    currentFunction: 'dma_map_single()',
    pciDevices: [{ bdf: '00:02.0', vendor: 0x8086, device: 0x1533, class: 'Network controller', headerType: 0 }],
    barMappings: [{ bar: 0, type: 'mem64', base: '0xFE000000', size: '128KB', prefetchable: false }],
    dmaRegions: [],
    iommuState: { enabled: false, domain: '', mappedPages: 0 },
    busHierarchy: [{ busNr: 0, parentBus: null, bridge: 'Host Bridge', devices: ['00:02.0'] }],
    srcRef: '',
  };

  // Frame 0: Driver calls dma_map_single
  state.srcRef = 'include/linux/dma-mapping.h:603 (dma_map_single macro)';
  frames.push({
    step: 0,
    label: 'Driver calls dma_map_single()',
    description: 'A network driver calls dma_map_single(dev, buf, len, DMA_TO_DEVICE) to map a kernel buffer for device DMA. dma_map_single() at include/linux/dma-mapping.h:603 is a macro that expands to dma_map_single_attrs(d, a, s, r, 0) with no extra attributes. This is a streaming mapping: the buffer is mapped for a single DMA transfer and must be unmapped after the device completes I/O.',
    highlights: ['phase-map'],
    data: cloneState(state),
  });

  // Frame 1: dma_map_single_attrs inline
  state.currentFunction = 'dma_map_single_attrs()';
  state.srcRef = 'include/linux/dma-mapping.h:519-529 (dma_map_single_attrs)';
  frames.push({
    step: 1,
    label: 'dma_map_single_attrs() validates buffer',
    description: 'dma_map_single_attrs() at include/linux/dma-mapping.h:519 first checks is_vmalloc_addr(ptr) at line 523 -- DMA must never operate on vmalloc memory because it may not be physically contiguous. debug_dma_map_single() at line 526 records the mapping for DMA-debug checking. It then calls dma_map_page_attrs(dev, virt_to_page(ptr), offset_in_page(ptr), size, dir, attrs) at line 527.',
    highlights: ['phase-map'],
    data: cloneState(state),
  });

  // Frame 2: dma_map_page_attrs
  state.currentFunction = 'dma_map_page_attrs()';
  state.srcRef = 'kernel/dma/mapping.c:191-206 (dma_map_page_attrs)';
  frames.push({
    step: 2,
    label: 'dma_map_page_attrs() converts to physical',
    description: 'dma_map_page_attrs() at kernel/dma/mapping.c:191 converts the page+offset to a physical address via page_to_phys(page) + offset at line 195. It checks for DMA_ATTR_MMIO at line 197 and zone device pages at line 201. Then calls dma_map_phys(dev, phys, size, dir, attrs) at line 204, which is the core mapping function.',
    highlights: ['phase-map'],
    data: cloneState(state),
  });

  // Frame 3: dma_map_phys dispatches
  state.currentFunction = 'dma_map_phys()';
  state.srcRef = 'kernel/dma/mapping.c:155-189 (dma_map_phys)';
  frames.push({
    step: 3,
    label: 'dma_map_phys() selects mapping backend',
    description: 'dma_map_phys() at kernel/dma/mapping.c:155 gets the DMA ops via get_dma_ops(dev) at line 158. It checks dma_map_direct() at line 171: if true (no IOMMU), calls dma_direct_map_phys() at line 174. If use_dma_iommu(dev) at line 177, calls iommu_dma_map_phys(). Otherwise falls through to ops->map_phys at line 180. For most x86 systems without IOMMU, the direct path is taken.',
    highlights: ['phase-map'],
    data: cloneState(state),
  });

  // Frame 4: dma_direct_map_phys
  state.phase = 'dma-direct';
  state.currentFunction = 'dma_direct_map_phys()';
  state.srcRef = 'kernel/dma/direct.h:85-128 (dma_direct_map_phys)';
  frames.push({
    step: 4,
    label: 'dma_direct_map_phys() translates address',
    description: 'dma_direct_map_phys() at kernel/dma/direct.h:85 first checks is_swiotlb_force_bounce(dev) at line 91 -- if the device requires bounce buffering, it calls swiotlb_map() at line 96. Otherwise, phys_to_dma(dev, phys) at line 111 translates the physical address to a DMA address. dma_capable(dev, dma_addr, size, true) at line 112 verifies the address fits within dev->dma_mask.',
    highlights: ['phase-direct'],
    data: cloneState(state),
  });

  // Frame 5: swiotlb bounce buffer path
  state.phase = 'swiotlb';
  state.currentFunction = 'swiotlb_map()';
  state.dmaRegions.push({
    physAddr: '0x1A000000',
    dmaAddr: '0x1A000000',
    size: '4KB',
    direction: 'to-device',
    type: 'streaming',
    bounced: true,
  });
  state.srcRef = 'kernel/dma/swiotlb.c:1594-1622 (swiotlb_map)';
  frames.push({
    step: 5,
    label: 'swiotlb_map() allocates bounce buffer',
    description: 'When the device cannot DMA to the buffer address (outside dma_mask), swiotlb_map() at kernel/dma/swiotlb.c:1594 provides a bounce buffer. swiotlb_tbl_map_single() at line 1602 finds a free slot in the SWIOTLB pool (default 64MB). For DMA_TO_DEVICE, the original data is copied to the bounce buffer. phys_to_dma_unencrypted() at line 1607 returns the DMA-accessible address.',
    highlights: ['dma-region'],
    data: cloneState(state),
  });

  // Frame 6: Cache sync for non-coherent devices
  state.phase = 'dma-direct';
  state.currentFunction = 'arch_sync_dma_for_device()';
  state.srcRef = 'kernel/dma/direct.h:122-127 (cache sync in dma_direct_map_phys)';
  frames.push({
    step: 6,
    label: 'Cache sync for non-coherent DMA',
    description: 'For non-coherent devices (!dev_is_dma_coherent(dev), line 122 in kernel/dma/direct.h), arch_sync_dma_for_device() at line 124 flushes CPU caches for the mapped region. On x86, devices are typically cache-coherent, but on ARM this is critical: dirty cache lines must be written back so the device reads current data. arch_sync_dma_flush() at line 126 ensures the sync completes.',
    highlights: ['phase-direct'],
    data: cloneState(state),
  });

  // Frame 7: DMA address returned to driver
  state.phase = 'map';
  state.currentFunction = 'dma_map_single() returns';
  state.srcRef = 'kernel/dma/mapping.c:184-188 (trace and debug, return dma_addr)';
  frames.push({
    step: 7,
    label: 'DMA address returned to driver',
    description: 'dma_map_phys() at kernel/dma/mapping.c:184 calls trace_dma_map_phys() and debug_dma_map_phys() at line 185 to record the mapping for tracing and debug. The dma_addr_t is returned through the call chain to the driver. The driver programs this address into the device DMA descriptor ring. The driver MUST check dma_mapping_error() before using the address.',
    highlights: ['dma-region'],
    data: cloneState(state),
  });

  // Frame 8: Device performs DMA
  state.currentFunction = 'Device DMA transfer';
  state.srcRef = 'drivers/pci/pci.c:1 (device performs bus-mastering DMA)';
  frames.push({
    step: 8,
    label: 'Device performs bus-mastering DMA',
    description: 'The device reads the DMA address from its descriptor ring and initiates a bus-mastering DMA transfer. For DMA_TO_DEVICE, the device reads data from system memory. The PCI host bridge translates the DMA address to a physical address. If SWIOTLB bounce buffering is active, the device reads from the bounce buffer, not the original buffer.',
    highlights: ['dma-region'],
    data: cloneState(state),
  });

  // Frame 9: dma_unmap_single
  state.phase = 'unmap';
  state.currentFunction = 'dma_unmap_single()';
  state.srcRef = 'include/linux/dma-mapping.h:604 (dma_unmap_single macro)';
  frames.push({
    step: 9,
    label: 'dma_unmap_single() releases mapping',
    description: 'After the device signals completion (interrupt), the driver calls dma_unmap_single(dev, dma_addr, size, DMA_TO_DEVICE) at include/linux/dma-mapping.h:604. This expands to dma_unmap_single_attrs() at line 531, which calls dma_unmap_page_attrs() at line 534. dma_unmap_page_attrs() at kernel/dma/mapping.c:232 calls dma_unmap_phys() at line 238, which frees any bounce buffer and invalidates debug tracking.',
    highlights: ['phase-unmap'],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario: dma-coherent-alloc
// Coherent DMA buffer allocation
// ---------------------------------------------------------------------------
function generateDmaCoherentAlloc(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: PciDmaState = {
    phase: 'alloc',
    currentFunction: 'dma_alloc_coherent()',
    pciDevices: [{ bdf: '00:02.0', vendor: 0x8086, device: 0x1533, class: 'Network controller', headerType: 0 }],
    barMappings: [{ bar: 0, type: 'mem64', base: '0xFE000000', size: '128KB', prefetchable: false }],
    dmaRegions: [],
    iommuState: { enabled: false, domain: '', mappedPages: 0 },
    busHierarchy: [{ busNr: 0, parentBus: null, bridge: 'Host Bridge', devices: ['00:02.0'] }],
    srcRef: '',
  };

  // Frame 0: Driver calls dma_alloc_coherent
  state.srcRef = 'include/linux/dma-mapping.h:614-619 (dma_alloc_coherent)';
  frames.push({
    step: 0,
    label: 'Driver calls dma_alloc_coherent()',
    description: 'A driver calls dma_alloc_coherent(dev, size, &dma_handle, GFP_KERNEL) to allocate a DMA-coherent buffer. dma_alloc_coherent() at include/linux/dma-mapping.h:614 is an inline that calls dma_alloc_attrs() with DMA_ATTR_NO_WARN if __GFP_NOWARN is set. Unlike streaming mappings, coherent buffers are permanently mapped and accessible by both CPU and device without explicit sync.',
    highlights: ['phase-alloc'],
    data: cloneState(state),
  });

  // Frame 1: dma_alloc_attrs dispatches
  state.currentFunction = 'dma_alloc_attrs()';
  state.srcRef = 'kernel/dma/mapping.c:631-673 (dma_alloc_attrs)';
  frames.push({
    step: 1,
    label: 'dma_alloc_attrs() selects allocator',
    description: 'dma_alloc_attrs() at kernel/dma/mapping.c:631 gets DMA ops via get_dma_ops(dev) at line 634. It warns if dev->coherent_dma_mask is not set (line 637). First, dma_alloc_from_dev_coherent() at line 647 checks for a device-specific coherent pool. Then GFP zone flags are cleared at line 654. The function dispatches: dma_direct_alloc() at line 657 for direct DMA, iommu_dma_alloc() at line 659 for IOMMU, or ops->alloc at line 661.',
    highlights: ['phase-alloc'],
    data: cloneState(state),
  });

  // Frame 2: dma_direct_alloc
  state.phase = 'alloc-direct';
  state.currentFunction = 'dma_direct_alloc()';
  state.srcRef = 'kernel/dma/direct.c:203-262 (dma_direct_alloc)';
  frames.push({
    step: 2,
    label: 'dma_direct_alloc() allocates pages',
    description: 'dma_direct_alloc() at kernel/dma/direct.c:203 aligns size to PAGE_ALIGN at line 210. For non-coherent devices (line 218), it checks for arch_dma_alloc() or DMA_GLOBAL_POOL. For coherent devices (typical x86), it falls through to __dma_direct_alloc_pages() at line 254 which allocates physically contiguous memory via dma_alloc_contiguous() or alloc_pages_node().',
    highlights: ['phase-direct'],
    data: cloneState(state),
  });

  // Frame 3: Page allocation and DMA address
  state.currentFunction = '__dma_direct_alloc_pages()';
  state.dmaRegions.push({
    physAddr: '0x20000000',
    dmaAddr: '0x20000000',
    size: '16KB',
    direction: 'bidirectional',
    type: 'coherent',
    bounced: false,
  });
  state.srcRef = 'kernel/dma/direct.c:119-165 (__dma_direct_alloc_pages)';
  frames.push({
    step: 3,
    label: 'Contiguous pages allocated',
    description: '__dma_direct_alloc_pages() at kernel/dma/direct.c:119 first checks is_swiotlb_for_alloc(dev) at line 128, using swiotlb if the device requires bounce buffering. Otherwise, dma_alloc_contiguous() at line 133 tries CMA (Contiguous Memory Allocator) first. If CMA fails, alloc_pages_node() at line 140 allocates from the buddy allocator with the appropriate GFP zone flags.',
    highlights: ['dma-region'],
    data: cloneState(state),
  });

  // Frame 4: Remap or set uncached
  state.currentFunction = 'dma_direct_alloc() (remap)';
  state.srcRef = 'kernel/dma/direct.c:258-290 (dma_direct_alloc remap/uncached path)';
  frames.push({
    step: 4,
    label: 'Pages remapped for DMA coherency',
    description: 'After allocation, dma_direct_alloc() may need to ensure cache coherency. On architectures without hardware coherency (e.g., ARM), remap=true causes dma_common_contiguous_remap() to create an uncached virtual mapping. On x86 with set_uncached, set_memory_uc() marks the pages uncacheable. For force_dma_unencrypted() (AMD SEV/SME), the memory is decrypted for device access.',
    highlights: ['phase-direct'],
    data: cloneState(state),
  });

  // Frame 5: IOMMU path (alternative)
  state.phase = 'alloc-iommu';
  state.currentFunction = 'iommu_dma_alloc()';
  state.iommuState = { enabled: true, domain: 'DMA domain', mappedPages: 4 };
  state.srcRef = 'drivers/iommu/dma-iommu.c:940-985 (__iommu_dma_alloc_noncontiguous)';
  frames.push({
    step: 5,
    label: 'IOMMU path: iommu_dma_alloc()',
    description: 'When an IOMMU is present (use_dma_iommu returns true), dma_alloc_attrs() calls iommu_dma_alloc() at kernel/dma/mapping.c:659. For non-contiguous allocation, __iommu_dma_alloc_noncontiguous() at drivers/iommu/dma-iommu.c:940 allocates an IOVA range via iommu_dma_alloc_iova() at line 974, then __iommu_dma_alloc_pages() at line 968 allocates scattered physical pages. The IOMMU maps them to a contiguous DMA address space.',
    highlights: ['phase-iommu'],
    data: cloneState(state),
  });

  // Frame 6: dma_alloc_from_pool (atomic context)
  state.phase = 'alloc-direct';
  state.currentFunction = 'dma_direct_alloc_from_pool()';
  state.srcRef = 'kernel/dma/direct.c:167-183 (dma_direct_alloc_from_pool)';
  frames.push({
    step: 6,
    label: 'Atomic pool for non-blocking contexts',
    description: 'When dma_direct_use_pool() returns true (line 250 in direct.c), dma_direct_alloc_from_pool() at kernel/dma/direct.c:167 allocates from pre-reserved atomic DMA pools. This path is used in interrupt context or when memory encryption requires pre-mapped buffers. The pool is initialized at boot and provides guaranteed DMA-capable memory without blocking.',
    highlights: ['phase-direct'],
    data: cloneState(state),
  });

  // Frame 7: Return cpu_addr and dma_handle
  state.phase = 'alloc-complete';
  state.currentFunction = 'dma_alloc_attrs() returns';
  state.srcRef = 'kernel/dma/mapping.c:668-672 (trace, debug, return cpu_addr)';
  frames.push({
    step: 7,
    label: 'Coherent buffer ready: CPU + DMA addresses',
    description: 'dma_alloc_attrs() at kernel/dma/mapping.c:668 calls trace_dma_alloc() and debug_dma_alloc_coherent() at line 670 to record the allocation. It returns the CPU virtual address (cpu_addr) while *dma_handle receives the device-visible DMA address. The driver uses cpu_addr for CPU access and dma_handle for device descriptors. Both addresses point to the same physical memory.',
    highlights: ['dma-region'],
    data: cloneState(state),
  });

  // Frame 8: Driver uses coherent buffer
  state.currentFunction = 'Driver uses coherent DMA buffer';
  state.srcRef = 'include/linux/dma-mapping.h:614 (dma_alloc_coherent usage)';
  frames.push({
    step: 8,
    label: 'CPU and device share coherent buffer',
    description: 'The driver writes DMA descriptors into the coherent buffer using cpu_addr. The device reads descriptors using dma_handle. No explicit sync is needed because the mapping is cache-coherent: CPU writes are visible to the device, and device writes are visible to the CPU. This is ideal for descriptor rings and command queues. The buffer persists until freed with dma_free_coherent().',
    highlights: ['dma-region'],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// SVG Rendering
// ---------------------------------------------------------------------------
const NS = 'http://www.w3.org/2000/svg';

const PHASE_LABELS_ENUM = [
  { id: 'scan', label: 'Scan' },
  { id: 'detect', label: 'Detect' },
  { id: 'setup', label: 'Setup' },
  { id: 'bar-read', label: 'BAR' },
  { id: 'register', label: 'Register' },
];

const PHASE_LABELS_DMA = [
  { id: 'map', label: 'Map' },
  { id: 'dma-direct', label: 'Direct' },
  { id: 'swiotlb', label: 'SWIOTLB' },
  { id: 'unmap', label: 'Unmap' },
];

const PHASE_LABELS_ALLOC = [
  { id: 'alloc', label: 'Alloc' },
  { id: 'alloc-direct', label: 'Direct' },
  { id: 'alloc-iommu', label: 'IOMMU' },
  { id: 'alloc-complete', label: 'Done' },
];

function getPhaseLabels(phase: string): { id: string; label: string }[] {
  if (['map', 'dma-direct', 'swiotlb', 'unmap'].includes(phase)) return PHASE_LABELS_DMA;
  if (['alloc', 'alloc-direct', 'alloc-iommu', 'alloc-complete'].includes(phase)) return PHASE_LABELS_ALLOC;
  return PHASE_LABELS_ENUM;
}

function getActivePhaseIndex(phase: string, labels: { id: string }[]): number {
  return labels.findIndex(l => l.id === phase);
}

function renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void {
  while (container.firstChild) container.removeChild(container.firstChild);
  const data = frame.data as PciDmaState;
  const margin = { top: 10, left: 15, right: 15, bottom: 10 };
  const usableWidth = width - margin.left - margin.right;

  // Title
  const title = document.createElementNS(NS, 'text');
  title.setAttribute('x', String(width / 2));
  title.setAttribute('y', '18');
  title.setAttribute('text-anchor', 'middle');
  title.setAttribute('class', 'anim-title');
  title.textContent = 'PCI Enumeration & DMA Mapping';
  container.appendChild(title);

  // --- Phase flow diagram ---
  const flowTop = margin.top + 30;
  const phaseLabels = getPhaseLabels(data.phase);
  const phaseCount = phaseLabels.length;
  const phaseWidth = Math.min(100, (usableWidth - (phaseCount - 1) * 6) / phaseCount);
  const phaseHeight = 28;
  const activeIndex = getActivePhaseIndex(data.phase, phaseLabels);

  phaseLabels.forEach((phase, i) => {
    const px = margin.left + i * (phaseWidth + 6);
    const isActive = i === activeIndex;
    const isPast = activeIndex > 0 && i < activeIndex;

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(px));
    rect.setAttribute('y', String(flowTop));
    rect.setAttribute('width', String(phaseWidth));
    rect.setAttribute('height', String(phaseHeight));
    rect.setAttribute('rx', '4');
    let blockClass = 'anim-block';
    if (isActive) {
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

  // --- Bus hierarchy ---
  const busTop = funcTop + 20;
  data.busHierarchy.forEach((bus, i) => {
    const bx = margin.left;
    const by = busTop + i * 24;

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(bx));
    rect.setAttribute('y', String(by));
    rect.setAttribute('width', String(Math.min(200, usableWidth * 0.4)));
    rect.setAttribute('height', '20');
    rect.setAttribute('rx', '3');
    rect.setAttribute('fill', '#1f4068');
    rect.setAttribute('class', 'anim-bus');
    container.appendChild(rect);

    const text = document.createElementNS(NS, 'text');
    text.setAttribute('x', String(bx + 6));
    text.setAttribute('y', String(by + 14));
    text.setAttribute('fill', '#e6edf3');
    text.setAttribute('font-size', '10');
    text.setAttribute('class', 'anim-bus');
    text.textContent = `Bus ${bus.busNr}: ${bus.bridge || 'root'} [${bus.devices.length} dev]`;
    container.appendChild(text);
  });

  // --- PCI Devices ---
  const devLeft = width * 0.45;
  const devTop = busTop;
  data.pciDevices.forEach((dev, i) => {
    const dy = devTop + i * 26;

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(devLeft));
    rect.setAttribute('y', String(dy));
    rect.setAttribute('width', String(Math.min(220, usableWidth * 0.4)));
    rect.setAttribute('height', '22');
    rect.setAttribute('rx', '3');
    rect.setAttribute('fill', '#1a3a1a');
    let devClass = 'anim-device';
    if (frame.highlights.includes(`device-${dev.bdf}`)) devClass += ' anim-highlight';
    rect.setAttribute('class', devClass);
    container.appendChild(rect);

    const text = document.createElementNS(NS, 'text');
    text.setAttribute('x', String(devLeft + 6));
    text.setAttribute('y', String(dy + 15));
    text.setAttribute('fill', '#e6edf3');
    text.setAttribute('font-size', '10');
    text.setAttribute('class', 'anim-device');
    text.textContent = `${dev.bdf} [${dev.vendor.toString(16)}:${dev.device.toString(16)}] ${dev.class}`;
    container.appendChild(text);
  });

  // --- BAR Mappings ---
  const barTop = devTop + Math.max(data.pciDevices.length, 1) * 26 + 10;
  data.barMappings.forEach((bar, i) => {
    const by = barTop + i * 22;

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(margin.left));
    rect.setAttribute('y', String(by));
    rect.setAttribute('width', String(Math.min(260, usableWidth * 0.5)));
    rect.setAttribute('height', '18');
    rect.setAttribute('rx', '2');
    rect.setAttribute('fill', '#3d2e00');
    let barClass = 'anim-bar';
    if (frame.highlights.includes(`bar-${bar.bar}`)) barClass += ' anim-highlight';
    rect.setAttribute('class', barClass);
    container.appendChild(rect);

    const text = document.createElementNS(NS, 'text');
    text.setAttribute('x', String(margin.left + 6));
    text.setAttribute('y', String(by + 13));
    text.setAttribute('fill', '#e6edf3');
    text.setAttribute('font-size', '9');
    text.setAttribute('class', 'anim-bar');
    text.textContent = `BAR${bar.bar}: ${bar.type} ${bar.base} (${bar.size}) ${bar.prefetchable ? 'PF' : ''}`;
    container.appendChild(text);
  });

  // --- DMA Regions ---
  const dmaTop = barTop + Math.max(data.barMappings.length, 0) * 22 + 10;
  data.dmaRegions.forEach((region, i) => {
    const ry = dmaTop + i * 22;

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(margin.left));
    rect.setAttribute('y', String(ry));
    rect.setAttribute('width', String(Math.min(300, usableWidth * 0.6)));
    rect.setAttribute('height', '18');
    rect.setAttribute('rx', '2');
    rect.setAttribute('fill', region.bounced ? '#5a1a1a' : '#1a3a5a');
    let dmaClass = 'anim-dma';
    if (frame.highlights.includes('dma-region')) dmaClass += ' anim-highlight';
    rect.setAttribute('class', dmaClass);
    container.appendChild(rect);

    const text = document.createElementNS(NS, 'text');
    text.setAttribute('x', String(margin.left + 6));
    text.setAttribute('y', String(ry + 13));
    text.setAttribute('fill', '#e6edf3');
    text.setAttribute('font-size', '9');
    text.setAttribute('class', 'anim-dma');
    text.textContent = `DMA: ${region.dmaAddr} -> ${region.physAddr} (${region.size}) ${region.type} ${region.bounced ? '[BOUNCED]' : ''}`;
    container.appendChild(text);
  });

  // --- Source reference ---
  const srcTop = height - margin.bottom - 14;
  const srcText = document.createElementNS(NS, 'text');
  srcText.setAttribute('x', String(margin.left));
  srcText.setAttribute('y', String(srcTop));
  srcText.setAttribute('fill', '#8b949e');
  srcText.setAttribute('font-size', '9');
  srcText.setAttribute('class', 'anim-cpu-label');
  srcText.textContent = `src: ${data.srcRef}`;
  container.appendChild(srcText);
}

// ---------------------------------------------------------------------------
// Module export
// ---------------------------------------------------------------------------
const SCENARIOS: AnimationScenario[] = [
  { id: 'pci-enumeration', label: 'PCI Bus Enumeration & BAR Mapping' },
  { id: 'dma-streaming-map', label: 'Streaming DMA Mapping (dma_map_single)' },
  { id: 'dma-coherent-alloc', label: 'Coherent DMA Allocation (dma_alloc_coherent)' },
];

const pciDma: AnimationModule = {
  config: {
    id: 'pci-dma',
    title: 'PCI Enumeration & DMA Mapping',
    skillName: 'pci-and-dma',
  },
  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario) {
      case 'dma-streaming-map': return generateDmaStreamingMap();
      case 'dma-coherent-alloc': return generateDmaCoherentAlloc();
      case 'pci-enumeration':
      default: return generatePciEnumeration();
    }
  },
  renderFrame,
  getScenarios: () => SCENARIOS,
};

export default pciDma;

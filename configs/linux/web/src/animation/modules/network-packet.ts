import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

export interface SkbPointers {
  head: number;
  data: number;
  tail: number;
  end: number;
}

export interface ProtocolHeader {
  name: string;
  size: number;
  fields: Array<{ name: string; value: string }>;
  state: 'absent' | 'building' | 'present' | 'processing' | 'removed';
}

export interface NetworkLayer {
  name: string;
  function: string;
  state: 'idle' | 'active' | 'done';
}

export interface PacketState {
  direction: 'send' | 'receive';
  skb: SkbPointers;
  headers: ProtocolHeader[];
  payload: string;
  layers: NetworkLayer[];
  currentLayer: number;
  phase: string;
  srcRef: string;
}

// Buffer size constants (bytes)
const ETH_HLEN = 14;
const IP_HLEN = 20;
const TCP_HLEN = 20;
const PAYLOAD_SIZE = 5; // "Hello"
const SKB_BUF_SIZE = 256;

function cloneState(state: PacketState): PacketState {
  return {
    direction: state.direction,
    skb: { ...state.skb },
    headers: state.headers.map(h => ({ ...h, fields: h.fields.map(f => ({ ...f })) })),
    payload: state.payload,
    layers: state.layers.map(l => ({ ...l })),
    currentLayer: state.currentLayer,
    phase: state.phase,
    srcRef: state.srcRef,
  };
}

function makeSendLayers(): NetworkLayer[] {
  return [
    { name: 'Application', function: '', state: 'idle' },
    { name: 'TCP', function: '', state: 'idle' },
    { name: 'IP', function: '', state: 'idle' },
    { name: 'Device', function: '', state: 'idle' },
    { name: 'NIC', function: '', state: 'idle' },
  ];
}

function makeReceiveLayers(): NetworkLayer[] {
  return [
    { name: 'NIC', function: '', state: 'idle' },
    { name: 'Device', function: '', state: 'idle' },
    { name: 'IP', function: '', state: 'idle' },
    { name: 'TCP', function: '', state: 'idle' },
    { name: 'Application', function: '', state: 'idle' },
  ];
}

function makeHeaders(): ProtocolHeader[] {
  return [
    {
      name: 'Ethernet',
      size: ETH_HLEN,
      fields: [
        { name: 'dst_mac', value: 'ff:ff:ff:ff:ff:ff' },
        { name: 'src_mac', value: '00:11:22:33:44:55' },
        { name: 'ethertype', value: '0x0800' },
      ],
      state: 'absent',
    },
    {
      name: 'IP',
      size: IP_HLEN,
      fields: [
        { name: 'src', value: '10.0.0.1' },
        { name: 'dst', value: '10.0.0.2' },
        { name: 'TTL', value: '64' },
        { name: 'protocol', value: '6 (TCP)' },
      ],
      state: 'absent',
    },
    {
      name: 'TCP',
      size: TCP_HLEN,
      fields: [
        { name: 'src_port', value: '49152' },
        { name: 'dst_port', value: '80' },
        { name: 'seq', value: '1000' },
        { name: 'ack', value: '0' },
        { name: 'window', value: '65535' },
      ],
      state: 'absent',
    },
  ];
}

// ---- TCP Send Path ----

function generateTcpSendFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];

  // Initial headroom reserves space for all headers
  const headroom = ETH_HLEN + IP_HLEN + TCP_HLEN;
  let state: PacketState = {
    direction: 'send',
    skb: { head: 0, data: headroom, tail: headroom, end: SKB_BUF_SIZE },
    headers: makeHeaders(),
    payload: 'Hello',
    layers: makeSendLayers(),
    currentLayer: -1,
    phase: 'init',
    srcRef: '',
  };

  // Frame 0: Application calls sendto()
  state.layers[0].state = 'active';
  state.layers[0].function = '__sys_sendto()';
  state.currentLayer = 0;
  state.phase = 'syscall';
  state.srcRef = 'net/socket.c:2171';
  frames.push({
    step: 0,
    label: 'Application calls __sys_sendto()',
    description:
      'Userspace send()/sendto() enters the kernel at __sys_sendto() (net/socket.c:2171). ' +
      'It builds a msghdr from the user buffer and flags, then calls sock_sendmsg() (net/socket.c:753) ' +
      'which dispatches to the protocol-specific sendmsg callback via sock->ops->sendmsg.',
    highlights: ['layer-Application'],
    data: cloneState(state),
  });

  // Frame 1: sock_sendmsg dispatches to TCP
  state.layers[0].function = 'sock_sendmsg()';
  state.phase = 'socket-dispatch';
  state.srcRef = 'net/socket.c:753';
  frames.push({
    step: 1,
    label: 'sock_sendmsg() dispatches to TCP',
    description:
      'sock_sendmsg() (net/socket.c:753) invokes the protocol sendmsg via sock->ops->sendmsg. ' +
      'For TCP sockets this calls tcp_sendmsg() (net/ipv4/tcp.c:1460), which acquires the socket lock ' +
      'and delegates to tcp_sendmsg_locked() (net/ipv4/tcp.c:1130) for segmentation and buffering.',
    highlights: ['layer-Application'],
    data: cloneState(state),
  });

  // Frame 2: tcp_sendmsg allocates sk_buff and copies data
  state.layers[0].state = 'done';
  state.layers[1].state = 'active';
  state.layers[1].function = 'tcp_sendmsg_locked()';
  state.currentLayer = 1;
  state.skb.tail = state.skb.data + PAYLOAD_SIZE;
  state.phase = 'tcp-copy';
  state.srcRef = 'net/ipv4/tcp.c:1130';
  frames.push({
    step: 2,
    label: 'tcp_sendmsg_locked() copies payload into sk_buff',
    description:
      'tcp_sendmsg_locked() (net/ipv4/tcp.c:1130) allocates an sk_buff via __alloc_skb() ' +
      '(net/core/skbuff.c:672) with headroom reserved by skb_reserve() for protocol headers. ' +
      'It copies the user data ("Hello") into the buffer using skb_put(), advancing the tail pointer. ' +
      'The headroom trick avoids data copies when headers are prepended later.',
    highlights: ['skb-payload', 'layer-TCP'],
    data: cloneState(state),
  });

  // Frame 3: TCP builds header
  state.layers[1].function = '__tcp_transmit_skb()';
  state.headers[2].state = 'building';
  state.phase = 'tcp-header';
  state.srcRef = 'net/ipv4/tcp_output.c:1512';
  frames.push({
    step: 3,
    label: '__tcp_transmit_skb() builds TCP header',
    description:
      'tcp_write_xmit() (net/ipv4/tcp_output.c:2966) drives transmission by calling ' +
      '__tcp_transmit_skb() (net/ipv4/tcp_output.c:1512), which clones the skb and constructs ' +
      'the TCP header: source/destination ports, sequence number, acknowledgment, window size, ' +
      'and checksum. The TCP header is 20 bytes for a basic segment.',
    highlights: ['header-TCP', 'layer-TCP'],
    data: cloneState(state),
  });

  // Frame 4: skb_push for TCP header
  state.headers[2].state = 'present';
  state.skb.data -= TCP_HLEN;
  state.layers[1].function = 'skb_push(skb, 20)';
  state.phase = 'tcp-push';
  state.srcRef = 'net/ipv4/tcp_output.c:1512';
  frames.push({
    step: 4,
    label: 'skb_push() prepends TCP header',
    description:
      'Inside __tcp_transmit_skb() (net/ipv4/tcp_output.c:1512), skb_push() moves the data pointer ' +
      'backward by 20 bytes (TCP header size). The TCP header now occupies bytes [data..data+20). ' +
      'This is why sk_buff uses head/data/tail/end pointers: each layer adds its header in O(1) ' +
      'without copying the payload.',
    highlights: ['skb-data-ptr', 'header-TCP'],
    data: cloneState(state),
  });

  // Frame 5: IP layer receives the skb
  state.layers[1].state = 'done';
  state.layers[2].state = 'active';
  state.layers[2].function = '__ip_queue_xmit()';
  state.currentLayer = 2;
  state.phase = 'ip-route';
  state.srcRef = 'net/ipv4/ip_output.c:463';
  frames.push({
    step: 5,
    label: '__ip_queue_xmit() performs route lookup',
    description:
      'The IP layer receives the skb from TCP. ip_queue_xmit() (net/ipv4/ip_output.c:546) is a thin ' +
      'wrapper that calls __ip_queue_xmit() (net/ipv4/ip_output.c:463). It first performs a route ' +
      'lookup via ip_route_output_ports() to determine the output interface and next-hop address.',
    highlights: ['layer-IP'],
    data: cloneState(state),
  });

  // Frame 6: IP header push
  state.headers[1].state = 'building';
  state.layers[2].function = '__ip_queue_xmit()';
  state.phase = 'ip-header';
  state.srcRef = 'net/ipv4/ip_output.c:463';
  frames.push({
    step: 6,
    label: '__ip_queue_xmit() builds IP header',
    description:
      '__ip_queue_xmit() (net/ipv4/ip_output.c:463) calls skb_push() to prepend the IP header, ' +
      'then fills in source address, destination address, TTL (time to live), protocol field (6 for TCP), ' +
      'total length, and header checksum. The IP header is 20 bytes.',
    highlights: ['header-IP', 'layer-IP'],
    data: cloneState(state),
  });

  // Frame 7: skb_push for IP header
  state.headers[1].state = 'present';
  state.skb.data -= IP_HLEN;
  state.layers[2].function = 'skb_push(skb, 20)';
  state.phase = 'ip-push';
  state.srcRef = 'net/ipv4/ip_output.c:463';
  frames.push({
    step: 7,
    label: 'skb_push() prepends IP header',
    description:
      'Inside __ip_queue_xmit() (net/ipv4/ip_output.c:463), skb_push() moves the data pointer back ' +
      'another 20 bytes for the IP header. The buffer now contains [IP header | TCP header | payload]. ' +
      `The data pointer has moved from offset ${headroom} to ${state.skb.data}, consuming the reserved headroom.`,
    highlights: ['skb-data-ptr', 'header-IP'],
    data: cloneState(state),
  });

  // Frame 8: ip_output and fragmentation check
  state.layers[2].function = 'ip_output()';
  state.phase = 'ip-output';
  state.srcRef = 'net/ipv4/ip_output.c:428';
  frames.push({
    step: 8,
    label: 'ip_output() checks MTU for fragmentation',
    description:
      'ip_output() (net/ipv4/ip_output.c:428) calls ip_finish_output() which checks if the packet ' +
      'exceeds the MTU (typically 1500 bytes). If it does, the packet is fragmented. Our 59-byte ' +
      'packet fits easily. The skb is then passed to the device layer via dst_output().',
    highlights: ['layer-IP'],
    data: cloneState(state),
  });

  // Frame 9: Device layer - qdisc
  state.layers[2].state = 'done';
  state.layers[3].state = 'active';
  state.layers[3].function = '__dev_queue_xmit()';
  state.currentLayer = 3;
  state.headers[0].state = 'building';
  state.phase = 'dev-ethernet';
  state.srcRef = 'net/core/dev.c:4760';
  frames.push({
    step: 9,
    label: '__dev_queue_xmit() enters device layer',
    description:
      'The packet enters __dev_queue_xmit() (net/core/dev.c:4760). The Ethernet header (14 bytes: ' +
      '6B dst MAC + 6B src MAC + 2B ethertype) is added by the device driver. The skb is then ' +
      'enqueued in the qdisc (queueing discipline) for traffic control. The default qdisc is pfifo_fast.',
    highlights: ['header-Ethernet', 'layer-Device'],
    data: cloneState(state),
  });

  // Frame 10: Ethernet header push
  state.headers[0].state = 'present';
  state.skb.data -= ETH_HLEN;
  state.layers[3].function = 'skb_push(skb, 14)';
  state.phase = 'eth-push';
  state.srcRef = 'net/core/dev.c:4760';
  frames.push({
    step: 10,
    label: 'skb_push() prepends Ethernet header',
    description:
      'skb_push() moves the data pointer back by 14 bytes for the Ethernet header. ' +
      'The complete frame is now [Ethernet | IP | TCP | Payload]. All headroom has been consumed. ' +
      'The data pointer equals the head pointer -- the buffer is full from the front.',
    highlights: ['skb-data-ptr', 'header-Ethernet'],
    data: cloneState(state),
  });

  // Frame 11: Driver transmit
  state.layers[3].function = 'dev_hard_start_xmit()';
  state.phase = 'driver-xmit';
  state.srcRef = 'net/core/dev.c:3894';
  frames.push({
    step: 11,
    label: 'dev_hard_start_xmit() sends to driver',
    description:
      'The qdisc dequeues the skb and calls dev_hard_start_xmit() (net/core/dev.c:3894), which ' +
      'invokes the NIC driver\'s ndo_start_xmit() callback. The driver programs the NIC\'s DMA ' +
      'engine with the skb data address for zero-copy transmission.',
    highlights: ['layer-Device'],
    data: cloneState(state),
  });

  // Frame 12: NIC transmits
  state.layers[3].state = 'done';
  state.layers[4].state = 'active';
  state.layers[4].function = 'NIC DMA transmit';
  state.currentLayer = 4;
  state.phase = 'nic-transmit';
  state.srcRef = 'net/core/skbuff.c:1444';
  frames.push({
    step: 12,
    label: 'NIC DMA sends packet on the wire',
    description:
      'The NIC reads the packet data via DMA (Direct Memory Access) from kernel memory and transmits it ' +
      'as electrical/optical signals on the wire. When transmission completes, the NIC raises an interrupt ' +
      'and the driver frees the skb via consume_skb() (net/core/skbuff.c:1444).',
    highlights: ['layer-NIC'],
    data: cloneState(state),
  });

  return frames;
}

// ---- TCP Receive Path ----

function generateTcpReceiveFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];

  // Received frame starts with all headers present
  const totalHdr = ETH_HLEN + IP_HLEN + TCP_HLEN;
  const totalLen = totalHdr + PAYLOAD_SIZE;
  let state: PacketState = {
    direction: 'receive',
    skb: { head: 0, data: 0, tail: totalLen, end: SKB_BUF_SIZE },
    headers: makeHeaders().map(h => ({ ...h, state: 'present' as const })),
    payload: 'Hello',
    layers: makeReceiveLayers(),
    currentLayer: -1,
    phase: 'init',
    srcRef: '',
  };

  // Frame 0: NIC receives frame
  state.layers[0].state = 'active';
  state.layers[0].function = 'NIC DMA receive';
  state.currentLayer = 0;
  state.phase = 'nic-dma';
  state.srcRef = 'net/core/skbuff.c:672';
  frames.push({
    step: 0,
    label: 'NIC receives frame via DMA',
    description:
      'The NIC receives an Ethernet frame from the wire. It uses DMA to copy the frame data into ' +
      'a pre-allocated ring buffer backed by __alloc_skb() (net/core/skbuff.c:672). The NIC then ' +
      'raises a hardware interrupt (IRQ) to notify the kernel that a packet has arrived.',
    highlights: ['layer-NIC'],
    data: cloneState(state),
  });

  // Frame 1: IRQ -> NAPI
  state.layers[0].function = 'IRQ handler';
  state.phase = 'irq';
  state.srcRef = 'net/core/dev.c:6433';
  frames.push({
    step: 1,
    label: 'Hardware IRQ triggers NAPI',
    description:
      'The IRQ handler disables further interrupts from this NIC and schedules NAPI (New API) polling. ' +
      'NAPI solves the "interrupt livelock" problem: under high load, processing each packet via ' +
      'individual interrupts wastes CPU. NAPI batches packets by polling via netif_receive_skb() ' +
      '(net/core/dev.c:6433), reducing overhead dramatically.',
    highlights: ['layer-NIC'],
    data: cloneState(state),
  });

  // Frame 2: NAPI poll
  state.layers[0].state = 'done';
  state.layers[1].state = 'active';
  state.layers[1].function = 'napi_gro_receive()';
  state.currentLayer = 1;
  state.phase = 'napi-poll';
  state.srcRef = 'net/core/dev.c:6433';
  frames.push({
    step: 2,
    label: 'NAPI poll calls napi_gro_receive()',
    description:
      'The NAPI poll function processes packets in a batch. napi_gro_receive() attempts GRO ' +
      '(Generic Receive Offload) to merge small packets into larger ones. It then passes the skb ' +
      'to netif_receive_skb() (net/core/dev.c:6433) for protocol demultiplexing based on ethertype.',
    highlights: ['layer-Device'],
    data: cloneState(state),
  });

  // Frame 3: netif_receive_skb
  state.layers[1].function = 'netif_receive_skb()';
  state.phase = 'netif-receive';
  state.srcRef = 'net/core/dev.c:6433';
  frames.push({
    step: 3,
    label: 'netif_receive_skb() dispatches by protocol',
    description:
      'netif_receive_skb() (net/core/dev.c:6433) examines the Ethernet header\'s ethertype field ' +
      '(0x0800 = IPv4) to determine which protocol handler should process this packet. It calls ' +
      'deliver_skb() for matching handlers, routing IPv4 packets to ip_rcv().',
    highlights: ['header-Ethernet', 'layer-Device'],
    data: cloneState(state),
  });

  // Frame 4: Pull Ethernet header
  state.headers[0].state = 'processing';
  state.phase = 'eth-pull';
  state.srcRef = 'net/ipv4/ip_input.c:564';
  frames.push({
    step: 4,
    label: 'Processing Ethernet header',
    description:
      'The Ethernet header has been read and its job is done. The ethertype field (0x0800) told us ' +
      'this is an IPv4 packet. The MAC addresses were used for link-layer routing. Control now ' +
      'passes to ip_rcv() (net/ipv4/ip_input.c:564) in the IP layer.',
    highlights: ['header-Ethernet', 'skb-data-ptr'],
    data: cloneState(state),
  });

  // Frame 5: skb_pull Ethernet
  state.headers[0].state = 'removed';
  state.skb.data += ETH_HLEN;
  state.layers[1].function = 'skb_pull(skb, 14)';
  state.phase = 'eth-removed';
  state.srcRef = 'net/ipv4/ip_input.c:564';
  frames.push({
    step: 5,
    label: 'skb_pull() removes Ethernet header',
    description:
      'skb_pull() advances the data pointer forward by 14 bytes, logically removing the Ethernet header. ' +
      'The header bytes are still in the buffer (between head and data), but the "current" packet data ' +
      'now starts at the IP header. This is the inverse of skb_push() used on the send path.',
    highlights: ['skb-data-ptr'],
    data: cloneState(state),
  });

  // Frame 6: IP layer receives
  state.layers[1].state = 'done';
  state.layers[2].state = 'active';
  state.layers[2].function = 'ip_rcv()';
  state.currentLayer = 2;
  state.phase = 'ip-rcv';
  state.srcRef = 'net/ipv4/ip_input.c:564';
  frames.push({
    step: 6,
    label: 'ip_rcv() validates IP header',
    description:
      'ip_rcv() (net/ipv4/ip_input.c:564) validates the IP header: checks version (must be 4), ' +
      'header length, total length, and header checksum. It then passes through netfilter PREROUTING ' +
      'hooks (NF_INET_PRE_ROUTING) for firewall/NAT processing before routing.',
    highlights: ['header-IP', 'layer-IP'],
    data: cloneState(state),
  });

  // Frame 7: IP route lookup and local deliver
  state.layers[2].function = 'ip_local_deliver()';
  state.headers[1].state = 'processing';
  state.phase = 'ip-deliver';
  state.srcRef = 'net/ipv4/ip_input.c:250';
  frames.push({
    step: 7,
    label: 'ip_local_deliver() routes to transport',
    description:
      'After route lookup confirms the destination IP is local, ip_local_deliver() (net/ipv4/ip_input.c:250) ' +
      'is called. It handles IP fragment reassembly if needed, then uses the protocol field (6 = TCP) ' +
      'to find the correct transport protocol handler registered in inet_protos[].',
    highlights: ['header-IP', 'layer-IP'],
    data: cloneState(state),
  });

  // Frame 8: Pull IP header
  state.headers[1].state = 'removed';
  state.skb.data += IP_HLEN;
  state.layers[2].function = 'skb_pull(skb, 20)';
  state.phase = 'ip-removed';
  state.srcRef = 'net/ipv4/ip_input.c:250';
  frames.push({
    step: 8,
    label: 'skb_pull() removes IP header',
    description:
      'ip_local_deliver() (net/ipv4/ip_input.c:250) strips the IP header via skb_pull(), advancing ' +
      'the data pointer by 20 bytes. The data pointer now points to the TCP header. Each layer peels ' +
      'off its header and passes the remaining data up the stack.',
    highlights: ['skb-data-ptr'],
    data: cloneState(state),
  });

  // Frame 9: TCP receives
  state.layers[2].state = 'done';
  state.layers[3].state = 'active';
  state.layers[3].function = 'tcp_v4_rcv()';
  state.currentLayer = 3;
  state.phase = 'tcp-rcv';
  state.srcRef = 'net/ipv4/tcp_ipv4.c:2147';
  frames.push({
    step: 9,
    label: 'tcp_v4_rcv() finds matching socket',
    description:
      'tcp_v4_rcv() (net/ipv4/tcp_ipv4.c:2147) uses a hash table keyed by (src_ip, src_port, ' +
      'dst_ip, dst_port) to find the matching socket via __inet_lookup_skb(). For established ' +
      'connections, it calls tcp_rcv_established() (net/ipv4/tcp_input.c:6519) which is the fast path.',
    highlights: ['header-TCP', 'layer-TCP'],
    data: cloneState(state),
  });

  // Frame 10: TCP processes segment
  state.layers[3].function = 'tcp_rcv_established()';
  state.headers[2].state = 'processing';
  state.phase = 'tcp-process';
  state.srcRef = 'net/ipv4/tcp_input.c:6519';
  frames.push({
    step: 10,
    label: 'tcp_rcv_established() validates segment',
    description:
      'tcp_rcv_established() (net/ipv4/tcp_input.c:6519) validates sequence numbers, processes ACKs ' +
      '(freeing sent data from the retransmit queue), updates the receive window, and checks for ' +
      'out-of-order segments. It calls tcp_queue_rcv() to add the data to the socket receive queue.',
    highlights: ['header-TCP', 'layer-TCP'],
    data: cloneState(state),
  });

  // Frame 11: Pull TCP header, queue data
  state.headers[2].state = 'removed';
  state.skb.data += TCP_HLEN;
  state.layers[3].function = 'tcp_queue_rcv()';
  state.phase = 'tcp-queue';
  state.srcRef = 'net/ipv4/tcp_input.c:6519';
  frames.push({
    step: 11,
    label: 'tcp_queue_rcv() delivers data to socket',
    description:
      'The TCP header is consumed and the data pointer now points to the payload. tcp_queue_rcv() adds ' +
      'the skb to the socket receive queue (sk->sk_receive_queue) and calls sk_data_ready() to wake ' +
      'any process blocked in recv(). This path is driven by tcp_rcv_established() (net/ipv4/tcp_input.c:6519).',
    highlights: ['skb-payload', 'layer-TCP'],
    data: cloneState(state),
  });

  // Frame 12: Application reads
  state.layers[3].state = 'done';
  state.layers[4].state = 'active';
  state.layers[4].function = 'tcp_recvmsg()';
  state.currentLayer = 4;
  state.phase = 'app-read';
  state.srcRef = 'net/ipv4/tcp.c:2965';
  frames.push({
    step: 12,
    label: 'Application reads via __sys_recvfrom()',
    description:
      'The application\'s recvfrom() syscall enters __sys_recvfrom() (net/socket.c:2231), which calls ' +
      'tcp_recvmsg() (net/ipv4/tcp.c:2965) to copy payload data from the socket receive queue into ' +
      'the user-space buffer. The skb is then freed with __kfree_skb() (net/core/skbuff.c:1215). ' +
      'The "Hello" message has successfully traversed the entire network stack.',
    highlights: ['layer-Application', 'skb-payload'],
    data: cloneState(state),
  });

  return frames;
}

// ---- sk_buff Lifecycle ----

function generateSkbLifecycleFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];

  const layers: NetworkLayer[] = [
    { name: 'Allocator', function: '', state: 'idle' },
    { name: 'Reserve', function: '', state: 'idle' },
    { name: 'Data', function: '', state: 'idle' },
    { name: 'Headers', function: '', state: 'idle' },
    { name: 'Receive', function: '', state: 'idle' },
    { name: 'Free', function: '', state: 'idle' },
  ];

  let state: PacketState = {
    direction: 'send',
    skb: { head: 0, data: 0, tail: 0, end: 0 },
    headers: makeHeaders(),
    payload: '',
    layers: layers.map(l => ({ ...l })),
    currentLayer: -1,
    phase: 'pre-alloc',
    srcRef: '',
  };

  // Frame 0: Before allocation
  frames.push({
    step: 0,
    label: 'sk_buff: Before allocation',
    description:
      'The sk_buff (socket buffer) is the fundamental data structure for network packets in the Linux kernel. ' +
      'Every packet flowing through the stack is represented by an sk_buff. It uses four pointers -- ' +
      'head, data, tail, end -- to manage the buffer without ever copying packet data. ' +
      'Defined in include/linux/skbuff.h, allocated via __alloc_skb() (net/core/skbuff.c:672).',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 1: alloc_skb
  state.skb = { head: 0, data: 0, tail: 0, end: SKB_BUF_SIZE };
  state.layers[0].state = 'active';
  state.layers[0].function = '__alloc_skb()';
  state.currentLayer = 0;
  state.phase = 'alloc';
  state.srcRef = 'net/core/skbuff.c:672';
  frames.push({
    step: 1,
    label: '__alloc_skb() allocates buffer',
    description:
      '__alloc_skb() (net/core/skbuff.c:672) allocates an sk_buff metadata structure from the ' +
      'skbuff_cache slab and a linear data buffer of the specified size via kmalloc_reserve(). ' +
      'Initially, head = data = tail = start of buffer, end = start + size. ' +
      'The data and tail pointers both point to the beginning, meaning the buffer is empty.',
    highlights: ['skb-head', 'skb-data-ptr', 'skb-tail', 'skb-end'],
    data: cloneState(state),
  });

  // Frame 2: skb_reserve (headroom)
  state.layers[0].state = 'done';
  state.layers[1].state = 'active';
  state.layers[1].function = 'skb_reserve()';
  state.currentLayer = 1;
  const headroom = ETH_HLEN + IP_HLEN + TCP_HLEN; // 54 bytes
  state.skb.data = headroom;
  state.skb.tail = headroom;
  state.phase = 'reserve';
  state.srcRef = 'include/linux/skbuff.h';
  frames.push({
    step: 2,
    label: 'skb_reserve() creates headroom',
    description:
      `skb_reserve(skb, ${headroom}) advances both data and tail pointers by ${headroom} bytes. ` +
      'This inline function (include/linux/skbuff.h) reserves space at the front of the buffer for ' +
      'protocol headers (Ethernet: 14B + IP: 20B + TCP: 20B). ' +
      'The region [head..data) is now headroom -- headers will be prepended here later using skb_push().',
    highlights: ['skb-data-ptr', 'skb-tail'],
    data: cloneState(state),
  });

  // Frame 3: skb_put (add payload data)
  state.layers[1].state = 'done';
  state.layers[2].state = 'active';
  state.layers[2].function = 'skb_put()';
  state.currentLayer = 2;
  state.skb.tail = headroom + PAYLOAD_SIZE;
  state.payload = 'Hello';
  state.phase = 'put-data';
  state.srcRef = 'include/linux/skbuff.h';
  frames.push({
    step: 3,
    label: 'skb_put() appends payload data',
    description:
      `skb_put(skb, ${PAYLOAD_SIZE}) advances the tail pointer by ${PAYLOAD_SIZE} bytes and returns a pointer ` +
      'to the old tail (include/linux/skbuff.h). The caller copies "Hello" into that space. ' +
      `The data region [data..tail) now contains the payload. The buffer has ${SKB_BUF_SIZE - state.skb.tail} bytes of tailroom remaining.`,
    highlights: ['skb-tail', 'skb-payload'],
    data: cloneState(state),
  });

  // Frame 4: skb_push TCP header
  state.layers[2].state = 'done';
  state.layers[3].state = 'active';
  state.layers[3].function = 'skb_push() - TCP';
  state.currentLayer = 3;
  state.skb.data -= TCP_HLEN;
  state.headers[2].state = 'present';
  state.phase = 'push-tcp';
  state.srcRef = 'net/ipv4/tcp_output.c:1512';
  frames.push({
    step: 4,
    label: 'skb_push() prepends TCP header (20B)',
    description:
      'skb_push(skb, 20) moves the data pointer backward by 20 bytes. Called inside ' +
      '__tcp_transmit_skb() (net/ipv4/tcp_output.c:1512), it returns a pointer to the new data ' +
      'position where the TCP header is written. The data region grows at the front. This is the key ' +
      'insight: skb_push allows zero-copy header prepending because headroom was pre-reserved.',
    highlights: ['skb-data-ptr', 'header-TCP'],
    data: cloneState(state),
  });

  // Frame 5: skb_push IP header
  state.layers[3].function = 'skb_push() - IP';
  state.skb.data -= IP_HLEN;
  state.headers[1].state = 'present';
  state.phase = 'push-ip';
  state.srcRef = 'net/ipv4/ip_output.c:463';
  frames.push({
    step: 5,
    label: 'skb_push() prepends IP header (20B)',
    description:
      'skb_push(skb, 20) moves data pointer back another 20 bytes for the IP header, called inside ' +
      `__ip_queue_xmit() (net/ipv4/ip_output.c:463). Headroom consumed so far: TCP (20) + IP (20) = 40 bytes. Remaining headroom: ${state.skb.data} bytes.`,
    highlights: ['skb-data-ptr', 'header-IP'],
    data: cloneState(state),
  });

  // Frame 6: skb_push Ethernet header
  state.layers[3].function = 'skb_push() - Ethernet';
  state.skb.data -= ETH_HLEN;
  state.headers[0].state = 'present';
  state.phase = 'push-eth';
  state.srcRef = 'net/core/dev.c:4760';
  frames.push({
    step: 6,
    label: 'skb_push() prepends Ethernet header (14B)',
    description:
      'skb_push(skb, 14) consumes the last 14 bytes of headroom for the Ethernet header in the device ' +
      'layer (__dev_queue_xmit() at net/core/dev.c:4760). Now data == head, meaning all headroom has been used. ' +
      'The complete frame is [Ethernet(14) | IP(20) | TCP(20) | Payload(5)] = 59 bytes.',
    highlights: ['skb-data-ptr', 'header-Ethernet'],
    data: cloneState(state),
  });

  // Frame 7: Packet transmitted, now simulate receive side
  state.layers[3].state = 'done';
  state.layers[4].state = 'active';
  state.layers[4].function = 'skb_pull() - Ethernet';
  state.currentLayer = 4;
  state.phase = 'pull-eth';
  state.srcRef = 'net/core/dev.c:6433';
  frames.push({
    step: 7,
    label: 'Receive side: packet arrives',
    description:
      'On the receive side, the inverse operations occur. The NIC DMA\'d the frame into a fresh skb ' +
      'allocated via __alloc_skb() (net/core/skbuff.c:672). netif_receive_skb() (net/core/dev.c:6433) ' +
      'dispatches it. Now each layer strips its header using skb_pull(), the symmetric counterpart to skb_push().',
    highlights: ['layer-Receive'],
    data: cloneState(state),
  });

  // Frame 8: skb_pull Ethernet
  state.skb.data += ETH_HLEN;
  state.headers[0].state = 'removed';
  state.phase = 'pull-eth-done';
  state.srcRef = 'net/ipv4/ip_input.c:564';
  frames.push({
    step: 8,
    label: 'skb_pull() strips Ethernet header (14B)',
    description:
      'skb_pull(skb, 14) advances data pointer by 14 bytes, logically removing the Ethernet header ' +
      'before passing the skb to ip_rcv() (net/ipv4/ip_input.c:564). The bytes are still in memory ' +
      '(between head and data) but are no longer part of the "active" packet data.',
    highlights: ['skb-data-ptr'],
    data: cloneState(state),
  });

  // Frame 9: skb_pull IP
  state.layers[4].function = 'skb_pull() - IP';
  state.skb.data += IP_HLEN;
  state.headers[1].state = 'removed';
  state.phase = 'pull-ip-done';
  state.srcRef = 'net/ipv4/ip_input.c:250';
  frames.push({
    step: 9,
    label: 'skb_pull() strips IP header (20B)',
    description:
      'skb_pull(skb, 20) advances past the IP header inside ip_local_deliver() (net/ipv4/ip_input.c:250). ' +
      'The transport layer now sees the TCP header at the start of the data region. Notice: head still ' +
      'points to the original start of the buffer.',
    highlights: ['skb-data-ptr'],
    data: cloneState(state),
  });

  // Frame 10: skb_pull TCP
  state.layers[4].function = 'skb_pull() - TCP';
  state.skb.data += TCP_HLEN;
  state.headers[2].state = 'removed';
  state.phase = 'pull-tcp-done';
  state.srcRef = 'net/ipv4/tcp_ipv4.c:2147';
  frames.push({
    step: 10,
    label: 'skb_pull() strips TCP header (20B)',
    description:
      'skb_pull(skb, 20) removes the TCP header inside tcp_v4_rcv() (net/ipv4/tcp_ipv4.c:2147). ' +
      'The data pointer now points directly at the payload. All three protocol headers have been stripped. ' +
      'The data region [data..tail) contains only "Hello".',
    highlights: ['skb-data-ptr', 'skb-payload'],
    data: cloneState(state),
  });

  // Frame 11: Data delivered to application
  state.layers[4].state = 'done';
  state.phase = 'delivered';
  state.srcRef = 'net/ipv4/tcp.c:2965';
  frames.push({
    step: 11,
    label: 'Payload delivered to application',
    description:
      'The payload data is copied from the skb to the user-space buffer via tcp_recvmsg() ' +
      '(net/ipv4/tcp.c:2965), triggered by __sys_recvfrom() (net/socket.c:2231). The skb has served ' +
      'its purpose: it carried the packet through every layer of the stack, with each layer manipulating ' +
      'only the pointers, never copying the actual data.',
    highlights: ['skb-payload'],
    data: cloneState(state),
  });

  // Frame 12: kfree_skb
  state.layers[5].state = 'active';
  state.layers[5].function = '__kfree_skb()';
  state.currentLayer = 5;
  state.skb = { head: 0, data: 0, tail: 0, end: 0 };
  state.headers = makeHeaders(); // reset to absent
  state.payload = '';
  state.phase = 'free';
  state.srcRef = 'net/core/skbuff.c:1215';
  frames.push({
    step: 12,
    label: '__kfree_skb() frees the buffer',
    description:
      '__kfree_skb() (net/core/skbuff.c:1215) decrements the reference count. When it reaches zero, ' +
      'the linear data buffer and the sk_buff metadata structure are freed back to the slab allocator ' +
      '(skbuff_cache). If the skb had fragments (scatter-gather), those are freed too. ' +
      'The packet\'s journey is complete.',
    highlights: [],
    data: cloneState(state),
  });

  return frames;
}

// ---- SVG Rendering ----

const NS = 'http://www.w3.org/2000/svg';

function createText(
  x: number, y: number, text: string, cls: string, anchor = 'start'
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
  x: number, y: number, w: number, h: number, cls: string, rx = 3
): SVGRectElement {
  const el = document.createElementNS(NS, 'rect');
  el.setAttribute('x', String(x));
  el.setAttribute('y', String(y));
  el.setAttribute('width', String(w));
  el.setAttribute('height', String(h));
  el.setAttribute('rx', String(rx));
  el.setAttribute('class', cls);
  return el;
}

function createLine(
  x1: number, y1: number, x2: number, y2: number, cls: string
): SVGLineElement {
  const el = document.createElementNS(NS, 'line');
  el.setAttribute('x1', String(x1));
  el.setAttribute('y1', String(y1));
  el.setAttribute('x2', String(x2));
  el.setAttribute('y2', String(y2));
  el.setAttribute('class', cls);
  return el;
}

const HEADER_COLORS: Record<string, string> = {
  Ethernet: 'anim-block-ethernet',
  IP: 'anim-block-ip',
  TCP: 'anim-block-tcp',
};

function renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void {
  while (container.firstChild) container.removeChild(container.firstChild);

  const data = frame.data as PacketState;
  const { skb, headers, layers, direction } = data;

  // Layout regions
  const layerColX = 10;
  const layerColW = 160;
  const skbX = 200;
  const skbW = 350;
  const packetX = 580;
  const packetW = 300;
  const topY = 30;

  // Title
  container.appendChild(
    createText(width / 2, 16, 'Network Packet Journey (sk_buff)', 'anim-title', 'middle')
  );

  // ---- Left column: Protocol stack layers ----
  const layerH = 60;
  const layerGap = 8;
  const totalLayerH = layers.length * layerH + (layers.length - 1) * layerGap;
  const layerStartY = topY + (height - topY - 40 - totalLayerH) / 2;

  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    const y = layerStartY + i * (layerH + layerGap);
    let cls = 'anim-block';
    if (layer.state === 'active') cls += ' anim-block-allocated anim-highlight';
    else if (layer.state === 'done') cls += ' anim-block-free';
    else cls += ' anim-block-free';

    if (frame.highlights.includes(`layer-${layer.name}`)) {
      cls += ' anim-highlight';
    }

    container.appendChild(createRect(layerColX, y, layerColW, layerH, cls));
    container.appendChild(
      createText(layerColX + layerColW / 2, y + 22, layer.name, 'anim-block-label', 'middle')
    );
    if (layer.function) {
      container.appendChild(
        createText(layerColX + layerColW / 2, y + 42, layer.function, 'anim-addr-marker', 'middle')
      );
    }
  }

  // Direction arrow
  const arrowX = layerColX + layerColW + 8;
  const arrowTop = layerStartY + 10;
  const arrowBottom = layerStartY + totalLayerH - 10;
  if (direction === 'send') {
    container.appendChild(createLine(arrowX, arrowTop, arrowX, arrowBottom, 'anim-block'));
    container.appendChild(createText(arrowX, arrowBottom + 14, 'v send', 'anim-addr-marker', 'middle'));
  } else {
    container.appendChild(createLine(arrowX, arrowBottom, arrowX, arrowTop, 'anim-block'));
    container.appendChild(createText(arrowX, arrowTop - 4, '^ recv', 'anim-addr-marker', 'middle'));
  }

  // ---- Center: sk_buff buffer visualization ----
  const bufY = topY + 20;
  const bufH = 50;
  const bufScale = skbW / SKB_BUF_SIZE;

  container.appendChild(
    createText(skbX + skbW / 2, bufY - 6, 'sk_buff buffer', 'anim-freelist-title', 'middle')
  );

  // Draw the full buffer outline
  container.appendChild(
    createRect(skbX, bufY, skbW, bufH, 'anim-block anim-block-free')
  );

  // Draw header regions within buffer if present
  if (skb.end > 0) {
    // Headroom region [head..data)
    if (skb.data > skb.head) {
      const hx = skbX + skb.head * bufScale;
      const hw = (skb.data - skb.head) * bufScale;
      // Show consumed headroom with header colors
      let offset = skb.head;
      for (const hdr of headers) {
        if (hdr.state === 'present' || hdr.state === 'building') {
          const hdrX = skbX + offset * bufScale;
          const hdrW = hdr.size * bufScale;
          if (offset >= skb.head && offset < skb.data) {
            // This header is in the headroom (send direction)
          } else {
            // Header is in active data area
            let hdrCls = `anim-block ${HEADER_COLORS[hdr.name] || 'anim-block-allocated'}`;
            if (frame.highlights.includes(`header-${hdr.name}`)) {
              hdrCls += ' anim-highlight';
            }
            container.appendChild(createRect(hdrX, bufY + 2, hdrW, bufH - 4, hdrCls));
            container.appendChild(
              createText(hdrX + hdrW / 2, bufY + bufH / 2 + 4, hdr.name, 'anim-block-label', 'middle')
            );
          }
        }
      }

      // Shade headroom
      if (hw > 0) {
        container.appendChild(
          createRect(hx, bufY, hw, bufH, 'anim-block anim-block-free')
        );
      }
    }

    // Active data region [data..tail) with colored segments
    if (skb.tail > skb.data) {
      let drawOffset = skb.data;

      // Draw headers in order of their position
      for (const hdr of headers) {
        if (hdr.state === 'present' || hdr.state === 'building' || hdr.state === 'processing') {
          const hdrX = skbX + drawOffset * bufScale;
          const hdrW = hdr.size * bufScale;
          let hdrCls = `anim-block ${HEADER_COLORS[hdr.name] || 'anim-block-allocated'}`;
          if (frame.highlights.includes(`header-${hdr.name}`)) {
            hdrCls += ' anim-highlight';
          }
          if (hdr.state === 'building') hdrCls += ' anim-block-allocated';
          container.appendChild(createRect(hdrX, bufY + 2, Math.max(hdrW, 1), bufH - 4, hdrCls));
          if (hdrW > 20) {
            container.appendChild(
              createText(hdrX + hdrW / 2, bufY + bufH / 2 + 4, hdr.name, 'anim-block-label', 'middle')
            );
          }
          drawOffset += hdr.size;
        }
      }

      // Payload
      if (data.payload && drawOffset < skb.tail) {
        const payX = skbX + drawOffset * bufScale;
        const payW = (skb.tail - drawOffset) * bufScale;
        let payCls = 'anim-block anim-block-allocated';
        if (frame.highlights.includes('skb-payload')) payCls += ' anim-highlight';
        container.appendChild(createRect(payX, bufY + 2, Math.max(payW, 1), bufH - 4, payCls));
        if (payW > 20) {
          container.appendChild(
            createText(payX + payW / 2, bufY + bufH / 2 + 4, `"${data.payload}"`, 'anim-block-label', 'middle')
          );
        }
      }
    }
  }

  // Pointer markers below the buffer
  const ptrY = bufY + bufH + 16;
  const pointers: Array<{ name: string; value: number; highlightId: string }> = [
    { name: 'head', value: skb.head, highlightId: 'skb-head' },
    { name: 'data', value: skb.data, highlightId: 'skb-data-ptr' },
    { name: 'tail', value: skb.tail, highlightId: 'skb-tail' },
    { name: 'end', value: skb.end, highlightId: 'skb-end' },
  ];

  for (const ptr of pointers) {
    if (skb.end === 0 && ptr.value === 0) continue; // skip if buffer not allocated
    const px = skbX + ptr.value * bufScale;
    const isHighlighted = frame.highlights.includes(ptr.highlightId);

    // Tick mark
    container.appendChild(
      createLine(px, bufY + bufH, px, bufY + bufH + 8, isHighlighted ? 'anim-highlight' : 'anim-block')
    );
    // Label
    container.appendChild(
      createText(px, ptrY + 4, `${ptr.name}=${ptr.value}`, isHighlighted ? 'anim-highlight' : 'anim-addr-marker', 'middle')
    );
  }

  // ---- Right column: Nested packet diagram ----
  const pktY = topY + 20;
  const pktBoxH = 36;
  const pktGap = 4;

  container.appendChild(
    createText(packetX + packetW / 2, pktY - 6, 'Packet Structure', 'anim-freelist-title', 'middle')
  );

  // Draw nested boxes for present headers + payload
  const presentHeaders = headers.filter(
    h => h.state === 'present' || h.state === 'building' || h.state === 'processing'
  );
  const nestCount = presentHeaders.length + (data.payload ? 1 : 0);
  const maxNestW = packetW - 10;

  for (let i = 0; i < presentHeaders.length; i++) {
    const hdr = presentHeaders[i];
    const nestInset = i * 14;
    const nx = packetX + nestInset;
    const ny = pktY + i * (pktBoxH + pktGap);
    const nw = maxNestW - nestInset * 2;
    let cls = `anim-block ${HEADER_COLORS[hdr.name] || 'anim-block-allocated'}`;
    if (frame.highlights.includes(`header-${hdr.name}`)) cls += ' anim-highlight';
    container.appendChild(createRect(nx, ny, Math.max(nw, 10), pktBoxH, cls));
    container.appendChild(
      createText(nx + 8, ny + 22, `${hdr.name} (${hdr.size}B)`, 'anim-block-label')
    );

    // Show key fields
    if (hdr.fields.length > 0 && nw > 100) {
      const fieldText = hdr.fields.slice(0, 2).map(f => `${f.name}:${f.value}`).join(' ');
      container.appendChild(
        createText(nx + nw - 4, ny + 22, fieldText, 'anim-addr-marker', 'end')
      );
    }
  }

  // Payload box
  if (data.payload) {
    const nestInset = presentHeaders.length * 14;
    const nx = packetX + nestInset;
    const ny = pktY + presentHeaders.length * (pktBoxH + pktGap);
    const nw = maxNestW - nestInset * 2;
    let cls = 'anim-block anim-block-allocated';
    if (frame.highlights.includes('skb-payload')) cls += ' anim-highlight';
    container.appendChild(createRect(nx, ny, Math.max(nw, 10), pktBoxH, cls));
    container.appendChild(
      createText(nx + 8, ny + 22, `Payload: "${data.payload}" (${PAYLOAD_SIZE}B)`, 'anim-block-label')
    );
  }

  // Source reference at bottom-left
  if (data.srcRef) {
    container.appendChild(
      createText(10, height - 8, data.srcRef, 'anim-addr-marker')
    );
  }

  // Phase label at bottom
  container.appendChild(
    createText(width / 2, height - 8, `Phase: ${data.phase}`, 'anim-freelist-title', 'middle')
  );
}

// ---- Module definition ----

const SCENARIOS: AnimationScenario[] = [
  { id: 'tcp-send', label: 'TCP Send Path (Application to Wire)' },
  { id: 'tcp-receive', label: 'TCP Receive Path (Wire to Application)' },
  { id: 'skb-lifecycle', label: 'sk_buff Lifecycle (push/pull/reserve)' },
];

const networkPacket: AnimationModule = {
  config: {
    id: 'network-packet',
    title: 'Network Packet Journey (sk_buff)',
    skillName: 'socket-layer',
  },

  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario) {
      case 'tcp-receive':
        return generateTcpReceiveFrames();
      case 'skb-lifecycle':
        return generateSkbLifecycleFrames();
      case 'tcp-send':
      default:
        return generateTcpSendFrames();
    }
  },

  renderFrame,
  getScenarios: () => SCENARIOS,
};

export default networkPacket;

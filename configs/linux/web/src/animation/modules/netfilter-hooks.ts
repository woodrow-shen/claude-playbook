import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

export interface NetfilterState {
  packet: { src: string; dst: string; proto: string; port: number };
  currentHook: string;
  hookIndex: number;
  registeredHooks: Array<{ hook: string; priority: number; name: string }>;
  nftChain: string | null;
  nftRules: Array<{ expressions: string[]; verdict: string }>;
  currentRule: number;
  conntrackState: string | null;
  verdict: string;
  currentFunction: string;
  phase: 'ingress' | 'prerouting' | 'routing' | 'forward' | 'input' | 'output' | 'postrouting' | 'nft-eval' | 'conntrack' | 'verdict';
  srcRef: string;
}

const DEFAULT_PACKET = { src: '10.0.0.1', dst: '10.0.0.2', proto: 'TCP', port: 80 };

const DEFAULT_HOOKS: NetfilterState['registeredHooks'] = [
  { hook: 'PREROUTING', priority: -300, name: 'conntrack' },
  { hook: 'PREROUTING', priority: -150, name: 'mangle' },
  { hook: 'PREROUTING', priority: -100, name: 'dnat' },
  { hook: 'FORWARD', priority: 0, name: 'filter' },
  { hook: 'POSTROUTING', priority: 100, name: 'snat' },
  { hook: 'POSTROUTING', priority: 300, name: 'conntrack_confirm' },
];

function cloneState(state: NetfilterState): NetfilterState {
  return {
    packet: { ...state.packet },
    currentHook: state.currentHook,
    hookIndex: state.hookIndex,
    registeredHooks: state.registeredHooks.map(h => ({ ...h })),
    nftChain: state.nftChain,
    nftRules: state.nftRules.map(r => ({ expressions: [...r.expressions], verdict: r.verdict })),
    currentRule: state.currentRule,
    conntrackState: state.conntrackState,
    verdict: state.verdict,
    currentFunction: state.currentFunction,
    phase: state.phase,
    srcRef: state.srcRef,
  };
}

function makeFrame(
  step: number,
  label: string,
  description: string,
  highlights: string[],
  state: NetfilterState,
): AnimationFrame {
  return { step, label, description, highlights, data: cloneState(state) };
}

// ---------------------------------------------------------------------------
// Scenario 1: packet-through-hooks
// ---------------------------------------------------------------------------
function generatePacketThroughHooksFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: NetfilterState = {
    packet: { ...DEFAULT_PACKET },
    currentHook: '',
    hookIndex: -1,
    registeredHooks: [...DEFAULT_HOOKS],
    nftChain: null,
    nftRules: [],
    currentRule: -1,
    conntrackState: null,
    verdict: '',
    currentFunction: 'ip_rcv',
    phase: 'ingress',
    srcRef: 'net/ipv4/ip_input.c:564',
  };

  // Frame 0: Packet arrives at ip_rcv()
  frames.push(makeFrame(0, 'Packet arrives at ip_rcv()',
    'ip_rcv() receives the sk_buff from the network device layer. It calls ip_rcv_core() for basic IP header validation, then invokes NF_HOOK with NF_INET_PRE_ROUTING.',
    ['ip_rcv'], state));

  // Frame 1: NF_HOOK PREROUTING invocation
  state.currentHook = 'PREROUTING';
  state.hookIndex = 0;
  state.phase = 'prerouting';
  state.currentFunction = 'NF_HOOK';
  state.srcRef = 'net/ipv4/ip_input.c:573';
  frames.push(makeFrame(1, 'NF_HOOK(NF_INET_PRE_ROUTING)',
    'ip_rcv() calls NF_HOOK(NFPROTO_IPV4, NF_INET_PRE_ROUTING, ..., ip_rcv_finish) at line 573. This macro invokes nf_hook() which checks if any hooks are registered for this protocol family and hook number.',
    ['prerouting-hook'], state));

  // Frame 2: nf_hook_slow iterates registered hooks
  state.currentFunction = 'nf_hook_slow';
  state.srcRef = 'net/netfilter/core.c:616';
  frames.push(makeFrame(2, 'nf_hook_slow() iterates PREROUTING hooks',
    'nf_hook_slow() at core.c:616 iterates through nf_hook_entries for PREROUTING. For each entry it calls nf_hook_entry_hookfn() and checks the verdict (NF_ACCEPT continues to next hook, NF_DROP frees the skb).',
    ['nf_hook_slow', 'prerouting-hooks'], state));

  // Frame 3: PREROUTING hooks return NF_ACCEPT
  state.verdict = 'NF_ACCEPT';
  state.currentFunction = 'ip_rcv_finish';
  state.srcRef = 'net/ipv4/ip_input.c:439';
  frames.push(makeFrame(3, 'PREROUTING verdict: NF_ACCEPT',
    'All registered PREROUTING hooks return NF_ACCEPT. nf_hook_slow() returns 1, causing the NF_HOOK macro to call the okfn callback ip_rcv_finish(). ip_rcv_finish() performs route lookup via ip_rcv_finish_core().',
    ['prerouting-accept'], state));

  // Frame 4: Routing decision
  state.phase = 'routing';
  state.currentFunction = 'ip_route_input_noref';
  state.srcRef = 'net/ipv4/ip_input.c:322';
  state.verdict = '';
  frames.push(makeFrame(4, 'Routing decision',
    'ip_rcv_finish_core() at ip_input.c:322 performs the routing lookup. The destination is not local, so the packet is marked for forwarding via ip_forward().',
    ['routing-decision'], state));

  // Frame 5: ip_forward() calls NF_HOOK(FORWARD)
  state.currentHook = 'FORWARD';
  state.hookIndex = 1;
  state.phase = 'forward';
  state.currentFunction = 'ip_forward';
  state.srcRef = 'net/ipv4/ip_forward.c:83';
  frames.push(makeFrame(5, 'ip_forward() enters FORWARD hook',
    'ip_forward() at ip_forward.c:83 decrements TTL, performs header checks, then calls NF_HOOK(NFPROTO_IPV4, NF_INET_FORWARD, ..., ip_forward_finish) at line 162.',
    ['forward-hook'], state));

  // Frame 6: nf_hook_slow iterates FORWARD hooks
  state.currentFunction = 'nf_hook_slow';
  state.srcRef = 'net/netfilter/core.c:622';
  frames.push(makeFrame(6, 'nf_hook_slow() iterates FORWARD hooks',
    'nf_hook_slow() loops through FORWARD hook entries at core.c:622. The filter table hook evaluates nftables rules. Each hook function returns a verdict that nf_hook_slow() checks against NF_VERDICT_MASK.',
    ['nf_hook_slow', 'forward-hooks'], state));

  // Frame 7: FORWARD verdict NF_ACCEPT
  state.verdict = 'NF_ACCEPT';
  state.currentFunction = 'ip_forward_finish';
  state.srcRef = 'net/ipv4/ip_forward.c:162';
  frames.push(makeFrame(7, 'FORWARD verdict: NF_ACCEPT',
    'FORWARD hooks return NF_ACCEPT. ip_forward_finish() is called as okfn. It calls dst_output() which leads to ip_output().',
    ['forward-accept'], state));

  // Frame 8: ip_output() calls NF_HOOK(POSTROUTING)
  state.currentHook = 'POSTROUTING';
  state.hookIndex = 2;
  state.phase = 'postrouting';
  state.currentFunction = 'ip_output';
  state.srcRef = 'net/ipv4/ip_output.c:428';
  state.verdict = '';
  frames.push(makeFrame(8, 'ip_output() enters POSTROUTING hook',
    'ip_output() at ip_output.c:428 calls NF_HOOK_COND(NFPROTO_IPV4, NF_INET_POST_ROUTING, ..., ip_finish_output) at line 422. This is the last netfilter hook before the packet leaves the host.',
    ['postrouting-hook'], state));

  // Frame 9: nf_hook_slow iterates POSTROUTING hooks
  state.currentFunction = 'nf_hook_slow';
  state.srcRef = 'net/netfilter/core.c:616';
  frames.push(makeFrame(9, 'nf_hook_slow() iterates POSTROUTING hooks',
    'nf_hook_slow() processes POSTROUTING hooks: SNAT (priority 100) and conntrack_confirm (priority 300). Each hook function is called via nf_hook_entry_hookfn() at core.c:623.',
    ['nf_hook_slow', 'postrouting-hooks'], state));

  // Frame 10: Packet leaves
  state.verdict = 'NF_ACCEPT';
  state.phase = 'verdict';
  state.currentFunction = 'ip_finish_output';
  state.srcRef = 'net/ipv4/ip_output.c:422';
  frames.push(makeFrame(10, 'Packet transmitted',
    'All POSTROUTING hooks return NF_ACCEPT. ip_finish_output() fragments if needed and calls ip_finish_output2() to send the packet to the neighbor layer and out the device.',
    ['packet-out'], state));

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario 2: nft-rule-evaluation
// ---------------------------------------------------------------------------
function generateNftRuleEvalFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const nftRules: NetfilterState['nftRules'] = [
    { expressions: ['nft_payload: dport', 'nft_cmp: eq 80'], verdict: 'NF_ACCEPT' },
    { expressions: ['nft_payload: saddr', 'nft_cmp: eq 10.0.0.0/24'], verdict: 'NF_ACCEPT' },
    { expressions: ['nft_payload: dport', 'nft_cmp: eq 443'], verdict: 'NF_DROP' },
  ];

  const state: NetfilterState = {
    packet: { ...DEFAULT_PACKET },
    currentHook: 'FORWARD',
    hookIndex: 1,
    registeredHooks: [...DEFAULT_HOOKS],
    nftChain: null,
    nftRules: [],
    currentRule: -1,
    conntrackState: null,
    verdict: '',
    currentFunction: 'nft_do_chain_ipv4',
    phase: 'nft-eval',
    srcRef: 'net/netfilter/nft_chain_filter.c:14',
  };

  // Frame 0: Hook dispatches to nft_do_chain_ipv4
  frames.push(makeFrame(0, 'Hook calls nft_do_chain_ipv4()',
    'nf_hook_slow() calls the registered hook function nft_do_chain_ipv4() at nft_chain_filter.c:14. This wrapper initializes nft_pktinfo from the skb and calls nft_do_chain().',
    ['nft_do_chain_ipv4'], state));

  // Frame 1: nft_do_chain entry
  state.currentFunction = 'nft_do_chain';
  state.nftChain = 'filter_forward';
  state.nftRules = nftRules.map(r => ({ expressions: [...r.expressions], verdict: r.verdict }));
  state.srcRef = 'net/netfilter/nf_tables_core.c:250';
  frames.push(makeFrame(1, 'nft_do_chain() begins rule evaluation',
    'nft_do_chain() at nf_tables_core.c:250 gets the chain from priv, selects the active rule blob based on gencursor, and starts iterating rules with nft_rule_dp_for_each_expr() at line 276.',
    ['nft_do_chain', 'rule-blob'], state));

  // Frame 2: First rule - payload extraction
  state.currentRule = 0;
  state.currentFunction = 'nft_payload_eval';
  state.srcRef = 'net/netfilter/nft_payload.c:159';
  frames.push(makeFrame(2, 'Rule 0: nft_payload_eval() extracts dport',
    'nft_payload_eval() at nft_payload.c:159 extracts the destination port from the TCP header into nft_regs. It reads priv->base (transport header), priv->offset, and priv->len to locate the field in the skb.',
    ['rule-0', 'nft_payload_eval'], state));

  // Frame 3: First rule - comparison
  state.currentFunction = 'nft_cmp_eval';
  state.srcRef = 'net/netfilter/nft_cmp.c:26';
  frames.push(makeFrame(3, 'Rule 0: nft_cmp_eval() compares dport == 80',
    'nft_cmp_eval() at nft_cmp.c:26 calls memcmp() on regs->data[priv->sreg] vs priv->data. For NFT_CMP_EQ, if d != 0 the expression sets verdict to NFT_BREAK (rule mismatch). Port 80 matches, so NFT_CONTINUE is kept.',
    ['rule-0', 'nft_cmp_eval'], state));

  // Frame 4: First rule matches - verdict NF_ACCEPT
  state.currentFunction = 'nft_do_chain';
  state.verdict = 'NF_ACCEPT';
  state.srcRef = 'net/netfilter/nf_tables_core.c:291';
  frames.push(makeFrame(4, 'Rule 0: verdict NF_ACCEPT',
    'All expressions in rule 0 returned NFT_CONTINUE, so regs.verdict.code is checked in the switch at nf_tables_core.c:291. The rule sets NF_ACCEPT, which matches NF_VERDICT_MASK at line 306 and nft_do_chain() returns NF_ACCEPT.',
    ['rule-0', 'verdict-accept'], state));

  // Frame 5: Second rule - payload extraction (saddr)
  state.currentRule = 1;
  state.verdict = '';
  state.currentFunction = 'nft_payload_eval';
  state.srcRef = 'net/netfilter/nft_payload.c:159';
  frames.push(makeFrame(5, 'Rule 1: nft_payload_eval() extracts saddr',
    'nft_payload_eval() extracts the source IP address from the network header. priv->base is set to NFT_PAYLOAD_NETWORK_HEADER, reading 4 bytes at the saddr offset into nft_regs.',
    ['rule-1', 'nft_payload_eval'], state));

  // Frame 6: Second rule - comparison (saddr)
  state.currentFunction = 'nft_cmp_eval';
  state.srcRef = 'net/netfilter/nft_cmp.c:26';
  frames.push(makeFrame(6, 'Rule 1: nft_cmp_eval() compares saddr',
    'nft_cmp_eval() compares the extracted source address against 10.0.0.0/24. The comparison uses NFT_CMP_EQ with a masked value. Source 10.0.0.1 is in range, so NFT_CONTINUE is preserved.',
    ['rule-1', 'nft_cmp_eval'], state));

  // Frame 7: Skip remaining rules, return verdict
  state.currentRule = -1;
  state.verdict = 'NF_ACCEPT';
  state.currentFunction = 'nft_do_chain';
  state.srcRef = 'net/netfilter/nf_tables_core.c:307';
  frames.push(makeFrame(7, 'nft_do_chain() returns NF_ACCEPT',
    'Rule 0 already set NF_ACCEPT. nft_do_chain() at nf_tables_core.c:307 returns regs.verdict.code. nf_hook_slow() receives NF_ACCEPT and continues to the next registered hook in the chain.',
    ['verdict-final'], state));

  // Frame 8: Back to nf_hook_slow
  state.currentFunction = 'nf_hook_slow';
  state.phase = 'verdict';
  state.srcRef = 'net/netfilter/core.c:624';
  frames.push(makeFrame(8, 'nf_hook_slow() continues after NF_ACCEPT',
    'nf_hook_slow() at core.c:624 receives NF_ACCEPT (case NF_ACCEPT: break), increments the hook index, and proceeds to the next hook entry or returns 1 to call the okfn callback.',
    ['nf_hook_slow', 'continue'], state));

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario 3: connection-tracking
// ---------------------------------------------------------------------------
function generateConnectionTrackingFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: NetfilterState = {
    packet: { ...DEFAULT_PACKET },
    currentHook: 'PREROUTING',
    hookIndex: 0,
    registeredHooks: [...DEFAULT_HOOKS],
    nftChain: null,
    nftRules: [],
    currentRule: -1,
    conntrackState: null,
    verdict: '',
    currentFunction: 'nf_hook_slow',
    phase: 'prerouting',
    srcRef: 'net/netfilter/core.c:616',
  };

  // Frame 0: nf_hook_slow calls conntrack at PREROUTING
  frames.push(makeFrame(0, 'PREROUTING invokes conntrack hook',
    'nf_hook_slow() at core.c:616 iterates PREROUTING hooks. The conntrack hook (priority -300) is the first to be called. It dispatches to nf_conntrack_in() for connection tracking.',
    ['prerouting', 'conntrack-hook'], state));

  // Frame 1: nf_conntrack_in entry
  state.currentFunction = 'nf_conntrack_in';
  state.phase = 'conntrack';
  state.srcRef = 'net/netfilter/nf_conntrack_core.c:2011';
  frames.push(makeFrame(1, 'nf_conntrack_in() entry',
    'nf_conntrack_in() at nf_conntrack_core.c:2011 is the main conntrack entry point. It extracts the L4 protocol number, checks for existing conntrack info on the skb, and calls resolve_normal_ct() at line 2047.',
    ['nf_conntrack_in'], state));

  // Frame 2: resolve_normal_ct
  state.currentFunction = 'resolve_normal_ct';
  state.srcRef = 'net/netfilter/nf_conntrack_core.c:1864';
  frames.push(makeFrame(2, 'resolve_normal_ct() builds tuple',
    'resolve_normal_ct() at nf_conntrack_core.c:1864 calls nf_ct_get_tuple() at line 1878 to build a conntrack tuple from the packet: source/destination addresses, L4 protocol, and ports.',
    ['resolve_normal_ct'], state));

  // Frame 3: nf_ct_get_tuple extracts fields
  state.currentFunction = 'nf_ct_get_tuple';
  state.srcRef = 'net/netfilter/nf_conntrack_core.c:267';
  frames.push(makeFrame(3, 'nf_ct_get_tuple() extracts packet fields',
    'nf_ct_get_tuple() at nf_conntrack_core.c:267 reads src/dst addresses from the IP header (NFPROTO_IPV4 case at line 283), then calls nf_ct_get_tuple_ports() at line 333 to extract L4 port numbers into the tuple struct.',
    ['nf_ct_get_tuple', 'tuple-build'], state));

  // Frame 4: Hash lookup
  state.currentFunction = 'hash_conntrack_raw';
  state.srcRef = 'net/netfilter/nf_conntrack_core.c:210';
  frames.push(makeFrame(4, 'Hash lookup in conntrack table',
    'resolve_normal_ct() computes hash_conntrack_raw() at nf_conntrack_core.c:210 over the tuple and zone ID. It calls __nf_conntrack_find_get() at line 1888 to look up the hash in the conntrack table. No existing entry is found.',
    ['hash-lookup', 'conntrack-table'], state));

  // Frame 5: init_conntrack for new connection
  state.currentFunction = 'init_conntrack';
  state.conntrackState = 'NEW';
  state.srcRef = 'net/netfilter/nf_conntrack_core.c:1759';
  frames.push(makeFrame(5, 'init_conntrack() creates new entry',
    'No matching entry found, so init_conntrack() at nf_conntrack_core.c:1759 is called at line 1900. It calls __nf_conntrack_alloc() at line 1780 to allocate a new nf_conn, inverts the tuple for the reply direction, and sets the conntrack state to NEW.',
    ['init_conntrack', 'new-connection'], state));

  // Frame 6: __nf_conntrack_alloc
  state.currentFunction = '__nf_conntrack_alloc';
  state.srcRef = 'net/netfilter/nf_conntrack_core.c:1658';
  frames.push(makeFrame(6, '__nf_conntrack_alloc() allocates nf_conn',
    '__nf_conntrack_alloc() at nf_conntrack_core.c:1658 allocates a new nf_conn struct from the conntrack slab cache. It initializes the original and reply tuples, sets the zone, and increments the net conntrack count.',
    ['nf_conntrack_alloc', 'slab-alloc'], state));

  // Frame 7: conntrack state set on skb
  state.currentFunction = 'resolve_normal_ct';
  state.srcRef = 'net/netfilter/nf_conntrack_core.c:1907';
  frames.push(makeFrame(7, 'Conntrack state attached to skb',
    'resolve_normal_ct() at nf_conntrack_core.c:1907 calls nf_ct_tuplehash_to_ctrack() to get the nf_conn from the hash entry. It sets skb->_nfct with the conntrack pointer and ctinfo=IP_CT_NEW. The packet is now tracked.',
    ['skb-nfct', 'ct-new'], state));

  // Frame 8: nf_conntrack_in returns NF_ACCEPT
  state.currentFunction = 'nf_conntrack_in';
  state.verdict = 'NF_ACCEPT';
  state.phase = 'verdict';
  state.srcRef = 'net/netfilter/nf_conntrack_core.c:2064';
  frames.push(makeFrame(8, 'nf_conntrack_in() returns NF_ACCEPT',
    'nf_conntrack_in() calls nf_conntrack_handle_packet() at line 2064 to run protocol-specific tracking. For a new TCP SYN, the state machine is initialized. The function returns NF_ACCEPT, allowing the packet to continue through remaining PREROUTING hooks.',
    ['nf_conntrack_in', 'accept'], state));

  return frames;
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------
function renderFrame(
  container: SVGGElement,
  frame: AnimationFrame,
  width: number,
  height: number,
): void {
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  const state = frame.data as NetfilterState;
  const ns = 'http://www.w3.org/2000/svg';

  // Title
  const title = document.createElementNS(ns, 'text');
  title.setAttribute('x', String(width / 2));
  title.setAttribute('y', '30');
  title.setAttribute('text-anchor', 'middle');
  title.setAttribute('font-size', '16');
  title.setAttribute('font-weight', 'bold');
  title.textContent = frame.label;
  container.appendChild(title);

  // Hook chain visualization
  const hooks = ['PREROUTING', 'INPUT', 'FORWARD', 'OUTPUT', 'POSTROUTING'];
  const hookY = 80;
  const hookSpacing = (width - 80) / hooks.length;

  for (let i = 0; i < hooks.length; i++) {
    const x = 40 + i * hookSpacing + hookSpacing / 2;
    const rect = document.createElementNS(ns, 'rect');
    rect.setAttribute('x', String(x - 40));
    rect.setAttribute('y', String(hookY));
    rect.setAttribute('width', '80');
    rect.setAttribute('height', '30');
    rect.setAttribute('rx', '4');
    rect.setAttribute('fill', hooks[i] === state.currentHook ? '#4a90d9' : '#ddd');
    rect.setAttribute('stroke', '#666');
    container.appendChild(rect);

    const label = document.createElementNS(ns, 'text');
    label.setAttribute('x', String(x));
    label.setAttribute('y', String(hookY + 20));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('font-size', '10');
    label.textContent = hooks[i];
    container.appendChild(label);
  }

  // Current function
  const funcText = document.createElementNS(ns, 'text');
  funcText.setAttribute('x', String(width / 2));
  funcText.setAttribute('y', String(hookY + 60));
  funcText.setAttribute('text-anchor', 'middle');
  funcText.setAttribute('font-size', '12');
  funcText.textContent = `Function: ${state.currentFunction}`;
  container.appendChild(funcText);

  // Source reference
  const srcText = document.createElementNS(ns, 'text');
  srcText.setAttribute('x', String(width / 2));
  srcText.setAttribute('y', String(hookY + 80));
  srcText.setAttribute('text-anchor', 'middle');
  srcText.setAttribute('font-size', '10');
  srcText.setAttribute('fill', '#666');
  srcText.textContent = state.srcRef;
  container.appendChild(srcText);

  // Packet info
  const pktText = document.createElementNS(ns, 'text');
  pktText.setAttribute('x', '20');
  pktText.setAttribute('y', String(height - 30));
  pktText.setAttribute('font-size', '10');
  pktText.textContent = `Packet: ${state.packet.src} -> ${state.packet.dst} ${state.packet.proto}:${state.packet.port}`;
  container.appendChild(pktText);

  // Verdict
  if (state.verdict) {
    const verdictText = document.createElementNS(ns, 'text');
    verdictText.setAttribute('x', String(width - 20));
    verdictText.setAttribute('y', String(height - 30));
    verdictText.setAttribute('text-anchor', 'end');
    verdictText.setAttribute('font-size', '12');
    verdictText.setAttribute('font-weight', 'bold');
    verdictText.setAttribute('fill', state.verdict === 'NF_DROP' ? '#d9534f' : '#5cb85c');
    verdictText.textContent = state.verdict;
    container.appendChild(verdictText);
  }
}

// ---------------------------------------------------------------------------
// Module definition
// ---------------------------------------------------------------------------
const SCENARIOS: AnimationScenario[] = [
  { id: 'packet-through-hooks', label: 'IPv4 Packet Through 5 Netfilter Hooks' },
  { id: 'nft-rule-evaluation', label: 'nftables Rule Evaluation (nft_do_chain)' },
  { id: 'connection-tracking', label: 'Connection Tracking (nf_conntrack_in)' },
];

const netfilterHooks: AnimationModule = {
  config: {
    id: 'netfilter-hooks',
    title: 'Netfilter Hook Architecture and nftables Evaluation',
    skillName: 'netfilter-and-nftables',
  },

  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario) {
      case 'nft-rule-evaluation':
        return generateNftRuleEvalFrames();
      case 'connection-tracking':
        return generateConnectionTrackingFrames();
      case 'packet-through-hooks':
      default:
        return generatePacketThroughHooksFrames();
    }
  },

  renderFrame,
  getScenarios: () => SCENARIOS,
};

export default netfilterHooks;

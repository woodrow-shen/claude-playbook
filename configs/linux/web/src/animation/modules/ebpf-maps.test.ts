import { describe, it, expect } from 'vitest';
import ebpfMaps from './ebpf-maps.js';
import type { EbpfMapsState } from './ebpf-maps.js';

describe('eBPF Maps & Helper Functions', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(ebpfMaps.config.id).toBe('ebpf-maps');
      expect(ebpfMaps.config.skillName).toBe('ebpf-maps-and-helpers');
      expect(ebpfMaps.config.title).toBe('BPF Maps & Helper Functions');
    });
  });

  describe('getScenarios', () => {
    it('returns 4 scenarios', () => {
      const scenarios = ebpfMaps.getScenarios();
      expect(scenarios.length).toBe(4);
      expect(scenarios.map(s => s.id)).toContain('hashmap-operations');
      expect(scenarios.map(s => s.id)).toContain('ringbuf-reserve-commit');
      expect(scenarios.map(s => s.id)).toContain('helper-call-dispatch');
      expect(scenarios.map(s => s.id)).toContain('bpf-f-cpu-flags');
    });

    it('bpf-f-cpu-flags scenario has v7.0 label', () => {
      const scenarios = ebpfMaps.getScenarios();
      const sc = scenarios.find(s => s.id === 'bpf-f-cpu-flags');
      expect(sc).toBeDefined();
      expect(sc!.label).toContain('v7.0');
      expect(sc!.label).toContain('BPF_F_CPU');
    });
  });

  describe('generateFrames - hashmap-operations (default)', () => {
    const frames = ebpfMaps.generateFrames('hashmap-operations');

    it('generates 8-12 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
      expect(frames.length).toBeLessThanOrEqual(12);
    });

    it('first frame has step 0', () => {
      expect(frames[0].step).toBe(0);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('data includes srcRef on all frames', () => {
      frames.forEach(f => {
        const data = f.data as EbpfMapsState;
        expect(data.srcRef).toBeDefined();
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });

    it('data includes phase', () => {
      const data = frames[0].data as EbpfMapsState;
      expect(data.phase).toBeDefined();
    });

    it('data includes mapType', () => {
      const data = frames[0].data as EbpfMapsState;
      expect(data.mapType).toBeDefined();
    });

    it('data includes buckets array', () => {
      const data = frames[0].data as EbpfMapsState;
      expect(Array.isArray(data.buckets)).toBe(true);
    });

    it('data includes ringBuffer object with producer and consumer pos', () => {
      const data = frames[0].data as EbpfMapsState;
      expect(data.ringBuffer).toBeDefined();
      expect(typeof data.ringBuffer.producerPos).toBe('number');
      expect(typeof data.ringBuffer.consumerPos).toBe('number');
    });

    it('data includes helperCalls', () => {
      const data = frames[0].data as EbpfMapsState;
      expect(Array.isArray(data.helperCalls)).toBe(true);
    });

    it('data includes currentKey and currentValue', () => {
      const data = frames[0].data as EbpfMapsState;
      expect(data.currentKey).toBeDefined();
      expect(data.currentValue).toBeDefined();
    });

    it('references htab_map_alloc in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('htab_map_alloc'));
      expect(hasRef).toBe(true);
    });

    it('references __htab_map_lookup_elem in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('__htab_map_lookup_elem'));
      expect(hasRef).toBe(true);
    });

    it('references htab_map_update_elem in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('htab_map_update_elem'));
      expect(hasRef).toBe(true);
    });

    it('references htab_map_delete_elem in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('htab_map_delete_elem'));
      expect(hasRef).toBe(true);
    });

    it('includes alloc phase', () => {
      const has = frames.some(f => (f.data as EbpfMapsState).phase === 'alloc');
      expect(has).toBe(true);
    });

    it('includes lookup phase', () => {
      const has = frames.some(f => (f.data as EbpfMapsState).phase === 'lookup');
      expect(has).toBe(true);
    });

    it('includes update phase', () => {
      const has = frames.some(f => (f.data as EbpfMapsState).phase === 'update');
      expect(has).toBe(true);
    });

    it('includes delete phase', () => {
      const has = frames.some(f => (f.data as EbpfMapsState).phase === 'delete');
      expect(has).toBe(true);
    });

    it('mapType is hash for this scenario', () => {
      frames.forEach(f => {
        const data = f.data as EbpfMapsState;
        expect(data.mapType).toBe('hash');
      });
    });

    it('buckets change during update operations', () => {
      const allocFrame = frames.find(f => (f.data as EbpfMapsState).phase === 'alloc');
      const updateFrame = frames.find(f => (f.data as EbpfMapsState).phase === 'update');
      expect(allocFrame).toBeDefined();
      expect(updateFrame).toBeDefined();
      const allocBuckets = (allocFrame!.data as EbpfMapsState).buckets;
      const updateBuckets = (updateFrame!.data as EbpfMapsState).buckets;
      const allocFilled = allocBuckets.filter(b => b.elements.length > 0).length;
      const updateFilled = updateBuckets.filter(b => b.elements.length > 0).length;
      expect(updateFilled).toBeGreaterThan(allocFilled);
    });
  });

  describe('generateFrames - default scenario', () => {
    it('returns frames when called without argument', () => {
      const frames = ebpfMaps.generateFrames();
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });
  });

  describe('generateFrames - ringbuf-reserve-commit', () => {
    const frames = ebpfMaps.generateFrames('ringbuf-reserve-commit');

    it('generates 8-12 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
      expect(frames.length).toBeLessThanOrEqual(12);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('has srcRef on all frames', () => {
      frames.forEach(f => {
        const data = f.data as EbpfMapsState;
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });

    it('references bpf_ringbuf_reserve in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('bpf_ringbuf_reserve'));
      expect(hasRef).toBe(true);
    });

    it('references bpf_ringbuf_submit in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('bpf_ringbuf_submit'));
      expect(hasRef).toBe(true);
    });

    it('references bpf_ringbuf_output in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('bpf_ringbuf_output'));
      expect(hasRef).toBe(true);
    });

    it('includes reserve phase', () => {
      const has = frames.some(f => (f.data as EbpfMapsState).phase === 'reserve');
      expect(has).toBe(true);
    });

    it('includes commit phase', () => {
      const has = frames.some(f => (f.data as EbpfMapsState).phase === 'commit');
      expect(has).toBe(true);
    });

    it('producer position advances during reserve', () => {
      const firstData = frames[0].data as EbpfMapsState;
      const reserveFrame = frames.find(f => (f.data as EbpfMapsState).phase === 'reserve');
      expect(reserveFrame).toBeDefined();
      const reserveData = reserveFrame!.data as EbpfMapsState;
      expect(reserveData.ringBuffer.producerPos).toBeGreaterThan(firstData.ringBuffer.producerPos);
    });

    it('consumer position advances during consume', () => {
      const consumeFrame = frames.find(f => (f.data as EbpfMapsState).phase === 'consume');
      if (consumeFrame) {
        const consumeData = consumeFrame.data as EbpfMapsState;
        expect(consumeData.ringBuffer.consumerPos).toBeGreaterThan(0);
      }
    });

    it('mapType is ringbuf for this scenario', () => {
      frames.forEach(f => {
        const data = f.data as EbpfMapsState;
        expect(data.mapType).toBe('ringbuf');
      });
    });
  });

  describe('generateFrames - helper-call-dispatch', () => {
    const frames = ebpfMaps.generateFrames('helper-call-dispatch');

    it('generates 8-12 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
      expect(frames.length).toBeLessThanOrEqual(12);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('has srcRef on all frames', () => {
      frames.forEach(f => {
        const data = f.data as EbpfMapsState;
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });

    it('references __bpf_call_base in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('__bpf_call_base'));
      expect(hasRef).toBe(true);
    });

    it('references bpf_get_current_pid_tgid in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('bpf_get_current_pid_tgid'));
      expect(hasRef).toBe(true);
    });

    it('references bpf_probe_read_kernel in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('bpf_probe_read_kernel'));
      expect(hasRef).toBe(true);
    });

    it('references bpf_map_lookup_elem in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('bpf_map_lookup_elem'));
      expect(hasRef).toBe(true);
    });

    it('includes dispatch phase', () => {
      const has = frames.some(f => (f.data as EbpfMapsState).phase === 'dispatch');
      expect(has).toBe(true);
    });

    it('includes call phase', () => {
      const has = frames.some(f => (f.data as EbpfMapsState).phase === 'call');
      expect(has).toBe(true);
    });

    it('helperCalls accumulate across frames', () => {
      const firstData = frames[0].data as EbpfMapsState;
      const lastData = frames[frames.length - 1].data as EbpfMapsState;
      expect(lastData.helperCalls.length).toBeGreaterThan(firstData.helperCalls.length);
    });
  });

  describe('generateFrames - bpf-f-cpu-flags (v7.0)', () => {
    const frames = ebpfMaps.generateFrames('bpf-f-cpu-flags');

    it('generates 8-12 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
      expect(frames.length).toBeLessThanOrEqual(12);
    });

    it('frames have sequential step numbers starting at 0', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('has non-empty srcRef on every frame', () => {
      frames.forEach(f => {
        const data = f.data as EbpfMapsState;
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });

    it('references BPF_F_CPU in at least one description', () => {
      const hasRef = frames.some(f => f.description.includes('BPF_F_CPU'));
      expect(hasRef).toBe(true);
    });

    it('references BPF_F_ALL_CPUS in at least one description', () => {
      const hasRef = frames.some(f => f.description.includes('BPF_F_ALL_CPUS'));
      expect(hasRef).toBe(true);
    });

    it('references the upper-32-bit CPU encoding', () => {
      // The description must explain that flags upper 32 bits encode the cpu number
      const hasRef = frames.some(f =>
        f.description.includes('upper 32') ||
        f.description.includes('>> 32') ||
        f.description.includes('<< 32')
      );
      expect(hasRef).toBe(true);
    });

    it('references a v7.0 kernel function that handles BPF_F_CPU', () => {
      // At least one frame should point at arraymap.c or hashtab.c
      const hasRef = frames.some(f => {
        const data = f.data as EbpfMapsState;
        return /kernel\/bpf\/(arraymap|hashtab)\.c/.test(data.srcRef);
      });
      expect(hasRef).toBe(true);
    });

    it('mentions the flag validation check', () => {
      const hasRef = frames.some(f =>
        f.description.includes('BPF_F_ALL_CPUS') &&
        (f.description.includes('EINVAL') || f.description.includes('invalid') || f.description.includes('reject'))
      );
      expect(hasRef).toBe(true);
    });

    it('exposes perCpuValues with 4 CPU slots', () => {
      const initial = frames[0].data as EbpfMapsState;
      expect(Array.isArray(initial.perCpuValues)).toBe(true);
      expect(initial.perCpuValues!.length).toBe(4);
    });

    it('updateMode transitions through current, cpu, and all_cpus', () => {
      const modes = new Set<string>();
      frames.forEach(f => {
        const data = f.data as EbpfMapsState;
        if (data.updateMode) modes.add(data.updateMode);
      });
      expect(modes.has('current')).toBe(true);
      expect(modes.has('cpu')).toBe(true);
      expect(modes.has('all_cpus')).toBe(true);
    });

    it('targetCpu is set in at least one cpu-mode frame', () => {
      const cpuFrame = frames.find(f => {
        const data = f.data as EbpfMapsState;
        return data.updateMode === 'cpu';
      });
      expect(cpuFrame).toBeDefined();
      const data = cpuFrame!.data as EbpfMapsState;
      expect(typeof data.targetCpu).toBe('number');
    });

    it('BPF_F_CPU mode leaves non-target CPUs unchanged', () => {
      // Find the frame where a specific CPU was targeted; other slots should differ from target
      const cpuFrame = frames.find(f => {
        const data = f.data as EbpfMapsState;
        return data.updateMode === 'cpu' && data.phase === 'applied';
      });
      if (cpuFrame) {
        const data = cpuFrame.data as EbpfMapsState;
        const target = data.targetCpu!;
        const targetVal = data.perCpuValues![target];
        const others = data.perCpuValues!.filter((_, i) => i !== target);
        // At least one other CPU slot should differ from the targeted value
        expect(others.some(v => v !== targetVal)).toBe(true);
      }
    });

    it('BPF_F_ALL_CPUS mode writes the same value to all CPU slots', () => {
      const allCpusFrame = frames.find(f => {
        const data = f.data as EbpfMapsState;
        return data.updateMode === 'all_cpus' && data.phase === 'applied';
      });
      expect(allCpusFrame).toBeDefined();
      const data = allCpusFrame!.data as EbpfMapsState;
      const first = data.perCpuValues![0];
      expect(data.perCpuValues!.every(v => v === first)).toBe(true);
    });

    it('mentions percpu hash maps applicability', () => {
      const hasRef = frames.some(f =>
        f.description.includes('percpu_hash') ||
        f.description.includes('PERCPU_HASH') ||
        f.description.includes('hash') && f.description.includes('percpu')
      );
      expect(hasRef).toBe(true);
    });
  });

  describe('renderFrame', () => {
    it('renders title text', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = ebpfMaps.generateFrames('hashmap-operations');
      ebpfMaps.renderFrame(svg, frames[0], 900, 480);
      const title = svg.querySelector('.anim-title');
      expect(title).not.toBeNull();
    });

    it('renders phase blocks', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = ebpfMaps.generateFrames('hashmap-operations');
      ebpfMaps.renderFrame(svg, frames[3], 900, 480);
      const blocks = svg.querySelectorAll('.anim-block');
      expect(blocks.length).toBeGreaterThan(0);
    });

    it('renders bucket visualization', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = ebpfMaps.generateFrames('hashmap-operations');
      ebpfMaps.renderFrame(svg, frames[3], 900, 480);
      const buckets = svg.querySelectorAll('.anim-bucket');
      expect(buckets.length).toBeGreaterThan(0);
    });

    it('renders ring buffer for ringbuf scenario', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = ebpfMaps.generateFrames('ringbuf-reserve-commit');
      ebpfMaps.renderFrame(svg, frames[3], 900, 480);
      const ringElems = svg.querySelectorAll('.anim-ring');
      expect(ringElems.length).toBeGreaterThan(0);
    });

    it('renders helper call entries', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = ebpfMaps.generateFrames('helper-call-dispatch');
      const midFrame = frames.find(f => (f.data as EbpfMapsState).helperCalls.length > 0);
      if (midFrame) {
        ebpfMaps.renderFrame(svg, midFrame, 900, 480);
        const calls = svg.querySelectorAll('.anim-helper-call');
        expect(calls.length).toBeGreaterThan(0);
      }
    });

    it('clears previous content on re-render', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = ebpfMaps.generateFrames('hashmap-operations');
      ebpfMaps.renderFrame(svg, frames[0], 900, 480);
      const countBefore = svg.childElementCount;
      ebpfMaps.renderFrame(svg, frames[1], 900, 480);
      expect(svg.childElementCount).toBeLessThanOrEqual(countBefore + 10);
    });

    it('renders highlight elements', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = ebpfMaps.generateFrames('hashmap-operations');
      const highlightFrame = frames.find(f => f.highlights.length > 0);
      if (highlightFrame) {
        ebpfMaps.renderFrame(svg, highlightFrame, 900, 480);
        const highlights = svg.querySelectorAll('.anim-highlight');
        expect(highlights.length).toBeGreaterThan(0);
      }
    });
  });
});

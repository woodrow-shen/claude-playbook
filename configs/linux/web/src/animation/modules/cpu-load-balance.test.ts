import { describe, it, expect } from 'vitest';
import cpuLoadBalance from './cpu-load-balance.js';
import type { CpuLoadBalanceState } from './cpu-load-balance.js';

describe('CPU Load Balance', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(cpuLoadBalance.config.id).toBe('cpu-load-balance');
      expect(cpuLoadBalance.config.skillName).toBe('cpu-topology-and-load-balancing');
      expect(cpuLoadBalance.config.title).toBe('CPU Topology & Load Balancing');
    });
  });

  describe('getScenarios', () => {
    it('returns 3 scenarios', () => {
      const scenarios = cpuLoadBalance.getScenarios();
      expect(scenarios.length).toBe(3);
      expect(scenarios.map(s => s.id)).toContain('sched-domain-hierarchy');
      expect(scenarios.map(s => s.id)).toContain('periodic-load-balance');
      expect(scenarios.map(s => s.id)).toContain('numa-balancing');
    });
  });

  describe('generateFrames - sched-domain-hierarchy (default)', () => {
    const frames = cpuLoadBalance.generateFrames('sched-domain-hierarchy');

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

    it('state includes phase field', () => {
      const data = frames[0].data as CpuLoadBalanceState;
      expect(data.phase).toBeDefined();
    });

    it('state includes cpus array with load info', () => {
      const data = frames[0].data as CpuLoadBalanceState;
      expect(Array.isArray(data.cpus)).toBe(true);
      expect(data.cpus.length).toBeGreaterThan(0);
      expect(data.cpus[0].id).toBeDefined();
      expect(data.cpus[0].load).toBeDefined();
    });

    it('state includes schedDomains', () => {
      const data = frames[0].data as CpuLoadBalanceState;
      expect(Array.isArray(data.schedDomains)).toBe(true);
    });

    it('state includes migrationPath', () => {
      const data = frames[0].data as CpuLoadBalanceState;
      expect(Array.isArray(data.migrationPath)).toBe(true);
    });

    it('state includes numaNodes', () => {
      const data = frames[0].data as CpuLoadBalanceState;
      expect(Array.isArray(data.numaNodes)).toBe(true);
    });

    it('state includes srcRef on all frames', () => {
      frames.forEach(f => {
        const data = f.data as CpuLoadBalanceState;
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });

    it('references build_sched_domains', () => {
      const hasRef = frames.some(f => f.description.includes('build_sched_domains'));
      expect(hasRef).toBe(true);
    });

    it('references sd_init', () => {
      const hasRef = frames.some(f => f.description.includes('sd_init'));
      expect(hasRef).toBe(true);
    });

    it('references build_overlap_sched_groups', () => {
      const hasRef = frames.some(f => f.description.includes('build_overlap_sched_groups'));
      expect(hasRef).toBe(true);
    });

    it('schedDomains grow as hierarchy is built', () => {
      const firstData = frames[0].data as CpuLoadBalanceState;
      const lastData = frames[frames.length - 1].data as CpuLoadBalanceState;
      expect(lastData.schedDomains.length).toBeGreaterThan(firstData.schedDomains.length);
    });

    it('includes topology-init phase', () => {
      const has = frames.some(f => {
        const d = f.data as CpuLoadBalanceState;
        return d.phase === 'topology-init';
      });
      expect(has).toBe(true);
    });

    it('includes domain-build phase', () => {
      const has = frames.some(f => {
        const d = f.data as CpuLoadBalanceState;
        return d.phase === 'domain-build';
      });
      expect(has).toBe(true);
    });

    it('includes group-build phase', () => {
      const has = frames.some(f => {
        const d = f.data as CpuLoadBalanceState;
        return d.phase === 'group-build';
      });
      expect(has).toBe(true);
    });
  });

  describe('generateFrames - default scenario', () => {
    it('returns frames when called without argument', () => {
      const frames = cpuLoadBalance.generateFrames();
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });
  });

  describe('generateFrames - periodic-load-balance', () => {
    const frames = cpuLoadBalance.generateFrames('periodic-load-balance');

    it('generates 8-12 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
      expect(frames.length).toBeLessThanOrEqual(12);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('references sched_balance_softirq', () => {
      const hasRef = frames.some(f => f.description.includes('sched_balance_softirq'));
      expect(hasRef).toBe(true);
    });

    it('references sched_balance_rq', () => {
      const hasRef = frames.some(f => f.description.includes('sched_balance_rq'));
      expect(hasRef).toBe(true);
    });

    it('references sched_balance_find_src_group', () => {
      const hasRef = frames.some(f => f.description.includes('sched_balance_find_src_group'));
      expect(hasRef).toBe(true);
    });

    it('references sched_balance_find_src_rq', () => {
      const hasRef = frames.some(f => f.description.includes('sched_balance_find_src_rq'));
      expect(hasRef).toBe(true);
    });

    it('references detach_tasks', () => {
      const hasRef = frames.some(f => f.description.includes('detach_tasks'));
      expect(hasRef).toBe(true);
    });

    it('includes balance-tick phase', () => {
      const has = frames.some(f => {
        const d = f.data as CpuLoadBalanceState;
        return d.phase === 'balance-tick';
      });
      expect(has).toBe(true);
    });

    it('includes find-busiest phase', () => {
      const has = frames.some(f => {
        const d = f.data as CpuLoadBalanceState;
        return d.phase === 'find-busiest';
      });
      expect(has).toBe(true);
    });

    it('includes migrate phase', () => {
      const has = frames.some(f => {
        const d = f.data as CpuLoadBalanceState;
        return d.phase === 'migrate';
      });
      expect(has).toBe(true);
    });

    it('migrationPath is populated during migration', () => {
      const migrateFrame = frames.find(f => {
        const d = f.data as CpuLoadBalanceState;
        return d.phase === 'migrate';
      });
      expect(migrateFrame).toBeDefined();
      const data = migrateFrame!.data as CpuLoadBalanceState;
      expect(data.migrationPath.length).toBeGreaterThan(0);
    });

    it('has srcRef on all frames', () => {
      frames.forEach(f => {
        const data = f.data as CpuLoadBalanceState;
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });
  });

  describe('generateFrames - numa-balancing', () => {
    const frames = cpuLoadBalance.generateFrames('numa-balancing');

    it('generates 8-12 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
      expect(frames.length).toBeLessThanOrEqual(12);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('references task_numa_fault', () => {
      const hasRef = frames.some(f => f.description.includes('task_numa_fault'));
      expect(hasRef).toBe(true);
    });

    it('references task_numa_find_cpu', () => {
      const hasRef = frames.some(f => f.description.includes('task_numa_find_cpu'));
      expect(hasRef).toBe(true);
    });

    it('references numa_migrate_preferred', () => {
      const hasRef = frames.some(f => f.description.includes('numa_migrate_preferred'));
      expect(hasRef).toBe(true);
    });

    it('references migrate_task_to', () => {
      const hasRef = frames.some(f => f.description.includes('migrate_task_to'));
      expect(hasRef).toBe(true);
    });

    it('numaNodes are populated', () => {
      const hasNodes = frames.some(f => {
        const d = f.data as CpuLoadBalanceState;
        return d.numaNodes.length > 0;
      });
      expect(hasNodes).toBe(true);
    });

    it('includes numa-fault phase', () => {
      const has = frames.some(f => {
        const d = f.data as CpuLoadBalanceState;
        return d.phase === 'numa-fault';
      });
      expect(has).toBe(true);
    });

    it('includes numa-migrate phase', () => {
      const has = frames.some(f => {
        const d = f.data as CpuLoadBalanceState;
        return d.phase === 'numa-migrate';
      });
      expect(has).toBe(true);
    });

    it('has srcRef on all frames', () => {
      frames.forEach(f => {
        const data = f.data as CpuLoadBalanceState;
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });
  });

  describe('renderFrame', () => {
    it('renders title text', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = cpuLoadBalance.generateFrames('sched-domain-hierarchy');
      cpuLoadBalance.renderFrame(svg, frames[0], 900, 480);
      const title = svg.querySelector('.anim-title');
      expect(title).not.toBeNull();
    });

    it('renders CPU elements', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = cpuLoadBalance.generateFrames('periodic-load-balance');
      cpuLoadBalance.renderFrame(svg, frames[3], 900, 480);
      const cpuElements = svg.querySelectorAll('.anim-cpu');
      expect(cpuElements.length).toBeGreaterThan(0);
    });

    it('renders domain layers', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = cpuLoadBalance.generateFrames('sched-domain-hierarchy');
      const lastFrame = frames[frames.length - 1];
      cpuLoadBalance.renderFrame(svg, lastFrame, 900, 480);
      const domains = svg.querySelectorAll('.anim-domain');
      expect(domains.length).toBeGreaterThan(0);
    });

    it('renders phase blocks', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = cpuLoadBalance.generateFrames('periodic-load-balance');
      cpuLoadBalance.renderFrame(svg, frames[3], 900, 480);
      const blocks = svg.querySelectorAll('.anim-block');
      expect(blocks.length).toBeGreaterThan(0);
    });

    it('clears previous content on re-render', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = cpuLoadBalance.generateFrames('sched-domain-hierarchy');
      cpuLoadBalance.renderFrame(svg, frames[0], 900, 480);
      const countBefore = svg.childElementCount;
      cpuLoadBalance.renderFrame(svg, frames[1], 900, 480);
      expect(svg.childElementCount).toBeLessThanOrEqual(countBefore + 10);
    });

    it('renders migration arrows for load balance scenario', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = cpuLoadBalance.generateFrames('periodic-load-balance');
      const migrateFrame = frames.find(f => {
        const d = f.data as CpuLoadBalanceState;
        return d.phase === 'migrate';
      });
      if (migrateFrame) {
        cpuLoadBalance.renderFrame(svg, migrateFrame, 900, 480);
        const arrows = svg.querySelectorAll('.anim-migration');
        expect(arrows.length).toBeGreaterThan(0);
      }
    });
  });
});

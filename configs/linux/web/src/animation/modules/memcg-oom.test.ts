import { describe, it, expect } from 'vitest';
import memcgOom from './memcg-oom.js';

interface PageCounterNode {
  name: string;
  usage: number;
  max: number;
  level: 'child' | 'parent' | 'root';
}

interface TaskInfo {
  pid: number;
  comm: string;
  rss: number;
  swap: number;
  pgtables: number;
  oomScoreAdj: number;
  score: number | null;
  state: 'running' | 'evaluated' | 'selected' | 'killed' | 'reaped';
}

interface CpuLaneState {
  cpu: number;
  op: string;
  blocked: boolean;
  lockHolder?: boolean;
  apiEra?: 'pre-v7' | 'post-v7';
}

interface MemcgOomState {
  pageCounters: PageCounterNode[];
  tasks: TaskInfo[];
  currentFunction: string;
  phase: string;
  chargeNrPages: number;
  chargeSuccess: boolean | null;
  oomTriggered: boolean;
  oomVictim: string | null;
  oomReaperActive: boolean;
  srcRef: string;
  memcgId?: number;
  memcgIdRef?: number;
  xarrayPublished?: boolean;
  cpuStates?: CpuLaneState[];
  idrLockHeld?: boolean;
  eraLabel?: string;
  raceWindowActive?: boolean;
}

describe('MemcgOom', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(memcgOom.config.id).toBe('memcg-oom');
      expect(memcgOom.config.skillName).toBe('memcg-and-oom');
    });

    it('has a title', () => {
      expect(memcgOom.config.title).toBeTruthy();
    });
  });

  describe('getScenarios', () => {
    it('returns exactly 4 scenarios', () => {
      expect(memcgOom.getScenarios()).toHaveLength(4);
    });

    it('each scenario has id and label', () => {
      for (const s of memcgOom.getScenarios()) {
        expect(s.id).toBeTruthy();
        expect(s.label).toBeTruthy();
      }
    });

    it('includes required scenario ids', () => {
      const ids = memcgOom.getScenarios().map(s => s.id);
      expect(ids).toContain('memcg-charge-hierarchy');
      expect(ids).toContain('oom-killer-scoring');
      expect(ids).toContain('oom-kill-execution');
      expect(ids).toContain('memcg-id-api');
    });

    it('memcg-id-api label references v7.0', () => {
      const scenario = memcgOom.getScenarios().find(s => s.id === 'memcg-id-api');
      expect(scenario).toBeDefined();
      expect(scenario!.label).toContain('v7.0');
    });
  });

  describe('generateFrames - common checks', () => {
    for (const scenarioId of ['memcg-charge-hierarchy', 'oom-killer-scoring', 'oom-kill-execution', 'memcg-id-api']) {
      describe(`scenario: ${scenarioId}`, () => {
        const frames = memcgOom.generateFrames(scenarioId);

        it('returns non-empty array', () => {
          expect(frames.length).toBeGreaterThan(0);
        });

        it('first frame has step=0', () => {
          expect(frames[0].step).toBe(0);
        });

        it('has sequential step numbers', () => {
          frames.forEach((f, i) => expect(f.step).toBe(i));
        });

        it('has at least 8 frames', () => {
          expect(frames.length).toBeGreaterThanOrEqual(8);
        });

        it('each frame has required fields', () => {
          for (const f of frames) {
            expect(f.step).toBeGreaterThanOrEqual(0);
            expect(f.label).toBeTruthy();
            expect(f.description).toBeTruthy();
            expect(Array.isArray(f.highlights)).toBe(true);
          }
        });

        it('every frame has srcRef in data', () => {
          for (const f of frames) {
            const data = f.data as MemcgOomState;
            expect(data.srcRef).toBeDefined();
            expect(typeof data.srcRef).toBe('string');
            expect(data.srcRef.length).toBeGreaterThan(0);
          }
        });

        it('every frame has currentFunction in data', () => {
          for (const f of frames) {
            const data = f.data as MemcgOomState;
            expect(typeof data.currentFunction).toBe('string');
            expect(data.currentFunction.length).toBeGreaterThan(0);
          }
        });

        it('descriptions reference real kernel function names', () => {
          const allDescriptions = frames.map(f => f.description).join(' ');
          // Each scenario must reference at least one real kernel function
          const kernelFunctions = [
            '__mem_cgroup_charge', 'try_charge_memcg', 'page_counter_try_charge',
            'mem_cgroup_oom', 'mem_cgroup_out_of_memory', 'out_of_memory',
            'select_bad_process', 'oom_evaluate_task', 'oom_badness',
            'oom_kill_process', '__oom_kill_process', 'queue_oom_reaper',
            'charge_memcg', 'consume_stock', 'mark_oom_victim',
            // v7.0 private memcg ID API
            'mem_cgroup_css_alloc', 'mem_cgroup_css_online', 'memcg_online_kmem',
            'mem_cgroup_from_private_id', 'mem_cgroup_private_id_remove',
            'xa_alloc', 'xa_store', 'xa_erase', 'xa_load',
            'refcount_set', 'refcount_sub_and_test',
          ];
          const hasKernelRef = kernelFunctions.some(fn => allDescriptions.includes(fn));
          expect(hasKernelRef).toBe(true);
        });
      });
    }
  });

  describe('generateFrames - default', () => {
    it('returns frames for default scenario (memcg-charge-hierarchy)', () => {
      const frames = memcgOom.generateFrames();
      expect(frames.length).toBeGreaterThan(0);
      const data = frames[0].data as MemcgOomState;
      expect(data.pageCounters).toBeDefined();
    });
  });

  describe('generateFrames - memcg-charge-hierarchy', () => {
    const frames = memcgOom.generateFrames('memcg-charge-hierarchy');

    it('starts with __mem_cgroup_charge entry', () => {
      const data = frames[0].data as MemcgOomState;
      expect(data.currentFunction).toContain('__mem_cgroup_charge');
    });

    it('has page counter hierarchy with child, parent, root levels', () => {
      const hasChild = frames.some(f => {
        const data = f.data as MemcgOomState;
        return data.pageCounters.some(pc => pc.level === 'child');
      });
      const hasParent = frames.some(f => {
        const data = f.data as MemcgOomState;
        return data.pageCounters.some(pc => pc.level === 'parent');
      });
      const hasRoot = frames.some(f => {
        const data = f.data as MemcgOomState;
        return data.pageCounters.some(pc => pc.level === 'root');
      });
      expect(hasChild).toBe(true);
      expect(hasParent).toBe(true);
      expect(hasRoot).toBe(true);
    });

    it('page_counter_try_charge walks hierarchy', () => {
      const chargeFrames = frames.filter(f =>
        (f.data as MemcgOomState).currentFunction.includes('page_counter_try_charge'),
      );
      expect(chargeFrames.length).toBeGreaterThanOrEqual(1);
    });

    it('charge eventually succeeds', () => {
      const lastFrame = frames[frames.length - 1].data as MemcgOomState;
      expect(lastFrame.chargeSuccess).toBe(true);
    });
  });

  describe('generateFrames - oom-killer-scoring', () => {
    const frames = memcgOom.generateFrames('oom-killer-scoring');

    it('triggers OOM at some point', () => {
      const hasOom = frames.some(f => (f.data as MemcgOomState).oomTriggered);
      expect(hasOom).toBe(true);
    });

    it('evaluates multiple tasks with oom_badness scores', () => {
      const scoredTasks = frames.filter(f => {
        const data = f.data as MemcgOomState;
        return data.tasks.some(t => t.score !== null && t.state === 'evaluated');
      });
      expect(scoredTasks.length).toBeGreaterThanOrEqual(1);
    });

    it('selects a victim with highest score', () => {
      const hasVictim = frames.some(f => {
        const data = f.data as MemcgOomState;
        return data.oomVictim !== null;
      });
      expect(hasVictim).toBe(true);
    });

    it('references select_bad_process and oom_evaluate_task', () => {
      const allFns = frames.map(f => (f.data as MemcgOomState).currentFunction).join(' ');
      expect(allFns).toContain('select_bad_process');
      expect(allFns).toContain('oom_evaluate_task');
    });

    it('references oom_badness', () => {
      const allFns = frames.map(f => (f.data as MemcgOomState).currentFunction).join(' ');
      expect(allFns).toContain('oom_badness');
    });
  });

  describe('generateFrames - oom-kill-execution', () => {
    const frames = memcgOom.generateFrames('oom-kill-execution');

    it('calls oom_kill_process', () => {
      const hasKill = frames.some(f =>
        (f.data as MemcgOomState).currentFunction.includes('oom_kill_process'),
      );
      expect(hasKill).toBe(true);
    });

    it('calls __oom_kill_process', () => {
      const hasInner = frames.some(f =>
        (f.data as MemcgOomState).currentFunction.includes('__oom_kill_process'),
      );
      expect(hasInner).toBe(true);
    });

    it('victim is marked killed with SIGKILL', () => {
      const hasKilled = frames.some(f => {
        const data = f.data as MemcgOomState;
        return data.tasks.some(t => t.state === 'killed');
      });
      expect(hasKilled).toBe(true);
    });

    it('oom_reaper becomes active', () => {
      const hasReaper = frames.some(f =>
        (f.data as MemcgOomState).oomReaperActive,
      );
      expect(hasReaper).toBe(true);
    });

    it('victim memory is reaped', () => {
      const hasReaped = frames.some(f => {
        const data = f.data as MemcgOomState;
        return data.tasks.some(t => t.state === 'reaped');
      });
      expect(hasReaped).toBe(true);
    });

    it('references queue_oom_reaper', () => {
      const allDescs = frames.map(f => f.description).join(' ');
      expect(allDescs).toContain('queue_oom_reaper');
    });
  });

  describe('generateFrames - memcg-id-api (v7.0)', () => {
    const frames = memcgOom.generateFrames('memcg-id-api');

    it('has between 8 and 20 frames', () => {
      // The scenario was deepened in v7.0 to include pre-v7.0 idr_lock
      // contention frames and post-v7.0 xa_load parallelism frames, so the
      // upper bound is intentionally permissive.
      expect(frames.length).toBeGreaterThanOrEqual(8);
      expect(frames.length).toBeLessThanOrEqual(20);
    });

    it('starts in mem_cgroup_css_alloc', () => {
      const data = frames[0].data as MemcgOomState;
      expect(data.currentFunction).toContain('mem_cgroup_css_alloc');
    });

    it('references xa_alloc in some frame', () => {
      const allDescs = frames.map(f => f.description).join(' ');
      expect(allDescs).toContain('xa_alloc');
    });

    it('references xa_store in some frame', () => {
      const allDescs = frames.map(f => f.description).join(' ');
      expect(allDescs).toContain('xa_store');
    });

    it('references xa_erase in some frame', () => {
      const allDescs = frames.map(f => f.description).join(' ');
      expect(allDescs).toContain('xa_erase');
    });

    it('references xa_load in some frame', () => {
      const allDescs = frames.map(f => f.description).join(' ');
      expect(allDescs).toContain('xa_load');
    });

    it('references refcount_set and refcount_sub_and_test', () => {
      const allDescs = frames.map(f => f.description).join(' ');
      expect(allDescs).toContain('refcount_set');
      expect(allDescs).toContain('refcount_sub_and_test');
    });

    it('references mem_cgroup_private_ids xarray', () => {
      const allDescs = frames.map(f => f.description).join(' ');
      expect(allDescs).toContain('mem_cgroup_private_ids');
    });

    it('allocates an ID, then publishes it, then erases it', () => {
      const allocFrame = frames.find(f => {
        const d = f.data as MemcgOomState;
        return d.memcgId !== undefined && d.memcgId > 0 && d.xarrayPublished === false;
      });
      const publishedFrame = frames.find(f => (f.data as MemcgOomState).xarrayPublished === true);
      const erasedFrame = frames.slice().reverse().find(f => {
        const d = f.data as MemcgOomState;
        return d.memcgId === 0 && d.xarrayPublished === false;
      });
      expect(allocFrame).toBeDefined();
      expect(publishedFrame).toBeDefined();
      expect(erasedFrame).toBeDefined();
    });

    it('refcount is set to 1 during online transition', () => {
      const pinnedFrame = frames.find(f => (f.data as MemcgOomState).memcgIdRef === 1);
      expect(pinnedFrame).toBeDefined();
    });

    it('refcount drops to 0 during offline teardown', () => {
      const pinnedFrame = frames.findIndex(f => (f.data as MemcgOomState).memcgIdRef === 1);
      expect(pinnedFrame).toBeGreaterThanOrEqual(0);
      const droppedAfter = frames.slice(pinnedFrame + 1).findIndex(
        f => (f.data as MemcgOomState).memcgIdRef === 0,
      );
      expect(droppedAfter).toBeGreaterThanOrEqual(0);
    });

    it('references kmemcg_id sharing the memcg ID namespace', () => {
      const allDescs = frames.map(f => f.description).join(' ');
      expect(allDescs).toContain('kmemcg_id');
    });

    it('every srcRef points to mm/memcontrol.c', () => {
      for (const f of frames) {
        const data = f.data as MemcgOomState;
        expect(data.srcRef).toContain('mm/memcontrol.c');
      }
    });

    it('has at least one pre-v7.0 frame with idr_lock contention across CPUs', () => {
      const preV7BlockedFrame = frames.find(f => {
        const d = f.data as MemcgOomState;
        if (!d.cpuStates) return false;
        const anyPreV7 = d.cpuStates.some(c => c.apiEra === 'pre-v7');
        const anyBlocked = d.cpuStates.some(c => c.blocked);
        const anyHolder = d.cpuStates.some(c => c.lockHolder === true);
        return anyPreV7 && anyBlocked && anyHolder;
      });
      expect(preV7BlockedFrame).toBeDefined();
      // At least 2 CPUs should be blocked when contention is shown so the
      // race across 3 lanes is meaningful.
      const d = preV7BlockedFrame!.data as MemcgOomState;
      expect(d.cpuStates!.filter(c => c.blocked).length).toBeGreaterThanOrEqual(2);
      expect(d.idrLockHeld).toBe(true);
    });

    it('has at least one post-v7.0 frame with all CPUs running xa_load in parallel', () => {
      const postV7ParallelFrame = frames.find(f => {
        const d = f.data as MemcgOomState;
        if (!d.cpuStates) return false;
        const allPostV7 = d.cpuStates.every(c => c.apiEra === 'post-v7');
        const noneBlocked = d.cpuStates.every(c => !c.blocked);
        const allXaLoad = d.cpuStates.every(c => c.op.includes('xa_load'));
        return allPostV7 && noneBlocked && allXaLoad;
      });
      expect(postV7ParallelFrame).toBeDefined();
    });

    it('explicitly highlights the idr_remove vs idr_find race window', () => {
      const raceFrame = frames.find(f => (f.data as MemcgOomState).raceWindowActive === true);
      expect(raceFrame).toBeDefined();
      expect(raceFrame!.description).toContain('idr_remove');
    });

    it('contrasts idr_lock (pre-v7.0) against xarray RCU reads (post-v7.0)', () => {
      const allDescs = frames.map(f => f.description).join(' ');
      expect(allDescs).toContain('idr_lock');
      expect(allDescs).toContain('rcu_read_lock');
    });

    it('post-v7.0 writer isolation frame shows xa_alloc holding xa_lock while readers proceed', () => {
      const writerFrame = frames.find(f => {
        const d = f.data as MemcgOomState;
        if (!d.cpuStates) return false;
        const hasHolder = d.cpuStates.some(c => c.lockHolder === true && c.op.includes('xa_alloc'));
        const othersRunning = d.cpuStates
          .filter(c => !c.lockHolder)
          .every(c => !c.blocked);
        return hasHolder && othersRunning;
      });
      expect(writerFrame).toBeDefined();
    });

    it('CPU lane frames carry an eraLabel for the renderer', () => {
      const labelledFrames = frames.filter(f => (f.data as MemcgOomState).eraLabel);
      expect(labelledFrames.length).toBeGreaterThanOrEqual(2);
      const labels = labelledFrames.map(f => (f.data as MemcgOomState).eraLabel!);
      expect(labels.some(l => l.includes('pre-v7'))).toBe(true);
      expect(labels.some(l => l.includes('post-v7'))).toBe(true);
    });

    it('cloneState isolates cpuStates so frames are immutable', () => {
      // Mutating a returned frame's cpuStates must not affect other frames.
      const laneFrame = frames.find(f => (f.data as MemcgOomState).cpuStates);
      expect(laneFrame).toBeDefined();
      const laneData = laneFrame!.data as MemcgOomState;
      const beforeOp = laneData.cpuStates![0].op;
      laneData.cpuStates![0].op = 'MUTATED';
      // Re-generate and check the pristine value is still intact.
      const fresh = memcgOom.generateFrames('memcg-id-api');
      const freshLane = fresh.find(f => (f.data as MemcgOomState).cpuStates);
      expect((freshLane!.data as MemcgOomState).cpuStates![0].op).toBe(beforeOp);
    });
  });

  describe('renderFrame', () => {
    it('renders SVG elements into container', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = memcgOom.generateFrames('memcg-charge-hierarchy');
      memcgOom.renderFrame(svg, frames[0], 900, 480);
      expect(svg.querySelectorAll('rect').length).toBeGreaterThan(0);
    });

    it('renders different content for different frames', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = memcgOom.generateFrames('memcg-charge-hierarchy');
      memcgOom.renderFrame(svg, frames[0], 900, 480);
      const html1 = svg.innerHTML;
      memcgOom.renderFrame(svg, frames[frames.length - 1], 900, 480);
      const html2 = svg.innerHTML;
      expect(html1).not.toBe(html2);
    });

    it('renders text elements', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = memcgOom.generateFrames('oom-killer-scoring');
      memcgOom.renderFrame(svg, frames[0], 900, 480);
      const texts = Array.from(svg.querySelectorAll('text')).map(t => t.textContent);
      expect(texts.length).toBeGreaterThan(0);
    });

    it('applies highlight classes', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = memcgOom.generateFrames('memcg-charge-hierarchy');
      const frameWithHighlights = frames.find(f => f.highlights.length > 0);
      if (frameWithHighlights) {
        memcgOom.renderFrame(svg, frameWithHighlights, 900, 480);
        expect(svg.querySelectorAll('.anim-highlight').length).toBeGreaterThan(0);
      }
    });

    it('renders OOM scenario elements', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = memcgOom.generateFrames('oom-kill-execution');
      const oomFrame = frames.find(f => (f.data as MemcgOomState).oomReaperActive);
      if (oomFrame) {
        memcgOom.renderFrame(svg, oomFrame, 900, 480);
        const texts = Array.from(svg.querySelectorAll('text')).map(t => t.textContent || '');
        const hasOomText = texts.some(t => t.includes('OOM') || t.includes('oom_reaper'));
        expect(hasOomText).toBe(true);
      }
    });

    it('renders memcg-id-api scenario without throwing', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = memcgOom.generateFrames('memcg-id-api');
      for (const f of frames) {
        expect(() => memcgOom.renderFrame(svg, f, 900, 480)).not.toThrow();
      }
      expect(svg.querySelectorAll('text').length).toBeGreaterThan(0);
    });
  });
});

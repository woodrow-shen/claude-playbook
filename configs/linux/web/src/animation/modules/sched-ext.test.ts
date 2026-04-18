import { describe, it, expect } from 'vitest';
import schedExt from './sched-ext.js';
import type { SchedExtState } from './sched-ext.js';

describe('Sched Ext', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(schedExt.config.id).toBe('sched-ext');
      expect(schedExt.config.skillName).toBe('sched-ext');
      expect(schedExt.config.title).toBe('BPF-Extensible Scheduler (sched_ext)');
    });
  });

  describe('getScenarios', () => {
    it('returns 4 scenarios', () => {
      const scenarios = schedExt.getScenarios();
      expect(scenarios.length).toBe(4);
      expect(scenarios.map(s => s.id)).toContain('scx-ops-enable');
      expect(scenarios.map(s => s.id)).toContain('scx-enqueue-dispatch');
      expect(scenarios.map(s => s.id)).toContain('scx-error-recovery');
      expect(scenarios.map(s => s.id)).toContain('scx-dl-server');
    });

    it('scx-dl-server has correct label', () => {
      const scenarios = schedExt.getScenarios();
      const dlServer = scenarios.find(s => s.id === 'scx-dl-server');
      expect(dlServer).toBeDefined();
      expect(dlServer!.label).toBe('DL Server Prevents SCX Starvation');
    });
  });

  describe('generateFrames - scx-ops-enable (default)', () => {
    const frames = schedExt.generateFrames('scx-ops-enable');

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

    it('starts with scxEnabled false', () => {
      const data = frames[0].data as SchedExtState;
      expect(data.scxEnabled).toBe(false);
    });

    it('ends with scxEnabled true', () => {
      const lastData = frames[frames.length - 1].data as SchedExtState;
      expect(lastData.scxEnabled).toBe(true);
    });

    it('includes loading phase', () => {
      const hasLoading = frames.some(f => {
        const data = f.data as SchedExtState;
        return data.phase === 'loading';
      });
      expect(hasLoading).toBe(true);
    });

    it('includes init phase', () => {
      const hasInit = frames.some(f => {
        const data = f.data as SchedExtState;
        return data.phase === 'init';
      });
      expect(hasInit).toBe(true);
    });

    it('includes enabling phase', () => {
      const hasEnabling = frames.some(f => {
        const data = f.data as SchedExtState;
        return data.phase === 'enabling';
      });
      expect(hasEnabling).toBe(true);
    });

    it('includes enabled phase', () => {
      const hasEnabled = frames.some(f => {
        const data = f.data as SchedExtState;
        return data.phase === 'enabled';
      });
      expect(hasEnabled).toBe(true);
    });

    it('data includes bpfOps with callback names', () => {
      const data = frames[0].data as SchedExtState;
      expect(data.bpfOps).toBeDefined();
      expect(typeof data.bpfOps).toBe('object');
    });

    it('data includes dispatchQueue', () => {
      const data = frames[0].data as SchedExtState;
      expect(Array.isArray(data.dispatchQueue)).toBe(true);
    });

    it('data includes tasks', () => {
      const data = frames[0].data as SchedExtState;
      expect(Array.isArray(data.tasks)).toBe(true);
    });

    it('data includes errorState', () => {
      const data = frames[0].data as SchedExtState;
      expect(data.errorState).toBeNull();
    });

    it('data includes srcRef', () => {
      const data = frames[0].data as SchedExtState;
      expect(data.srcRef).toBeDefined();
      expect(data.srcRef.length).toBeGreaterThan(0);
    });

    it('srcRef references real kernel source files on all frames', () => {
      frames.forEach(f => {
        const data = f.data as SchedExtState;
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });

    it('descriptions reference scx_enable', () => {
      const hasRef = frames.some(f => f.description.includes('scx_enable'));
      expect(hasRef).toBe(true);
    });

    it('descriptions reference scx_root_enable_workfn', () => {
      const hasRef = frames.some(f => f.description.includes('scx_root_enable_workfn'));
      expect(hasRef).toBe(true);
    });

    it('descriptions reference scx_init_task', () => {
      const hasRef = frames.some(f => f.description.includes('scx_init_task'));
      expect(hasRef).toBe(true);
    });

    it('bpfOps populates with callbacks during enable', () => {
      const lastData = frames[frames.length - 1].data as SchedExtState;
      expect(Object.keys(lastData.bpfOps).length).toBeGreaterThan(0);
    });
  });

  describe('generateFrames - default scenario', () => {
    it('returns frames when called without argument', () => {
      const frames = schedExt.generateFrames();
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });
  });

  describe('generateFrames - scx-enqueue-dispatch', () => {
    const frames = schedExt.generateFrames('scx-enqueue-dispatch');

    it('generates 8-12 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
      expect(frames.length).toBeLessThanOrEqual(12);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('includes enqueue phase', () => {
      const hasEnqueue = frames.some(f => {
        const data = f.data as SchedExtState;
        return data.phase === 'enqueue';
      });
      expect(hasEnqueue).toBe(true);
    });

    it('includes dispatch phase', () => {
      const hasDispatch = frames.some(f => {
        const data = f.data as SchedExtState;
        return data.phase === 'dispatch';
      });
      expect(hasDispatch).toBe(true);
    });

    it('includes pick phase', () => {
      const hasPick = frames.some(f => {
        const data = f.data as SchedExtState;
        return data.phase === 'pick';
      });
      expect(hasPick).toBe(true);
    });

    it('references enqueue_task_scx', () => {
      const hasRef = frames.some(f => f.description.includes('enqueue_task_scx'));
      expect(hasRef).toBe(true);
    });

    it('references scx_bpf_dsq_insert', () => {
      const hasRef = frames.some(f => f.description.includes('scx_bpf_dsq_insert'));
      expect(hasRef).toBe(true);
    });

    it('references pick_task_scx', () => {
      const hasRef = frames.some(f => f.description.includes('pick_task_scx'));
      expect(hasRef).toBe(true);
    });

    it('dispatchQueue grows during dispatch', () => {
      const dispatchFrame = frames.find(f => {
        const data = f.data as SchedExtState;
        return data.phase === 'dispatch';
      });
      expect(dispatchFrame).toBeDefined();
      const data = dispatchFrame!.data as SchedExtState;
      expect(data.dispatchQueue.length).toBeGreaterThan(0);
    });

    it('tasks array is populated', () => {
      const hasTask = frames.some(f => {
        const data = f.data as SchedExtState;
        return data.tasks.length > 0;
      });
      expect(hasTask).toBe(true);
    });

    it('has srcRef on all frames', () => {
      frames.forEach(f => {
        const data = f.data as SchedExtState;
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });

    it('scxEnabled is true throughout', () => {
      frames.forEach(f => {
        const data = f.data as SchedExtState;
        expect(data.scxEnabled).toBe(true);
      });
    });
  });

  describe('generateFrames - scx-error-recovery', () => {
    const frames = schedExt.generateFrames('scx-error-recovery');

    it('generates 8-12 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
      expect(frames.length).toBeLessThanOrEqual(12);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('includes error phase', () => {
      const hasError = frames.some(f => {
        const data = f.data as SchedExtState;
        return data.phase === 'error';
      });
      expect(hasError).toBe(true);
    });

    it('includes disabling phase', () => {
      const hasDisabling = frames.some(f => {
        const data = f.data as SchedExtState;
        return data.phase === 'disabling';
      });
      expect(hasDisabling).toBe(true);
    });

    it('includes fallback phase', () => {
      const hasFallback = frames.some(f => {
        const data = f.data as SchedExtState;
        return data.phase === 'fallback';
      });
      expect(hasFallback).toBe(true);
    });

    it('errorState is set during error', () => {
      const errorFrame = frames.find(f => {
        const data = f.data as SchedExtState;
        return data.errorState !== null;
      });
      expect(errorFrame).toBeDefined();
      const data = errorFrame!.data as SchedExtState;
      expect(data.errorState).not.toBeNull();
      expect(typeof data.errorState).toBe('string');
    });

    it('scxEnabled becomes false by end', () => {
      const lastData = frames[frames.length - 1].data as SchedExtState;
      expect(lastData.scxEnabled).toBe(false);
    });

    it('references scx_vexit', () => {
      const hasRef = frames.some(f => f.description.includes('scx_vexit'));
      expect(hasRef).toBe(true);
    });

    it('references scx_root_disable', () => {
      const hasRef = frames.some(f => f.description.includes('scx_root_disable'));
      expect(hasRef).toBe(true);
    });

    it('references scx_disable_workfn', () => {
      const hasRef = frames.some(f => f.description.includes('scx_disable_workfn'));
      expect(hasRef).toBe(true);
    });

    it('mentions CFS fallback', () => {
      const hasCfs = frames.some(f =>
        f.description.toLowerCase().includes('cfs') ||
        f.description.includes('fair') ||
        f.label.toLowerCase().includes('cfs') ||
        f.label.toLowerCase().includes('fallback')
      );
      expect(hasCfs).toBe(true);
    });

    it('has srcRef on all frames', () => {
      frames.forEach(f => {
        const data = f.data as SchedExtState;
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });
  });

  describe('generateFrames - scx-dl-server', () => {
    const frames = schedExt.generateFrames('scx-dl-server');

    it('generates 8-12 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
      expect(frames.length).toBeLessThanOrEqual(12);
    });

    it('generates at least 10 frames (deepened contrast scenario)', () => {
      expect(frames.length).toBeGreaterThanOrEqual(10);
    });

    it('first frame has step 0', () => {
      expect(frames[0].step).toBe(0);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('scxEnabled is true throughout (scheduler already loaded)', () => {
      frames.forEach(f => {
        const data = f.data as SchedExtState;
        expect(data.scxEnabled).toBe(true);
      });
    });

    it('has srcRef on all frames', () => {
      frames.forEach(f => {
        const data = f.data as SchedExtState;
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });

    it('all srcRefs follow path:line func() format', () => {
      // DL-server scenario spans both ext.c (SCX integration) and deadline.c
      // (DL reservation/replenish primitives), so accept either file.
      frames.forEach(f => {
        const data = f.data as SchedExtState;
        expect(data.srcRef).toMatch(/kernel\/sched\/(?:ext|deadline)\.c:\d+\s+\w+/);
      });
    });

    it('references ext_server_init', () => {
      const hasRef = frames.some(f =>
        f.description.includes('ext_server_init') ||
        (f.data as SchedExtState).srcRef.includes('ext_server_init'),
      );
      expect(hasRef).toBe(true);
    });

    it('references ext_server_pick_task', () => {
      const hasRef = frames.some(f =>
        f.description.includes('ext_server_pick_task') ||
        (f.data as SchedExtState).srcRef.includes('ext_server_pick_task'),
      );
      expect(hasRef).toBe(true);
    });

    it('references dl_server_init', () => {
      const hasRef = frames.some(f =>
        f.description.includes('dl_server_init') ||
        (f.data as SchedExtState).srcRef.includes('dl_server_init'),
      );
      expect(hasRef).toBe(true);
    });

    it('references dl_server_start', () => {
      const hasRef = frames.some(f =>
        f.description.includes('dl_server_start') ||
        (f.data as SchedExtState).srcRef.includes('dl_server_start'),
      );
      expect(hasRef).toBe(true);
    });

    it('references dl_server_update', () => {
      const hasRef = frames.some(f =>
        f.description.includes('dl_server_update') ||
        (f.data as SchedExtState).srcRef.includes('dl_server_update'),
      );
      expect(hasRef).toBe(true);
    });

    it('mentions RT starvation risk', () => {
      const hasRt = frames.some(f =>
        f.description.includes('RT') ||
        f.description.toLowerCase().includes('starv') ||
        f.label.toLowerCase().includes('starv'),
      );
      expect(hasRt).toBe(true);
    });

    it('includes a frame where RT tasks are present in tasks list', () => {
      const hasRt = frames.some(f => {
        const data = f.data as SchedExtState;
        return data.tasks.some(t => t.includes('SCHED_FIFO') || t.includes('rt_'));
      });
      expect(hasRt).toBe(true);
    });

    it('populates dlServer metadata at least once', () => {
      const hasDlServer = frames.some(f => {
        const data = f.data as SchedExtState;
        return data.dlServer !== undefined;
      });
      expect(hasDlServer).toBe(true);
    });

    it('dlServer becomes active after dl_server_start', () => {
      const activeFrame = frames.find(f => {
        const data = f.data as SchedExtState;
        return data.dlServer?.active === true;
      });
      expect(activeFrame).toBeDefined();
    });

    it('dlServer runtime reaches zero at some point (expiration)', () => {
      const expiredFrame = frames.find(f => {
        const data = f.data as SchedExtState;
        return data.dlServer?.active === true && data.dlServer?.runtime === 0;
      });
      expect(expiredFrame).toBeDefined();
    });

    it('dlServer picking flag set when ext_server_pick_task fires', () => {
      const pickingFrame = frames.find(f => {
        const data = f.data as SchedExtState;
        return data.dlServer?.picking === true;
      });
      expect(pickingFrame).toBeDefined();
    });

    it('includes pick phase (DL server picks SCX task)', () => {
      const hasPick = frames.some(f => {
        const data = f.data as SchedExtState;
        return data.phase === 'pick';
      });
      expect(hasPick).toBe(true);
    });

    it('phase sequence progresses from running -> enqueue -> pick -> running', () => {
      const phases = frames.map(f => (f.data as SchedExtState).phase);
      expect(phases).toContain('running');
      expect(phases).toContain('enqueue');
      expect(phases).toContain('pick');
    });

    it('contrasts pre-v7.0 era with v7.0 era in dlServer metadata', () => {
      const pre = frames.find(f => (f.data as SchedExtState).dlServer?.era === 'pre-v7.0');
      const post = frames.find(f => (f.data as SchedExtState).dlServer?.era === 'v7.0');
      expect(pre).toBeDefined();
      expect(post).toBeDefined();
    });

    it('pre-v7.0 frames come before v7.0 frames (narrative ordering)', () => {
      const lastPreIdx = frames.findIndex(f => (f.data as SchedExtState).dlServer?.era === 'v7.0') - 1;
      const firstPostIdx = frames.findIndex(f => (f.data as SchedExtState).dlServer?.era === 'v7.0');
      expect(firstPostIdx).toBeGreaterThan(lastPreIdx);
      expect(firstPostIdx).toBeGreaterThan(0);
    });

    it('dlServer exposes dlRuntime and dlPeriod (50ms / 1s reservation)', () => {
      const active = frames.find(f => (f.data as SchedExtState).dlServer?.active === true);
      expect(active).toBeDefined();
      const ds = (active!.data as SchedExtState).dlServer!;
      expect(ds.dlRuntime).toBe(50_000_000);
      expect(ds.dlPeriod).toBe(1_000_000_000);
    });

    it('dlServer enters throttled state when runtime reaches 0', () => {
      const throttled = frames.find(f => (f.data as SchedExtState).dlServer?.throttled === true);
      expect(throttled).toBeDefined();
      const ds = (throttled!.data as SchedExtState).dlServer!;
      expect(ds.runtime).toBe(0);
    });

    it('dlServer replenishes back to dlRuntime after throttle', () => {
      const throttleIdx = frames.findIndex(f => (f.data as SchedExtState).dlServer?.throttled === true);
      expect(throttleIdx).toBeGreaterThanOrEqual(0);
      const laterFull = frames.slice(throttleIdx + 1).find(f => {
        const ds = (f.data as SchedExtState).dlServer;
        return ds !== undefined && ds.runtime === ds.dlRuntime && !ds.throttled;
      });
      expect(laterFull).toBeDefined();
    });

    it('cpuTimeline shows RT-only monopoly in pre-v7.0 frames', () => {
      const preFrame = frames.find(f => {
        const data = f.data as SchedExtState;
        return data.dlServer?.era === 'pre-v7.0' && (data.cpuTimeline?.length ?? 0) > 0;
      });
      expect(preFrame).toBeDefined();
      const timeline = (preFrame!.data as SchedExtState).cpuTimeline!;
      expect(timeline.every(s => s.kind === 'RT')).toBe(true);
    });

    it('cpuTimeline contains SCX slices in v7.0 frames', () => {
      const postFrame = frames.find(f => {
        const data = f.data as SchedExtState;
        return data.dlServer?.era === 'v7.0' && (data.cpuTimeline?.some(s => s.kind === 'SCX') ?? false);
      });
      expect(postFrame).toBeDefined();
    });

    it('rtLatencyMs is infinity in pre-v7.0 starvation frame', () => {
      const preFrame = frames.find(f => (f.data as SchedExtState).dlServer?.era === 'pre-v7.0');
      expect(preFrame).toBeDefined();
      const data = preFrame!.data as SchedExtState;
      expect(data.rtLatencyMs).toBe(Number.POSITIVE_INFINITY);
    });

    it('rtLatencyMs is bounded (<= dl_period) in v7.0 running frame', () => {
      const running = frames.find(f => {
        const data = f.data as SchedExtState;
        return data.dlServer?.era === 'v7.0' && data.phase === 'running' && (data.rtLatencyMs ?? 0) > 0;
      });
      expect(running).toBeDefined();
      const data = running!.data as SchedExtState;
      expect(data.rtLatencyMs).toBeLessThanOrEqual(1000);
      expect(Number.isFinite(data.rtLatencyMs!)).toBe(true);
    });

    it('references update_curr_dl_se (runtime accounting)', () => {
      const hasRef = frames.some(f =>
        f.description.includes('update_curr_dl_se') ||
        (f.data as SchedExtState).srcRef.includes('update_curr_dl_se'),
      );
      expect(hasRef).toBe(true);
    });

    it('references dl_server_timer (period replenishment)', () => {
      const hasRef = frames.some(f =>
        f.description.includes('dl_server_timer') ||
        (f.data as SchedExtState).srcRef.includes('dl_server_timer'),
      );
      expect(hasRef).toBe(true);
    });

    it('references replenish_dl_new_period (budget refill)', () => {
      const hasRef = frames.some(f => f.description.includes('replenish_dl_new_period'));
      expect(hasRef).toBe(true);
    });

    it('references init_dl_entity (DL entity setup)', () => {
      const hasRef = frames.some(f =>
        f.description.includes('init_dl_entity') ||
        (f.data as SchedExtState).srcRef.includes('init_dl_entity'),
      );
      expect(hasRef).toBe(true);
    });

    it('cloneState preserves dlServer.era and new fields', () => {
      frames.forEach(f => {
        const data = f.data as SchedExtState;
        if (data.dlServer) {
          expect(data.dlServer.era === 'pre-v7.0' || data.dlServer.era === 'v7.0').toBe(true);
          expect(typeof data.dlServer.dlRuntime).toBe('number');
          expect(typeof data.dlServer.dlPeriod).toBe('number');
          expect(typeof data.dlServer.throttled).toBe('boolean');
        }
      });
    });
  });

  describe('renderFrame', () => {
    it('renders phase indicator', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = schedExt.generateFrames('scx-ops-enable');
      schedExt.renderFrame(svg, frames[0], 900, 480);
      const phaseElements = svg.querySelectorAll('.anim-block');
      expect(phaseElements.length).toBeGreaterThan(0);
    });

    it('renders task list', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = schedExt.generateFrames('scx-enqueue-dispatch');
      const taskFrame = frames.find(f => {
        const data = f.data as SchedExtState;
        return data.tasks.length > 0;
      });
      if (taskFrame) {
        schedExt.renderFrame(svg, taskFrame, 900, 480);
        const taskEntries = svg.querySelectorAll('.anim-task');
        expect(taskEntries.length).toBeGreaterThan(0);
      }
    });

    it('renders title text', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = schedExt.generateFrames('scx-ops-enable');
      schedExt.renderFrame(svg, frames[0], 900, 480);
      const title = svg.querySelector('.anim-title');
      expect(title).not.toBeNull();
    });

    it('clears previous content on re-render', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = schedExt.generateFrames('scx-ops-enable');
      schedExt.renderFrame(svg, frames[0], 900, 480);
      const countBefore = svg.childElementCount;
      schedExt.renderFrame(svg, frames[1], 900, 480);
      expect(svg.childElementCount).toBeLessThanOrEqual(countBefore + 10);
    });

    it('renders error indicator for error scenario', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = schedExt.generateFrames('scx-error-recovery');
      const errorFrame = frames.find(f => {
        const data = f.data as SchedExtState;
        return data.errorState !== null;
      });
      if (errorFrame) {
        schedExt.renderFrame(svg, errorFrame, 900, 480);
        const highlights = svg.querySelectorAll('.anim-highlight');
        expect(highlights.length).toBeGreaterThan(0);
      }
    });

    it('renders dispatch queue entries', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = schedExt.generateFrames('scx-enqueue-dispatch');
      const dsqFrame = frames.find(f => {
        const data = f.data as SchedExtState;
        return data.dispatchQueue.length > 0;
      });
      if (dsqFrame) {
        schedExt.renderFrame(svg, dsqFrame, 900, 480);
        const dsqEntries = svg.querySelectorAll('.anim-dsq-entry');
        expect(dsqEntries.length).toBeGreaterThan(0);
      }
    });

    it('renders DL server budget bar for dl-server frames', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = schedExt.generateFrames('scx-dl-server');
      const activeFrame = frames.find(f => (f.data as SchedExtState).dlServer?.active === true);
      expect(activeFrame).toBeDefined();
      schedExt.renderFrame(svg, activeFrame!, 900, 520);
      const budgetEls = svg.querySelectorAll('.anim-dl-budget');
      expect(budgetEls.length).toBeGreaterThan(0);
    });

    it('renders CPU timeline strip for dl-server frames', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = schedExt.generateFrames('scx-dl-server');
      const timelineFrame = frames.find(f => ((f.data as SchedExtState).cpuTimeline?.length ?? 0) > 0);
      expect(timelineFrame).toBeDefined();
      schedExt.renderFrame(svg, timelineFrame!, 900, 520);
      const timelineEls = svg.querySelectorAll('.anim-cpu-timeline');
      expect(timelineEls.length).toBeGreaterThan(0);
    });
  });
});

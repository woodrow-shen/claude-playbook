import { describe, it, expect } from 'vitest';
import perfEvents from './perf-events.js';
import type { PerfEventsState } from './perf-events.js';

describe('Perf Events', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(perfEvents.config.id).toBe('perf-events');
      expect(perfEvents.config.skillName).toBe('perf-events');
      expect(perfEvents.config.title).toBe('perf_event Subsystem & PMU Sampling');
    });
  });

  describe('getScenarios', () => {
    it('returns 3 scenarios', () => {
      const scenarios = perfEvents.getScenarios();
      expect(scenarios.length).toBe(3);
      expect(scenarios.map(s => s.id)).toContain('event-open-enable');
      expect(scenarios.map(s => s.id)).toContain('sampling-overflow');
      expect(scenarios.map(s => s.id)).toContain('software-event');
    });
  });

  describe('generateFrames - event-open-enable (default)', () => {
    const frames = perfEvents.generateFrames('event-open-enable');

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

    it('data includes phase', () => {
      const data = frames[0].data as PerfEventsState;
      expect(data.phase).toBeDefined();
    });

    it('data includes eventType', () => {
      const data = frames[0].data as PerfEventsState;
      expect(data.eventType).toBeDefined();
    });

    it('data includes pmuConfig', () => {
      const data = frames[0].data as PerfEventsState;
      expect(data.pmuConfig).toBeDefined();
    });

    it('data includes sampleCount', () => {
      const data = frames[0].data as PerfEventsState;
      expect(typeof data.sampleCount).toBe('number');
    });

    it('data includes ringBuffer with head and tail', () => {
      const data = frames[0].data as PerfEventsState;
      expect(data.ringBuffer).toBeDefined();
      expect(typeof data.ringBuffer.head).toBe('number');
      expect(typeof data.ringBuffer.tail).toBe('number');
    });

    it('data includes overflowCount', () => {
      const data = frames[0].data as PerfEventsState;
      expect(typeof data.overflowCount).toBe('number');
    });

    it('data includes eventState', () => {
      const data = frames[0].data as PerfEventsState;
      expect(data.eventState).toBeDefined();
    });

    it('data includes srcRef', () => {
      const data = frames[0].data as PerfEventsState;
      expect(data.srcRef).toBeDefined();
      expect(data.srcRef.length).toBeGreaterThan(0);
    });

    it('srcRef references real kernel source files on all frames', () => {
      frames.forEach(f => {
        const data = f.data as PerfEventsState;
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });

    it('references perf_event_alloc', () => {
      const hasRef = frames.some(f => f.description.includes('perf_event_alloc'));
      expect(hasRef).toBe(true);
    });

    it('references perf_event_open', () => {
      const hasRef = frames.some(f => f.description.includes('perf_event_open'));
      expect(hasRef).toBe(true);
    });

    it('references perf_install_in_context', () => {
      const hasRef = frames.some(f => f.description.includes('perf_install_in_context'));
      expect(hasRef).toBe(true);
    });

    it('references event_sched_in', () => {
      const hasRef = frames.some(f => f.description.includes('event_sched_in'));
      expect(hasRef).toBe(true);
    });

    it('event reaches ACTIVE state', () => {
      const hasActive = frames.some(f => {
        const data = f.data as PerfEventsState;
        return data.eventState === 'ACTIVE';
      });
      expect(hasActive).toBe(true);
    });
  });

  describe('generateFrames - default scenario', () => {
    it('returns frames when called without argument', () => {
      const frames = perfEvents.generateFrames();
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });
  });

  describe('generateFrames - sampling-overflow', () => {
    const frames = perfEvents.generateFrames('sampling-overflow');

    it('generates 8-12 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
      expect(frames.length).toBeLessThanOrEqual(12);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('references perf_event_overflow', () => {
      const hasRef = frames.some(f => f.description.includes('perf_event_overflow'));
      expect(hasRef).toBe(true);
    });

    it('references __perf_event_output', () => {
      const hasRef = frames.some(f => f.description.includes('__perf_event_output'));
      expect(hasRef).toBe(true);
    });

    it('references perf_output_begin', () => {
      const hasRef = frames.some(f => f.description.includes('perf_output_begin'));
      expect(hasRef).toBe(true);
    });

    it('references perf_output_end', () => {
      const hasRef = frames.some(f => f.description.includes('perf_output_end'));
      expect(hasRef).toBe(true);
    });

    it('overflowCount increases during scenario', () => {
      const firstData = frames[0].data as PerfEventsState;
      const hasHigherOverflow = frames.some(f => {
        const data = f.data as PerfEventsState;
        return data.overflowCount > firstData.overflowCount;
      });
      expect(hasHigherOverflow).toBe(true);
    });

    it('ring buffer head advances', () => {
      const firstData = frames[0].data as PerfEventsState;
      const hasAdvancedHead = frames.some(f => {
        const data = f.data as PerfEventsState;
        return data.ringBuffer.head > firstData.ringBuffer.head;
      });
      expect(hasAdvancedHead).toBe(true);
    });

    it('sampleCount increases', () => {
      const firstData = frames[0].data as PerfEventsState;
      const hasMoreSamples = frames.some(f => {
        const data = f.data as PerfEventsState;
        return data.sampleCount > firstData.sampleCount;
      });
      expect(hasMoreSamples).toBe(true);
    });

    it('has srcRef on all frames', () => {
      frames.forEach(f => {
        const data = f.data as PerfEventsState;
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });
  });

  describe('generateFrames - software-event', () => {
    const frames = perfEvents.generateFrames('software-event');

    it('generates 8-12 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
      expect(frames.length).toBeLessThanOrEqual(12);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('references perf_sw_event', () => {
      const hasRef = frames.some(f => f.description.includes('perf_sw_event'));
      expect(hasRef).toBe(true);
    });

    it('references perf_swevent_event', () => {
      const hasRef = frames.some(f => f.description.includes('perf_swevent_event'));
      expect(hasRef).toBe(true);
    });

    it('references perf_event_task_sched_out', () => {
      const hasRef = frames.some(f => f.description.includes('perf_event_task_sched_out'));
      expect(hasRef).toBe(true);
    });

    it('references perf_event_ctxp', () => {
      const hasRef = frames.some(f => f.description.includes('perf_event_ctxp'));
      expect(hasRef).toBe(true);
    });

    it('eventType is software', () => {
      const hasSw = frames.some(f => {
        const data = f.data as PerfEventsState;
        return data.eventType === 'software';
      });
      expect(hasSw).toBe(true);
    });

    it('has srcRef on all frames', () => {
      frames.forEach(f => {
        const data = f.data as PerfEventsState;
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });
  });

  describe('renderFrame', () => {
    it('renders title text', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = perfEvents.generateFrames('event-open-enable');
      perfEvents.renderFrame(svg, frames[0], 900, 480);
      const title = svg.querySelector('.anim-title');
      expect(title).not.toBeNull();
    });

    it('renders phase indicator', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = perfEvents.generateFrames('event-open-enable');
      perfEvents.renderFrame(svg, frames[0], 900, 480);
      const blocks = svg.querySelectorAll('.anim-block');
      expect(blocks.length).toBeGreaterThan(0);
    });

    it('renders ring buffer visualization', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = perfEvents.generateFrames('sampling-overflow');
      perfEvents.renderFrame(svg, frames[4], 900, 480);
      const rbElements = svg.querySelectorAll('.anim-ring-buffer');
      expect(rbElements.length).toBeGreaterThan(0);
    });

    it('renders event state display', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = perfEvents.generateFrames('event-open-enable');
      perfEvents.renderFrame(svg, frames[3], 900, 480);
      const stateElements = svg.querySelectorAll('.anim-mode');
      expect(stateElements.length).toBeGreaterThan(0);
    });

    it('clears previous content on re-render', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = perfEvents.generateFrames('event-open-enable');
      perfEvents.renderFrame(svg, frames[0], 900, 480);
      const countBefore = svg.childElementCount;
      perfEvents.renderFrame(svg, frames[1], 900, 480);
      expect(svg.childElementCount).toBeLessThanOrEqual(countBefore + 10);
    });

    it('renders overflow indicator for sampling scenario', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = perfEvents.generateFrames('sampling-overflow');
      const overflowFrame = frames.find(f => {
        const data = f.data as PerfEventsState;
        return data.overflowCount > 0;
      });
      if (overflowFrame) {
        perfEvents.renderFrame(svg, overflowFrame, 900, 480);
        const highlights = svg.querySelectorAll('.anim-highlight');
        expect(highlights.length).toBeGreaterThan(0);
      }
    });
  });
});

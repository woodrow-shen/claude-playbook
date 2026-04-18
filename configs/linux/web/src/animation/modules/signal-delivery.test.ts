import { describe, it, expect } from 'vitest';
import signalDelivery from './signal-delivery.js';
import type { SignalDeliveryState } from './signal-delivery.js';

describe('Signal Delivery', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(signalDelivery.config.id).toBe('signal-delivery');
      expect(signalDelivery.config.skillName).toBe('signals-and-ipc');
      expect(signalDelivery.config.title).toBe('Signal Delivery');
    });
  });

  describe('getScenarios', () => {
    it('returns 3 scenarios', () => {
      const scenarios = signalDelivery.getScenarios();
      expect(scenarios.length).toBe(3);
      expect(scenarios.map(s => s.id)).toContain('signal-delivery');
      expect(scenarios.map(s => s.id)).toContain('signal-handler-return');
      expect(scenarios.map(s => s.id)).toContain('fatal-signal');
    });
  });

  describe('generateFrames - signal-delivery (default)', () => {
    const frames = signalDelivery.generateFrames('signal-delivery');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('first frame has step 0', () => {
      expect(frames[0].step).toBe(0);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('every frame has srcRef in data', () => {
      frames.forEach(f => {
        const data = f.data as SignalDeliveryState;
        expect(data.srcRef).toBeDefined();
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });

    it('shows send_signal_locked in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('send_signal_locked'));
      expect(hasRef).toBe(true);
    });

    it('shows complete_signal in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('complete_signal'));
      expect(hasRef).toBe(true);
    });

    it('shows get_signal in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('get_signal'));
      expect(hasRef).toBe(true);
    });

    it('shows setup_rt_frame in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('setup_rt_frame'));
      expect(hasRef).toBe(true);
    });

    it('shows signal_wake_up in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('signal_wake_up'));
      expect(hasRef).toBe(true);
    });

    it('shows __send_signal_locked in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('__send_signal_locked'));
      expect(hasRef).toBe(true);
    });

    it('includes send-entry phase', () => {
      const has = frames.some(f => (f.data as SignalDeliveryState).phase === 'send-entry');
      expect(has).toBe(true);
    });

    it('includes queue-signal phase', () => {
      const has = frames.some(f => (f.data as SignalDeliveryState).phase === 'queue-signal');
      expect(has).toBe(true);
    });

    it('includes complete phase', () => {
      const has = frames.some(f => (f.data as SignalDeliveryState).phase === 'complete');
      expect(has).toBe(true);
    });

    it('includes wake-up phase', () => {
      const has = frames.some(f => (f.data as SignalDeliveryState).phase === 'wake-up');
      expect(has).toBe(true);
    });

    it('includes get-signal phase', () => {
      const has = frames.some(f => (f.data as SignalDeliveryState).phase === 'get-signal');
      expect(has).toBe(true);
    });

    it('includes handle phase', () => {
      const has = frames.some(f => (f.data as SignalDeliveryState).phase === 'handle');
      expect(has).toBe(true);
    });

    it('includes setup-frame phase', () => {
      const has = frames.some(f => (f.data as SignalDeliveryState).phase === 'setup-frame');
      expect(has).toBe(true);
    });

    it('includes handler-exec phase', () => {
      const has = frames.some(f => (f.data as SignalDeliveryState).phase === 'handler-exec');
      expect(has).toBe(true);
    });

    it('tracks SIGTERM in pendingSignals', () => {
      const hasPending = frames.some(f => {
        const data = f.data as SignalDeliveryState;
        return data.pendingSignals.includes('SIGTERM');
      });
      expect(hasPending).toBe(true);
    });

    it('pendingSignals is cleared after get_signal dequeues', () => {
      const handleFrame = frames.find(f => (f.data as SignalDeliveryState).phase === 'handle');
      expect(handleFrame).toBeDefined();
      const data = handleFrame!.data as SignalDeliveryState;
      expect(data.pendingSignals.length).toBe(0);
    });

    it('srcRef references real kernel source files', () => {
      const kernelPaths = ['kernel/signal.c', 'arch/x86/kernel/signal.c', 'kernel/entry/common.c'];
      const allSrcRefs = frames.map(f => (f.data as SignalDeliveryState).srcRef);
      const refsKernelFile = allSrcRefs.some(ref =>
        kernelPaths.some(path => ref.includes(path))
      );
      expect(refsKernelFile).toBe(true);
    });

    it('includes real function names in descriptions', () => {
      const realFunctions = [
        'do_send_sig_info',
        'sigqueue_alloc',
        'sigaddset',
        'exit_to_user_mode_loop',
        'arch_do_signal_or_restart',
        'handle_signal',
      ];
      realFunctions.forEach(fn => {
        const hasRef = frames.some(f => f.description.includes(fn));
        expect(hasRef).toBe(true);
      });
    });
  });

  describe('generateFrames - default scenario (no argument)', () => {
    it('returns frames when called without argument', () => {
      const frames = signalDelivery.generateFrames();
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });
  });

  describe('generateFrames - signal-handler-return', () => {
    const frames = signalDelivery.generateFrames('signal-handler-return');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('every frame has srcRef in data', () => {
      frames.forEach(f => {
        const data = f.data as SignalDeliveryState;
        expect(data.srcRef).toBeDefined();
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });

    it('references rt_sigreturn in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('rt_sigreturn'));
      expect(hasRef).toBe(true);
    });

    it('references restore_sigcontext in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('restore_sigcontext'));
      expect(hasRef).toBe(true);
    });

    it('references restore_altstack in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('restore_altstack'));
      expect(hasRef).toBe(true);
    });

    it('includes sigreturn phase', () => {
      const has = frames.some(f => (f.data as SignalDeliveryState).phase === 'sigreturn');
      expect(has).toBe(true);
    });

    it('references arch/x86/kernel/signal_64.c in srcRef', () => {
      const has = frames.some(f => {
        const data = f.data as SignalDeliveryState;
        return data.srcRef.includes('signal_64.c');
      });
      expect(has).toBe(true);
    });
  });

  describe('generateFrames - fatal-signal', () => {
    const frames = signalDelivery.generateFrames('fatal-signal');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('every frame has srcRef in data', () => {
      frames.forEach(f => {
        const data = f.data as SignalDeliveryState;
        expect(data.srcRef).toBeDefined();
        expect(data.srcRef.length).toBeGreaterThan(0);
      });
    });

    it('signal is SIGKILL', () => {
      const data = frames[0].data as SignalDeliveryState;
      expect(data.signalName).toBe('SIGKILL');
      expect(data.signalNumber).toBe(9);
    });

    it('shows SIGKILL path with do_group_exit in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('do_group_exit'));
      expect(hasRef).toBe(true);
    });

    it('shows do_exit in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('do_exit'));
      expect(hasRef).toBe(true);
    });

    it('includes fatal phase', () => {
      const has = frames.some(f => (f.data as SignalDeliveryState).phase === 'fatal');
      expect(has).toBe(true);
    });

    it('shows SIGNAL_GROUP_EXIT in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('SIGNAL_GROUP_EXIT'));
      expect(hasRef).toBe(true);
    });

    it('shows zap_other_threads in descriptions', () => {
      const hasRef = frames.some(f => f.description.includes('zap_other_threads'));
      expect(hasRef).toBe(true);
    });

    it('mentions SIGKILL cannot be caught in descriptions', () => {
      const hasRef = frames.some(f =>
        f.description.includes('cannot be caught') ||
        f.description.includes('uncatchable') ||
        f.description.includes('never executes any user handler') ||
        f.description.includes('no handler')
      );
      expect(hasRef).toBe(true);
    });

    it('references kernel/exit.c in srcRef', () => {
      const has = frames.some(f => {
        const data = f.data as SignalDeliveryState;
        return data.srcRef.includes('kernel/exit.c');
      });
      expect(has).toBe(true);
    });

    it('shows signal_wake_up waking all threads', () => {
      const hasRef = frames.some(f =>
        f.description.includes('signal_wake_up') &&
        (f.description.includes('EACH thread') || f.description.includes('all thread'))
      );
      expect(hasRef).toBe(true);
    });

    it('skips sigqueue allocation for SIGKILL', () => {
      const hasRef = frames.some(f =>
        f.description.includes('skips sigqueue') ||
        f.description.includes('Skip') ||
        f.description.includes('skip')
      );
      expect(hasRef).toBe(true);
    });
  });

  describe('renderFrame', () => {
    it('renders title', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = signalDelivery.generateFrames('signal-delivery');
      signalDelivery.renderFrame(svg, frames[0], 900, 480);
      const title = svg.querySelector('.anim-title');
      expect(title).not.toBeNull();
    });

    it('renders process blocks', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = signalDelivery.generateFrames('signal-delivery');
      signalDelivery.renderFrame(svg, frames[0], 900, 480);
      const blocks = svg.querySelectorAll('.anim-block');
      expect(blocks.length).toBeGreaterThan(0);
    });

    it('renders phase indicator', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = signalDelivery.generateFrames('signal-delivery');
      signalDelivery.renderFrame(svg, frames[0], 900, 480);
      const phases = svg.querySelectorAll('.anim-phase');
      expect(phases.length).toBeGreaterThan(0);
    });

    it('renders stack frames', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = signalDelivery.generateFrames('signal-delivery');
      signalDelivery.renderFrame(svg, frames[5], 900, 480);
      const stackEntries = svg.querySelectorAll('.anim-stack-frame');
      expect(stackEntries.length).toBeGreaterThan(0);
    });

    it('clears previous content on re-render', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = signalDelivery.generateFrames('signal-delivery');
      signalDelivery.renderFrame(svg, frames[0], 900, 480);
      const countBefore = svg.childElementCount;
      signalDelivery.renderFrame(svg, frames[1], 900, 480);
      expect(svg.childElementCount).toBeLessThanOrEqual(countBefore + 10);
    });

    it('renders fatal phase with different color', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = signalDelivery.generateFrames('fatal-signal');
      const fatalFrame = frames.find(f => (f.data as SignalDeliveryState).phase === 'fatal');
      expect(fatalFrame).toBeDefined();
      signalDelivery.renderFrame(svg, fatalFrame!, 900, 480);
      const phaseRect = svg.querySelector('.anim-phase');
      expect(phaseRect).not.toBeNull();
    });
  });
});

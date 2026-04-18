import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnimationEngine } from './engine.js';
import type { AnimationModule, AnimationFrame, PlaybackState } from './types.js';

function makeFrame(step: number): AnimationFrame {
  return {
    step,
    label: `Step ${step}`,
    description: `Description for step ${step}`,
    highlights: [`item-${step}`],
    data: { step },
  };
}

function makeMockModule(frameCount = 5): AnimationModule {
  const frames = Array.from({ length: frameCount }, (_, i) => makeFrame(i));
  return {
    config: { id: 'test-anim', title: 'Test Animation', skillName: 'test-skill' },
    generateFrames: vi.fn(() => frames),
    renderFrame: vi.fn(),
    getScenarios: () => [{ id: 'default', label: 'Default' }],
  };
}

let svg: SVGGElement;
let onStateChange: ReturnType<typeof vi.fn>;

beforeEach(() => {
  document.body.innerHTML = '<svg><g id="test-g"></g></svg>';
  svg = document.querySelector('#test-g') as unknown as SVGGElement;
  onStateChange = vi.fn();
});

describe('AnimationEngine', () => {
  it('starts paused at frame 0 after load', () => {
    const engine = new AnimationEngine(svg, onStateChange);
    engine.load(makeMockModule());
    const state = engine.getState();
    expect(state.currentFrame).toBe(0);
    expect(state.playing).toBe(false);
    expect(state.totalFrames).toBe(5);
    expect(state.speed).toBe(1);
  });

  it('calls generateFrames on load', () => {
    const mod = makeMockModule();
    const engine = new AnimationEngine(svg, onStateChange);
    engine.load(mod);
    expect(mod.generateFrames).toHaveBeenCalledOnce();
  });

  it('renders frame 0 on load', () => {
    const mod = makeMockModule();
    const engine = new AnimationEngine(svg, onStateChange);
    engine.load(mod);
    expect(mod.renderFrame).toHaveBeenCalledWith(svg, expect.objectContaining({ step: 0 }), expect.any(Number), expect.any(Number));
  });

  it('fires onStateChange on load', () => {
    const engine = new AnimationEngine(svg, onStateChange);
    engine.load(makeMockModule());
    expect(onStateChange).toHaveBeenCalled();
  });

  it('step(1) advances to next frame', () => {
    const mod = makeMockModule();
    const engine = new AnimationEngine(svg, onStateChange);
    engine.load(mod);
    engine.step(1);
    expect(engine.getState().currentFrame).toBe(1);
    expect(mod.renderFrame).toHaveBeenLastCalledWith(svg, expect.objectContaining({ step: 1 }), expect.any(Number), expect.any(Number));
  });

  it('step(-1) goes back one frame', () => {
    const engine = new AnimationEngine(svg, onStateChange);
    engine.load(makeMockModule());
    engine.step(1);
    engine.step(1);
    engine.step(-1);
    expect(engine.getState().currentFrame).toBe(1);
  });

  it('step(-1) at frame 0 stays at frame 0', () => {
    const engine = new AnimationEngine(svg, onStateChange);
    engine.load(makeMockModule());
    engine.step(-1);
    expect(engine.getState().currentFrame).toBe(0);
  });

  it('step(1) at last frame stays at last frame', () => {
    const engine = new AnimationEngine(svg, onStateChange);
    engine.load(makeMockModule(3));
    engine.step(1);
    engine.step(1);
    engine.step(1); // already at 2 (last), should stay
    expect(engine.getState().currentFrame).toBe(2);
  });

  it('seekTo jumps to specific frame', () => {
    const engine = new AnimationEngine(svg, onStateChange);
    engine.load(makeMockModule());
    engine.seekTo(3);
    expect(engine.getState().currentFrame).toBe(3);
  });

  it('seekTo clamps to valid range', () => {
    const engine = new AnimationEngine(svg, onStateChange);
    engine.load(makeMockModule(5));
    engine.seekTo(-5);
    expect(engine.getState().currentFrame).toBe(0);
    engine.seekTo(100);
    expect(engine.getState().currentFrame).toBe(4);
  });

  it('play sets playing to true', () => {
    const engine = new AnimationEngine(svg, onStateChange);
    engine.load(makeMockModule());
    engine.play();
    expect(engine.getState().playing).toBe(true);
    engine.destroy();
  });

  it('pause sets playing to false', () => {
    const engine = new AnimationEngine(svg, onStateChange);
    engine.load(makeMockModule());
    engine.play();
    engine.pause();
    expect(engine.getState().playing).toBe(false);
  });

  it('setSpeed updates speed', () => {
    const engine = new AnimationEngine(svg, onStateChange);
    engine.load(makeMockModule());
    engine.setSpeed(2);
    expect(engine.getState().speed).toBe(2);
  });

  it('setSpeed clamps to allowed values', () => {
    const engine = new AnimationEngine(svg, onStateChange);
    engine.load(makeMockModule());
    engine.setSpeed(0.1);
    expect(engine.getState().speed).toBe(0.25);
    engine.setSpeed(100);
    expect(engine.getState().speed).toBe(4);
  });

  it('reset goes to frame 0 and pauses', () => {
    const engine = new AnimationEngine(svg, onStateChange);
    engine.load(makeMockModule());
    engine.step(1);
    engine.step(1);
    engine.play();
    engine.reset();
    expect(engine.getState().currentFrame).toBe(0);
    expect(engine.getState().playing).toBe(false);
  });

  it('getCurrentFrame returns the current AnimationFrame', () => {
    const engine = new AnimationEngine(svg, onStateChange);
    engine.load(makeMockModule());
    const frame = engine.getCurrentFrame();
    expect(frame).not.toBeNull();
    expect(frame!.step).toBe(0);
    expect(frame!.label).toBe('Step 0');
  });

  it('getCurrentFrame returns null before load', () => {
    const engine = new AnimationEngine(svg, onStateChange);
    expect(engine.getCurrentFrame()).toBeNull();
  });

  it('onStateChange receives state and frame on every mutation', () => {
    const engine = new AnimationEngine(svg, onStateChange);
    engine.load(makeMockModule());
    onStateChange.mockClear();
    engine.step(1);
    expect(onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({ currentFrame: 1 }),
      expect.objectContaining({ step: 1 }),
    );
  });

  it('destroy stops playback', () => {
    const engine = new AnimationEngine(svg, onStateChange);
    engine.load(makeMockModule());
    engine.play();
    engine.destroy();
    expect(engine.getState().playing).toBe(false);
  });

  it('load with scenario passes it to generateFrames', () => {
    const mod = makeMockModule();
    const engine = new AnimationEngine(svg, onStateChange);
    engine.load(mod, 'custom-scenario');
    expect(mod.generateFrames).toHaveBeenCalledWith('custom-scenario');
  });
});

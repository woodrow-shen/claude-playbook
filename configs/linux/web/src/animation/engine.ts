import type { AnimationModule, AnimationFrame, PlaybackState } from './types.js';

const MIN_SPEED = 0.25;
const MAX_SPEED = 4;
const BASE_INTERVAL_MS = 1500;

export class AnimationEngine {
  private module: AnimationModule | null = null;
  private frames: AnimationFrame[] = [];
  private state: PlaybackState = { currentFrame: 0, totalFrames: 0, playing: false, speed: 1 };
  private rafId: number | null = null;
  private lastAdvance = 0;
  private renderWidth = 432;
  private renderHeight = 300;

  constructor(
    private readonly svgGroup: SVGGElement,
    private readonly onStateChange: (state: PlaybackState, frame: AnimationFrame) => void,
  ) {}

  load(module: AnimationModule, scenario?: string, width?: number, height?: number): void {
    this.destroy();
    this.module = module;
    if (width) this.renderWidth = width;
    if (height) this.renderHeight = height;
    this.frames = module.generateFrames(scenario);
    this.state = { currentFrame: 0, totalFrames: this.frames.length, playing: false, speed: 1 };
    this.render();
    this.notify();
  }

  play(): void {
    if (!this.module || this.state.playing) return;
    this.state.playing = true;
    this.lastAdvance = performance.now();
    this.tick();
    this.notify();
  }

  pause(): void {
    this.state.playing = false;
    this.cancelRaf();
    this.notify();
  }

  step(direction: 1 | -1): void {
    const next = this.state.currentFrame + direction;
    if (next < 0 || next >= this.state.totalFrames) return;
    this.state.currentFrame = next;
    this.render();
    this.notify();
  }

  seekTo(frame: number): void {
    this.state.currentFrame = Math.max(0, Math.min(frame, this.state.totalFrames - 1));
    this.render();
    this.notify();
  }

  setSpeed(speed: number): void {
    this.state.speed = Math.max(MIN_SPEED, Math.min(speed, MAX_SPEED));
    this.notify();
  }

  reset(): void {
    this.pause();
    this.state.currentFrame = 0;
    this.render();
    this.notify();
  }

  destroy(): void {
    this.pause();
    this.module = null;
    this.frames = [];
  }

  getState(): PlaybackState {
    return { ...this.state };
  }

  getCurrentFrame(): AnimationFrame | null {
    if (this.frames.length === 0) return null;
    return this.frames[this.state.currentFrame] ?? null;
  }

  private render(): void {
    if (!this.module || this.frames.length === 0) return;
    const frame = this.frames[this.state.currentFrame];
    if (frame) {
      this.module.renderFrame(this.svgGroup, frame, this.renderWidth, this.renderHeight);
    }
  }

  private notify(): void {
    const frame = this.getCurrentFrame();
    if (frame) {
      this.onStateChange({ ...this.state }, frame);
    }
  }

  private tick(): void {
    if (!this.state.playing) return;
    this.rafId = requestAnimationFrame((now) => {
      const interval = BASE_INTERVAL_MS / this.state.speed;
      if (now - this.lastAdvance >= interval) {
        this.lastAdvance = now;
        if (this.state.currentFrame < this.state.totalFrames - 1) {
          this.state.currentFrame++;
          this.render();
          this.notify();
        } else {
          this.pause();
          return;
        }
      }
      this.tick();
    });
  }

  private cancelRaf(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}

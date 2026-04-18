/** A single discrete state in an animation timeline */
export interface AnimationFrame {
  /** Step index, 0-based */
  step: number;
  /** Short label: "Split order-3 block at 0x8000" */
  label: string;
  /** Educational explanation shown below the visualization */
  description: string;
  /** IDs of visual elements to emphasize */
  highlights: string[];
  /** State snapshot the renderer uses to draw */
  data: unknown;
}

/** Static configuration for an animation */
export interface AnimationConfig {
  /** Machine-readable ID, e.g. "buddy-allocator" */
  id: string;
  /** Display title */
  title: string;
  /** Which skill this attaches to */
  skillName: string;
}

/** Playback state managed by the engine */
export interface PlaybackState {
  currentFrame: number;
  totalFrames: number;
  playing: boolean;
  /** Speed multiplier: 0.5, 1, 2, 4 */
  speed: number;
}

/** A scenario selectable in the control bar */
export interface AnimationScenario {
  id: string;
  label: string;
}

/** Interface every animation module must implement */
export interface AnimationModule {
  readonly config: AnimationConfig;
  /** Generate all frames for a given scenario */
  generateFrames(scenario?: string): AnimationFrame[];
  /** Render a single frame into an SVG group */
  renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void;
  /** List available scenarios */
  getScenarios(): AnimationScenario[];
}

/** Registry entry for lazy-loading animation modules */
export interface AnimationRegistryEntry {
  skillName: string;
  moduleId: string;
  title: string;
  load: () => Promise<AnimationModule>;
}

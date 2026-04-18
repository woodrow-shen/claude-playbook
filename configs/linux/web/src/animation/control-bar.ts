import type { PlaybackState, AnimationScenario } from './types.js';

export interface ControlBarCallbacks {
  onPlay: () => void;
  onPause: () => void;
  onStepForward: () => void;
  onStepBack: () => void;
  onSeek: (frame: number) => void;
  onSpeedChange: (speed: number) => void;
  onScenarioChange: (id: string) => void;
  onReset: () => void;
  // Optional close handler invoked by the Escape keyboard shortcut. When
  // omitted, Escape is a no-op at the control-bar level (callers may still
  // bind their own handlers elsewhere). This keeps the callback interface
  // backward compatible with existing consumers.
  onClose?: () => void;
}

export interface ControlBar {
  update(state: PlaybackState): void;
  updateDescription(label: string, detail: string): void;
  destroy(): void;
}

// Maps a number key character to its corresponding playback speed. Defined
// at module scope so the handler re-uses the same lookup without rebuilding
// it per keypress.
const SPEED_BY_NUMBER_KEY: Record<string, number> = {
  '1': 0.5,
  '2': 1,
  '3': 2,
  '4': 4,
};

// Returns true when keyboard shortcuts should NOT fire for the given event
// target -- e.g. the user is typing in a form field or rich-text editor. The
// native scrubber <input type="range"> is also caught here, which is the
// desired behavior: once the user focuses the scrubber, its own arrow-key
// handling wins.
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  // Check both the native property (honored by real browsers) and the raw
  // attribute (jsdom does not compute isContentEditable from the attribute).
  if (target.isContentEditable) return true;
  const attr = target.getAttribute('contenteditable');
  if (attr !== null && attr.toLowerCase() !== 'false') return true;
  return false;
}

export function createControlBar(
  container: HTMLElement,
  scenarios: AnimationScenario[],
  callbacks: ControlBarCallbacks,
): ControlBar {
  let isPlaying = false;

  const wrapper = document.createElement('div');
  wrapper.className = 'animation-controls';

  // Reset button
  const btnReset = document.createElement('button');
  btnReset.className = 'btn-reset anim-ctrl-btn';
  btnReset.textContent = 'Reset';
  btnReset.addEventListener('click', callbacks.onReset);

  // Step back
  const btnBack = document.createElement('button');
  btnBack.className = 'btn-step-back anim-ctrl-btn';
  btnBack.textContent = 'Back';
  btnBack.addEventListener('click', callbacks.onStepBack);

  // Play/Pause
  const btnPlay = document.createElement('button');
  btnPlay.className = 'btn-play anim-ctrl-btn';
  btnPlay.textContent = 'Play';
  btnPlay.addEventListener('click', () => {
    if (isPlaying) callbacks.onPause();
    else callbacks.onPlay();
  });

  // Step forward
  const btnFwd = document.createElement('button');
  btnFwd.className = 'btn-step-fwd anim-ctrl-btn';
  btnFwd.textContent = 'Fwd';
  btnFwd.addEventListener('click', callbacks.onStepForward);

  // Scrubber
  const scrubber = document.createElement('input');
  scrubber.type = 'range';
  scrubber.className = 'animation-scrubber';
  scrubber.min = '0';
  scrubber.max = '0';
  scrubber.value = '0';
  scrubber.addEventListener('input', () => {
    callbacks.onSeek(parseInt(scrubber.value, 10));
  });

  // Step counter
  const counter = document.createElement('span');
  counter.className = 'animation-step-counter';
  counter.textContent = '1 / 1';

  // Speed selector
  const speedSelect = document.createElement('select');
  speedSelect.className = 'animation-speed';
  for (const s of [0.5, 1, 2, 4]) {
    const opt = document.createElement('option');
    opt.value = String(s);
    opt.textContent = `${s}x`;
    if (s === 1) opt.selected = true;
    speedSelect.appendChild(opt);
  }
  speedSelect.addEventListener('change', () => {
    callbacks.onSpeedChange(parseFloat(speedSelect.value));
  });

  // Scenario selector
  const scenarioSelect = document.createElement('select');
  scenarioSelect.className = 'animation-scenario';
  for (const sc of scenarios) {
    const opt = document.createElement('option');
    opt.value = sc.id;
    opt.textContent = sc.label;
    scenarioSelect.appendChild(opt);
  }
  if (scenarios.length <= 1) {
    scenarioSelect.style.display = 'none';
  }
  scenarioSelect.addEventListener('change', () => {
    callbacks.onScenarioChange(scenarioSelect.value);
  });

  // Description area
  const desc = document.createElement('div');
  desc.className = 'animation-description';
  const descLabel = document.createElement('div');
  descLabel.className = 'animation-desc-label';
  const descDetail = document.createElement('div');
  descDetail.className = 'animation-desc-detail';
  desc.appendChild(descLabel);
  desc.appendChild(descDetail);

  wrapper.appendChild(btnReset);
  wrapper.appendChild(btnBack);
  wrapper.appendChild(btnPlay);
  wrapper.appendChild(btnFwd);
  wrapper.appendChild(scrubber);
  wrapper.appendChild(counter);
  wrapper.appendChild(speedSelect);
  wrapper.appendChild(scenarioSelect);

  container.appendChild(wrapper);
  container.appendChild(desc);

  // Global keydown handler for playback shortcuts. Attached to `document`
  // because the animation viewport fills the page and shortcut focus is
  // implicit (users expect the controls to respond without having to click
  // into the modal first). Form-field and modifier-key guards prevent
  // hijacking normal typing or browser chord shortcuts.
  function onKeyDown(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (isEditableTarget(event.target)) return;

    switch (event.key) {
      case ' ':
      case 'Spacebar': // legacy browsers
        event.preventDefault();
        if (isPlaying) callbacks.onPause();
        else callbacks.onPlay();
        return;
      case 'ArrowLeft':
        callbacks.onStepBack();
        return;
      case 'ArrowRight':
        callbacks.onStepForward();
        return;
      case 'r':
      case 'R':
        callbacks.onReset();
        return;
      case 'Escape':
        if (callbacks.onClose) callbacks.onClose();
        return;
    }

    const speed = SPEED_BY_NUMBER_KEY[event.key];
    if (speed !== undefined) {
      // Keep the UI select in sync with the chosen speed, mirroring what a
      // manual selector change would look like.
      speedSelect.value = String(speed);
      callbacks.onSpeedChange(speed);
    }
  }

  document.addEventListener('keydown', onKeyDown);

  return {
    update(state: PlaybackState): void {
      isPlaying = state.playing;
      btnPlay.textContent = state.playing ? 'Pause' : 'Play';
      scrubber.max = String(state.totalFrames - 1);
      scrubber.value = String(state.currentFrame);
      counter.textContent = `${state.currentFrame + 1} / ${state.totalFrames}`;
    },

    updateDescription(label: string, detail: string): void {
      descLabel.textContent = label;
      descDetail.textContent = detail;
    },

    destroy(): void {
      document.removeEventListener('keydown', onKeyDown);
      container.innerHTML = '';
    },
  };
}

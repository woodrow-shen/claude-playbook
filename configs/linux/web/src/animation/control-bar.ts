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
}

export interface ControlBar {
  update(state: PlaybackState): void;
  updateDescription(label: string, detail: string): void;
  destroy(): void;
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
      container.innerHTML = '';
    },
  };
}

import type { AnimationModule } from './types.js';
import { AnimationEngine } from './engine.js';
import { createControlBar } from './control-bar.js';

const SVG_WIDTH = 900;
const SVG_HEIGHT = 480;

export function mountAnimationViewport(
  _container: HTMLElement,
  module: AnimationModule,
  onClose: () => void,
): { destroy(): void } {
  // Create fullscreen overlay
  const overlay = document.createElement('div');
  overlay.className = 'animation-overlay';

  const modal = document.createElement('div');
  modal.className = 'animation-modal';

  // Header row: title + close button
  const header = document.createElement('div');
  header.className = 'animation-modal-header';

  const title = document.createElement('h2');
  title.className = 'animation-title';
  title.textContent = module.config.title;
  header.appendChild(title);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'animation-close-btn';
  closeBtn.textContent = '\u00d7';
  closeBtn.addEventListener('click', doClose);
  header.appendChild(closeBtn);

  modal.appendChild(header);

  // SVG canvas -- large and centered
  const svgContainer = document.createElement('div');
  svgContainer.className = 'animation-svg-container';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'animation-svg');
  svg.setAttribute('viewBox', `0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  const svgGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  svgGroup.setAttribute('class', 'animation-root');
  svg.appendChild(svgGroup);
  svgContainer.appendChild(svg);
  modal.appendChild(svgContainer);

  // Control bar
  const controlContainer = document.createElement('div');
  controlContainer.className = 'animation-control-container';
  modal.appendChild(controlContainer);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Prevent body scroll while overlay is open
  document.body.classList.add('animation-open');

  // Close on overlay background click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) doClose();
  });

  // Create engine and control bar. The control bar owns the document-level
  // keydown listener for playback shortcuts and delegates Escape to the
  // viewport via onClose so there is a single keyboard handler active.
  const controlBar = createControlBar(
    controlContainer,
    module.getScenarios(),
    {
      onPlay: () => engine.play(),
      onPause: () => engine.pause(),
      onStepForward: () => engine.step(1),
      onStepBack: () => engine.step(-1),
      onSeek: (frame) => engine.seekTo(frame),
      onSpeedChange: (speed) => engine.setSpeed(speed),
      onScenarioChange: (id) => engine.load(module, id),
      onReset: () => engine.reset(),
      onClose: () => doClose(),
    },
  );

  const engine = new AnimationEngine(svgGroup as unknown as SVGGElement, (state, frame) => {
    controlBar.update(state);
    controlBar.updateDescription(frame.label, frame.description);
  });

  engine.load(module, undefined, SVG_WIDTH, SVG_HEIGHT);

  let destroyed = false;

  function doClose() {
    if (destroyed) return;
    destroyed = true;
    engine.destroy();
    controlBar.destroy();
    document.body.classList.remove('animation-open');
    overlay.remove();
    onClose();
  }

  return { destroy: doClose };
}

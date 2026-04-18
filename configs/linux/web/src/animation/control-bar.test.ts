import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createControlBar } from './control-bar.js';
import type { PlaybackState } from './types.js';

let container: HTMLElement;
let callbacks: Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  document.body.innerHTML = '<div id="controls"></div>';
  container = document.getElementById('controls')!;
  callbacks = {
    onPlay: vi.fn(),
    onPause: vi.fn(),
    onStepForward: vi.fn(),
    onStepBack: vi.fn(),
    onSeek: vi.fn(),
    onSpeedChange: vi.fn(),
    onScenarioChange: vi.fn(),
    onReset: vi.fn(),
  };
});

function state(overrides: Partial<PlaybackState> = {}): PlaybackState {
  return { currentFrame: 0, totalFrames: 10, playing: false, speed: 1, ...overrides };
}

describe('createControlBar', () => {
  it('creates control bar elements', () => {
    createControlBar(container, [{ id: 'default', label: 'Default' }], callbacks);
    expect(container.querySelector('.animation-controls')).not.toBeNull();
  });

  it('has play button', () => {
    createControlBar(container, [{ id: 'default', label: 'Default' }], callbacks);
    expect(container.querySelector('.btn-play')).not.toBeNull();
  });

  it('has step forward and back buttons', () => {
    createControlBar(container, [{ id: 'default', label: 'Default' }], callbacks);
    expect(container.querySelector('.btn-step-back')).not.toBeNull();
    expect(container.querySelector('.btn-step-fwd')).not.toBeNull();
  });

  it('has reset button', () => {
    createControlBar(container, [{ id: 'default', label: 'Default' }], callbacks);
    expect(container.querySelector('.btn-reset')).not.toBeNull();
  });

  it('has scrubber input', () => {
    createControlBar(container, [{ id: 'default', label: 'Default' }], callbacks);
    const scrubber = container.querySelector('.animation-scrubber') as HTMLInputElement;
    expect(scrubber).not.toBeNull();
    expect(scrubber.type).toBe('range');
  });

  it('has speed selector', () => {
    createControlBar(container, [{ id: 'default', label: 'Default' }], callbacks);
    const select = container.querySelector('.animation-speed') as HTMLSelectElement;
    expect(select).not.toBeNull();
    expect(select.options.length).toBeGreaterThanOrEqual(4);
  });

  it('has scenario selector when multiple scenarios', () => {
    const scenarios = [
      { id: 'a', label: 'Scenario A' },
      { id: 'b', label: 'Scenario B' },
    ];
    createControlBar(container, scenarios, callbacks);
    const select = container.querySelector('.animation-scenario') as HTMLSelectElement;
    expect(select).not.toBeNull();
    expect(select.options.length).toBe(2);
  });

  it('hides scenario selector for single scenario', () => {
    createControlBar(container, [{ id: 'default', label: 'Default' }], callbacks);
    const select = container.querySelector('.animation-scenario') as HTMLSelectElement;
    expect(select.style.display).toBe('none');
  });

  it('calls onPlay when play button clicked', () => {
    createControlBar(container, [{ id: 'default', label: 'Default' }], callbacks);
    (container.querySelector('.btn-play') as HTMLButtonElement).click();
    expect(callbacks.onPlay).toHaveBeenCalledOnce();
  });

  it('calls onPause when pause button clicked during play', () => {
    const bar = createControlBar(container, [{ id: 'default', label: 'Default' }], callbacks);
    bar.update(state({ playing: true }));
    (container.querySelector('.btn-play') as HTMLButtonElement).click();
    expect(callbacks.onPause).toHaveBeenCalledOnce();
  });

  it('calls onStepForward when step-fwd clicked', () => {
    createControlBar(container, [{ id: 'default', label: 'Default' }], callbacks);
    (container.querySelector('.btn-step-fwd') as HTMLButtonElement).click();
    expect(callbacks.onStepForward).toHaveBeenCalledOnce();
  });

  it('calls onStepBack when step-back clicked', () => {
    createControlBar(container, [{ id: 'default', label: 'Default' }], callbacks);
    (container.querySelector('.btn-step-back') as HTMLButtonElement).click();
    expect(callbacks.onStepBack).toHaveBeenCalledOnce();
  });

  it('calls onReset when reset clicked', () => {
    createControlBar(container, [{ id: 'default', label: 'Default' }], callbacks);
    (container.querySelector('.btn-reset') as HTMLButtonElement).click();
    expect(callbacks.onReset).toHaveBeenCalledOnce();
  });

  it('calls onSpeedChange when speed changed', () => {
    createControlBar(container, [{ id: 'default', label: 'Default' }], callbacks);
    const select = container.querySelector('.animation-speed') as HTMLSelectElement;
    select.value = '2';
    select.dispatchEvent(new Event('change'));
    expect(callbacks.onSpeedChange).toHaveBeenCalledWith(2);
  });

  it('calls onScenarioChange when scenario changed', () => {
    const scenarios = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }];
    createControlBar(container, scenarios, callbacks);
    const select = container.querySelector('.animation-scenario') as HTMLSelectElement;
    select.value = 'b';
    select.dispatchEvent(new Event('change'));
    expect(callbacks.onScenarioChange).toHaveBeenCalledWith('b');
  });

  it('update changes step counter text', () => {
    const bar = createControlBar(container, [{ id: 'default', label: 'Default' }], callbacks);
    bar.update(state({ currentFrame: 3, totalFrames: 10 }));
    const counter = container.querySelector('.animation-step-counter');
    expect(counter!.textContent).toContain('4');
    expect(counter!.textContent).toContain('10');
  });

  it('update changes scrubber value and max', () => {
    const bar = createControlBar(container, [{ id: 'default', label: 'Default' }], callbacks);
    bar.update(state({ currentFrame: 5, totalFrames: 10 }));
    const scrubber = container.querySelector('.animation-scrubber') as HTMLInputElement;
    expect(scrubber.value).toBe('5');
    expect(scrubber.max).toBe('9');
  });

  it('update toggles play/pause button text', () => {
    const bar = createControlBar(container, [{ id: 'default', label: 'Default' }], callbacks);
    bar.update(state({ playing: true }));
    const btn = container.querySelector('.btn-play') as HTMLButtonElement;
    expect(btn.textContent).toContain('Pause');
    bar.update(state({ playing: false }));
    expect(btn.textContent).toContain('Play');
  });

  it('has description area', () => {
    createControlBar(container, [{ id: 'default', label: 'Default' }], callbacks);
    expect(container.querySelector('.animation-description')).not.toBeNull();
  });

  it('updateDescription sets label and detail text', () => {
    const bar = createControlBar(container, [{ id: 'default', label: 'Default' }], callbacks);
    bar.updateDescription('My Label', 'My Detail');
    const desc = container.querySelector('.animation-description')!;
    expect(desc.textContent).toContain('My Label');
    expect(desc.textContent).toContain('My Detail');
  });

  it('destroy removes all content', () => {
    const bar = createControlBar(container, [{ id: 'default', label: 'Default' }], callbacks);
    bar.destroy();
    expect(container.innerHTML).toBe('');
  });

  it('calls onSeek when scrubber input changes', () => {
    const bar = createControlBar(container, [{ id: 'default', label: 'Default' }], callbacks);
    bar.update(state({ totalFrames: 10 }));
    const scrubber = container.querySelector('.animation-scrubber') as HTMLInputElement;
    scrubber.value = '7';
    scrubber.dispatchEvent(new Event('input'));
    expect(callbacks.onSeek).toHaveBeenCalledWith(7);
  });
});

describe('createControlBar keyboard shortcuts', () => {
  function dispatchKey(
    key: string,
    options: {
      target?: EventTarget;
      shiftKey?: boolean;
      ctrlKey?: boolean;
      altKey?: boolean;
      metaKey?: boolean;
    } = {},
  ): KeyboardEvent {
    const event = new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
      shiftKey: options.shiftKey ?? false,
      ctrlKey: options.ctrlKey ?? false,
      altKey: options.altKey ?? false,
      metaKey: options.metaKey ?? false,
    });
    (options.target ?? document.body).dispatchEvent(event);
    return event;
  }

  it('Space calls onPlay when paused', () => {
    createControlBar(container, [{ id: 'default', label: 'Default' }], callbacks);
    dispatchKey(' ');
    expect(callbacks.onPlay).toHaveBeenCalledOnce();
    expect(callbacks.onPause).not.toHaveBeenCalled();
  });

  it('Space calls onPause when playing', () => {
    const bar = createControlBar(container, [{ id: 'default', label: 'Default' }], callbacks);
    bar.update(state({ playing: true }));
    dispatchKey(' ');
    expect(callbacks.onPause).toHaveBeenCalledOnce();
    expect(callbacks.onPlay).not.toHaveBeenCalled();
  });

  it('Space calls event.preventDefault()', () => {
    createControlBar(container, [{ id: 'default', label: 'Default' }], callbacks);
    const event = dispatchKey(' ');
    expect(event.defaultPrevented).toBe(true);
  });

  it('ArrowLeft calls onStepBack', () => {
    createControlBar(container, [{ id: 'default', label: 'Default' }], callbacks);
    dispatchKey('ArrowLeft');
    expect(callbacks.onStepBack).toHaveBeenCalledOnce();
  });

  it('ArrowRight calls onStepForward', () => {
    createControlBar(container, [{ id: 'default', label: 'Default' }], callbacks);
    dispatchKey('ArrowRight');
    expect(callbacks.onStepForward).toHaveBeenCalledOnce();
  });

  it('key 1 sets speed to 0.5', () => {
    createControlBar(container, [{ id: 'default', label: 'Default' }], callbacks);
    dispatchKey('1');
    expect(callbacks.onSpeedChange).toHaveBeenCalledWith(0.5);
  });

  it('key 2 sets speed to 1', () => {
    createControlBar(container, [{ id: 'default', label: 'Default' }], callbacks);
    dispatchKey('2');
    expect(callbacks.onSpeedChange).toHaveBeenCalledWith(1);
  });

  it('key 3 sets speed to 2', () => {
    createControlBar(container, [{ id: 'default', label: 'Default' }], callbacks);
    dispatchKey('3');
    expect(callbacks.onSpeedChange).toHaveBeenCalledWith(2);
  });

  it('key 4 sets speed to 4', () => {
    createControlBar(container, [{ id: 'default', label: 'Default' }], callbacks);
    dispatchKey('4');
    expect(callbacks.onSpeedChange).toHaveBeenCalledWith(4);
  });

  it('number keys update the speed selector UI', () => {
    createControlBar(container, [{ id: 'default', label: 'Default' }], callbacks);
    dispatchKey('3');
    const select = container.querySelector('.animation-speed') as HTMLSelectElement;
    expect(select.value).toBe('2');
  });

  it('R (uppercase) fires onReset', () => {
    createControlBar(container, [{ id: 'default', label: 'Default' }], callbacks);
    dispatchKey('R');
    expect(callbacks.onReset).toHaveBeenCalledOnce();
  });

  it('r (lowercase) fires onReset', () => {
    createControlBar(container, [{ id: 'default', label: 'Default' }], callbacks);
    dispatchKey('r');
    expect(callbacks.onReset).toHaveBeenCalledOnce();
  });

  it('Escape fires onClose callback when provided', () => {
    const onClose = vi.fn();
    createControlBar(
      container,
      [{ id: 'default', label: 'Default' }],
      { ...callbacks, onClose },
    );
    dispatchKey('Escape');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('Escape is a no-op when no onClose is provided', () => {
    createControlBar(container, [{ id: 'default', label: 'Default' }], callbacks);
    expect(() => dispatchKey('Escape')).not.toThrow();
  });

  it('ignores keys when target is an input element', () => {
    createControlBar(container, [{ id: 'default', label: 'Default' }], callbacks);
    const input = document.createElement('input');
    document.body.appendChild(input);
    dispatchKey(' ', { target: input });
    dispatchKey('ArrowRight', { target: input });
    dispatchKey('r', { target: input });
    expect(callbacks.onPlay).not.toHaveBeenCalled();
    expect(callbacks.onStepForward).not.toHaveBeenCalled();
    expect(callbacks.onReset).not.toHaveBeenCalled();
  });

  it('ignores keys when target is a textarea element', () => {
    createControlBar(container, [{ id: 'default', label: 'Default' }], callbacks);
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    dispatchKey(' ', { target: textarea });
    dispatchKey('1', { target: textarea });
    expect(callbacks.onPlay).not.toHaveBeenCalled();
    expect(callbacks.onSpeedChange).not.toHaveBeenCalled();
  });

  it('ignores keys when target is contenteditable', () => {
    createControlBar(container, [{ id: 'default', label: 'Default' }], callbacks);
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    document.body.appendChild(editable);
    dispatchKey(' ', { target: editable });
    dispatchKey('2', { target: editable });
    expect(callbacks.onPlay).not.toHaveBeenCalled();
    expect(callbacks.onSpeedChange).not.toHaveBeenCalled();
  });

  it('ignores shortcut when modifier keys are pressed', () => {
    createControlBar(container, [{ id: 'default', label: 'Default' }], callbacks);
    dispatchKey(' ', { ctrlKey: true });
    dispatchKey('ArrowRight', { metaKey: true });
    expect(callbacks.onPlay).not.toHaveBeenCalled();
    expect(callbacks.onStepForward).not.toHaveBeenCalled();
  });

  it('does not fire callbacks for unrelated keys', () => {
    createControlBar(container, [{ id: 'default', label: 'Default' }], callbacks);
    dispatchKey('a');
    dispatchKey('5');
    dispatchKey('Enter');
    expect(callbacks.onPlay).not.toHaveBeenCalled();
    expect(callbacks.onPause).not.toHaveBeenCalled();
    expect(callbacks.onStepForward).not.toHaveBeenCalled();
    expect(callbacks.onStepBack).not.toHaveBeenCalled();
    expect(callbacks.onSpeedChange).not.toHaveBeenCalled();
    expect(callbacks.onReset).not.toHaveBeenCalled();
  });

  it('removes keyboard listener on destroy', () => {
    const bar = createControlBar(container, [{ id: 'default', label: 'Default' }], callbacks);
    bar.destroy();
    dispatchKey(' ');
    dispatchKey('ArrowRight');
    dispatchKey('r');
    expect(callbacks.onPlay).not.toHaveBeenCalled();
    expect(callbacks.onStepForward).not.toHaveBeenCalled();
    expect(callbacks.onReset).not.toHaveBeenCalled();
  });
});

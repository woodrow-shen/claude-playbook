import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mountAnimationViewport } from './viewport.js';
import type { AnimationModule, AnimationFrame } from './types.js';

function makeFrame(step: number): AnimationFrame {
  return { step, label: `Step ${step}`, description: `Desc ${step}`, highlights: [], data: {} };
}

function makeMockModule(): AnimationModule {
  return {
    config: { id: 'test', title: 'Test Animation', skillName: 'test-skill' },
    generateFrames: vi.fn(() => [makeFrame(0), makeFrame(1), makeFrame(2)]),
    renderFrame: vi.fn(),
    getScenarios: () => [{ id: 'default', label: 'Default' }],
  };
}

let container: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = '<div id="detail-content"><p>Original content</p></div>';
  container = document.getElementById('detail-content')!;
});

afterEach(() => {
  // Clean up any overlays
  document.querySelectorAll('.animation-overlay').forEach(el => el.remove());
  document.body.classList.remove('animation-open');
});

describe('mountAnimationViewport', () => {
  it('creates a fullscreen overlay on document.body', () => {
    mountAnimationViewport(container, makeMockModule(), vi.fn());
    expect(document.querySelector('.animation-overlay')).not.toBeNull();
  });

  it('overlay contains a modal', () => {
    mountAnimationViewport(container, makeMockModule(), vi.fn());
    expect(document.querySelector('.animation-modal')).not.toBeNull();
  });

  it('includes an SVG element', () => {
    mountAnimationViewport(container, makeMockModule(), vi.fn());
    expect(document.querySelector('.animation-svg')).not.toBeNull();
  });

  it('SVG has a viewBox for large rendering', () => {
    mountAnimationViewport(container, makeMockModule(), vi.fn());
    const svg = document.querySelector('.animation-svg')!;
    expect(svg.getAttribute('viewBox')).toContain('900');
  });

  it('includes control bar', () => {
    mountAnimationViewport(container, makeMockModule(), vi.fn());
    expect(document.querySelector('.animation-controls')).not.toBeNull();
  });

  it('includes a close button', () => {
    mountAnimationViewport(container, makeMockModule(), vi.fn());
    expect(document.querySelector('.animation-close-btn')).not.toBeNull();
  });

  it('includes title', () => {
    mountAnimationViewport(container, makeMockModule(), vi.fn());
    const title = document.querySelector('.animation-title');
    expect(title).not.toBeNull();
    expect(title!.textContent).toBe('Test Animation');
  });

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    mountAnimationViewport(container, makeMockModule(), onClose);
    (document.querySelector('.animation-close-btn') as HTMLButtonElement).click();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('removes overlay when close button clicked', () => {
    mountAnimationViewport(container, makeMockModule(), vi.fn());
    (document.querySelector('.animation-close-btn') as HTMLButtonElement).click();
    expect(document.querySelector('.animation-overlay')).toBeNull();
  });

  it('destroy removes overlay', () => {
    const { destroy } = mountAnimationViewport(container, makeMockModule(), vi.fn());
    destroy();
    expect(document.querySelector('.animation-overlay')).toBeNull();
  });

  it('adds animation-open class to body', () => {
    mountAnimationViewport(container, makeMockModule(), vi.fn());
    expect(document.body.classList.contains('animation-open')).toBe(true);
  });

  it('removes animation-open class on close', () => {
    const { destroy } = mountAnimationViewport(container, makeMockModule(), vi.fn());
    destroy();
    expect(document.body.classList.contains('animation-open')).toBe(false);
  });

  it('calls renderFrame on the module', () => {
    const mod = makeMockModule();
    mountAnimationViewport(container, mod, vi.fn());
    expect(mod.renderFrame).toHaveBeenCalled();
  });

  it('shows description from first frame', () => {
    mountAnimationViewport(container, makeMockModule(), vi.fn());
    const desc = document.querySelector('.animation-description');
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Step 0');
  });

  it('does not modify the original container content', () => {
    mountAnimationViewport(container, makeMockModule(), vi.fn());
    expect(container.innerHTML).toContain('Original content');
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import {
  computePathStats,
  renderLearningPaths,
  openLearningPaths,
  closeLearningPaths,
  type LearningPath,
} from './learning-paths.js';
import type { Progress } from './types.js';

function makeProgress(overrides: Partial<Progress> = {}): Progress {
  return {
    version: 1,
    completedSkills: [],
    inProgressSkills: [],
    totalXP: 0,
    badges: [],
    verificationChecks: {},
    startedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const PATHS: LearningPath[] = [
  {
    id: 'memory-deep-dive',
    name: 'Memory Deep Dive',
    tagline: 'From pages to OOM',
    skills: ['boot-and-init', 'system-calls', 'page-allocation', 'memcg-and-oom'],
  },
  {
    id: 'network-stack',
    name: 'Network Stack',
    tagline: 'BSD sockets down to TCP',
    skills: ['boot-and-init', 'system-calls', 'socket-layer'],
  },
];

let container: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = `
    <div id="learning-paths-modal" class="modal hidden" role="dialog" aria-modal="true">
      <div class="modal-backdrop"></div>
      <div class="modal-content">
        <button class="modal-close" id="learning-paths-close">&times;</button>
        <h2>Learning Paths</h2>
        <div id="learning-paths-list"></div>
      </div>
    </div>
  `;
  container = document.getElementById('learning-paths-modal')!;
});

describe('computePathStats', () => {
  it('reports 0/N when no skills complete', () => {
    const stats = computePathStats(PATHS[0], makeProgress());
    expect(stats.completed).toBe(0);
    expect(stats.total).toBe(4);
    expect(stats.percent).toBe(0);
  });

  it('reports N/N = 100% when all skills complete', () => {
    const progress = makeProgress({ completedSkills: PATHS[0].skills });
    const stats = computePathStats(PATHS[0], progress);
    expect(stats.completed).toBe(4);
    expect(stats.percent).toBe(100);
  });

  it('computes partial percent', () => {
    const progress = makeProgress({ completedSkills: ['boot-and-init', 'system-calls'] });
    const stats = computePathStats(PATHS[0], progress);
    expect(stats.completed).toBe(2);
    expect(stats.total).toBe(4);
    expect(Math.round(stats.percent)).toBe(50);
  });

  it('only counts completions that are in the path', () => {
    const progress = makeProgress({
      completedSkills: ['boot-and-init', 'unrelated-skill'],
    });
    const stats = computePathStats(PATHS[0], progress);
    expect(stats.completed).toBe(1);
  });

  it('returns percent 0 for empty skills array', () => {
    const empty: LearningPath = { id: 'e', name: 'E', tagline: '', skills: [] };
    const stats = computePathStats(empty, makeProgress());
    expect(stats.total).toBe(0);
    expect(stats.percent).toBe(0);
  });
});

describe('renderLearningPaths', () => {
  it('renders a card per path', () => {
    renderLearningPaths(container, PATHS, makeProgress(), () => {});
    const cards = container.querySelectorAll('.path-card');
    expect(cards.length).toBe(PATHS.length);
  });

  it('renders path names and taglines', () => {
    renderLearningPaths(container, PATHS, makeProgress(), () => {});
    const html = container.innerHTML;
    expect(html).toContain('Memory Deep Dive');
    expect(html).toContain('From pages to OOM');
    expect(html).toContain('Network Stack');
  });

  it('renders N/M skills and percent per card', () => {
    const progress = makeProgress({ completedSkills: ['boot-and-init'] });
    renderLearningPaths(container, PATHS, progress, () => {});
    const firstCard = container.querySelector('.path-card[data-path-id="memory-deep-dive"]')!;
    expect(firstCard.textContent).toContain('1/4');
    expect(firstCard.textContent).toMatch(/25%/);
  });

  it('renders an ordered skill list for each path', () => {
    renderLearningPaths(container, PATHS, makeProgress(), () => {});
    const firstCard = container.querySelector('.path-card[data-path-id="memory-deep-dive"]')!;
    const items = firstCard.querySelectorAll('.path-skill');
    expect(items.length).toBe(4);
    // Names are prettified (hyphens -> spaces) for display
    expect(items[0].textContent).toContain('boot and init');
    expect(items[3].textContent).toContain('memcg and oom');
  });

  it('marks completed skills with a .completed class', () => {
    const progress = makeProgress({ completedSkills: ['boot-and-init'] });
    renderLearningPaths(container, PATHS, progress, () => {});
    const firstCard = container.querySelector('.path-card[data-path-id="memory-deep-dive"]')!;
    const items = firstCard.querySelectorAll('.path-skill');
    expect(items[0].classList.contains('completed')).toBe(true);
    expect(items[1].classList.contains('completed')).toBe(false);
  });

  it('calls onFocus with path id when Focus button is clicked', () => {
    let focused = '';
    renderLearningPaths(container, PATHS, makeProgress(), (id) => { focused = id; });
    const btn = container.querySelector(
      '.path-card[data-path-id="memory-deep-dive"] .path-focus-btn',
    ) as HTMLButtonElement;
    btn.click();
    expect(focused).toBe('memory-deep-dive');
  });
});

describe('openLearningPaths / closeLearningPaths', () => {
  it('opens by removing hidden class', () => {
    openLearningPaths(container, PATHS, makeProgress(), () => {});
    expect(container.classList.contains('hidden')).toBe(false);
  });

  it('closes by adding hidden class', () => {
    openLearningPaths(container, PATHS, makeProgress(), () => {});
    closeLearningPaths(container);
    expect(container.classList.contains('hidden')).toBe(true);
  });

  it('close button dismisses the modal', () => {
    openLearningPaths(container, PATHS, makeProgress(), () => {});
    (container.querySelector('#learning-paths-close') as HTMLButtonElement).click();
    expect(container.classList.contains('hidden')).toBe(true);
  });

  it('backdrop click dismisses the modal', () => {
    openLearningPaths(container, PATHS, makeProgress(), () => {});
    (container.querySelector('.modal-backdrop') as HTMLElement).click();
    expect(container.classList.contains('hidden')).toBe(true);
  });

  it('Escape key dismisses the modal', () => {
    openLearningPaths(container, PATHS, makeProgress(), () => {});
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(container.classList.contains('hidden')).toBe(true);
  });

  it('closes automatically after onFocus fires', () => {
    openLearningPaths(container, PATHS, makeProgress(), () => {});
    const btn = container.querySelector(
      '.path-card[data-path-id="memory-deep-dive"] .path-focus-btn',
    ) as HTMLButtonElement;
    btn.click();
    expect(container.classList.contains('hidden')).toBe(true);
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import {
  computeRealmStats,
  computeGlobalStats,
  renderRealmProgress,
  openRealmProgress,
  closeRealmProgress,
} from './realm-progress.js';
import type { Skill, Progress, Realm } from './types.js';

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    name: 'skill',
    description: 'test',
    realm: 'foundations',
    category: 'x',
    difficulty: 'beginner',
    xp: 100,
    estimated_minutes: 60,
    prerequisites: [],
    unlocks: [],
    kernel_files: [],
    doc_files: [],
    badge: 'Badge',
    tags: [],
    content: '# Test',
    ...overrides,
  };
}

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

const REALMS: Realm[] = [
  { id: 'foundations', name: 'The Foundations', color: '#c9a227', icon: 'F', description: 'x' },
  { id: 'memory', name: 'Memory Arcana', color: '#2d6b2d', icon: 'M', description: 'x' },
  { id: 'scheduler', name: "The Scheduler's Domain", color: '#7b2d8b', icon: 'S', description: 'x' },
];

const SKILLS: Skill[] = [
  makeSkill({ name: 'boot-and-init', realm: 'foundations', xp: 100 }),
  makeSkill({ name: 'system-calls', realm: 'foundations', xp: 150 }),
  makeSkill({ name: 'kernel-modules', realm: 'foundations', xp: 200 }),
  makeSkill({ name: 'page-allocation', realm: 'memory', xp: 200 }),
  makeSkill({ name: 'slab-allocator', realm: 'memory', xp: 200 }),
  makeSkill({ name: 'scheduler-fundamentals', realm: 'scheduler', xp: 150 }),
];

let container: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = `
    <div id="realm-progress-modal" class="modal hidden" role="dialog" aria-modal="true">
      <div class="modal-backdrop"></div>
      <div class="modal-content">
        <button class="modal-close" id="realm-progress-close">&times;</button>
        <h2>Realm Progress</h2>
        <div id="realm-progress-summary"></div>
        <div id="realm-progress-list"></div>
        <div id="realm-progress-toolbar">
          <button id="btn-export-progress" type="button">Export</button>
          <button id="btn-import-progress" type="button">Import</button>
          <input id="import-progress-file" type="file" accept="application/json" hidden />
          <button id="btn-reset-progress" type="button">Reset</button>
        </div>
      </div>
    </div>
  `;
  container = document.getElementById('realm-progress-modal')!;
});

describe('computeRealmStats', () => {
  it('returns one entry per realm', () => {
    const stats = computeRealmStats(SKILLS, REALMS, makeProgress());
    expect(stats.length).toBe(REALMS.length);
  });

  it('returns stats in realms.json order', () => {
    const stats = computeRealmStats(SKILLS, REALMS, makeProgress());
    expect(stats.map(s => s.realm.id)).toEqual(['foundations', 'memory', 'scheduler']);
  });

  it('counts 0/N complete with no progress', () => {
    const stats = computeRealmStats(SKILLS, REALMS, makeProgress());
    const foundations = stats.find(s => s.realm.id === 'foundations')!;
    expect(foundations.completed).toBe(0);
    expect(foundations.total).toBe(3);
    expect(foundations.percent).toBe(0);
  });

  it('counts N/N complete as 100%', () => {
    const progress = makeProgress({
      completedSkills: ['boot-and-init', 'system-calls', 'kernel-modules'],
    });
    const stats = computeRealmStats(SKILLS, REALMS, progress);
    const foundations = stats.find(s => s.realm.id === 'foundations')!;
    expect(foundations.completed).toBe(3);
    expect(foundations.total).toBe(3);
    expect(foundations.percent).toBe(100);
  });

  it('calculates partial percent correctly', () => {
    const progress = makeProgress({ completedSkills: ['boot-and-init'] });
    const stats = computeRealmStats(SKILLS, REALMS, progress);
    const foundations = stats.find(s => s.realm.id === 'foundations')!;
    expect(foundations.completed).toBe(1);
    expect(foundations.total).toBe(3);
    expect(Math.round(foundations.percent)).toBe(33);
  });

  it('sums XP earned per realm', () => {
    const progress = makeProgress({
      completedSkills: ['boot-and-init', 'system-calls', 'page-allocation'],
    });
    const stats = computeRealmStats(SKILLS, REALMS, progress);
    const foundations = stats.find(s => s.realm.id === 'foundations')!;
    expect(foundations.xpEarned).toBe(250); // 100 + 150
    const memory = stats.find(s => s.realm.id === 'memory')!;
    expect(memory.xpEarned).toBe(200);
  });

  it('sums total XP per realm', () => {
    const stats = computeRealmStats(SKILLS, REALMS, makeProgress());
    const foundations = stats.find(s => s.realm.id === 'foundations')!;
    expect(foundations.xpTotal).toBe(450); // 100 + 150 + 200
    const memory = stats.find(s => s.realm.id === 'memory')!;
    expect(memory.xpTotal).toBe(400);
    const scheduler = stats.find(s => s.realm.id === 'scheduler')!;
    expect(scheduler.xpTotal).toBe(150);
  });

  it('handles an empty realm (no skills) with percent 0', () => {
    const emptyRealms: Realm[] = [
      ...REALMS,
      { id: 'empty', name: 'Empty', color: '#000', icon: 'E', description: 'x' },
    ];
    const stats = computeRealmStats(SKILLS, emptyRealms, makeProgress());
    const empty = stats.find(s => s.realm.id === 'empty')!;
    expect(empty.total).toBe(0);
    expect(empty.completed).toBe(0);
    expect(empty.percent).toBe(0);
    expect(empty.xpTotal).toBe(0);
  });
});

describe('computeGlobalStats', () => {
  it('sums totals across every skill', () => {
    const stats = computeGlobalStats(SKILLS, makeProgress());
    expect(stats.totalSkills).toBe(6);
    expect(stats.xpTotal).toBe(1000); // 100 + 150 + 200 + 200 + 200 + 150
  });

  it('reports zero completion when no progress', () => {
    const stats = computeGlobalStats(SKILLS, makeProgress());
    expect(stats.completedSkills).toBe(0);
    expect(stats.percent).toBe(0);
    expect(stats.xpEarned).toBe(0);
  });

  it('reports full completion when every skill is done', () => {
    const progress = makeProgress({
      completedSkills: SKILLS.map(s => s.name),
    });
    const stats = computeGlobalStats(SKILLS, progress);
    expect(stats.completedSkills).toBe(6);
    expect(stats.percent).toBe(100);
    expect(stats.xpEarned).toBe(1000);
  });

  it('computes partial percent correctly', () => {
    const progress = makeProgress({
      completedSkills: ['boot-and-init', 'system-calls', 'page-allocation'],
    });
    const stats = computeGlobalStats(SKILLS, progress);
    expect(stats.completedSkills).toBe(3);
    expect(Math.round(stats.percent)).toBe(50);
    expect(stats.xpEarned).toBe(450); // 100 + 150 + 200
  });

  it('returns percent 0 for an empty skill set', () => {
    const stats = computeGlobalStats([], makeProgress());
    expect(stats.totalSkills).toBe(0);
    expect(stats.percent).toBe(0);
    expect(stats.xpTotal).toBe(0);
  });
});

describe('renderRealmProgress', () => {
  it('renders a row per realm', () => {
    renderRealmProgress(container, SKILLS, REALMS, makeProgress());
    const rows = container.querySelectorAll('.realm-row');
    expect(rows.length).toBe(REALMS.length);
  });

  it('renders realm names', () => {
    renderRealmProgress(container, SKILLS, REALMS, makeProgress());
    const html = container.innerHTML;
    for (const r of REALMS) {
      expect(html).toContain(r.name);
    }
  });

  it('renders X/Y count text', () => {
    const progress = makeProgress({ completedSkills: ['boot-and-init'] });
    renderRealmProgress(container, SKILLS, REALMS, progress);
    const html = container.innerHTML;
    expect(html).toContain('1/3');
  });

  it('renders XP earned/total', () => {
    const progress = makeProgress({ completedSkills: ['page-allocation'] });
    renderRealmProgress(container, SKILLS, REALMS, progress);
    const html = container.innerHTML;
    // memory realm: 200/400
    expect(html).toContain('200');
    expect(html).toContain('400');
  });

  it('renders a progress bar with width reflecting percent', () => {
    const progress = makeProgress({
      completedSkills: ['boot-and-init', 'system-calls', 'kernel-modules'],
    });
    renderRealmProgress(container, SKILLS, REALMS, progress);
    const bars = container.querySelectorAll('.realm-row .realm-bar-fill');
    expect(bars.length).toBe(REALMS.length);
    const foundationsRow = container.querySelector('.realm-row[data-realm="foundations"]')!;
    const fill = foundationsRow.querySelector('.realm-bar-fill') as HTMLElement;
    expect(fill.style.width).toBe('100%');
  });

  it('maintains realms.json order in rendered rows', () => {
    renderRealmProgress(container, SKILLS, REALMS, makeProgress());
    const rows = Array.from(container.querySelectorAll('.realm-row'));
    const ids = rows.map(r => r.getAttribute('data-realm'));
    expect(ids).toEqual(['foundations', 'memory', 'scheduler']);
  });

  it('renders a global summary row with X/N skills and percent', () => {
    const progress = makeProgress({ completedSkills: ['boot-and-init', 'system-calls'] });
    renderRealmProgress(container, SKILLS, REALMS, progress);
    const summary = container.querySelector('#realm-progress-summary')!;
    expect(summary.textContent).toContain('2/6');
    expect(summary.textContent).toMatch(/33%/);
  });

  it('renders total XP earned vs available in the summary', () => {
    const progress = makeProgress({ completedSkills: ['page-allocation'] });
    renderRealmProgress(container, SKILLS, REALMS, progress);
    const summary = container.querySelector('#realm-progress-summary')!;
    // 200 earned out of 1000 total
    expect(summary.textContent).toContain('200');
    expect(summary.textContent).toContain('1000');
  });
});

describe('openRealmProgress / closeRealmProgress', () => {
  it('opens by removing hidden class', () => {
    openRealmProgress(container, SKILLS, REALMS, makeProgress());
    expect(container.classList.contains('hidden')).toBe(false);
  });

  it('closes by adding hidden class', () => {
    openRealmProgress(container, SKILLS, REALMS, makeProgress());
    closeRealmProgress(container);
    expect(container.classList.contains('hidden')).toBe(true);
  });

  it('close button click closes the modal', () => {
    openRealmProgress(container, SKILLS, REALMS, makeProgress());
    const closeBtn = container.querySelector('#realm-progress-close') as HTMLButtonElement;
    closeBtn.click();
    expect(container.classList.contains('hidden')).toBe(true);
  });

  it('backdrop click closes the modal', () => {
    openRealmProgress(container, SKILLS, REALMS, makeProgress());
    const backdrop = container.querySelector('.modal-backdrop') as HTMLElement;
    backdrop.click();
    expect(container.classList.contains('hidden')).toBe(true);
  });

  it('Escape key closes the modal', () => {
    openRealmProgress(container, SKILLS, REALMS, makeProgress());
    const evt = new KeyboardEvent('keydown', { key: 'Escape' });
    document.dispatchEvent(evt);
    expect(container.classList.contains('hidden')).toBe(true);
  });

  it('re-renders when reopened with updated progress', () => {
    openRealmProgress(container, SKILLS, REALMS, makeProgress());
    expect(container.innerHTML).toContain('0/3');
    openRealmProgress(container, SKILLS, REALMS, makeProgress({
      completedSkills: ['boot-and-init'],
    }));
    expect(container.innerHTML).toContain('1/3');
  });

  it('invokes onExport when the Export button is clicked', () => {
    let called = 0;
    openRealmProgress(container, SKILLS, REALMS, makeProgress(), {
      onExport: () => { called++; },
    });
    (container.querySelector('#btn-export-progress') as HTMLButtonElement).click();
    expect(called).toBe(1);
  });

  it('invokes onReset when the Reset button is clicked', () => {
    let called = 0;
    openRealmProgress(container, SKILLS, REALMS, makeProgress(), {
      onReset: () => { called++; },
    });
    (container.querySelector('#btn-reset-progress') as HTMLButtonElement).click();
    expect(called).toBe(1);
  });

  it('triggers the hidden file input when Import is clicked', () => {
    let clicked = 0;
    openRealmProgress(container, SKILLS, REALMS, makeProgress(), {
      onImportFile: () => {},
    });
    const fileInput = container.querySelector('#import-progress-file') as HTMLInputElement;
    fileInput.click = () => { clicked++; };
    (container.querySelector('#btn-import-progress') as HTMLButtonElement).click();
    expect(clicked).toBe(1);
  });

  it('invokes onImportFile when a file is chosen', () => {
    let received: File | undefined;
    openRealmProgress(container, SKILLS, REALMS, makeProgress(), {
      onImportFile: (file) => { received = file; },
    });
    const fileInput = container.querySelector('#import-progress-file') as HTMLInputElement;
    const file = new File(['{}'], 'progress.json', { type: 'application/json' });
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    fileInput.dispatchEvent(new Event('change'));
    expect(received).toBe(file);
  });

  it('handler callbacks are optional and safe to omit', () => {
    openRealmProgress(container, SKILLS, REALMS, makeProgress());
    const exportBtn = container.querySelector('#btn-export-progress') as HTMLButtonElement;
    expect(() => exportBtn.click()).not.toThrow();
  });
});

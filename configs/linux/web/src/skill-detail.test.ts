import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderDetail } from './skill-detail.js';
import type { Skill, Progress } from './types.js';

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    name: 'boot-and-init',
    description: 'test',
    realm: 'foundations',
    category: 'boot',
    difficulty: 'beginner',
    xp: 100,
    estimated_minutes: 60,
    prerequisites: [],
    unlocks: [],
    kernel_files: ['init/main.c', 'arch/x86/boot/header.S'],
    doc_files: [],
    badge: 'First Boot',
    tags: [],
    content: `# Boot and Init

## Learning Objectives

- Trace the boot sequence
- Understand start_kernel() in init/main.c

## Code Walkthrough

Open fs/namei.c and trace the path.

## Verification Criteria

- [ ] Can describe the boot chain
- [ ] Can read dmesg output`,
    ...overrides,
  };
}

function makeProgress(overrides: Partial<Progress> = {}): Progress {
  return {
    version: 1, completedSkills: [], inProgressSkills: [],
    totalXP: 0, badges: [], verificationChecks: {},
    startedAt: '2026-01-01T00:00:00Z', ...overrides,
  };
}

let panel: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = `
    <aside id="detail-panel" class="hidden">
      <button id="detail-close">&times;</button>
      <div id="detail-header">
        <span id="detail-badge" class="badge"></span>
        <h2 id="detail-title"></h2>
        <div id="detail-meta"></div>
      </div>
      <div id="detail-actions">
        <button id="btn-start" class="action-btn">Start Quest</button>
        <button id="btn-complete" class="action-btn">Mark Complete</button>
      </div>
      <div id="detail-content"></div>
    </aside>
  `;
  panel = document.getElementById('detail-panel')!;
});

describe('renderDetail', () => {
  it('shows the panel (removes hidden class)', () => {
    renderDetail(panel, makeSkill(), makeProgress(), vi.fn(), vi.fn());
    expect(panel.classList.contains('hidden')).toBe(false);
  });

  it('sets the title from skill name', () => {
    renderDetail(panel, makeSkill(), makeProgress(), vi.fn(), vi.fn());
    expect(document.getElementById('detail-title')!.textContent).toBe('boot and init');
  });

  it('renders metadata tags', () => {
    renderDetail(panel, makeSkill(), makeProgress(), vi.fn(), vi.fn());
    const meta = document.getElementById('detail-meta')!;
    expect(meta.innerHTML).toContain('foundations');
    expect(meta.innerHTML).toContain('Beginner');
    expect(meta.innerHTML).toContain('100 XP');
    expect(meta.innerHTML).toContain('60 min');
  });

  it('renders badge with correct state class', () => {
    const progress = makeProgress({ completedSkills: ['boot-and-init'] });
    renderDetail(panel, makeSkill(), progress, vi.fn(), vi.fn());
    const badge = document.getElementById('detail-badge')!;
    expect(badge.textContent).toBe('First Boot');
    expect(badge.className).toContain('badge-completed');
  });

  it('renders markdown content', () => {
    renderDetail(panel, makeSkill(), makeProgress(), vi.fn(), vi.fn());
    const content = document.getElementById('detail-content')!;
    expect(content.innerHTML).toContain('<h1');
    expect(content.innerHTML).toContain('Boot and Init');
    expect(content.innerHTML).toContain('Learning Objectives');
  });

  it('linkifies kernel file paths in content', () => {
    renderDetail(panel, makeSkill(), makeProgress(), vi.fn(), vi.fn());
    const content = document.getElementById('detail-content')!;
    const links = content.querySelectorAll('a.kernel-link');
    // Should have links for init/main.c, fs/namei.c from content + source files section
    expect(links.length).toBeGreaterThan(0);
    const hrefs = Array.from(links).map(a => a.getAttribute('href'));
    expect(hrefs.some(h => h?.includes('init/main.c'))).toBe(true);
  });

  it('renders kernel source files section', () => {
    renderDetail(panel, makeSkill(), makeProgress(), vi.fn(), vi.fn());
    const section = document.querySelector('.kernel-files-section');
    expect(section).not.toBeNull();
    expect(section!.innerHTML).toContain('init/main.c');
    expect(section!.innerHTML).toContain('arch/x86/boot/header.S');
  });

  it('shows Start button for available skills', () => {
    renderDetail(panel, makeSkill(), makeProgress(), vi.fn(), vi.fn());
    const btn = document.getElementById('btn-start') as HTMLButtonElement;
    expect(btn.style.display).not.toBe('none');
  });

  it('hides Start button for completed skills', () => {
    const progress = makeProgress({ completedSkills: ['boot-and-init'] });
    renderDetail(panel, makeSkill(), progress, vi.fn(), vi.fn());
    const btn = document.getElementById('btn-start') as HTMLButtonElement;
    expect(btn.style.display).toBe('none');
  });

  it('shows disabled Complete button for completed skills', () => {
    const progress = makeProgress({ completedSkills: ['boot-and-init'] });
    renderDetail(panel, makeSkill(), progress, vi.fn(), vi.fn());
    const btn = document.getElementById('btn-complete') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toBe('Completed');
  });

  it('calls onStart when Start button is clicked', () => {
    const onStart = vi.fn();
    renderDetail(panel, makeSkill(), makeProgress(), onStart, vi.fn());
    (document.getElementById('btn-start') as HTMLButtonElement).click();
    expect(onStart).toHaveBeenCalledOnce();
  });

  it('calls onComplete when Complete button is clicked', () => {
    const onComplete = vi.fn();
    renderDetail(panel, makeSkill(), makeProgress(), vi.fn(), onComplete);
    (document.getElementById('btn-complete') as HTMLButtonElement).click();
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('renders verification criteria as checkboxes', () => {
    renderDetail(panel, makeSkill(), makeProgress(), vi.fn(), vi.fn());
    // marked converts - [ ] into <input type="checkbox"> inside <li> elements
    const checkboxes = document.querySelectorAll('#detail-content input[type="checkbox"]');
    expect(checkboxes.length).toBe(2);
  });

  it('renders intermediate difficulty label correctly', () => {
    renderDetail(panel, makeSkill({ difficulty: 'intermediate' }), makeProgress(), vi.fn(), vi.fn());
    const meta = document.getElementById('detail-meta')!;
    expect(meta.innerHTML).toContain('Intermediate');
    expect(meta.innerHTML).toContain('meta-diff-intermediate');
  });

  it('handles skills with no kernel files', () => {
    renderDetail(panel, makeSkill({ kernel_files: [] }), makeProgress(), vi.fn(), vi.fn());
    const section = document.querySelector('.kernel-files-section');
    expect(section).toBeNull();
  });

  it('hides Start button for in-progress skills', () => {
    const progress = makeProgress({ inProgressSkills: ['boot-and-init'] });
    renderDetail(panel, makeSkill(), progress, vi.fn(), vi.fn());
    const btn = document.getElementById('btn-start') as HTMLButtonElement;
    expect(btn.style.display).toBe('none');
  });

  it('shows Complete button for in-progress skills', () => {
    const progress = makeProgress({ inProgressSkills: ['boot-and-init'] });
    renderDetail(panel, makeSkill(), progress, vi.fn(), vi.fn());
    const btn = document.getElementById('btn-complete') as HTMLButtonElement;
    expect(btn.style.display).not.toBe('none');
    expect(btn.disabled).toBe(false);
  });
});

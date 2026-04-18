import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderBadgesGallery, openBadgesGallery, closeBadgesGallery } from './badges-gallery.js';
import type { Skill, Progress, Realm } from './types.js';

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
    kernel_files: [],
    doc_files: [],
    badge: 'First Boot',
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
  makeSkill({ name: 'boot-and-init', realm: 'foundations', badge: 'First Boot' }),
  makeSkill({ name: 'system-calls', realm: 'foundations', badge: 'Syscall Sage' }),
  makeSkill({ name: 'page-allocation', realm: 'memory', badge: 'Page Master' }),
  makeSkill({ name: 'slab-allocator', realm: 'memory', badge: 'Slab Sorcerer' }),
  makeSkill({ name: 'scheduler-fundamentals', realm: 'scheduler', badge: 'Timeslice Tactician' }),
];

let container: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = `
    <div id="badges-modal" class="modal hidden" role="dialog" aria-modal="true">
      <div class="modal-backdrop"></div>
      <div class="modal-content">
        <button class="modal-close" id="badges-close">&times;</button>
        <h2>Badges</h2>
        <div id="badges-grid"></div>
      </div>
    </div>
  `;
  container = document.getElementById('badges-modal')!;
});

describe('renderBadgesGallery', () => {
  it('renders one tile per skill', () => {
    renderBadgesGallery(container, SKILLS, REALMS, makeProgress());
    const tiles = container.querySelectorAll('.badge-tile');
    expect(tiles.length).toBe(SKILLS.length);
  });

  it('marks tiles as unlocked when badge is in progress.badges', () => {
    const progress = makeProgress({ badges: ['First Boot', 'Page Master'] });
    renderBadgesGallery(container, SKILLS, REALMS, progress);
    const unlocked = container.querySelectorAll('.badge-tile.unlocked');
    expect(unlocked.length).toBe(2);
  });

  it('marks tiles as locked when badge is not earned', () => {
    const progress = makeProgress({ badges: ['First Boot'] });
    renderBadgesGallery(container, SKILLS, REALMS, progress);
    const locked = container.querySelectorAll('.badge-tile.locked');
    expect(locked.length).toBe(SKILLS.length - 1);
  });

  it('shows Earned label for unlocked badges', () => {
    const progress = makeProgress({ badges: ['First Boot'] });
    renderBadgesGallery(container, SKILLS, REALMS, progress);
    const unlocked = container.querySelector('.badge-tile.unlocked')!;
    expect(unlocked.textContent).toContain('Earned');
  });

  it('shows source skill name hint on locked badges', () => {
    renderBadgesGallery(container, SKILLS, REALMS, makeProgress());
    const locked = container.querySelector('.badge-tile.locked')!;
    // Locked tiles should indicate the requirement (source skill name)
    const text = locked.textContent || '';
    // at least one known skill name appears
    const anySkill = SKILLS.some(s => text.includes(s.name.replace(/-/g, ' ')) || text.includes(s.name));
    expect(anySkill).toBe(true);
  });

  it('renders badge name in each tile', () => {
    renderBadgesGallery(container, SKILLS, REALMS, makeProgress());
    const html = container.innerHTML;
    for (const s of SKILLS) {
      expect(html).toContain(s.badge);
    }
  });

  it('applies realm color accent via data attribute or inline style', () => {
    renderBadgesGallery(container, SKILLS, REALMS, makeProgress());
    const tiles = container.querySelectorAll('.badge-tile');
    // Each tile should reference its realm somehow (data attr or style)
    tiles.forEach((tile) => {
      const realmAttr = tile.getAttribute('data-realm');
      expect(realmAttr).toBeTruthy();
    });
  });

  it('sorts unlocked badges before locked badges', () => {
    const progress = makeProgress({ badges: ['Slab Sorcerer'] });
    renderBadgesGallery(container, SKILLS, REALMS, progress);
    const tiles = Array.from(container.querySelectorAll('.badge-tile'));
    const firstClass = tiles[0].className;
    expect(firstClass).toContain('unlocked');
    // first one unlocked, rest locked
    for (let i = 1; i < tiles.length; i++) {
      expect(tiles[i].className).toContain('locked');
    }
  });

  it('uses a star fallback character, no emoji', () => {
    renderBadgesGallery(container, SKILLS, REALMS, makeProgress());
    const icons = container.querySelectorAll('.badge-tile-icon');
    expect(icons.length).toBe(SKILLS.length);
    icons.forEach((icon) => {
      expect(icon.textContent).toBe('\u2605');
    });
  });

  it('renders empty grid when there are no skills', () => {
    renderBadgesGallery(container, [], REALMS, makeProgress());
    const tiles = container.querySelectorAll('.badge-tile');
    expect(tiles.length).toBe(0);
  });

  it('groups sort within locked and unlocked by realm order', () => {
    // Unlocked: Page Master (memory), Slab Sorcerer (memory), First Boot (foundations)
    // Expected unlocked order: foundations first then memory
    const progress = makeProgress({ badges: ['Page Master', 'Slab Sorcerer', 'First Boot'] });
    renderBadgesGallery(container, SKILLS, REALMS, progress);
    const tiles = Array.from(container.querySelectorAll('.badge-tile'));
    const unlockedRealms = tiles
      .filter(t => t.className.includes('unlocked'))
      .map(t => t.getAttribute('data-realm'));
    // foundations should come before memory since realms ordered that way
    expect(unlockedRealms[0]).toBe('foundations');
    expect(unlockedRealms[unlockedRealms.length - 1]).toBe('memory');
  });
});

describe('openBadgesGallery / closeBadgesGallery', () => {
  it('opens the modal by removing hidden class', () => {
    openBadgesGallery(container, SKILLS, REALMS, makeProgress());
    expect(container.classList.contains('hidden')).toBe(false);
  });

  it('closes the modal by adding hidden class', () => {
    openBadgesGallery(container, SKILLS, REALMS, makeProgress());
    closeBadgesGallery(container);
    expect(container.classList.contains('hidden')).toBe(true);
  });

  it('re-renders tiles when reopened with updated progress', () => {
    openBadgesGallery(container, SKILLS, REALMS, makeProgress());
    let unlocked = container.querySelectorAll('.badge-tile.unlocked');
    expect(unlocked.length).toBe(0);
    openBadgesGallery(container, SKILLS, REALMS, makeProgress({ badges: ['First Boot'] }));
    unlocked = container.querySelectorAll('.badge-tile.unlocked');
    expect(unlocked.length).toBe(1);
  });

  it('close button click closes the modal', () => {
    openBadgesGallery(container, SKILLS, REALMS, makeProgress());
    const closeBtn = container.querySelector('#badges-close') as HTMLButtonElement;
    closeBtn.click();
    // The close handler must be wired by openBadgesGallery
    expect(container.classList.contains('hidden')).toBe(true);
  });

  it('backdrop click closes the modal', () => {
    openBadgesGallery(container, SKILLS, REALMS, makeProgress());
    const backdrop = container.querySelector('.modal-backdrop') as HTMLElement;
    backdrop.click();
    expect(container.classList.contains('hidden')).toBe(true);
  });

  it('Escape key closes the modal', () => {
    openBadgesGallery(container, SKILLS, REALMS, makeProgress());
    const evt = new KeyboardEvent('keydown', { key: 'Escape' });
    document.dispatchEvent(evt);
    expect(container.classList.contains('hidden')).toBe(true);
  });

  it('Escape key does nothing when modal is already hidden', () => {
    container.classList.add('hidden');
    const evt = new KeyboardEvent('keydown', { key: 'Escape' });
    // Should not throw
    expect(() => document.dispatchEvent(evt)).not.toThrow();
    expect(container.classList.contains('hidden')).toBe(true);
  });
});

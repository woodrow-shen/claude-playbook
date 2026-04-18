import type { Skill, Realm, Progress } from './types.js';

// Single star character, no emoji, per brief requirement.
const BADGE_ICON = '\u2605';

interface BadgeTileData {
  skill: Skill;
  realm: Realm | undefined;
  unlocked: boolean;
}

function buildTiles(skills: Skill[], realms: Realm[], progress: Progress): BadgeTileData[] {
  const realmOrder = new Map<string, number>();
  realms.forEach((r, i) => realmOrder.set(r.id, i));
  const earned = new Set(progress.badges);

  const tiles = skills.map<BadgeTileData>((skill) => ({
    skill,
    realm: realms.find((r) => r.id === skill.realm),
    unlocked: earned.has(skill.badge),
  }));

  tiles.sort((a, b) => {
    // Unlocked first
    if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
    // Within group, sort by realms.json order
    const ao = realmOrder.get(a.skill.realm) ?? 999;
    const bo = realmOrder.get(b.skill.realm) ?? 999;
    if (ao !== bo) return ao - bo;
    // Stable within realm by badge name
    return a.skill.badge.localeCompare(b.skill.badge);
  });

  return tiles;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderBadgesGallery(
  container: HTMLElement,
  skills: Skill[],
  realms: Realm[],
  progress: Progress,
): void {
  const grid = container.querySelector('#badges-grid') as HTMLElement | null;
  if (!grid) return;

  const tiles = buildTiles(skills, realms, progress);

  grid.innerHTML = tiles
    .map((t) => {
      const stateClass = t.unlocked ? 'unlocked' : 'locked';
      const color = t.realm?.color ?? '#484f58';
      const realmName = t.realm?.name ?? t.skill.realm;
      const skillLabel = t.skill.name.replace(/-/g, ' ');
      const hint = t.unlocked
        ? '<span class="badge-tile-status">Earned</span>'
        : `<span class="badge-tile-status">Locked: complete ${escapeHtml(skillLabel)}</span>`;
      return `
        <div class="badge-tile ${stateClass}" data-realm="${escapeHtml(t.skill.realm)}" style="--realm-color: ${escapeHtml(color)}">
          <div class="badge-tile-icon" aria-hidden="true">${BADGE_ICON}</div>
          <div class="badge-tile-name">${escapeHtml(t.skill.badge)}</div>
          <div class="badge-tile-source">${escapeHtml(skillLabel)}</div>
          <div class="badge-tile-realm">${escapeHtml(realmName)}</div>
          ${hint}
        </div>
      `;
    })
    .join('');
}

// Track the currently open modal so the global Escape handler can target it.
const openModals = new Set<HTMLElement>();

let escapeHandlerAttached = false;
function ensureEscapeHandler(): void {
  if (escapeHandlerAttached) return;
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    for (const el of openModals) {
      el.classList.add('hidden');
    }
    openModals.clear();
  });
  escapeHandlerAttached = true;
}

export function openBadgesGallery(
  container: HTMLElement,
  skills: Skill[],
  realms: Realm[],
  progress: Progress,
): void {
  renderBadgesGallery(container, skills, realms, progress);
  container.classList.remove('hidden');
  openModals.add(container);

  // Wire close handlers idempotently per-open: use a one-shot flag to avoid stacking listeners.
  if (!container.dataset.wired) {
    const closeBtn = container.querySelector('#badges-close') as HTMLElement | null;
    const backdrop = container.querySelector('.modal-backdrop') as HTMLElement | null;
    closeBtn?.addEventListener('click', () => closeBadgesGallery(container));
    backdrop?.addEventListener('click', () => closeBadgesGallery(container));
    container.dataset.wired = '1';
  }

  ensureEscapeHandler();
}

export function closeBadgesGallery(container: HTMLElement): void {
  container.classList.add('hidden');
  openModals.delete(container);
}

import type { Skill, Realm, Progress } from './types.js';

export interface RealmStats {
  realm: Realm;
  completed: number;
  total: number;
  percent: number;
  xpEarned: number;
  xpTotal: number;
}

export interface GlobalStats {
  completedSkills: number;
  totalSkills: number;
  percent: number;
  xpEarned: number;
  xpTotal: number;
}

export interface RealmProgressHandlers {
  onExport?: () => void;
  onImportFile?: (file: File) => void;
  onReset?: () => void;
}

export function computeRealmStats(
  skills: Skill[],
  realms: Realm[],
  progress: Progress,
): RealmStats[] {
  const completedSet = new Set(progress.completedSkills);
  return realms.map((realm) => {
    const inRealm = skills.filter((s) => s.realm === realm.id);
    const completedSkills = inRealm.filter((s) => completedSet.has(s.name));
    const total = inRealm.length;
    const completed = completedSkills.length;
    const xpTotal = inRealm.reduce((acc, s) => acc + s.xp, 0);
    const xpEarned = completedSkills.reduce((acc, s) => acc + s.xp, 0);
    const percent = total > 0 ? (completed / total) * 100 : 0;
    return { realm, completed, total, percent, xpEarned, xpTotal };
  });
}

export function computeGlobalStats(skills: Skill[], progress: Progress): GlobalStats {
  const completedSet = new Set(progress.completedSkills);
  const completedList = skills.filter((s) => completedSet.has(s.name));
  const totalSkills = skills.length;
  const completedSkills = completedList.length;
  const xpTotal = skills.reduce((acc, s) => acc + s.xp, 0);
  const xpEarned = completedList.reduce((acc, s) => acc + s.xp, 0);
  const percent = totalSkills > 0 ? (completedSkills / totalSkills) * 100 : 0;
  return { completedSkills, totalSkills, percent, xpEarned, xpTotal };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderGlobalSummary(container: HTMLElement, skills: Skill[], progress: Progress): void {
  const summary = container.querySelector('#realm-progress-summary') as HTMLElement | null;
  if (!summary) return;
  const g = computeGlobalStats(skills, progress);
  const pct = Math.round(g.percent);
  summary.innerHTML = `
    <div class="realm-global-summary">
      <div class="realm-global-line">
        <span class="realm-global-label">Overall Progress</span>
        <span class="realm-global-count">${g.completedSkills}/${g.totalSkills} skills</span>
        <span class="realm-global-percent">${pct}%</span>
      </div>
      <div class="realm-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
        <div class="realm-bar-fill" style="width: ${pct}%"></div>
      </div>
      <div class="realm-global-xp">${g.xpEarned} / ${g.xpTotal} XP</div>
    </div>
  `;
}

export function renderRealmProgress(
  container: HTMLElement,
  skills: Skill[],
  realms: Realm[],
  progress: Progress,
): void {
  renderGlobalSummary(container, skills, progress);

  const list = container.querySelector('#realm-progress-list') as HTMLElement | null;
  if (!list) return;

  const stats = computeRealmStats(skills, realms, progress);
  list.innerHTML = stats
    .map((st) => {
      const pct = Math.round(st.percent);
      return `
        <div class="realm-row" data-realm="${escapeHtml(st.realm.id)}" style="--realm-color: ${escapeHtml(st.realm.color)}">
          <div class="realm-row-header">
            <span class="realm-row-icon" aria-hidden="true">${escapeHtml(st.realm.icon)}</span>
            <span class="realm-row-name">${escapeHtml(st.realm.name)}</span>
            <span class="realm-row-count">${st.completed}/${st.total}</span>
          </div>
          <div class="realm-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
            <div class="realm-bar-fill" style="width: ${pct}%"></div>
          </div>
          <div class="realm-row-meta">
            <span class="realm-row-xp">${st.xpEarned} / ${st.xpTotal} XP</span>
            <span class="realm-row-percent">${pct}%</span>
          </div>
        </div>
      `;
    })
    .join('');
}

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

function wireToolbar(container: HTMLElement, handlers: RealmProgressHandlers): void {
  const exportBtn = container.querySelector('#btn-export-progress') as HTMLButtonElement | null;
  const importBtn = container.querySelector('#btn-import-progress') as HTMLButtonElement | null;
  const resetBtn = container.querySelector('#btn-reset-progress') as HTMLButtonElement | null;
  const fileInput = container.querySelector('#import-progress-file') as HTMLInputElement | null;

  exportBtn?.addEventListener('click', () => {
    handlers.onExport?.();
  });
  resetBtn?.addEventListener('click', () => {
    handlers.onReset?.();
  });
  importBtn?.addEventListener('click', () => {
    fileInput?.click();
  });
  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) handlers.onImportFile?.(file);
    fileInput.value = '';
  });
}

export function openRealmProgress(
  container: HTMLElement,
  skills: Skill[],
  realms: Realm[],
  progress: Progress,
  handlers: RealmProgressHandlers = {},
): void {
  renderRealmProgress(container, skills, realms, progress);
  container.classList.remove('hidden');
  openModals.add(container);

  if (!container.dataset.wired) {
    const closeBtn = container.querySelector('#realm-progress-close') as HTMLElement | null;
    const backdrop = container.querySelector('.modal-backdrop') as HTMLElement | null;
    closeBtn?.addEventListener('click', () => closeRealmProgress(container));
    backdrop?.addEventListener('click', () => closeRealmProgress(container));
    wireToolbar(container, handlers);
    container.dataset.wired = '1';
  }

  ensureEscapeHandler();
}

export function closeRealmProgress(container: HTMLElement): void {
  container.classList.add('hidden');
  openModals.delete(container);
}

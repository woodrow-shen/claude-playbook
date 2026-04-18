import type { Progress } from './types.js';

export interface LearningPath {
  id: string;
  name: string;
  tagline: string;
  skills: string[];
}

export interface PathStats {
  completed: number;
  total: number;
  percent: number;
}

export function computePathStats(path: LearningPath, progress: Progress): PathStats {
  const done = new Set(progress.completedSkills);
  const total = path.skills.length;
  const completed = path.skills.filter((s) => done.has(s)).length;
  const percent = total > 0 ? (completed / total) * 100 : 0;
  return { completed, total, percent };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderLearningPaths(
  container: HTMLElement,
  paths: LearningPath[],
  progress: Progress,
  onFocus: (pathId: string) => void,
): void {
  const list = container.querySelector('#learning-paths-list') as HTMLElement | null;
  if (!list) return;
  const done = new Set(progress.completedSkills);

  list.innerHTML = paths
    .map((p) => {
      const stats = computePathStats(p, progress);
      const pct = Math.round(stats.percent);
      const steps = p.skills
        .map((name, i) => {
          const completedClass = done.has(name) ? ' completed' : '';
          const label = name.replace(/-/g, ' ');
          return `<li class="path-skill${completedClass}">
            <span class="path-step-num">${i + 1}</span>
            <span class="path-step-name">${escapeHtml(label)}</span>
          </li>`;
        })
        .join('');
      return `
        <div class="path-card" data-path-id="${escapeHtml(p.id)}">
          <div class="path-card-header">
            <h3 class="path-card-name">${escapeHtml(p.name)}</h3>
            <span class="path-card-count">${stats.completed}/${stats.total} skills (${pct}%)</span>
          </div>
          <p class="path-card-tagline">${escapeHtml(p.tagline)}</p>
          <div class="path-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
            <div class="path-bar-fill" style="width: ${pct}%"></div>
          </div>
          <ol class="path-skills">${steps}</ol>
          <div class="path-card-actions">
            <button type="button" class="path-focus-btn" data-path-id="${escapeHtml(p.id)}">
              Focus this path
            </button>
          </div>
        </div>
      `;
    })
    .join('');

  list.querySelectorAll<HTMLButtonElement>('.path-focus-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-path-id') ?? '';
      onFocus(id);
      closeLearningPaths(container);
    });
  });
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

export function openLearningPaths(
  container: HTMLElement,
  paths: LearningPath[],
  progress: Progress,
  onFocus: (pathId: string) => void,
): void {
  renderLearningPaths(container, paths, progress, onFocus);
  container.classList.remove('hidden');
  openModals.add(container);

  if (!container.dataset.wired) {
    const closeBtn = container.querySelector('#learning-paths-close') as HTMLElement | null;
    const backdrop = container.querySelector('.modal-backdrop') as HTMLElement | null;
    closeBtn?.addEventListener('click', () => closeLearningPaths(container));
    backdrop?.addEventListener('click', () => closeLearningPaths(container));
    container.dataset.wired = '1';
  }

  ensureEscapeHandler();
}

export function closeLearningPaths(container: HTMLElement): void {
  container.classList.add('hidden');
  openModals.delete(container);
}

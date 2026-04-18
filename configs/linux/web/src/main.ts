import type { SkillGraph, Skill, Progress } from './types.js';
import { loadProgress, saveProgress, startSkill, completeSkill, getSkillState } from './progress.js';
import { renderGraph, applyFilter } from './graph.js';
import { renderDetail } from './skill-detail.js';
import { openBadgesGallery } from './badges-gallery.js';
import { openRealmProgress, computeGlobalStats } from './realm-progress.js';
import { downloadProgress, importProgressJSON, resetProgress } from './progress-io.js';
import { matchSkill, type FilterCriteria, type SkillState } from './skill-filter.js';
import skillData from '../data/skills.json';

const graph = skillData as SkillGraph;
let progress: Progress = loadProgress();

const svgEl = document.getElementById('skill-graph') as unknown as SVGSVGElement;
const detailPanel = document.getElementById('detail-panel') as HTMLElement;
const detailClose = document.getElementById('detail-close') as HTMLElement;
const xpFill = document.getElementById('xp-fill') as HTMLElement;
const xpText = document.getElementById('xp-text') as HTMLElement;
const xpBar = document.getElementById('xp-bar') as HTMLElement;
const completionIndicator = document.getElementById('completion-indicator') as HTMLElement;
const badgeCount = document.getElementById('badge-count') as HTMLElement;
const badgesModal = document.getElementById('badges-modal') as HTMLElement;
const realmProgressModal = document.getElementById('realm-progress-modal') as HTMLElement;
const toastContainer = document.getElementById('toast-container') as HTMLElement;
const filterQuery = document.getElementById('filter-query') as HTMLInputElement;
const filterRealm = document.getElementById('filter-realm') as HTMLSelectElement;
const filterState = document.getElementById('filter-state') as HTMLSelectElement;
const filterClear = document.getElementById('filter-clear') as HTMLButtonElement;
const filterCount = document.getElementById('filter-count') as HTMLElement;

const filterCriteria: FilterCriteria = { query: '', realmId: 'all', state: 'all' };

function populateRealmOptions() {
  for (const r of graph.realms) {
    const opt = document.createElement('option');
    opt.value = r.id;
    opt.textContent = r.name;
    filterRealm.appendChild(opt);
  }
}

function applyCurrentFilter() {
  const stateMap = new Map<string, SkillState>();
  for (const s of graph.skills) {
    stateMap.set(s.name, getSkillState(progress, s.name, s.prerequisites));
  }
  let matched = 0;
  applyFilter(svgEl, (name) => {
    const skill = graph.skills.find(s => s.name === name);
    if (!skill) return false;
    const st = stateMap.get(name) ?? 'locked';
    const ok = matchSkill(skill, st, filterCriteria);
    if (ok) matched++;
    return ok;
  });
  const hasFilter =
    filterCriteria.query.trim() !== '' ||
    filterCriteria.realmId !== 'all' ||
    filterCriteria.state !== 'all';
  filterCount.textContent = hasFilter
    ? `${matched}/${graph.skills.length} match`
    : '';
}

let filterDebounce = 0;
function onFilterChanged() {
  window.clearTimeout(filterDebounce);
  filterDebounce = window.setTimeout(applyCurrentFilter, 120);
}

function showToast(message: string, type: 'xp' | 'badge' | 'info' | 'error' = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast-show'));
  setTimeout(() => {
    toast.classList.remove('toast-show');
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

function updateHeader() {
  const pct = graph.totalXP > 0 ? (progress.totalXP / graph.totalXP) * 100 : 0;
  xpFill.style.width = `${pct}%`;
  xpText.textContent = `${progress.totalXP} / ${graph.totalXP} XP`;
  badgeCount.textContent = `${progress.badges.length} Badge${progress.badges.length !== 1 ? 's' : ''}`;
  const g = computeGlobalStats(graph.skills, progress);
  const completionPct = Math.round(g.percent);
  completionIndicator.textContent = `${g.completedSkills}/${g.totalSkills} skills (${completionPct}%)`;
}

function openDetail(skill: Skill) {
  renderDetail(
    detailPanel,
    skill,
    progress,
    () => {
      progress = startSkill(progress, skill.name);
      showToast(`Quest started: ${skill.name.replace(/-/g, ' ')}`, 'info');
      refresh();
      openDetail(skill);
    },
    () => {
      const prevXP = progress.totalXP;
      const prevBadges = progress.badges.length;
      progress = completeSkill(progress, skill);
      if (progress.totalXP > prevXP) {
        showToast(`+${skill.xp} XP earned!`, 'xp');
      }
      if (progress.badges.length > prevBadges) {
        showToast(`Badge unlocked: ${skill.badge}`, 'badge');
      }
      refresh();
      openDetail(skill);
    },
  );
}

function refresh() {
  updateHeader();
  renderGraph(svgEl, graph.skills, graph.realms, progress, openDetail);
  applyCurrentFilter();
}

function openRealmModal() {
  openRealmProgress(realmProgressModal, graph.skills, graph.realms, progress, {
    onExport: () => {
      downloadProgress(progress);
      showToast('Progress exported', 'info');
    },
    onImportFile: async (file) => {
      try {
        const text = await file.text();
        const imported = importProgressJSON(text);
        progress = imported;
        saveProgress(progress);
        showToast('Progress imported', 'info');
        refresh();
        openRealmModal();
      } catch (e) {
        showToast(`Import failed: ${(e as Error).message}`, 'error');
      }
    },
    onReset: () => {
      const ok = confirm('Reset all progress? This clears completed skills, XP, and badges.');
      if (!ok) return;
      resetProgress();
      progress = loadProgress();
      showToast('Progress reset', 'info');
      refresh();
      openRealmModal();
    },
  });
}

detailClose.addEventListener('click', () => {
  detailPanel.classList.add('hidden');
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    detailPanel.classList.add('hidden');
  }
});

badgeCount.addEventListener('click', () => {
  openBadgesGallery(badgesModal, graph.skills, graph.realms, progress);
});

xpBar.addEventListener('click', () => {
  openRealmModal();
});

filterQuery.addEventListener('input', () => {
  filterCriteria.query = filterQuery.value;
  onFilterChanged();
});
filterRealm.addEventListener('change', () => {
  filterCriteria.realmId = filterRealm.value;
  applyCurrentFilter();
});
filterState.addEventListener('change', () => {
  filterCriteria.state = filterState.value as FilterCriteria['state'];
  applyCurrentFilter();
});
filterClear.addEventListener('click', () => {
  filterQuery.value = '';
  filterRealm.value = 'all';
  filterState.value = 'all';
  filterCriteria.query = '';
  filterCriteria.realmId = 'all';
  filterCriteria.state = 'all';
  applyCurrentFilter();
});

// Initial render
populateRealmOptions();
refresh();

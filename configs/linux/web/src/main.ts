import type { SkillGraph, Skill, Progress } from './types.js';
import { loadProgress, saveProgress, startSkill, completeSkill } from './progress.js';
import { renderGraph } from './graph.js';
import { renderDetail } from './skill-detail.js';
import { openBadgesGallery } from './badges-gallery.js';
import { openRealmProgress, computeGlobalStats } from './realm-progress.js';
import { downloadProgress, importProgressJSON, resetProgress } from './progress-io.js';
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

// Initial render
refresh();

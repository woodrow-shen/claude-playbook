import { marked } from 'marked';
import type { Skill, Progress } from './types.js';
import { getSkillState } from './progress.js';
import { getAnimationsForSkill } from './animation/registry.js';
import { mountAnimationViewport } from './animation/viewport.js';

const GITHUB_BASE = 'https://github.com/torvalds/linux/blob/master/';

function linkifyKernelPaths(html: string): string {
  // Link kernel file paths like fs/namei.c or include/linux/fs.h
  return html.replace(
    /(?<!["/])\b((?:arch|block|crypto|drivers|fs|include|init|io_uring|ipc|kernel|lib|mm|net|rust|security|sound|tools|virt|Documentation)\/[\w/.+-]+\.[chSrst]+)\b/g,
    `<a href="${GITHUB_BASE}$1" target="_blank" class="kernel-link">$1</a>`,
  );
}

export function renderDetail(
  panel: HTMLElement,
  skill: Skill,
  progress: Progress,
  onStart: () => void,
  onComplete: () => void,
): void {
  const state = getSkillState(progress, skill.name, skill.prerequisites);

  const title = panel.querySelector('#detail-title') as HTMLElement;
  const meta = panel.querySelector('#detail-meta') as HTMLElement;
  const badge = panel.querySelector('#detail-badge') as HTMLElement;
  const content = panel.querySelector('#detail-content') as HTMLElement;
  const btnStart = panel.querySelector('#btn-start') as HTMLButtonElement;
  const btnComplete = panel.querySelector('#btn-complete') as HTMLButtonElement;

  title.textContent = skill.name.replace(/-/g, ' ');

  const diffLabel = skill.difficulty.charAt(0).toUpperCase() + skill.difficulty.slice(1);
  meta.innerHTML = `
    <span class="meta-realm">${skill.realm}</span>
    <span class="meta-diff meta-diff-${skill.difficulty}">${diffLabel}</span>
    <span class="meta-xp">${skill.xp} XP</span>
    <span class="meta-time">${skill.estimated_minutes} min</span>
  `;

  badge.textContent = skill.badge;
  badge.className = `badge badge-${state}`;

  // Render markdown content with kernel path links
  const rawHtml = marked.parse(skill.content) as string;
  content.innerHTML = linkifyKernelPaths(rawHtml);

  // Convert verification criteria checkboxes to interactive
  content.querySelectorAll('li').forEach((li) => {
    const text = li.textContent || '';
    if (text.startsWith('[ ]') || text.startsWith('[x]')) {
      const checked = text.startsWith('[x]');
      const label = text.slice(4);
      li.innerHTML = `<label class="check-item"><input type="checkbox" ${checked ? 'checked' : ''}> ${label}</label>`;
    }
  });

  // Button states
  btnStart.style.display = state === 'available' ? '' : 'none';
  btnComplete.style.display = (state === 'in-progress' || state === 'available') ? '' : 'none';

  if (state === 'completed') {
    btnComplete.style.display = '';
    btnComplete.textContent = 'Completed';
    btnComplete.disabled = true;
    btnComplete.classList.add('btn-done');
  } else {
    btnComplete.textContent = 'Mark Complete';
    btnComplete.disabled = false;
    btnComplete.classList.remove('btn-done');
  }

  btnStart.onclick = onStart;
  btnComplete.onclick = onComplete;

  // Kernel files links
  if (skill.kernel_files.length > 0) {
    const filesHtml = skill.kernel_files
      .map(f => `<a href="${GITHUB_BASE}${f}" target="_blank" class="kernel-link">${f}</a>`)
      .join(', ');
    const filesSection = document.createElement('div');
    filesSection.className = 'kernel-files-section';
    filesSection.innerHTML = `<h3>Source Files</h3><p>${filesHtml}</p>`;
    content.insertBefore(filesSection, content.firstChild);
  }

  // Animation buttons
  const animations = getAnimationsForSkill(skill.name);
  if (animations.length > 0) {
    const animSection = document.createElement('div');
    animSection.className = 'animation-section';
    animSection.innerHTML = '<h3>Interactive Animations</h3>';
    for (const anim of animations) {
      const btn = document.createElement('button');
      btn.className = 'animation-launch-btn';
      btn.textContent = anim.title;
      btn.addEventListener('click', async () => {
        const mod = await anim.load();
        mountAnimationViewport(content, mod, () => {
          // Re-render detail to restore content
          renderDetail(panel, skill, progress, onStart, onComplete);
        });
      });
      animSection.appendChild(btn);
    }
    content.insertBefore(animSection, content.firstChild);
  }

  panel.classList.remove('hidden');
}

import type { Progress, Skill } from './types.js';

const STORAGE_KEY = 'kernel-quest-progress';

const DEFAULT_PROGRESS: Progress = {
  version: 1,
  completedSkills: [],
  inProgressSkills: [],
  totalXP: 0,
  badges: [],
  verificationChecks: {},
  startedAt: new Date().toISOString(),
};

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PROGRESS, startedAt: new Date().toISOString() };
    const data = JSON.parse(raw) as Progress;
    if (data.version !== 1) return { ...DEFAULT_PROGRESS, startedAt: new Date().toISOString() };
    return data;
  } catch {
    return { ...DEFAULT_PROGRESS, startedAt: new Date().toISOString() };
  }
}

export function saveProgress(progress: Progress): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

export function startSkill(progress: Progress, skillName: string): Progress {
  if (progress.completedSkills.includes(skillName)) return progress;
  if (progress.inProgressSkills.includes(skillName)) return progress;
  const updated = {
    ...progress,
    inProgressSkills: [...progress.inProgressSkills, skillName],
  };
  saveProgress(updated);
  return updated;
}

export function completeSkill(progress: Progress, skill: Skill): Progress {
  if (progress.completedSkills.includes(skill.name)) return progress;
  const updated = {
    ...progress,
    completedSkills: [...progress.completedSkills, skill.name],
    inProgressSkills: progress.inProgressSkills.filter(s => s !== skill.name),
    totalXP: progress.totalXP + skill.xp,
    badges: skill.badge && !progress.badges.includes(skill.badge)
      ? [...progress.badges, skill.badge]
      : progress.badges,
  };
  saveProgress(updated);
  return updated;
}

export function getSkillState(
  progress: Progress,
  skillName: string,
  prerequisites: string[],
): 'locked' | 'available' | 'in-progress' | 'completed' {
  if (progress.completedSkills.includes(skillName)) return 'completed';
  if (progress.inProgressSkills.includes(skillName)) return 'in-progress';
  const allPrereqsMet = prerequisites.every(p => progress.completedSkills.includes(p));
  return allPrereqsMet ? 'available' : 'locked';
}

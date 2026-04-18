import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadProgress,
  saveProgress,
  startSkill,
  completeSkill,
  getSkillState,
} from './progress.js';
import type { Progress, Skill } from './types.js';

function makeProgress(overrides: Partial<Progress> = {}): Progress {
  return {
    version: 1,
    completedSkills: [],
    inProgressSkills: [],
    totalXP: 0,
    badges: [],
    verificationChecks: {},
    startedAt: '2026-04-05T00:00:00.000Z',
    ...overrides,
  };
}

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    name: 'boot-and-init',
    description: 'test skill',
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

beforeEach(() => {
  localStorage.clear();
});

describe('loadProgress', () => {
  it('returns default progress when storage is empty', () => {
    const p = loadProgress();
    expect(p.version).toBe(1);
    expect(p.completedSkills).toEqual([]);
    expect(p.totalXP).toBe(0);
    expect(p.badges).toEqual([]);
  });

  it('loads saved progress from localStorage', () => {
    const saved = makeProgress({ totalXP: 500, completedSkills: ['boot-and-init'] });
    localStorage.setItem('kernel-quest-progress', JSON.stringify(saved));
    const p = loadProgress();
    expect(p.totalXP).toBe(500);
    expect(p.completedSkills).toEqual(['boot-and-init']);
  });

  it('returns default on corrupt JSON', () => {
    localStorage.setItem('kernel-quest-progress', '{invalid json');
    const p = loadProgress();
    expect(p.version).toBe(1);
    expect(p.totalXP).toBe(0);
  });

  it('returns default on version mismatch', () => {
    const saved = makeProgress({ totalXP: 999 });
    (saved as Record<string, unknown>).version = 99;
    localStorage.setItem('kernel-quest-progress', JSON.stringify(saved));
    const p = loadProgress();
    expect(p.totalXP).toBe(0);
  });
});

describe('saveProgress', () => {
  it('persists progress to localStorage', () => {
    const p = makeProgress({ totalXP: 200 });
    saveProgress(p);
    const raw = localStorage.getItem('kernel-quest-progress');
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!).totalXP).toBe(200);
  });
});

describe('startSkill', () => {
  it('adds skill to inProgressSkills', () => {
    const p = makeProgress();
    const updated = startSkill(p, 'boot-and-init');
    expect(updated.inProgressSkills).toContain('boot-and-init');
  });

  it('does not duplicate if already in progress', () => {
    const p = makeProgress({ inProgressSkills: ['boot-and-init'] });
    const updated = startSkill(p, 'boot-and-init');
    expect(updated.inProgressSkills).toEqual(['boot-and-init']);
    expect(updated).toBe(p); // same reference = no mutation
  });

  it('does not start a completed skill', () => {
    const p = makeProgress({ completedSkills: ['boot-and-init'] });
    const updated = startSkill(p, 'boot-and-init');
    expect(updated.inProgressSkills).toEqual([]);
    expect(updated).toBe(p);
  });

  it('persists to localStorage', () => {
    const p = makeProgress();
    startSkill(p, 'boot-and-init');
    const raw = localStorage.getItem('kernel-quest-progress');
    expect(JSON.parse(raw!).inProgressSkills).toContain('boot-and-init');
  });
});

describe('completeSkill', () => {
  it('moves skill from inProgress to completed and adds XP', () => {
    const p = makeProgress({ inProgressSkills: ['boot-and-init'] });
    const skill = makeSkill({ name: 'boot-and-init', xp: 100, badge: 'First Boot' });
    const updated = completeSkill(p, skill);
    expect(updated.completedSkills).toContain('boot-and-init');
    expect(updated.inProgressSkills).not.toContain('boot-and-init');
    expect(updated.totalXP).toBe(100);
  });

  it('awards badge on completion', () => {
    const p = makeProgress();
    const skill = makeSkill({ badge: 'First Boot' });
    const updated = completeSkill(p, skill);
    expect(updated.badges).toContain('First Boot');
  });

  it('does not duplicate badge', () => {
    const p = makeProgress({ badges: ['First Boot'] });
    const skill = makeSkill({ name: 'system-calls', badge: 'First Boot', xp: 50 });
    const updated = completeSkill(p, skill);
    expect(updated.badges).toEqual(['First Boot']);
  });

  it('is idempotent for already completed skills', () => {
    const p = makeProgress({ completedSkills: ['boot-and-init'], totalXP: 100 });
    const skill = makeSkill({ name: 'boot-and-init', xp: 100 });
    const updated = completeSkill(p, skill);
    expect(updated.totalXP).toBe(100); // not 200
    expect(updated).toBe(p);
  });

  it('completes a skill not yet in progress (direct complete)', () => {
    const p = makeProgress();
    const skill = makeSkill({ xp: 150 });
    const updated = completeSkill(p, skill);
    expect(updated.completedSkills).toContain('boot-and-init');
    expect(updated.totalXP).toBe(150);
  });

  it('persists to localStorage', () => {
    const p = makeProgress();
    const skill = makeSkill({ xp: 100 });
    completeSkill(p, skill);
    const raw = JSON.parse(localStorage.getItem('kernel-quest-progress')!);
    expect(raw.completedSkills).toContain('boot-and-init');
    expect(raw.totalXP).toBe(100);
  });
});

describe('getSkillState', () => {
  it('returns completed for completed skills', () => {
    const p = makeProgress({ completedSkills: ['boot-and-init'] });
    expect(getSkillState(p, 'boot-and-init', [])).toBe('completed');
  });

  it('returns in-progress for in-progress skills', () => {
    const p = makeProgress({ inProgressSkills: ['boot-and-init'] });
    expect(getSkillState(p, 'boot-and-init', [])).toBe('in-progress');
  });

  it('returns available when all prerequisites are completed', () => {
    const p = makeProgress({ completedSkills: ['boot-and-init'] });
    expect(getSkillState(p, 'system-calls', ['boot-and-init'])).toBe('available');
  });

  it('returns available for skills with no prerequisites', () => {
    const p = makeProgress();
    expect(getSkillState(p, 'boot-and-init', [])).toBe('available');
  });

  it('returns locked when prerequisites are not met', () => {
    const p = makeProgress();
    expect(getSkillState(p, 'system-calls', ['boot-and-init'])).toBe('locked');
  });

  it('returns locked when only some prerequisites are met', () => {
    const p = makeProgress({ completedSkills: ['process-lifecycle'] });
    expect(getSkillState(p, 'socket-layer', ['process-lifecycle', 'vfs-layer'])).toBe('locked');
  });

  it('completed takes priority over in-progress', () => {
    const p = makeProgress({
      completedSkills: ['boot-and-init'],
      inProgressSkills: ['boot-and-init'],
    });
    expect(getSkillState(p, 'boot-and-init', [])).toBe('completed');
  });
});

describe('full lifecycle', () => {
  it('progresses through locked -> available -> in-progress -> completed', () => {
    let p = makeProgress();
    const boot = makeSkill({ name: 'boot-and-init', xp: 100, badge: 'First Boot' });
    const syscalls = makeSkill({
      name: 'system-calls', xp: 120, badge: 'Gateway Keeper',
      prerequisites: ['boot-and-init'],
    });

    // syscalls is locked, boot is available
    expect(getSkillState(p, 'system-calls', syscalls.prerequisites)).toBe('locked');
    expect(getSkillState(p, 'boot-and-init', boot.prerequisites)).toBe('available');

    // start boot
    p = startSkill(p, 'boot-and-init');
    expect(getSkillState(p, 'boot-and-init', boot.prerequisites)).toBe('in-progress');
    expect(getSkillState(p, 'system-calls', syscalls.prerequisites)).toBe('locked');

    // complete boot
    p = completeSkill(p, boot);
    expect(getSkillState(p, 'boot-and-init', boot.prerequisites)).toBe('completed');
    expect(p.totalXP).toBe(100);
    expect(p.badges).toContain('First Boot');

    // syscalls is now available
    expect(getSkillState(p, 'system-calls', syscalls.prerequisites)).toBe('available');

    // complete syscalls
    p = completeSkill(p, syscalls);
    expect(p.totalXP).toBe(220);
    expect(p.badges).toContain('Gateway Keeper');
    expect(getSkillState(p, 'system-calls', syscalls.prerequisites)).toBe('completed');
  });
});

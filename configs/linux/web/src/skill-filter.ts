import type { Skill } from './types.js';

export type SkillState = 'locked' | 'available' | 'in-progress' | 'completed';

export interface FilterCriteria {
  query: string;
  realmId: string | 'all';
  state: SkillState | 'all';
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
}

function textFields(skill: Skill): string {
  return [
    skill.name,
    skill.badge,
    skill.description,
    skill.tags.join(' '),
  ].join(' ');
}

export function matchSkill(
  skill: Skill,
  skillState: SkillState,
  criteria: FilterCriteria,
): boolean {
  if (criteria.realmId !== 'all' && skill.realm !== criteria.realmId) return false;
  if (criteria.state !== 'all' && skillState !== criteria.state) return false;
  const q = normalize(criteria.query);
  if (q === '') return true;
  const hay = normalize(textFields(skill));
  for (const token of q.split(' ')) {
    if (token === '') continue;
    if (!hay.includes(token)) return false;
  }
  return true;
}

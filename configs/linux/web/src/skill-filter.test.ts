import { describe, it, expect } from 'vitest';
import { matchSkill, type FilterCriteria, type SkillState } from './skill-filter.js';
import type { Skill } from './types.js';

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    name: 'rcu-fundamentals',
    description: 'Master Read-Copy-Update lock-free synchronization',
    realm: 'concurrency',
    category: 'x',
    difficulty: 'advanced',
    xp: 200,
    estimated_minutes: 60,
    prerequisites: [],
    unlocks: [],
    kernel_files: [],
    doc_files: [],
    badge: 'RCU Sage',
    tags: ['rcu', 'lockless'],
    content: '# Test',
    ...overrides,
  };
}

function makeCriteria(overrides: Partial<FilterCriteria> = {}): FilterCriteria {
  return { query: '', realmId: 'all', state: 'all', ...overrides };
}

describe('matchSkill — empty criteria', () => {
  it('matches any skill when no filters are set', () => {
    expect(matchSkill(makeSkill(), 'available', makeCriteria())).toBe(true);
  });

  it('treats whitespace-only query as empty', () => {
    expect(matchSkill(makeSkill(), 'locked', makeCriteria({ query: '   ' }))).toBe(true);
  });
});

describe('matchSkill — text query', () => {
  it('matches by skill name substring', () => {
    const s = makeSkill();
    expect(matchSkill(s, 'available', makeCriteria({ query: 'rcu' }))).toBe(true);
    expect(matchSkill(s, 'available', makeCriteria({ query: 'RCU' }))).toBe(true);
    expect(matchSkill(s, 'available', makeCriteria({ query: 'fundamentals' }))).toBe(true);
  });

  it('matches hyphenated names when searching with spaces', () => {
    const s = makeSkill({ name: 'boot-and-init' });
    expect(matchSkill(s, 'available', makeCriteria({ query: 'boot and init' }))).toBe(true);
    expect(matchSkill(s, 'available', makeCriteria({ query: 'boot init' }))).toBe(true);
  });

  it('matches by badge', () => {
    expect(matchSkill(makeSkill(), 'available', makeCriteria({ query: 'sage' }))).toBe(true);
  });

  it('matches by description', () => {
    expect(matchSkill(makeSkill(), 'available', makeCriteria({ query: 'lock-free' }))).toBe(true);
  });

  it('matches by tag', () => {
    expect(matchSkill(makeSkill(), 'available', makeCriteria({ query: 'lockless' }))).toBe(true);
  });

  it('returns false when no field matches', () => {
    expect(matchSkill(makeSkill(), 'available', makeCriteria({ query: 'nonexistent' }))).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(matchSkill(makeSkill(), 'available', makeCriteria({ query: 'MASTER' }))).toBe(true);
  });
});

describe('matchSkill — realm filter', () => {
  it('matches when realmId === skill.realm', () => {
    const s = makeSkill({ realm: 'memory' });
    expect(matchSkill(s, 'available', makeCriteria({ realmId: 'memory' }))).toBe(true);
  });

  it('rejects when realmId differs', () => {
    const s = makeSkill({ realm: 'memory' });
    expect(matchSkill(s, 'available', makeCriteria({ realmId: 'scheduler' }))).toBe(false);
  });

  it('accepts any realm when realmId === "all"', () => {
    const s = makeSkill({ realm: 'memory' });
    expect(matchSkill(s, 'available', makeCriteria({ realmId: 'all' }))).toBe(true);
  });
});

describe('matchSkill — state filter', () => {
  const states: SkillState[] = ['locked', 'available', 'in-progress', 'completed'];

  it('matches when state === skillState', () => {
    for (const st of states) {
      expect(matchSkill(makeSkill(), st, makeCriteria({ state: st }))).toBe(true);
    }
  });

  it('rejects when state differs', () => {
    expect(matchSkill(makeSkill(), 'locked', makeCriteria({ state: 'completed' }))).toBe(false);
  });

  it('accepts any state when state === "all"', () => {
    for (const st of states) {
      expect(matchSkill(makeSkill(), st, makeCriteria({ state: 'all' }))).toBe(true);
    }
  });
});

describe('matchSkill — combined filters', () => {
  it('requires all criteria to match (AND semantics)', () => {
    const s = makeSkill({ realm: 'memory', name: 'page-allocation' });
    const crit = makeCriteria({ query: 'page', realmId: 'memory', state: 'available' });
    expect(matchSkill(s, 'available', crit)).toBe(true);
  });

  it('rejects when query matches but realm does not', () => {
    const s = makeSkill({ realm: 'memory', name: 'page-allocation' });
    const crit = makeCriteria({ query: 'page', realmId: 'scheduler' });
    expect(matchSkill(s, 'available', crit)).toBe(false);
  });

  it('rejects when realm matches but state does not', () => {
    const s = makeSkill({ realm: 'memory' });
    const crit = makeCriteria({ realmId: 'memory', state: 'completed' });
    expect(matchSkill(s, 'available', crit)).toBe(false);
  });
});

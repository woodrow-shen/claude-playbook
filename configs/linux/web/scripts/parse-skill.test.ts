import { describe, it, expect } from 'vitest';
import {
  parseFrontmatter,
  validateMeta,
  metaToSkill,
  parseSkillContent,
  detectCycles,
  validatePrerequisites,
} from './parse-skill.js';
import type { Skill } from '../src/types.js';

const VALID_SKILL_MD = `---
name: test-skill
description: A test skill
realm: foundations
category: test
difficulty: beginner
xp: 100
estimated_minutes: 60
prerequisites: []
unlocks:
  - another-skill
kernel_files:
  - init/main.c
doc_files:
  - Documentation/test.rst
badge: Test Badge
tags:
  - test
---

# Test Skill

Some content here.

## Learning Objectives

- Learn things
`;

describe('parseFrontmatter', () => {
  it('parses valid frontmatter and content', () => {
    const { meta, content } = parseFrontmatter(VALID_SKILL_MD);
    expect(meta.name).toBe('test-skill');
    expect(meta.xp).toBe(100);
    expect(content).toContain('# Test Skill');
    expect(content).toContain('## Learning Objectives');
  });

  it('throws on missing frontmatter delimiters', () => {
    expect(() => parseFrontmatter('no frontmatter here')).toThrow('Invalid frontmatter');
  });

  it('throws on single delimiter', () => {
    expect(() => parseFrontmatter('---\nname: test\n')).toThrow('Invalid frontmatter');
  });

  it('handles empty content after frontmatter', () => {
    const { content } = parseFrontmatter('---\nname: test\n---\n');
    expect(content).toBe('');
  });

  it('preserves multiline content', () => {
    const md = '---\nname: x\n---\nLine 1\n\nLine 2\n\nLine 3';
    const { content } = parseFrontmatter(md);
    expect(content).toContain('Line 1');
    expect(content).toContain('Line 3');
  });
});

describe('validateMeta', () => {
  it('returns no errors for valid meta', () => {
    const { meta } = parseFrontmatter(VALID_SKILL_MD);
    expect(validateMeta(meta)).toEqual([]);
  });

  it('reports missing required fields', () => {
    const errors = validateMeta({ name: 'test' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.includes('description'))).toBe(true);
    expect(errors.some(e => e.includes('realm'))).toBe(true);
    expect(errors.some(e => e.includes('xp'))).toBe(true);
  });

  it('validates difficulty values', () => {
    const meta = {
      name: 'x', description: 'x', realm: 'x', difficulty: 'expert',
      xp: 100, prerequisites: [], kernel_files: [], badge: 'X',
    };
    const errors = validateMeta(meta);
    expect(errors.some(e => e.includes('difficulty'))).toBe(true);
  });

  it('validates xp is a positive number', () => {
    const meta = {
      name: 'x', description: 'x', realm: 'x', difficulty: 'beginner',
      xp: -5, prerequisites: [], kernel_files: [], badge: 'X',
    };
    const errors = validateMeta(meta);
    expect(errors.some(e => e.includes('xp'))).toBe(true);
  });

  it('accepts valid difficulty values', () => {
    for (const diff of ['beginner', 'intermediate', 'advanced']) {
      const meta = {
        name: 'x', description: 'x', realm: 'x', difficulty: diff,
        xp: 100, prerequisites: [], kernel_files: [], badge: 'X',
      };
      expect(validateMeta(meta)).toEqual([]);
    }
  });
});

describe('metaToSkill', () => {
  it('converts valid meta to Skill object', () => {
    const { meta, content } = parseFrontmatter(VALID_SKILL_MD);
    const skill = metaToSkill(meta, content);
    expect(skill.name).toBe('test-skill');
    expect(skill.realm).toBe('foundations');
    expect(skill.difficulty).toBe('beginner');
    expect(skill.xp).toBe(100);
    expect(skill.prerequisites).toEqual([]);
    expect(skill.unlocks).toEqual(['another-skill']);
    expect(skill.kernel_files).toEqual(['init/main.c']);
    expect(skill.badge).toBe('Test Badge');
    expect(skill.content).toContain('# Test Skill');
  });

  it('defaults optional fields', () => {
    const meta = {
      name: 'x', description: 'x', realm: 'x', difficulty: 'beginner',
      xp: 50, prerequisites: [], kernel_files: [], badge: 'X',
    };
    const skill = metaToSkill(meta, 'content');
    expect(skill.category).toBe('');
    expect(skill.estimated_minutes).toBe(60);
    expect(skill.unlocks).toEqual([]);
    expect(skill.doc_files).toEqual([]);
    expect(skill.tags).toEqual([]);
  });
});

describe('parseSkillContent', () => {
  it('parses a complete valid SKILL.md', () => {
    const skill = parseSkillContent(VALID_SKILL_MD);
    expect(skill.name).toBe('test-skill');
    expect(skill.xp).toBe(100);
  });

  it('throws on invalid frontmatter', () => {
    expect(() => parseSkillContent('no frontmatter')).toThrow();
  });

  it('throws on missing required fields', () => {
    const md = '---\nname: test\n---\ncontent';
    expect(() => parseSkillContent(md)).toThrow('Missing required field');
  });
});

describe('detectCycles', () => {
  it('finds no cycles in a valid DAG', () => {
    const skills = new Map([
      ['a', []],
      ['b', ['a']],
      ['c', ['b']],
    ]);
    expect(detectCycles(skills)).toEqual([]);
  });

  it('detects a direct cycle', () => {
    const skills = new Map([
      ['a', ['b']],
      ['b', ['a']],
    ]);
    const cycles = detectCycles(skills);
    expect(cycles.length).toBeGreaterThan(0);
  });

  it('detects an indirect cycle', () => {
    const skills = new Map([
      ['a', ['c']],
      ['b', ['a']],
      ['c', ['b']],
    ]);
    const cycles = detectCycles(skills);
    expect(cycles.length).toBeGreaterThan(0);
  });

  it('handles isolated nodes', () => {
    const skills = new Map([
      ['a', []],
      ['b', []],
    ]);
    expect(detectCycles(skills)).toEqual([]);
  });

  it('handles empty graph', () => {
    expect(detectCycles(new Map())).toEqual([]);
  });
});

describe('validatePrerequisites', () => {
  function skill(name: string, prereqs: string[]): Skill {
    return {
      name, description: '', realm: '', category: '', difficulty: 'beginner',
      xp: 100, estimated_minutes: 60, prerequisites: prereqs, unlocks: [],
      kernel_files: [], doc_files: [], badge: '', tags: [], content: '',
    };
  }

  it('returns no errors for valid prerequisites', () => {
    const skills = [skill('a', []), skill('b', ['a']), skill('c', ['a', 'b'])];
    expect(validatePrerequisites(skills)).toEqual([]);
  });

  it('reports dangling prerequisite references', () => {
    const skills = [skill('a', []), skill('b', ['nonexistent'])];
    const errors = validatePrerequisites(skills);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('nonexistent');
  });

  it('reports multiple dangling references', () => {
    const skills = [skill('a', ['x', 'y'])];
    const errors = validatePrerequisites(skills);
    expect(errors.length).toBe(2);
  });

  it('handles empty skill list', () => {
    expect(validatePrerequisites([])).toEqual([]);
  });
});

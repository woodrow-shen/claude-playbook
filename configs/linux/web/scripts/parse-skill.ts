import * as yaml from 'js-yaml';
import type { Skill } from '../src/types.js';

const REQUIRED_FIELDS = ['name', 'description', 'realm', 'difficulty', 'xp', 'prerequisites', 'kernel_files', 'badge'];

export function parseFrontmatter(raw: string): { meta: Record<string, unknown>; content: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    throw new Error('Invalid frontmatter: missing --- delimiters');
  }
  const meta = yaml.load(match[1]) as Record<string, unknown>;
  const content = match[2].trim();
  return { meta, content };
}

export function validateMeta(meta: Record<string, unknown>): string[] {
  const errors: string[] = [];
  for (const field of REQUIRED_FIELDS) {
    if (!(field in meta)) {
      errors.push(`Missing required field: ${field}`);
    }
  }
  if (meta.difficulty && !['beginner', 'intermediate', 'advanced'].includes(meta.difficulty as string)) {
    errors.push(`Invalid difficulty: ${meta.difficulty} (must be beginner, intermediate, or advanced)`);
  }
  if (meta.xp !== undefined && (typeof meta.xp !== 'number' || meta.xp <= 0)) {
    errors.push(`Invalid xp: ${meta.xp} (must be a positive number)`);
  }
  return errors;
}

export function metaToSkill(meta: Record<string, unknown>, content: string): Skill {
  return {
    name: meta.name as string,
    description: meta.description as string,
    realm: meta.realm as string,
    category: (meta.category as string) || '',
    difficulty: meta.difficulty as Skill['difficulty'],
    xp: meta.xp as number,
    estimated_minutes: (meta.estimated_minutes as number) || 60,
    prerequisites: (meta.prerequisites as string[]) || [],
    unlocks: (meta.unlocks as string[]) || [],
    kernel_files: (meta.kernel_files as string[]) || [],
    doc_files: (meta.doc_files as string[]) || [],
    badge: meta.badge as string,
    tags: (meta.tags as string[]) || [],
    content,
  };
}

export function parseSkillContent(raw: string): Skill {
  const { meta, content } = parseFrontmatter(raw);
  const errors = validateMeta(meta);
  if (errors.length > 0) {
    throw new Error(errors.join('; '));
  }
  return metaToSkill(meta, content);
}

export function detectCycles(skills: Map<string, string[]>): string[] {
  const cycles: string[] = [];
  const visited = new Set<string>();
  const stack = new Set<string>();

  function dfs(node: string): boolean {
    visited.add(node);
    stack.add(node);
    for (const prereq of skills.get(node) || []) {
      if (stack.has(prereq)) {
        cycles.push(`${node} -> ${prereq}`);
        return true;
      }
      if (!visited.has(prereq) && dfs(prereq)) return true;
    }
    stack.delete(node);
    return false;
  }

  for (const name of skills.keys()) {
    if (!visited.has(name)) dfs(name);
  }
  return cycles;
}

export function validatePrerequisites(skills: Skill[]): string[] {
  const names = new Set(skills.map(s => s.name));
  const errors: string[] = [];
  for (const skill of skills) {
    for (const prereq of skill.prerequisites) {
      if (!names.has(prereq)) {
        errors.push(`${skill.name} requires '${prereq}' which does not exist`);
      }
    }
  }
  return errors;
}

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import * as yaml from 'js-yaml';

const SKILLS_DIR = resolve(import.meta.dirname, '../../.claude/skills');
const KERNEL_ROOT = resolve(import.meta.dirname, '../../../../..');

interface SkillMeta {
  name: string;
  realm: string;
  prerequisites: string[];
  unlocks: string[];
  kernel_files: string[];
}

function main() {
  let errors = 0;
  let warnings = 0;

  const skillDirs = readdirSync(SKILLS_DIR).filter(d => {
    const p = join(SKILLS_DIR, d);
    return statSync(p).isDirectory() && existsSync(join(p, 'SKILL.md'));
  });

  const skills = new Map<string, SkillMeta>();

  // Parse all skills
  for (const dir of skillDirs.sort()) {
    const raw = readFileSync(join(SKILLS_DIR, dir, 'SKILL.md'), 'utf-8');
    const match = raw.match(/^---\n([\s\S]*?)\n---/);
    if (!match) {
      console.error(`ERROR: ${dir}/SKILL.md has no frontmatter`);
      errors++;
      continue;
    }
    const meta = yaml.load(match[1]) as SkillMeta;
    skills.set(meta.name, meta);
  }

  console.log(`Validating ${skills.size} skills...\n`);

  // Check prerequisite references
  for (const [name, meta] of skills) {
    for (const prereq of meta.prerequisites || []) {
      if (!skills.has(prereq)) {
        console.error(`ERROR: ${name} requires '${prereq}' which does not exist`);
        errors++;
      }
    }
    for (const unlock of meta.unlocks || []) {
      if (!skills.has(unlock)) {
        console.warn(`WARN: ${name} unlocks '${unlock}' which does not exist`);
        warnings++;
      }
    }
  }

  // Check for cycles (DFS)
  const visited = new Set<string>();
  const stack = new Set<string>();

  function hasCycle(node: string): boolean {
    visited.add(node);
    stack.add(node);
    for (const prereq of skills.get(node)?.prerequisites || []) {
      if (stack.has(prereq)) {
        console.error(`ERROR: Cycle detected: ${node} -> ${prereq}`);
        return true;
      }
      if (!visited.has(prereq) && hasCycle(prereq)) return true;
    }
    stack.delete(node);
    return false;
  }

  for (const name of skills.keys()) {
    if (!visited.has(name) && hasCycle(name)) {
      errors++;
    }
  }

  // Check kernel file paths exist
  for (const [name, meta] of skills) {
    for (const kf of meta.kernel_files || []) {
      const fullPath = join(KERNEL_ROOT, kf);
      if (!existsSync(fullPath)) {
        console.warn(`WARN: ${name} references ${kf} which does not exist in kernel tree`);
        warnings++;
      }
    }
  }

  // Check realm coverage
  const realms = new Set([...skills.values()].map(s => s.realm));
  console.log(`\nRealms covered: ${[...realms].sort().join(', ')} (${realms.size}/8)`);

  // Summary
  console.log(`\nResults: ${errors} errors, ${warnings} warnings`);
  if (errors > 0) {
    process.exit(1);
  }
  console.log('Validation passed!');
}

main();

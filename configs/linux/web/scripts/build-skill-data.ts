import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import type { SkillGraph, Skill, Realm } from '../src/types.js';
import { parseSkillContent } from './parse-skill.js';

const SKILLS_DIR = resolve(import.meta.dirname, '../../.claude/skills');
const DATA_DIR = resolve(import.meta.dirname, '../data');
const REALMS_FILE = join(DATA_DIR, 'realms.json');
const OUTPUT_FILE = join(DATA_DIR, 'skills.json');

function main() {
  console.log('Building skill data...');
  console.log(`Skills dir: ${SKILLS_DIR}`);

  const skillDirs = readdirSync(SKILLS_DIR).filter(d => {
    const p = join(SKILLS_DIR, d);
    return statSync(p).isDirectory() && statSync(join(p, 'SKILL.md')).isFile();
  });

  console.log(`Found ${skillDirs.length} skills`);

  const skills: Skill[] = [];
  for (const dir of skillDirs.sort()) {
    const filePath = join(SKILLS_DIR, dir, 'SKILL.md');
    try {
      const raw = readFileSync(filePath, 'utf-8');
      const skill = parseSkillContent(raw);
      if (skill.name !== dir) {
        console.warn(`  WARN: name '${skill.name}' != directory '${dir}'`);
      }
      skills.push(skill);
      console.log(`  OK: ${skill.name} (${skill.realm}, ${skill.difficulty}, ${skill.xp}xp)`);
    } catch (e) {
      console.error(`  ERROR: ${dir}: ${(e as Error).message}`);
      process.exit(1);
    }
  }

  const realms: Realm[] = JSON.parse(readFileSync(REALMS_FILE, 'utf-8'));
  const totalXP = skills.reduce((sum, s) => sum + s.xp, 0);

  const graph: SkillGraph = { skills, realms, totalXP };

  writeFileSync(OUTPUT_FILE, JSON.stringify(graph, null, 2));
  console.log(`\nWrote ${OUTPUT_FILE}`);
  console.log(`Total: ${skills.length} skills, ${totalXP} XP, ${realms.length} realms`);
}

main();

export interface SkillMeta {
  name: string;
  description: string;
  realm: string;
  category: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  xp: number;
  estimated_minutes: number;
  prerequisites: string[];
  unlocks: string[];
  kernel_files: string[];
  doc_files: string[];
  badge: string;
  tags: string[];
}

export interface Skill extends SkillMeta {
  content: string;
}

export interface Realm {
  id: string;
  name: string;
  color: string;
  icon: string;
  description: string;
}

export interface SkillGraph {
  skills: Skill[];
  realms: Realm[];
  totalXP: number;
}

export interface Progress {
  version: number;
  completedSkills: string[];
  inProgressSkills: string[];
  totalXP: number;
  badges: string[];
  verificationChecks: Record<string, boolean[]>;
  startedAt: string;
}

export interface SkillNode {
  skill: Skill;
  x: number;
  y: number;
  state: 'locked' | 'available' | 'in-progress' | 'completed';
}

export interface SkillEdge {
  source: string;
  target: string;
}

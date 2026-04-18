import type { Progress } from './types.js';

const STORAGE_KEY = 'kernel-quest-progress';
const DEFAULT_FILENAME = 'kernel-quest-progress.json';

export function exportProgressJSON(progress: Progress): string {
  return JSON.stringify(progress, null, 2);
}

export function importProgressJSON(raw: string): Progress {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Could not parse progress JSON: ${(e as Error).message}`);
  }
  if (typeof data !== 'object' || data === null) {
    throw new Error('Progress JSON must be an object');
  }
  const obj = data as Record<string, unknown>;
  if (obj.version !== 1) {
    throw new Error('Unsupported progress version (expected 1)');
  }
  if (!Array.isArray(obj.completedSkills)) {
    throw new Error('Field completedSkills must be an array');
  }
  if (!Array.isArray(obj.inProgressSkills)) {
    throw new Error('Field inProgressSkills must be an array');
  }
  if (typeof obj.totalXP !== 'number') {
    throw new Error('Field totalXP must be a number');
  }
  if (!Array.isArray(obj.badges)) {
    throw new Error('Field badges must be an array');
  }
  if (typeof obj.verificationChecks !== 'object' || obj.verificationChecks === null) {
    throw new Error('Field verificationChecks must be an object');
  }
  if (typeof obj.startedAt !== 'string') {
    throw new Error('Field startedAt must be a string');
  }
  return data as Progress;
}

export function resetProgress(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function downloadProgress(progress: Progress, filename: string = DEFAULT_FILENAME): void {
  const blob = new Blob([exportProgressJSON(progress)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

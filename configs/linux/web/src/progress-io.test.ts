import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  exportProgressJSON,
  importProgressJSON,
  resetProgress,
  downloadProgress,
} from './progress-io.js';
import type { Progress } from './types.js';

function makeProgress(overrides: Partial<Progress> = {}): Progress {
  return {
    version: 1,
    completedSkills: ['boot-and-init'],
    inProgressSkills: [],
    totalXP: 100,
    badges: ['Bootstrapper'],
    verificationChecks: {},
    startedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('exportProgressJSON', () => {
  it('returns pretty-printed JSON string', () => {
    const json = exportProgressJSON(makeProgress());
    expect(json).toContain('\n');
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(1);
    expect(parsed.completedSkills).toEqual(['boot-and-init']);
  });

  it('round-trips through JSON.parse', () => {
    const p = makeProgress({ totalXP: 450, badges: ['A', 'B'] });
    const parsed = JSON.parse(exportProgressJSON(p));
    expect(parsed).toEqual(p);
  });
});

describe('importProgressJSON', () => {
  it('parses valid progress JSON', () => {
    const p = makeProgress();
    const result = importProgressJSON(JSON.stringify(p));
    expect(result).toEqual(p);
  });

  it('throws on invalid JSON', () => {
    expect(() => importProgressJSON('not json')).toThrow(/parse/i);
  });

  it('throws when version missing', () => {
    const raw = JSON.stringify({ completedSkills: [] });
    expect(() => importProgressJSON(raw)).toThrow(/version/i);
  });

  it('throws when version does not equal 1', () => {
    const raw = JSON.stringify({ ...makeProgress(), version: 2 });
    expect(() => importProgressJSON(raw)).toThrow(/version/i);
  });

  it('throws when completedSkills is not an array', () => {
    const raw = JSON.stringify({ ...makeProgress(), completedSkills: 'oops' });
    expect(() => importProgressJSON(raw)).toThrow(/completedSkills/i);
  });

  it('throws when badges is not an array', () => {
    const raw = JSON.stringify({ ...makeProgress(), badges: null });
    expect(() => importProgressJSON(raw)).toThrow(/badges/i);
  });

  it('throws when totalXP is not a number', () => {
    const raw = JSON.stringify({ ...makeProgress(), totalXP: 'lots' });
    expect(() => importProgressJSON(raw)).toThrow(/totalXP/i);
  });
});

describe('resetProgress', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('removes the kernel-quest-progress key from localStorage', () => {
    localStorage.setItem('kernel-quest-progress', JSON.stringify(makeProgress()));
    resetProgress();
    expect(localStorage.getItem('kernel-quest-progress')).toBeNull();
  });

  it('is a no-op when nothing is stored', () => {
    expect(() => resetProgress()).not.toThrow();
    expect(localStorage.getItem('kernel-quest-progress')).toBeNull();
  });
});

describe('downloadProgress', () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let appendSpy: ReturnType<typeof vi.spyOn>;
  let removeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    createObjectURL = vi.fn(() => 'blob:mock-url');
    revokeObjectURL = vi.fn();
    (URL.createObjectURL as unknown) = createObjectURL;
    (URL.revokeObjectURL as unknown) = revokeObjectURL;
    appendSpy = vi.spyOn(document.body, 'appendChild');
    removeSpy = vi.spyOn(document.body, 'removeChild');
  });

  it('creates a blob URL and triggers an anchor click', () => {
    downloadProgress(makeProgress());
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blobArg = createObjectURL.mock.calls[0][0] as Blob;
    expect(blobArg).toBeInstanceOf(Blob);
    expect(blobArg.type).toBe('application/json');
  });

  it('revokes the blob URL after triggering download', () => {
    downloadProgress(makeProgress());
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('uses the given filename', () => {
    let clickedHref = '';
    let clickedDownload = '';
    const anchor = document.createElement('a');
    const origClick = anchor.click;
    anchor.click = function () {
      clickedHref = this.getAttribute('href') ?? '';
      clickedDownload = this.getAttribute('download') ?? '';
    };
    const createSpy = vi.spyOn(document, 'createElement').mockReturnValueOnce(anchor);
    downloadProgress(makeProgress(), 'my-progress.json');
    expect(clickedDownload).toBe('my-progress.json');
    expect(clickedHref).toBe('blob:mock-url');
    createSpy.mockRestore();
    anchor.click = origClick;
  });

  it('defaults to kernel-quest-progress.json', () => {
    let clickedDownload = '';
    const anchor = document.createElement('a');
    anchor.click = function () {
      clickedDownload = this.getAttribute('download') ?? '';
    };
    const createSpy = vi.spyOn(document, 'createElement').mockReturnValueOnce(anchor);
    downloadProgress(makeProgress());
    expect(clickedDownload).toBe('kernel-quest-progress.json');
    createSpy.mockRestore();
  });
});

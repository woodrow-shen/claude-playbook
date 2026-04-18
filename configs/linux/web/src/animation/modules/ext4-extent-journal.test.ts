import { describe, it, expect } from 'vitest';
import ext4ExtentJournal from './ext4-extent-journal.js';
import type { Ext4State } from './ext4-extent-journal.js';

describe('ext4 Extent Tree & JBD2 Journal', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(ext4ExtentJournal.config.id).toBe('ext4-extent-journal');
      expect(ext4ExtentJournal.config.skillName).toBe('ext4-internals');
    });

    it('has a title', () => {
      expect(ext4ExtentJournal.config.title).toBe('ext4 Extent Tree & JBD2 Journal');
    });
  });

  describe('getScenarios', () => {
    it('returns 3 scenarios', () => {
      expect(ext4ExtentJournal.getScenarios().length).toBe(3);
    });

    it('each scenario has id and label', () => {
      for (const s of ext4ExtentJournal.getScenarios()) {
        expect(s.id).toBeTruthy();
        expect(s.label).toBeTruthy();
      }
    });

    it('includes extent-tree-lookup, extent-insertion, and jbd2-journal-commit', () => {
      const ids = ext4ExtentJournal.getScenarios().map(s => s.id);
      expect(ids).toContain('extent-tree-lookup');
      expect(ids).toContain('extent-insertion');
      expect(ids).toContain('jbd2-journal-commit');
    });
  });

  describe('generateFrames - extent-tree-lookup (default)', () => {
    const frames = ext4ExtentJournal.generateFrames('extent-tree-lookup');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('first frame has step=0', () => {
      expect(frames[0].step).toBe(0);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('each frame has required fields', () => {
      for (const f of frames) {
        expect(f.step).toBeGreaterThanOrEqual(0);
        expect(f.label).toBeTruthy();
        expect(f.description).toBeTruthy();
        expect(Array.isArray(f.highlights)).toBe(true);
      }
    });

    it('every frame has srcRef in data', () => {
      for (const f of frames) {
        const data = f.data as Ext4State;
        expect(data.srcRef).toBeTruthy();
        expect(data.srcRef).toMatch(/^fs\//);
      }
    });

    it('data includes extentTree with depth and levels', () => {
      const data = frames[0].data as Ext4State;
      expect(typeof data.extentTree.depth).toBe('number');
      expect(Array.isArray(data.extentTree.levels)).toBe(true);
    });

    it('shows tree walk through levels', () => {
      const phases = frames.map(f => (f.data as Ext4State).phase);
      expect(phases).toContain('map-blocks');
      expect(phases).toContain('find-extent');
      expect(phases).toContain('walk-tree');
      expect(phases).toContain('found');
    });

    it('uses real kernel function names in currentFunction', () => {
      const functions = frames.map(f => (f.data as Ext4State).currentFunction);
      expect(functions).toContain('ext4_map_blocks');
      expect(functions).toContain('ext4_ext_map_blocks');
      expect(functions).toContain('ext4_find_extent');
    });

    it('descriptions reference real function names', () => {
      const allDesc = frames.map(f => f.description).join(' ');
      expect(allDesc).toContain('ext4_map_blocks');
      expect(allDesc).toContain('ext4_ext_map_blocks');
      expect(allDesc).toContain('ext4_find_extent');
    });

    it('extent tree has header, index, and leaf levels', () => {
      const lastFrame = frames[frames.length - 1];
      const data = lastFrame.data as Ext4State;
      const types = data.extentTree.levels.map(l => l.type);
      expect(types).toContain('header');
      expect(types).toContain('index');
      expect(types).toContain('leaf');
    });
  });

  describe('generateFrames - default scenario (no argument)', () => {
    it('returns frames for default', () => {
      const frames = ext4ExtentJournal.generateFrames();
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });
  });

  describe('generateFrames - extent-insertion', () => {
    const frames = ext4ExtentJournal.generateFrames('extent-insertion');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('every frame has srcRef in data', () => {
      for (const f of frames) {
        const data = f.data as Ext4State;
        expect(data.srcRef).toBeTruthy();
        expect(data.srcRef).toMatch(/^fs\//);
      }
    });

    it('shows allocation and insertion phases', () => {
      const phases = frames.map(f => (f.data as Ext4State).phase);
      expect(phases).toContain('allocate');
      expect(phases).toContain('insert-extent');
    });

    it('references ext4_ext_insert_extent in descriptions', () => {
      const allDesc = frames.map(f => f.description).join(' ');
      expect(allDesc).toContain('ext4_ext_insert_extent');
      expect(allDesc).toContain('ext4_mb_new_blocks');
    });

    it('references ext4_da_write_begin in descriptions', () => {
      const allDesc = frames.map(f => f.description).join(' ');
      expect(allDesc).toContain('ext4_da_write_begin');
    });

    it('shows tree modification with new extent entry', () => {
      const firstLevels = (frames[0].data as Ext4State).extentTree.levels;
      const lastLevels = (frames[frames.length - 1].data as Ext4State).extentTree.levels;
      const firstLeaf = firstLevels.find(l => l.type === 'leaf');
      const lastLeaf = lastLevels.find(l => l.type === 'leaf');
      expect(lastLeaf!.entries.length).toBeGreaterThan(firstLeaf!.entries.length);
    });
  });

  describe('generateFrames - jbd2-journal-commit', () => {
    const frames = ext4ExtentJournal.generateFrames('jbd2-journal-commit');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('every frame has srcRef in data', () => {
      for (const f of frames) {
        const data = f.data as Ext4State;
        expect(data.srcRef).toBeTruthy();
        expect(data.srcRef).toMatch(/^fs\//);
      }
    });

    it('shows journal transaction lifecycle phases', () => {
      const phases = frames.map(f => (f.data as Ext4State).phase);
      expect(phases).toContain('journal-start');
      expect(phases).toContain('journal-access');
      expect(phases).toContain('journal-dirty');
      expect(phases).toContain('journal-stop');
      expect(phases).toContain('journal-commit');
    });

    it('journal state transitions through lifecycle', () => {
      const states = frames.map(f => (f.data as Ext4State).journalState.state);
      expect(states).toContain('running');
      expect(states).toContain('committing');
      expect(states).toContain('committed');
    });

    it('references jbd2 functions in descriptions', () => {
      const allDesc = frames.map(f => f.description).join(' ');
      expect(allDesc).toContain('jbd2_journal_start');
      expect(allDesc).toContain('jbd2_journal_get_write_access');
      expect(allDesc).toContain('jbd2_journal_dirty_metadata');
      expect(allDesc).toContain('jbd2_journal_stop');
      expect(allDesc).toContain('jbd2_journal_commit_transaction');
    });

    it('dirty buffers increase during transaction', () => {
      const dirtyValues = frames.map(f => (f.data as Ext4State).journalState.dirtyBuffers);
      const maxDirty = Math.max(...dirtyValues);
      expect(maxDirty).toBeGreaterThan(0);
    });

    it('transaction id is set', () => {
      const data = frames[0].data as Ext4State;
      expect(data.journalState.transactionId).toBeGreaterThan(0);
    });
  });

  describe('renderFrame', () => {
    it('renders SVG elements into container', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = ext4ExtentJournal.generateFrames('extent-tree-lookup');
      ext4ExtentJournal.renderFrame(svg, frames[0], 900, 480);
      expect(svg.querySelectorAll('rect').length).toBeGreaterThan(0);
    });

    it('renders text elements', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = ext4ExtentJournal.generateFrames('extent-tree-lookup');
      ext4ExtentJournal.renderFrame(svg, frames[0], 900, 480);
      expect(svg.querySelectorAll('text').length).toBeGreaterThan(0);
    });

    it('renders different content for different frames', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = ext4ExtentJournal.generateFrames('extent-tree-lookup');
      ext4ExtentJournal.renderFrame(svg, frames[0], 900, 480);
      const html1 = svg.innerHTML;
      ext4ExtentJournal.renderFrame(svg, frames[frames.length - 1], 900, 480);
      const html2 = svg.innerHTML;
      expect(html1).not.toBe(html2);
    });

    it('applies highlight classes', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = ext4ExtentJournal.generateFrames('extent-tree-lookup');
      const frameWithHighlights = frames.find(f => f.highlights.length > 0);
      if (frameWithHighlights) {
        ext4ExtentJournal.renderFrame(svg, frameWithHighlights, 900, 480);
        expect(svg.querySelectorAll('.anim-highlight').length).toBeGreaterThan(0);
      }
    });

    it('renders journal scenario frames', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const frames = ext4ExtentJournal.generateFrames('jbd2-journal-commit');
      ext4ExtentJournal.renderFrame(svg, frames[0], 900, 480);
      expect(svg.querySelectorAll('rect').length).toBeGreaterThan(0);
      expect(svg.querySelectorAll('text').length).toBeGreaterThan(0);
    });
  });
});

import { describe, it, expect } from 'vitest';
import pipeRingBuffer from './pipe-ring-buffer.js';
import type { PipeRingBufferState } from './pipe-ring-buffer.js';

describe('pipe-ring-buffer animation module', () => {
  describe('config', () => {
    it('has correct id and skill name', () => {
      expect(pipeRingBuffer.config.id).toBe('pipe-ring-buffer');
      expect(pipeRingBuffer.config.skillName).toBe('pipe-and-fifo');
    });

    it('has a title', () => {
      expect(pipeRingBuffer.config.title).toBeTruthy();
    });
  });

  describe('getScenarios', () => {
    it('returns 3 scenarios', () => {
      const scenarios = pipeRingBuffer.getScenarios();
      expect(scenarios.length).toBe(3);
    });

    it('includes pipe-write-read, pipe-full-and-block, and splice-zero-copy', () => {
      const ids = pipeRingBuffer.getScenarios().map(s => s.id);
      expect(ids).toContain('pipe-write-read');
      expect(ids).toContain('pipe-full-and-block');
      expect(ids).toContain('splice-zero-copy');
    });
  });

  describe('generateFrames - pipe-write-read (default)', () => {
    const frames = pipeRingBuffer.generateFrames('pipe-write-read');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('first frame has step=0', () => {
      expect(frames[0].step).toBe(0);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('every frame has a srcRef in data', () => {
      frames.forEach(f => {
        const data = f.data as PipeRingBufferState;
        expect(data.srcRef).toBeTruthy();
      });
    });

    it('shows do_pipe2 in descriptions', () => {
      expect(frames.some(f => f.description.includes('do_pipe2'))).toBe(true);
    });

    it('shows alloc_pipe_info in descriptions', () => {
      expect(frames.some(f => f.description.includes('alloc_pipe_info'))).toBe(true);
    });

    it('shows create_pipe_files in descriptions', () => {
      expect(frames.some(f => f.description.includes('create_pipe_files'))).toBe(true);
    });

    it('shows anon_pipe_write in descriptions', () => {
      expect(frames.some(f => f.description.includes('anon_pipe_write'))).toBe(true);
    });

    it('shows anon_pipe_read in descriptions', () => {
      expect(frames.some(f => f.description.includes('anon_pipe_read'))).toBe(true);
    });

    it('head advances during write', () => {
      const headValues = frames.map(f => (f.data as PipeRingBufferState).head);
      const maxHead = Math.max(...headValues);
      expect(maxHead).toBeGreaterThan(0);
    });

    it('tail advances during read', () => {
      const tailValues = frames.map(f => (f.data as PipeRingBufferState).tail);
      const maxTail = Math.max(...tailValues);
      expect(maxTail).toBeGreaterThan(0);
    });

    it('state starts with create phase', () => {
      const data = frames[0].data as PipeRingBufferState;
      expect(data.phase).toBe('create');
    });
  });

  describe('generateFrames - default returns frames', () => {
    it('returns frames when called without argument', () => {
      expect(pipeRingBuffer.generateFrames().length).toBeGreaterThan(0);
    });
  });

  describe('generateFrames - pipe-full-and-block', () => {
    const frames = pipeRingBuffer.generateFrames('pipe-full-and-block');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('every frame has a srcRef in data', () => {
      frames.forEach(f => {
        const data = f.data as PipeRingBufferState;
        expect(data.srcRef).toBeTruthy();
      });
    });

    it('shows anon_pipe_write in descriptions', () => {
      expect(frames.some(f => f.description.includes('anon_pipe_write'))).toBe(true);
    });

    it('shows pipe_full in descriptions', () => {
      expect(frames.some(f => f.description.includes('pipe_full'))).toBe(true);
    });

    it('shows wr_wait in descriptions', () => {
      expect(frames.some(f => f.description.includes('wr_wait'))).toBe(true);
    });

    it('shows wake_up_interruptible in descriptions', () => {
      expect(frames.some(f => f.description.includes('wake_up_interruptible'))).toBe(true);
    });

    it('pipe becomes full (head - tail == maxUsage)', () => {
      const hasFull = frames.some(f => {
        const data = f.data as PipeRingBufferState;
        return (data.head - data.tail) === data.maxUsage;
      });
      expect(hasFull).toBe(true);
    });

    it('shows writer blocked state', () => {
      const hasBlocked = frames.some(f => {
        const data = f.data as PipeRingBufferState;
        return data.writerBlocked === true;
      });
      expect(hasBlocked).toBe(true);
    });
  });

  describe('generateFrames - splice-zero-copy', () => {
    const frames = pipeRingBuffer.generateFrames('splice-zero-copy');

    it('generates at least 8 frames', () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
    });

    it('frames have sequential step numbers', () => {
      frames.forEach((f, i) => expect(f.step).toBe(i));
    });

    it('every frame has a srcRef in data', () => {
      frames.forEach(f => {
        const data = f.data as PipeRingBufferState;
        expect(data.srcRef).toBeTruthy();
      });
    });

    it('shows do_splice in descriptions', () => {
      expect(frames.some(f => f.description.includes('do_splice'))).toBe(true);
    });

    it('shows splice_file_to_pipe in descriptions', () => {
      expect(frames.some(f => f.description.includes('splice_file_to_pipe'))).toBe(true);
    });

    it('shows filemap_splice_read in descriptions', () => {
      expect(frames.some(f => f.description.includes('filemap_splice_read'))).toBe(true);
    });

    it('shows splice_folio_into_pipe in descriptions', () => {
      expect(frames.some(f => f.description.includes('splice_folio_into_pipe'))).toBe(true);
    });

    it('shows zero-copy page reference mechanism', () => {
      expect(frames.some(f =>
        f.description.includes('page_cache_pipe_buf_ops') ||
        f.description.includes('zero-copy') ||
        f.description.includes('folio_get')
      )).toBe(true);
    });
  });

  describe('state interface consistency', () => {
    const allScenarios = ['pipe-write-read', 'pipe-full-and-block', 'splice-zero-copy'];

    allScenarios.forEach(scenario => {
      describe(`scenario: ${scenario}`, () => {
        const frames = pipeRingBuffer.generateFrames(scenario);

        it('every frame has required state fields', () => {
          frames.forEach(f => {
            const data = f.data as PipeRingBufferState;
            expect(data).toHaveProperty('head');
            expect(data).toHaveProperty('tail');
            expect(data).toHaveProperty('maxUsage');
            expect(data).toHaveProperty('buffers');
            expect(data).toHaveProperty('currentFunction');
            expect(data).toHaveProperty('phase');
            expect(data).toHaveProperty('writerBlocked');
            expect(data).toHaveProperty('readerBlocked');
            expect(data).toHaveProperty('srcRef');
          });
        });

        it('every frame has real kernel function names in currentFunction', () => {
          frames.forEach(f => {
            const data = f.data as PipeRingBufferState;
            expect(data.currentFunction).toBeTruthy();
          });
        });
      });
    });
  });
});

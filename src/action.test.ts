import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { main } from './action.js';

describe('action scaffold', () => {
  let stderrChunks: string[] = [];

  beforeEach(() => {
    stderrChunks = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderrChunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
      return true;
    });
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code ?? 0}`);
    }) as typeof process.exit);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.INPUT_COMMAND;
  });

  it('logs the command and exits 0', () => {
    process.env.INPUT_COMMAND = 'plan';
    expect(() => main()).toThrow(/exit:0/);
    expect(stderrChunks.join('')).toMatch(/command='plan'/);
    expect(stderrChunks.join('')).toMatch(/scaffold only/);
  });

  it('handles missing INPUT_COMMAND', () => {
    expect(() => main()).toThrow(/exit:0/);
    expect(stderrChunks.join('')).toMatch(/command=''/);
  });
});

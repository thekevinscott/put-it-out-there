import { describe, expect, it } from 'vitest';
import { AuthError, TransientError } from './types.js';

describe('error classes', () => {
  it('AuthError exposes its name and message', () => {
    const e = new AuthError('bad token');
    expect(e.name).toBe('AuthError');
    expect(e.message).toBe('bad token');
    expect(e instanceof Error).toBe(true);
  });

  it('TransientError exposes its name and message', () => {
    const e = new TransientError('registry 502');
    expect(e.name).toBe('TransientError');
    expect(e.message).toBe('registry 502');
    expect(e instanceof Error).toBe(true);
  });
});

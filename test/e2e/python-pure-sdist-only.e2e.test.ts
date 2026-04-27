/**
 * E2E for `python-pure-sdist-only` — sdist-only path (no wheel
 * emitted). Different artifact set on the wire from setuptools+wheel.
 *
 * Plan + dry-run only until a trusted publisher exists for
 * `piot-fixture-zzz-python-sdist` on TestPyPI (issue #244 step 2).
 */

import { rmSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { makeE2ERepo, runPiot, type E2ERepo } from './harness.js';

let repo: E2ERepo;

beforeEach(() => {
  repo = makeE2ERepo({ fixture: 'python-pure-sdist-only' });
});

afterEach(() => {
  rmSync(repo.cwd, { recursive: true, force: true });
});

describe('e2e: python-pure-sdist-only plan', () => {
  it('emits 1 pypi row', () => {
    const out = runPiot(['plan', '--json'], repo.cwd);
    const matrix = JSON.parse(out.trim()) as Array<{ kind: string }>;
    expect(matrix).toHaveLength(1);
    expect(matrix[0]!.kind).toBe('pypi');
  });
});

describe('e2e: python-pure-sdist-only publish --dry-run', () => {
  it('runs without side effects', () => {
    const out = runPiot(['publish', '--dry-run', '--json'], repo.cwd);
    const result = JSON.parse(out.trim()) as { ok: boolean; published: unknown[] };
    expect(result.ok).toBe(true);
  });
});

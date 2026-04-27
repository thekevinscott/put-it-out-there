/**
 * E2E for `python-rust-maturin` — cross-compile per-target wheel via
 * maturin. The most complex per-build of the e2e set; the shape
 * consumers will hit hardest if the maturin path breaks.
 *
 * Plan + dry-run only until a trusted publisher exists for
 * `piot-fixture-zzz-python-maturin` on TestPyPI (issue #244 step 2).
 */

import { rmSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { makeE2ERepo, runPiot, type E2ERepo } from './harness.js';

let repo: E2ERepo;

beforeEach(() => {
  repo = makeE2ERepo({ fixture: 'python-rust-maturin' });
});

afterEach(() => {
  rmSync(repo.cwd, { recursive: true, force: true });
});

describe('e2e: python-rust-maturin plan', () => {
  it('emits 5 wheels + 1 sdist', () => {
    const out = runPiot(['plan', '--json'], repo.cwd);
    const matrix = JSON.parse(out.trim()) as Array<{ kind: string; target: string }>;
    expect(matrix).toHaveLength(6);
    expect(matrix.every((r) => r.kind === 'pypi')).toBe(true);
    expect(matrix.filter((r) => r.target === 'sdist')).toHaveLength(1);
  });
});

describe('e2e: python-rust-maturin publish --dry-run', () => {
  it('runs without side effects', () => {
    const out = runPiot(['publish', '--dry-run', '--json'], repo.cwd);
    const result = JSON.parse(out.trim()) as { ok: boolean; published: unknown[] };
    expect(result.ok).toBe(true);
  });
});

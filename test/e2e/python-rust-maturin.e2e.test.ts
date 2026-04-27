/**
 * E2E for `python-rust-maturin` — cross-compile per-target wheel via
 * maturin. The most complex per-build of the e2e set; the shape
 * consumers will hit hardest if the maturin path breaks.
 *
 * Until a trusted publisher is registered for
 * `piot-fixture-zzz-python-maturin` on TestPyPI (#244 step 2), this
 * fails — by design.
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

describe('e2e: python-rust-maturin', () => {
  it('publishes piot-fixture-zzz-python-maturin (5 wheels + sdist) to TestPyPI via OIDC', () => {
    const out = runPiot(['publish', '--json'], repo.cwd);
    const result = JSON.parse(out.trim()) as {
      ok: boolean;
      published: Array<{ package: string; version: string; result: { status: string } }>;
    };
    expect(result.ok).toBe(true);
    expect(result.published).toHaveLength(1);
    const entry = result.published[0]!;
    expect(entry.package).toBe('piot-fixture-zzz-python-maturin');
    expect(entry.version).toBe(repo.version);
    expect(entry.result.status).toMatch(/^(published|already-published)$/);
  });
});

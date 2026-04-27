/**
 * E2E for `python-pure-hatch` — hatch backend + twine OIDC mint-token.
 * The pypi OIDC path is engine-side mint-token + twine consume-token,
 * separate code from npm OIDC.
 *
 * Until a trusted publisher is registered for
 * `piot-fixture-zzz-python-hatch` on TestPyPI (#244 step 2), this
 * fails — by design.
 */

import { rmSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { makeE2ERepo, runPiot, type E2ERepo } from './harness.js';

let repo: E2ERepo;

beforeEach(() => {
  repo = makeE2ERepo({ fixture: 'python-pure-hatch' });
});

afterEach(() => {
  rmSync(repo.cwd, { recursive: true, force: true });
});

describe('e2e: python-pure-hatch', () => {
  it('publishes piot-fixture-zzz-python-hatch to TestPyPI via OIDC', () => {
    const out = runPiot(['publish', '--json'], repo.cwd);
    const result = JSON.parse(out.trim()) as {
      ok: boolean;
      published: Array<{ package: string; version: string; result: { status: string } }>;
    };
    expect(result.ok).toBe(true);
    expect(result.published).toHaveLength(1);
    const entry = result.published[0]!;
    expect(entry.package).toBe('piot-fixture-zzz-python-hatch');
    expect(entry.version).toBe(repo.version);
    expect(entry.result.status).toMatch(/^(published|already-published)$/);
  });
});

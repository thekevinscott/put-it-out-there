/**
 * E2E for `js-python-no-rust` — the SDK shape: a Python package + an
 * npm package with no Rust between them. Exercises the cross-language
 * publish path without any native build.
 *
 * Until trusted publishers are registered for
 * `piot-fixture-zzz-python-no-rust` (TestPyPI) and
 * `piot-fixture-zzz-js-no-rust` (npm) (#244 step 2), this fails —
 * by design.
 */

import { rmSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { makeE2ERepo, runPiot, type E2ERepo } from './harness.js';

let repo: E2ERepo;

beforeEach(() => {
  repo = makeE2ERepo({ fixture: 'js-python-no-rust' });
});

afterEach(() => {
  rmSync(repo.cwd, { recursive: true, force: true });
});

describe('e2e: js-python-no-rust', () => {
  it('publishes 1 pypi + 1 npm package via OIDC', () => {
    const out = runPiot(['publish', '--json'], repo.cwd);
    const result = JSON.parse(out.trim()) as {
      ok: boolean;
      published: Array<{ package: string; version: string; result: { status: string } }>;
    };
    expect(result.ok).toBe(true);
    expect(result.published).toHaveLength(2);
    const names = result.published.map((p) => p.package).sort();
    expect(names).toEqual(['piot-fixture-zzz-js-no-rust', 'piot-fixture-zzz-python-no-rust']);
    for (const entry of result.published) {
      expect(entry.version).toBe(repo.version);
      expect(entry.result.status).toMatch(/^(published|already-published)$/);
    }
  });
});

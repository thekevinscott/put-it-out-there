/**
 * E2E for `js-bundled-cli` — same N+1 pattern as napi, but the
 * top-level is a thin launcher script that picks the right platform
 * binary at runtime instead of `optionalDependencies`. ruff/uv/biome
 * ship this shape.
 *
 * Until trusted publishers are registered for
 * `piot-fixture-zzz-js-bundled` + its 5 platform sub-packages
 * (#244 step 2), this fails — by design.
 */

import { rmSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { makeE2ERepo, runPiot, type E2ERepo } from './harness.js';

let repo: E2ERepo;

beforeEach(() => {
  repo = makeE2ERepo({ fixture: 'js-bundled-cli' });
});

afterEach(() => {
  rmSync(repo.cwd, { recursive: true, force: true });
});

describe('e2e: js-bundled-cli', () => {
  it('publishes piot-fixture-zzz-js-bundled (+5 platform sub-pkgs) to npm via OIDC', () => {
    const out = runPiot(['publish', '--json'], repo.cwd);
    const result = JSON.parse(out.trim()) as {
      ok: boolean;
      published: Array<{ package: string; version: string; result: { status: string } }>;
    };
    expect(result.ok).toBe(true);
    expect(result.published).toHaveLength(1);
    const entry = result.published[0]!;
    expect(entry.package).toBe('piot-fixture-zzz-js-bundled');
    expect(entry.version).toBe(repo.version);
    expect(entry.result.status).toMatch(/^(published|already-published)$/);
  });
});

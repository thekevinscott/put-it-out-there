/**
 * E2E for `js-napi` — napi platform-family synthesis: per-triple
 * sub-packages + top-level with `optionalDependencies` pinning them.
 * Multi-publish + optionalDeps rewrite, end-to-end. dirsql ships
 * this shape.
 *
 * Until trusted publishers are registered for `piot-fixture-zzz-js-napi`
 * + its 5 platform sub-packages (#244 step 2), this fails — by design;
 * the failure is the signal to wire the publisher.
 */

import { rmSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { makeE2ERepo, runPiot, type E2ERepo } from './harness.js';

let repo: E2ERepo;

beforeEach(() => {
  repo = makeE2ERepo({ fixture: 'js-napi' });
});

afterEach(() => {
  rmSync(repo.cwd, { recursive: true, force: true });
});

describe('e2e: js-napi', () => {
  it('publishes piot-fixture-zzz-js-napi (+5 platform sub-pkgs) to npm via OIDC', () => {
    const out = runPiot(['publish', '--json'], repo.cwd);
    const result = JSON.parse(out.trim()) as {
      ok: boolean;
      published: Array<{ package: string; version: string; result: { status: string } }>;
    };
    expect(result.ok).toBe(true);
    expect(result.published).toHaveLength(1);
    const entry = result.published[0]!;
    expect(entry.package).toBe('piot-fixture-zzz-js-napi');
    expect(entry.version).toBe(repo.version);
    expect(entry.result.status).toMatch(/^(published|already-published)$/);
  });
});

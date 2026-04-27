/**
 * E2E for `js-vanilla` — npm OIDC + plain `npm publish` against
 * `piot-fixture-zzz-cli`. The live canary; throwaway
 * `0.0.{unix_seconds}` versions on every CI run.
 *
 * Auth is OIDC trusted publishing only — no NODE_AUTH_TOKEN — so the
 * test fails the same way `release-npm.yml` did on run 24972181242
 * if the engine's npm path can't reach OIDC. That's the whole point.
 *
 * Issues #28, #244.
 */

import { rmSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { makeE2ERepo, runPiot, type E2ERepo } from './harness.js';

let repo: E2ERepo;

beforeEach(() => {
  repo = makeE2ERepo({ fixture: 'js-vanilla' });
});

afterEach(() => {
  rmSync(repo.cwd, { recursive: true, force: true });
});

describe('e2e: js-vanilla', () => {
  it('publishes piot-fixture-zzz-cli to npm via OIDC', () => {
    const out = runPiot(['publish', '--json'], repo.cwd);
    const result = JSON.parse(out.trim()) as {
      ok: boolean;
      published: Array<{ package: string; version: string; result: { status: string } }>;
    };
    expect(result.ok).toBe(true);
    expect(result.published).toHaveLength(1);
    const entry = result.published[0]!;
    expect(entry.package).toBe('piot-fixture-zzz-cli');
    expect(entry.version).toBe(repo.version);
    expect(entry.result.status).toMatch(/^(published|already-published)$/);
  });
});

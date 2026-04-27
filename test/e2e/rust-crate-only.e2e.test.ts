/**
 * E2E for `rust-crate-only` — crates.io OIDC via
 * `rust-lang/crates-io-auth-action@v1` + `cargo publish`. Distinct
 * code path from npm and pypi OIDC.
 *
 * Until a trusted publisher is registered for `piot-fixture-zzz-rust`
 * on crates.io (#244 step 2), this fails — by design.
 */

import { rmSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { makeE2ERepo, runPiot, type E2ERepo } from './harness.js';

let repo: E2ERepo;

beforeEach(() => {
  repo = makeE2ERepo({ fixture: 'rust-crate-only' });
});

afterEach(() => {
  rmSync(repo.cwd, { recursive: true, force: true });
});

describe('e2e: rust-crate-only', () => {
  it('publishes piot-fixture-zzz-rust to crates.io via OIDC', () => {
    const out = runPiot(['publish', '--json'], repo.cwd);
    const result = JSON.parse(out.trim()) as {
      ok: boolean;
      published: Array<{ package: string; version: string; result: { status: string } }>;
    };
    expect(result.ok).toBe(true);
    expect(result.published).toHaveLength(1);
    const entry = result.published[0]!;
    expect(entry.package).toBe('piot-fixture-zzz-rust');
    expect(entry.version).toBe(repo.version);
    expect(entry.result.status).toMatch(/^(published|already-published)$/);
  });
});

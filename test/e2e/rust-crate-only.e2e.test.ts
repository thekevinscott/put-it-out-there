/**
 * E2E for `rust-crate-only` — crates.io OIDC via
 * `rust-lang/crates-io-auth-action@v1` + `cargo publish`. Distinct
 * code path from npm and pypi OIDC.
 *
 * Plan + dry-run only until a trusted publisher exists for
 * `piot-fixture-zzz-rust` on crates.io (issue #244 step 2).
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

describe('e2e: rust-crate-only plan', () => {
  it('emits 1 crates row', () => {
    const out = runPiot(['plan', '--json'], repo.cwd);
    const matrix = JSON.parse(out.trim()) as Array<{ kind: string; target: string }>;
    expect(matrix).toHaveLength(1);
    expect(matrix[0]!.kind).toBe('crates');
    expect(matrix[0]!.target).toBe('noarch');
  });
});

describe('e2e: rust-crate-only publish --dry-run', () => {
  it('runs without side effects', () => {
    const out = runPiot(['publish', '--dry-run', '--json'], repo.cwd);
    const result = JSON.parse(out.trim()) as { ok: boolean; published: unknown[] };
    expect(result.ok).toBe(true);
  });
});

/**
 * E2E for `polyglot-everything` — cascade ordering + cross-language
 * `depends_on` end-to-end. The v0 success criterion (plan.md §25.3
 * #2). Mirrors the dirsql shape: rust crate → python wheels (maturin)
 * + npm bundled-cli (rust binary).
 *
 * Until trusted publishers are registered for the full
 * `-rust` + `-python` + `-cli` (+5 platform sub-pkgs) set across
 * crates.io, TestPyPI, and npm (#244 step 2), this fails — by design.
 */

import { rmSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { makeE2ERepo, runPiot, type E2ERepo } from './harness.js';

let repo: E2ERepo;

beforeEach(() => {
  repo = makeE2ERepo({ fixture: 'polyglot-everything' });
});

afterEach(() => {
  rmSync(repo.cwd, { recursive: true, force: true });
});

describe('e2e: polyglot-everything', () => {
  it('publishes -rust + -python + -cli across all 3 registries via OIDC', () => {
    const out = runPiot(['publish', '--json'], repo.cwd);
    const result = JSON.parse(out.trim()) as {
      ok: boolean;
      published: Array<{ package: string; version: string; result: { status: string } }>;
    };
    expect(result.ok).toBe(true);
    expect(result.published).toHaveLength(3);
    const names = result.published.map((p) => p.package).sort();
    expect(names).toEqual([
      'piot-fixture-zzz-cli',
      'piot-fixture-zzz-python',
      'piot-fixture-zzz-rust',
    ]);
    for (const entry of result.published) {
      expect(entry.version).toBe(repo.version);
      expect(entry.result.status).toMatch(/^(published|already-published)$/);
    }
  });
});

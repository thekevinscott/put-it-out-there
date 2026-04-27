/**
 * E2E for `polyglot-everything` — cascade ordering + cross-language
 * `depends_on` end-to-end. The v0 success criterion (plan.md §25.3
 * #2). Mirrors the dirsql shape: rust crate → python wheels (maturin)
 * + npm bundled-cli (rust binary).
 *
 * Plan + dry-run only until trusted publishers exist for the full
 * `-rust` + `-python` + `-cli` (+5 platform sub-pkgs) set across all
 * three registries (issue #244 step 2).
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

describe('e2e: polyglot-everything plan', () => {
  it('emits 1 crates + 6 pypi + 6 npm rows', () => {
    const out = runPiot(['plan', '--json'], repo.cwd);
    const matrix = JSON.parse(out.trim()) as Array<{ name: string; kind: string }>;
    expect(matrix).toHaveLength(13);
    const byKind = new Map<string, number>();
    for (const r of matrix) byKind.set(r.kind, (byKind.get(r.kind) ?? 0) + 1);
    expect(byKind.get('crates')).toBe(1);
    expect(byKind.get('pypi')).toBe(6);
    expect(byKind.get('npm')).toBe(6);
  });
});

describe('e2e: polyglot-everything publish --dry-run', () => {
  it('runs without side effects', () => {
    const out = runPiot(['publish', '--dry-run', '--json'], repo.cwd);
    const result = JSON.parse(out.trim()) as { ok: boolean; published: unknown[] };
    expect(result.ok).toBe(true);
  });
});

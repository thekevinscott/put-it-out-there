/**
 * E2E for `js-napi` — napi platform-family synthesis: per-triple
 * sub-packages + top-level with `optionalDependencies` pinning them.
 * Multi-publish + optionalDeps rewrite is non-trivial; dirsql ships
 * this shape.
 *
 * Plan + dry-run only until trusted publishers exist for
 * `piot-fixture-zzz-js-napi` and its 5 platform sub-packages
 * (issue #244 step 2).
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

describe('e2e: js-napi plan', () => {
  it('emits 1 main + 5 platform rows', () => {
    const out = runPiot(['plan', '--json'], repo.cwd);
    const matrix = JSON.parse(out.trim()) as Array<{ name: string; kind: string; target: string }>;
    expect(matrix).toHaveLength(6);
    expect(matrix.every((r) => r.kind === 'npm')).toBe(true);
    expect(matrix.filter((r) => r.target === 'main')).toHaveLength(1);
  });
});

describe('e2e: js-napi publish --dry-run', () => {
  it('runs without side effects', () => {
    const out = runPiot(['publish', '--dry-run', '--json'], repo.cwd);
    const result = JSON.parse(out.trim()) as { ok: boolean; published: unknown[] };
    expect(result.ok).toBe(true);
  });
});

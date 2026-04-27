/**
 * E2E for `js-python-no-rust` — the SDK shape: a Python package + an
 * npm package with no Rust between them. Exercises the cross-language
 * publish path without any native build.
 *
 * Plan + dry-run only until trusted publishers exist for
 * `piot-fixture-zzz-python-no-rust` and `piot-fixture-zzz-js-no-rust`
 * (issue #244 step 2).
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

describe('e2e: js-python-no-rust plan', () => {
  it('emits 1 pypi + 1 npm row', () => {
    const out = runPiot(['plan', '--json'], repo.cwd);
    const matrix = JSON.parse(out.trim()) as Array<{ name: string; kind: string }>;
    expect(matrix).toHaveLength(2);
    const byKind = new Map<string, number>();
    for (const r of matrix) byKind.set(r.kind, (byKind.get(r.kind) ?? 0) + 1);
    expect(byKind.get('pypi')).toBe(1);
    expect(byKind.get('npm')).toBe(1);
  });
});

describe('e2e: js-python-no-rust publish --dry-run', () => {
  it('runs without side effects', () => {
    const out = runPiot(['publish', '--dry-run', '--json'], repo.cwd);
    const result = JSON.parse(out.trim()) as { ok: boolean; published: unknown[] };
    expect(result.ok).toBe(true);
  });
});

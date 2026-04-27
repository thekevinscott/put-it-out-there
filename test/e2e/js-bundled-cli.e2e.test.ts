/**
 * E2E for `js-bundled-cli` — same N+1 family pattern as napi, but the
 * top-level is a thin launcher script that picks the right platform
 * binary at runtime instead of `optionalDependencies`. ruff/uv/biome
 * ship this shape.
 *
 * Plan + dry-run only until trusted publishers exist for
 * `piot-fixture-zzz-js-bundled` and its 5 platform sub-packages
 * (issue #244 step 2).
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

describe('e2e: js-bundled-cli plan', () => {
  it('emits 1 main + 5 platform rows', () => {
    const out = runPiot(['plan', '--json'], repo.cwd);
    const matrix = JSON.parse(out.trim()) as Array<{ name: string; kind: string; target: string }>;
    expect(matrix).toHaveLength(6);
    expect(matrix.every((r) => r.kind === 'npm')).toBe(true);
    expect(matrix.filter((r) => r.target === 'main')).toHaveLength(1);
  });
});

describe('e2e: js-bundled-cli publish --dry-run', () => {
  it('runs without side effects', () => {
    const out = runPiot(['publish', '--dry-run', '--json'], repo.cwd);
    const result = JSON.parse(out.trim()) as { ok: boolean; published: unknown[] };
    expect(result.ok).toBe(true);
  });
});

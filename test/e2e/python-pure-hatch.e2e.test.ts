/**
 * E2E for `python-pure-hatch` — hatch backend + twine OIDC mint-token.
 * The pypi OIDC path is engine-side mint-token + twine consume-token,
 * separate from npm's OIDC path.
 *
 * Plan + dry-run only until a trusted publisher exists for
 * `piot-fixture-zzz-python-hatch` on TestPyPI (issue #244 step 2).
 */

import { rmSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { makeE2ERepo, runPiot, type E2ERepo } from './harness.js';

let repo: E2ERepo;

beforeEach(() => {
  repo = makeE2ERepo({ fixture: 'python-pure-hatch' });
});

afterEach(() => {
  rmSync(repo.cwd, { recursive: true, force: true });
});

describe('e2e: python-pure-hatch plan', () => {
  it('emits 1 pypi row', () => {
    const out = runPiot(['plan', '--json'], repo.cwd);
    const matrix = JSON.parse(out.trim()) as Array<{ kind: string }>;
    expect(matrix).toHaveLength(1);
    expect(matrix[0]!.kind).toBe('pypi');
  });
});

describe('e2e: python-pure-hatch publish --dry-run', () => {
  it('runs without side effects', () => {
    const out = runPiot(['publish', '--dry-run', '--json'], repo.cwd);
    const result = JSON.parse(out.trim()) as { ok: boolean; published: unknown[] };
    expect(result.ok).toBe(true);
  });
});

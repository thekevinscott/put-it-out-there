/**
 * Spawn-based regression test for pkg.path absolutization (issue #88,
 * follow-up to #85).
 *
 * The in-process test in `src/publish.test.ts` asserts that publish()
 * absolutizes pkg.path before calling handlers. That catches TS-level
 * regressions but not:
 *   - breakage in how `bin/putitoutthere` parses `--cwd`, or
 *   - a config loader that re-introduces relative-path access from
 *     process.cwd().
 *
 * This test spawns the real CLI from a working directory that is
 * deliberately NOT the fixture repo, then runs `plan --json` with
 * `--cwd <repo>`. If any part of the chain (CLI arg parsing, config
 * loader, plan) forgets to anchor filesystem access to `--cwd`,
 * this fails with a non-zero exit.
 *
 * Used to also exercise `publish --dry-run` to cover the publish
 * code path's leg of the same plumbing; that arm went away with
 * `--dry-run` in #244, and the publish-side coverage now lives in
 * the live per-fixture e2e tests, which use the same `--cwd` plumbing.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { makeE2ERepo, type E2ERepo } from './harness.js';

const CLI = fileURLToPath(new URL('../../dist/cli-bin.js', import.meta.url));

let repo: E2ERepo;
let spawnCwd: string;

beforeEach(() => {
  repo = makeE2ERepo({ fixture: 'js-vanilla' });
  // A fresh tmp dir with no putitoutthere.toml, no package.json, no .git.
  // If the CLI reads from process.cwd() anywhere it shouldn't, this will
  // produce either an "ENOENT" or a silently-empty plan.
  spawnCwd = mkdtempSync(join(tmpdir(), 'piot-spawn-'));
});

afterEach(() => {
  rmSync(repo.cwd, { recursive: true, force: true });
  rmSync(spawnCwd, { recursive: true, force: true });
});

describe('e2e: pkg.path absolutization (spawn surface)', () => {
  it('plan --json succeeds when spawn cwd != --cwd', () => {
    const out = execFileSync('node', [CLI, 'plan', '--json', '--cwd', repo.cwd], {
      cwd: spawnCwd,
      env: process.env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const matrix = JSON.parse(out.trim()) as Array<{ name: string; version: string }>;
    expect(matrix.map((r) => r.name)).toEqual(['piot-fixture-zzz-cli']);
    for (const row of matrix) {
      expect(row.version).toBe(repo.version);
    }
  });
});

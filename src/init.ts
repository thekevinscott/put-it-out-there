/**
 * `putitoutthere init` — scaffold a new repo.
 *
 * Writes:
 * - `putitoutthere.toml` (skeleton with `version = 1`, no packages)
 * - `putitoutthere/AGENTS.md` (trailer convention doc per plan.md §17.3)
 * - `.github/workflows/release.yml` + `.github/workflows/putitoutthere-check.yml`
 * - Appends `@putitoutthere/AGENTS.md` to `CLAUDE.md` (creates if missing)
 *
 * Idempotency (plan.md §17.4):
 * - Existing `putitoutthere.toml` → skip unless `--force`.
 * - Existing workflow → rename to `.bak` before writing.
 * - Existing `CLAUDE.md` already containing the import line → skip the append.
 *
 * Issue #20. Plan: §17.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface InitOptions {
  cwd: string;
  /** Overwrite `putitoutthere.toml` even if it exists. */
  force?: boolean;
  /** Reserved for v0.1. Only `claude` supported today. */
  agent?: 'claude' | 'cursor';
}

export interface InitResult {
  wrote: string[];
  skipped: string[];
  backedUp: string[];
}

export function init(opts: InitOptions): InitResult {
  const cwd = opts.cwd;
  const force = Boolean(opts.force);
  const agent = opts.agent ?? 'claude';
  const result: InitResult = { wrote: [], skipped: [], backedUp: [] };

  // 1. putitoutthere.toml
  const tomlPath = join(cwd, 'putitoutthere.toml');
  if (existsSync(tomlPath) && !force) {
    result.skipped.push('putitoutthere.toml');
  } else {
    writeAtomic(tomlPath, TOML_SKELETON);
    result.wrote.push('putitoutthere.toml');
  }

  // 2. putitoutthere/AGENTS.md
  const agentsPath = join(cwd, 'putitoutthere', 'AGENTS.md');
  if (existsSync(agentsPath)) {
    result.skipped.push('putitoutthere/AGENTS.md');
  } else {
    writeAtomic(agentsPath, AGENTS_MD);
    result.wrote.push('putitoutthere/AGENTS.md');
  }

  // 3. CLAUDE.md / .cursorrules
  if (agent === 'claude') {
    const claudePath = join(cwd, 'CLAUDE.md');
    const importLine = '@putitoutthere/AGENTS.md';
    const existing = existsSync(claudePath) ? readFileSync(claudePath, 'utf8') : '';
    if (existing.includes(importLine)) {
      result.skipped.push('CLAUDE.md');
    } else {
      const sep = existing.length > 0 && !existing.endsWith('\n') ? '\n' : '';
      writeAtomic(claudePath, `${existing}${sep}${importLine}\n`);
      result.wrote.push('CLAUDE.md');
    }
    /* v8 ignore start -- cursor path is stub-level until requested */
  } else {
    const cursorPath = join(cwd, '.cursorrules');
    const existing = existsSync(cursorPath) ? readFileSync(cursorPath, 'utf8') : '';
    if (existing.includes('Release signaling for Put It Out There')) {
      result.skipped.push('.cursorrules');
    } else {
      writeAtomic(cursorPath, `${existing}${existing.length > 0 ? '\n' : ''}${AGENTS_MD}`);
      result.wrote.push('.cursorrules');
    }
  }
  /* v8 ignore stop */

  // 4. Workflows
  writeWorkflow(cwd, 'release.yml', RELEASE_YML, result);
  writeWorkflow(cwd, 'putitoutthere-check.yml', CHECK_YML, result);

  return result;
}

/* ---------------------------- internals ---------------------------- */

function writeWorkflow(cwd: string, name: string, contents: string, result: InitResult): void {
  const target = join(cwd, '.github', 'workflows', name);
  if (existsSync(target)) {
    const bak = `${target}.bak`;
    renameSync(target, bak);
    result.backedUp.push(`.github/workflows/${name}`);
  }
  writeAtomic(target, contents);
  result.wrote.push(`.github/workflows/${name}`);
}

function writeAtomic(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, 'utf8');
}

/* ---------------------------- templates ---------------------------- */

const TOML_SKELETON = `# Put It Out There — release orchestration config.
# Docs: https://github.com/thekevinscott/put-it-out-there
#
# Declare one [[package]] block per releasable artifact. Example:
#
# [[package]]
# name = "my-crate"
# kind = "crates"
# path = "crates/my-crate"
# paths = ["crates/my-crate/**", "Cargo.toml", "Cargo.lock"]
# first_version = "0.1.0"

version = 1
`;

const AGENTS_MD = `# Release signaling for Put It Out There

When you finish a unit of work and are preparing a PR or commit, add a git
trailer to the commit message body to signal a release:

    release: <patch|minor|major|skip>

Rules:
- Omit the trailer for docs-only, CI-only, or internal-only changes.
- \`patch\` for bug fixes or internal refactors that don't change public API.
- \`minor\` for new features that are backwards-compatible.
- \`major\` for breaking changes.
- \`skip\` to suppress release when path filters would otherwise cascade.

The trailer on the merge commit determines the release. If merging via
"Squash and merge," include the trailer in the PR description so it ends up
in the squashed commit body.

## Scoping a release to specific packages

To release a subset of packages in a polyglot repo, append a bracketed list:

    release: minor [dirsql-rust, dirsql-python]

Packages named in the list are bumped with the specified version. Other
packages cascaded by path filters still get a \`patch\`. Packages in the
list that *aren't* cascaded are force-included.
`;

const RELEASE_YML = `name: Release

on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      dry_run:
        description: 'Dry-run: compute plan, skip publish + tag'
        type: boolean
        default: false

concurrency:
  group: release
  cancel-in-progress: false

permissions:
  contents: write
  id-token: write

jobs:
  plan:
    runs-on: ubuntu-latest
    outputs:
      matrix: \${{ steps.plan.outputs.matrix }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
      - id: plan
        name: putitoutthere plan
        uses: thekevinscott/put-it-out-there@v0
        with:
          command: plan

  publish:
    needs: plan
    if: fromJSON(needs.plan.outputs.matrix || '[]')[0] != null
    runs-on: \${{ matrix.runs_on }}
    strategy:
      fail-fast: false
      matrix:
        include: \${{ fromJSON(needs.plan.outputs.matrix) }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
          registry-url: 'https://registry.npmjs.org'
      - name: putitoutthere publish
        uses: thekevinscott/put-it-out-there@v0
        with:
          command: publish
          dry_run: \${{ inputs.dry_run || 'false' }}
`;

const CHECK_YML = `name: Putitoutthere check (PR dry-run)

on:
  pull_request:
    branches: [main]

permissions:
  contents: read
  pull-requests: read

jobs:
  dry-run:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
      - name: putitoutthere plan (dry-run)
        uses: thekevinscott/put-it-out-there@v0
        with:
          command: plan
`;

/**
 * PyPI handler.
 *
 * Issue #17. Plan: §6.4, §12.2, §12.3, §13.1, §14.5, §16.1.
 *
 * Publish model: twine upload. The workflow is responsible for wiring
 * up PYPI_API_TOKEN (either from a classic secret or via a
 * trusted-publisher-backed OIDC exchange step that populates the env
 * before pilot runs). Full in-handler OIDC exchange is deferred --
 * the gh-action-pypi-publish step handles that cleanly for v0.
 *
 * Artifact discovery: scans `ctx.artifactsRoot` for directories named
 * `{pkg.name}-*` (the artifact naming contract from §12.4). Uploads
 * all `.whl` and `.tar.gz` files found under those directories. Fails
 * loud if nothing's found -- the completeness check (#13) should have
 * caught that earlier, but defense in depth.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Ctx, Handler, PublishResult } from '../types.js';
import { TransientError } from '../types.js';

const REGISTRY = 'https://pypi.org';

async function isPublishedImpl(
  pkg: { name: string; pypi?: string },
  version: string,
  _ctx: Ctx,
): Promise<boolean> {
  const name = pypiNameFor(pkg);
  const url = `${REGISTRY}/pypi/${encodeURIComponent(name)}/${encodeURIComponent(version)}/json`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'user-agent': 'putitoutthere/0.0.1' },
  });
  if (res.status === 200) return true;
  if (res.status === 404) return false;
  if (res.status >= 500) {
    throw new TransientError(`pypi.org GET ${url} returned ${res.status}`);
  }
  /* v8 ignore next -- defensive 4xx fallthrough; PyPI returns 200/404 for this endpoint */
  throw new Error(`pypi.org GET ${url} returned ${res.status}`);
}

function writeVersionImpl(
  pkg: { path: string },
  version: string,
  _ctx: Ctx,
): Promise<string[]> {
  const pyProjectPath = join(pkg.path, 'pyproject.toml');
  if (!existsSync(pyProjectPath)) {
    return Promise.reject(new Error(`pyproject.toml not found at ${pyProjectPath}`));
  }
  const original = readFileSync(pyProjectPath, 'utf8');
  let updated: string;
  try {
    updated = replacePyProjectVersion(original, version);
  } catch (err) {
    return Promise.reject(err instanceof Error ? err : new Error(String(err)));
  }
  if (updated === original) return Promise.resolve([]);
  writeFileSync(pyProjectPath, updated, 'utf8');
  return Promise.resolve([pyProjectPath]);
}

async function publishImpl(
  pkg: { name: string; path: string; pypi?: string },
  version: string,
  ctx: Ctx,
): Promise<PublishResult> {
  if (await isPublishedImpl(pkg, version, ctx)) {
    return { status: 'already-published' };
  }
  if (ctx.dryRun) {
    return { status: 'skipped' };
  }

  const files = collectArtifacts(pkg.name, ctx.artifactsRoot);
  if (files.length === 0) {
    throw new Error(
      `pypi: no artifacts found for ${pkg.name} under ${ctx.artifactsRoot ?? '(artifactsRoot unset)'}`,
    );
  }

  const token = ctx.env.PYPI_API_TOKEN ?? process.env.PYPI_API_TOKEN;
  if (!token) {
    throw new Error('pypi: PYPI_API_TOKEN not set; see plan.md §16.4.2');
  }

  try {
    execFileSync('twine', ['upload', '--non-interactive', '--disable-progress-bar', ...files], {
      cwd: ctx.cwd,
      env: {
        ...process.env,
        ...ctx.env,
        TWINE_USERNAME: '__token__',
        TWINE_PASSWORD: token,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    const stderr = (err as { stderr?: Buffer }).stderr?.toString('utf8').trim();
    const base = err instanceof Error ? err.message : String(err);
    throw new Error(`twine upload failed${stderr ? `:\n${stderr}` : `: ${base}`}`);
  }

  return {
    status: 'published',
    url: `${REGISTRY}/project/${pypiNameFor(pkg)}/${version}/`,
  };
}

/* ------------------------------ internals ------------------------------ */

function pypiNameFor(pkg: { name: string; pypi?: string }): string {
  return pkg.pypi ?? pkg.name;
}

/**
 * Rewrites the first `version = "x.y.z"` inside the `[project]` table.
 */
export function replacePyProjectVersion(source: string, version: string): string {
  const re = /(\[project\][\s\S]*?)(^\s*version\s*=\s*")([^"]*)(")/m;
  const m = re.exec(source);
  if (!m) {
    throw new Error('pyproject.toml: no [project].version field found');
  }
  const [, pre, prefix, old, suffix] = m as unknown as [string, string, string, string, string];
  if (old === version) return source;
  const start = m.index + pre.length;
  const end = start + prefix.length + old.length + suffix.length;
  return source.slice(0, start) + prefix + version + suffix + source.slice(end);
}

/**
 * Collects `.whl` and `.tar.gz` files across every artifact subdir whose
 * name starts with the package's pilot name. Matches the artifact naming
 * contract from §12.4: `{name}-wheel-{target}` and `{name}-sdist`.
 */
function collectArtifacts(pkgName: string, artifactsRoot: string | undefined): string[] {
  if (!artifactsRoot || !existsSync(artifactsRoot)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(artifactsRoot)) {
    if (!entry.startsWith(`${pkgName}-`)) continue;
    const sub = join(artifactsRoot, entry);
    /* v8 ignore next -- fs entries shouldn't vanish between readdir and stat */
    if (!statSync(sub).isDirectory()) continue;
    for (const file of readdirSync(sub)) {
      if (file.endsWith('.whl') || file.endsWith('.tar.gz')) {
        out.push(join(sub, file));
      }
    }
  }
  return out;
}

export const pypi: Handler = {
  kind: 'pypi',
  isPublished: isPublishedImpl as Handler['isPublished'],
  writeVersion: writeVersionImpl as Handler['writeVersion'],
  publish: publishImpl as Handler['publish'],
};

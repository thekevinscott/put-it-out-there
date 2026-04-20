/**
 * Pre-flight auth check. Runs before any publish side effect to verify
 * every cascaded package has usable credentials.
 *
 * Per plan.md §16.3: each handler accepts OIDC (detected by
 * `ACTIONS_ID_TOKEN_REQUEST_TOKEN`) or a specific long-lived env var.
 * OIDC-capable handlers fall back on the env var when OIDC is not
 * available.
 *
 * This module reports; callers decide whether to throw. `requireAuth`
 * is the common case (publish). `pilot doctor` uses `checkAuth`
 * directly so it can show a table instead of aborting.
 *
 * Issue #14.
 */

import type { Package } from './config.js';
import type { Kind } from './types.js';

// Each kind lists the env vars we accept, in priority order. `npm` accepts
// both `NODE_AUTH_TOKEN` (the setup-node idiom) and `NPM_TOKEN` (the common
// community convention) — see #95.
const TOKEN_ENV: Record<Kind, readonly string[]> = {
  crates: ['CARGO_REGISTRY_TOKEN'],
  pypi: ['PYPI_API_TOKEN'],
  npm: ['NODE_AUTH_TOKEN', 'NPM_TOKEN'],
};

const OIDC_ENV = 'ACTIONS_ID_TOKEN_REQUEST_TOKEN';
const DOCS_POINTER = 'plan.md §16.4';

export interface AuthResult {
  package: string;
  kind: Kind;
  via: 'oidc' | 'token' | 'missing';
  /** Display name of the token env var(s) for this kind, e.g. `NODE_AUTH_TOKEN or NPM_TOKEN`. */
  envVar: string;
}

export interface AuthStatus {
  ok: boolean;
  results: AuthResult[];
}

export function checkAuth(packages: readonly Package[]): AuthStatus {
  const hasOidc = nonEmpty(process.env[OIDC_ENV]);
  const results: AuthResult[] = packages.map((p) => {
    const accepted = TOKEN_ENV[p.kind];
    const envVar = accepted.join(' or ');
    if (hasOidc) {
      return { package: p.name, kind: p.kind, via: 'oidc', envVar };
    }
    if (accepted.some((name) => nonEmpty(process.env[name]))) {
      return { package: p.name, kind: p.kind, via: 'token', envVar };
    }
    return { package: p.name, kind: p.kind, via: 'missing', envVar };
  });
  const ok = results.every((r) => r.via !== 'missing');
  return { ok, results };
}

export function requireAuth(packages: readonly Package[]): void {
  const status = checkAuth(packages);
  if (status.ok) return;
  const missing = status.results.filter((r) => r.via === 'missing');
  const lines = missing.map(
    (r) =>
      `  - ${r.package} (${r.kind}) needs ${r.envVar} (or OIDC via ${OIDC_ENV})`,
  );
  throw new Error(
    [
      'Pre-flight auth check failed:',
      ...lines,
      '',
      `Wire the missing env vars in .github/workflows/release.yml under the publish job.`,
      `See ${DOCS_POINTER}.`,
    ].join('\n'),
  );
}

function nonEmpty(v: string | undefined): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

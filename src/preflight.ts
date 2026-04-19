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

const TOKEN_ENV: Record<Kind, string> = {
  crates: 'CARGO_REGISTRY_TOKEN',
  pypi: 'PYPI_API_TOKEN',
  npm: 'NODE_AUTH_TOKEN',
};

const OIDC_ENV = 'ACTIONS_ID_TOKEN_REQUEST_TOKEN';
const DOCS_POINTER = 'plan.md §16.4';

export interface AuthResult {
  package: string;
  kind: Kind;
  via: 'oidc' | 'token' | 'missing';
  envVar: string; // always the expected token env var for this kind
}

export interface AuthStatus {
  ok: boolean;
  results: AuthResult[];
}

export function checkAuth(packages: readonly Package[]): AuthStatus {
  const hasOidc = nonEmpty(process.env[OIDC_ENV]);
  const results: AuthResult[] = packages.map((p) => {
    const envVar = TOKEN_ENV[p.kind];
    if (hasOidc) {
      return { package: p.name, kind: p.kind, via: 'oidc', envVar };
    }
    if (nonEmpty(process.env[envVar])) {
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

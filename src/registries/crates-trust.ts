/**
 * crates.io trusted-publishing read API.
 *
 * Issue #189. crates.io exposes `GET /api/v1/trusted_publishing/github_configs?crate=<name>`
 * that returns each registered GitHub trust-policy config — enough to
 * diff against a local `[package.trust_policy]` declaration and catch
 * the `release.yml → patch-release.yml` rename landmine before it
 * breaks a live publish.
 *
 * PyPI and npm do NOT have a usable read API from CI: PyPI has no
 * current-policy endpoint (only past provenance via PEP 740), and
 * npm's equivalent requires 2FA/OTP on every call and rejects
 * bypass-2FA tokens. See `docs/guide/auth.md` for the full matrix.
 */

import { USER_AGENT } from '../version.js';

const API_BASE = 'https://crates.io';

/** One `GitHubConfig` entry from crates.io's trust-policy API. */
export interface CratesGithubConfig {
  id: number;
  repository_owner: string;
  repository_name: string;
  workflow_filename: string;
  environment: string | null;
}

export type CratesTrustFetchResult =
  | { kind: 'ok'; configs: CratesGithubConfig[] }
  /** Transient failure — timeout, network error, or 5xx. Neutral-skip in doctor. */
  | { kind: 'skip-transient'; reason: string }
  /** Token rejected (401). Fails the phase; user must fix the token. */
  | { kind: 'auth-failed'; reason: string };

export interface FetchOptions {
  /** Override for tests; defaults to `API_BASE`. */
  apiBase?: string;
  /** Override for tests; defaults to `AbortSignal.timeout(5000)`. */
  signal?: AbortSignal;
}

/**
 * Fetches the crates.io trust-policy configs for a crate. Wraps the
 * network call in a 5s timeout; transient failures (timeout, 5xx,
 * network error) return `skip-transient` so `doctor` doesn't turn red
 * because crates.io is having a bad minute. A 401 returns
 * `auth-failed` — the token is the user's responsibility to fix.
 */
export async function fetchCratesTrustPolicy(
  crate: string,
  token: string,
  opts: FetchOptions = {},
): Promise<CratesTrustFetchResult> {
  const base = opts.apiBase ?? API_BASE;
  const url = `${base}/api/v1/trusted_publishing/github_configs?crate=${encodeURIComponent(crate)}`;
  const signal = opts.signal ?? AbortSignal.timeout(5000);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: {
        'user-agent': USER_AGENT,
        authorization: `Bearer ${token}`,
      },
      signal,
    });
  } catch (err) {
    /* v8 ignore next -- fetch always throws an Error; the String(err) fallback is defensive */
    const message = err instanceof Error ? err.message : String(err);
    return { kind: 'skip-transient', reason: message };
  }
  if (res.status === 401) {
    return { kind: 'auth-failed', reason: 'crates.io rejected CRATES_IO_DOCTOR_TOKEN (401)' };
  }
  if (res.status >= 500) {
    return { kind: 'skip-transient', reason: `crates.io returned HTTP ${res.status}` };
  }
  if (res.status !== 200) {
    return { kind: 'skip-transient', reason: `crates.io returned unexpected HTTP ${res.status}` };
  }
  const body = (await res.json()) as { github_configs?: CratesGithubConfig[] };
  return { kind: 'ok', configs: body.github_configs ?? [] };
}

/** Issue emitted when a declared trust policy disagrees with crates.io. */
export interface CratesTrustMismatch {
  crate: string;
  field: 'workflow_filename' | 'environment' | 'repository';
  declared: string;
  registered: string | null;
}

/**
 * Compare a `[package.trust_policy]` declaration against each registered
 * crates.io config for the same crate. Returns one mismatch per field
 * per config; empty when every field agrees across every registered
 * config.
 */
export function diffCratesTrust(
  crate: string,
  declared: { workflow: string; environment?: string | undefined; repository?: string | undefined },
  configs: readonly CratesGithubConfig[],
): CratesTrustMismatch[] {
  const out: CratesTrustMismatch[] = [];
  for (const cfg of configs) {
    if (cfg.workflow_filename !== declared.workflow) {
      out.push({
        crate,
        field: 'workflow_filename',
        declared: declared.workflow,
        registered: cfg.workflow_filename,
      });
    }
    if (declared.environment !== undefined && cfg.environment !== declared.environment) {
      out.push({
        crate,
        field: 'environment',
        declared: declared.environment,
        registered: cfg.environment,
      });
    }
    if (declared.repository !== undefined) {
      const registeredRepo = `${cfg.repository_owner}/${cfg.repository_name}`;
      if (registeredRepo !== declared.repository) {
        out.push({
          crate,
          field: 'repository',
          declared: declared.repository,
          registered: registeredRepo,
        });
      }
    }
  }
  return out;
}

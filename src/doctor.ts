/**
 * `putitoutthere doctor` — pre-flight validator.
 *
 * Validates: config parses; every package has a resolvable kind; every
 * package has usable credentials (OIDC or per-kind token). Returns a
 * structured report rather than throwing so the CLI can render it as
 * a table.
 *
 * When `checkArtifacts` is on, also walks the plan and checks each
 * expected artifact directory. Silent-skips when plan can't run (no
 * git state / no commits) so `doctor` stays useful in contexts that
 * don't have a release history yet.
 *
 * Issue #23. Plan: §21.1, §16.4.7. Artifact check: #89.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { expectedLayout, type MatrixRow } from './completeness.js';
import { loadConfig, type Package } from './config.js';
import {
  checkEnvironment,
  checkPermissions,
  checkPublishInvocation,
  findPublishWorkflows,
  type WorkflowFile,
} from './oidc-policy.js';
import { plan } from './plan.js';
import { checkAuth, type AuthResult } from './preflight.js';
import { deepCheck, type DeepCheckRow, type InspectFn } from './token-scope.js';

export interface DoctorOptions {
  cwd: string;
  configPath?: string;
  /** When true, walks the plan and checks each artifact dir exists. */
  checkArtifacts?: boolean;
  /**
   * When true, resolve each package's token and run a live `inspect`
   * to cross-check publish scope against the config. Slower (hits the
   * registries); off by default. See #110.
   */
  deep?: boolean;
  /** Override for tests; defaults to the real `inspect`. */
  inspectFn?: InspectFn;
}

export interface DoctorReport {
  ok: boolean;
  issues: string[];
  packages: Array<{
    name: string;
    kind: string;
    auth: AuthResult['via'];
    /** Populated when `deep: true`. */
    scope?: string;
    scope_match?: DeepCheckRow['match'];
  }>;
  artifacts?: Array<{
    package: string;
    target: string;
    artifact_name: string;
    present: boolean;
    expected: string;
  }>;
  /**
   * Trust-policy (local) check results. See `checkTrustPolicyLocal`.
   * `undefined` when no publish workflow was found (e.g. a bare repo
   * with no `.github/workflows/` yet — no signal, no noise).
   */
  trustPolicy?: TrustPolicyReport;
}

export interface TrustPolicyReport {
  workflows: Array<{
    filename: string;
    permissions_ok: boolean;
    environment_ok: boolean;
    invocation_ok: boolean;
    issues: string[];
  }>;
}

export async function doctor(opts: DoctorOptions): Promise<DoctorReport> {
  const issues: string[] = [];
  let config: { packages: Package[] } | null = null;

  /* v8 ignore next -- tests always pass an explicit cwd */
  const cfgPath =
    opts.configPath ?? `${opts.cwd.replace(/\/+$/, '')}/putitoutthere.toml`;

  try {
    config = loadConfig(cfgPath);
    /* v8 ignore start -- non-Error catch fallback path */
  } catch (err) {
    issues.push(
      `config: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  /* v8 ignore stop */

  const packages: DoctorReport['packages'] = [];

  if (config) {
    const auth = checkAuth(config.packages);
    for (const pkg of config.packages) {
      const row = auth.results.find((r) => r.package === pkg.name);
      /* v8 ignore next -- every cascaded package has a row in checkAuth */
      const via = row?.via ?? 'missing';
      packages.push({ name: pkg.name, kind: pkg.kind, auth: via });
      if (via === 'missing') {
        issues.push(
          `auth: ${pkg.name} (${pkg.kind}) needs ${row?.acceptedEnvVars.join(' or ') ?? '<env-var>'} or OIDC`,
        );
      }
    }

    if (opts.deep) {
      const scopable = config.packages.filter((p) => {
        const r = auth.results.find((x) => x.package === p.name);
        return r !== undefined && r.via === 'token';
      });
      const envVarForPackage = new Map<string, string>();
      for (const p of scopable) {
        const r = auth.results.find((x) => x.package === p.name);
        /* v8 ignore next -- filter above guarantees a row */
        if (r !== undefined) envVarForPackage.set(p.name, r.envVar);
      }
      const rows = await deepCheck({
        packages: scopable,
        envVarForPackage,
        ...(opts.inspectFn !== undefined ? { inspect: opts.inspectFn } : {}),
      });
      for (const row of rows) {
        const pkgEntry = packages.find((p) => p.name === row.package);
        /* v8 ignore next -- deepCheck rows always correspond to a scoped package */
        if (pkgEntry === undefined) continue;
        pkgEntry.scope = row.scope;
        pkgEntry.scope_match = row.match;
        if (row.match === 'mismatch' || row.match === 'error') {
          issues.push(
            `scope: ${row.package} (${row.kind}) — ${row.detail ?? 'token scope does not match config'}`,
          );
        }
      }
    }
  }

  const artifacts = opts.checkArtifacts && config
    ? await checkArtifacts(opts, cfgPath, issues)
    : undefined;

  const trustPolicy = checkTrustPolicyLocal(opts.cwd, issues);

  return {
    ok: issues.length === 0,
    issues,
    packages,
    ...(artifacts !== undefined ? { artifacts } : {}),
    ...(trustPolicy !== undefined ? { trustPolicy } : {}),
  };
}

/**
 * Trust-policy (local) phase. Additive; runs after auth-availability.
 * Deferred to a follow-up: filename-vs-registry diff and environment-
 * name-vs-registry diff (Option C of #162).
 */
function checkTrustPolicyLocal(
  cwd: string,
  issues: string[],
): TrustPolicyReport | undefined {
  const workflows = findPublishWorkflows(cwd);
  if (workflows.length === 0) return undefined;

  const report: TrustPolicyReport = { workflows: [] };
  for (const wf of workflows) {
    const wfIssues: string[] = [];

    const invocation = checkPublishInvocation(wf);
    if (invocation !== null) {
      wfIssues.push(
        `trust-policy: ${wf.filename}: no clearly-identifiable publish step (commented out?)`,
      );
    }

    const perms = checkPermissions(wf);
    for (const p of perms) {
      wfIssues.push(
        `trust-policy: ${wf.filename}: job \`${p.job}\` is missing \`${p.permission}\` permission — add it to the job or to workflow-level \`permissions:\``,
      );
    }

    const env = checkEnvironment(wf);
    if (env !== null) {
      wfIssues.push(
        `trust-policy: ${wf.filename}: job \`${env.job}\` has no \`environment:\` key — many trust policies pin an environment; add one (e.g. \`environment: release\`) matching the registry registration`,
      );
    }

    for (const line of wfIssues) issues.push(line);
    report.workflows.push({
      filename: wf.filename,
      permissions_ok: perms.length === 0,
      environment_ok: env === null,
      invocation_ok: invocation === null,
      issues: wfIssues,
    });
  }
  return report;
}

/**
 * Exported for CLI rendering: the explicit "what's NOT checked" line
 * we surface below the trust-policy phase so a green doctor output
 * doesn't imply the filename landmine is caught.
 */
export const TRUST_POLICY_SCOPE_NOTE =
  'note: `doctor` does NOT diff workflow filename or environment name against each registry\'s trust policy. Renaming the workflow or environment will still break publish with HTTP 400 until the registry registration is updated.';

/** Re-exported for callers that want to construct a `TrustPolicyReport` or inspect workflows directly. */
export type { WorkflowFile };

async function checkArtifacts(
  opts: DoctorOptions,
  cfgPath: string,
  issues: string[],
): Promise<DoctorReport['artifacts']> {
  let matrix: MatrixRow[];
  try {
    matrix = (await plan({ cwd: opts.cwd, configPath: cfgPath })) as MatrixRow[];
  } catch (err) {
    // Plan needs a git repo with at least one commit. In a scratch
    // checkout (no git state yet) we can't walk the plan at all, so
    // we note it as a soft issue and move on.
    /* v8 ignore next -- non-Error catch fallback path */
    const message = err instanceof Error ? err.message : String(err);
    issues.push(`artifacts: cannot walk plan (${message})`);
    return [];
  }

  const root = join(opts.cwd, 'artifacts');
  const rows: NonNullable<DoctorReport['artifacts']> = [];
  for (const row of matrix) {
    // Vanilla npm publishes from the source tree; there's no separate
    // artifact dir to check. Mirrors completeness.ts's carve-out.
    if (row.kind === 'npm' && row.target === 'noarch') continue;
    const dir = join(root, row.artifact_name);
    const present = existsSync(dir);
    const expected = expectedLayout(row);
    rows.push({
      package: row.name,
      target: row.target,
      artifact_name: row.artifact_name,
      present,
      expected,
    });
    if (!present) {
      issues.push(`artifacts: ${row.name} (${row.target}) missing; expected ${expected}`);
    }
  }
  return rows;
}

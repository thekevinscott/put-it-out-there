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
  diffEnvironment,
  diffWorkflowFilename,
  findPublishWorkflows,
  inferFromGithubWorkflowRef,
  type EnvironmentMismatch,
  type WorkflowFile,
  type WorkflowFilenameMismatch,
} from './oidc-policy.js';
import {
  diffCratesTrust,
  fetchCratesTrustPolicy,
  type CratesTrustMismatch,
} from './registries/crates-trust.js';
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
  /**
   * Override for tests of the crates.io trust-policy cross-check.
   * Defaults to the real `fetchCratesTrustPolicy`. Accepting `null`
   * here means "use the default".
   */
  cratesIoFetch?: typeof fetchCratesTrustPolicy;
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
  /**
   * Trust-policy (declared) check results. See #189. `undefined` when
   * no package has a `[package.trust_policy]` block.
   */
  trustPolicyDeclared?: TrustPolicyDeclaredReport;
  /**
   * Trust-policy (crates.io) cross-check. `undefined` when the phase
   * didn't run (e.g. no `CRATES_IO_DOCTOR_TOKEN`, or no crates with
   * `trust_policy` declared).
   */
  trustPolicyCratesIo?: TrustPolicyCratesIoReport;
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

export interface TrustPolicyDeclaredReport {
  /** One entry per package with a `[package.trust_policy]` block. */
  packages: Array<{
    name: string;
    workflow_ok: boolean;
    environment_ok: boolean;
    ref_ok: boolean;
    issues: string[];
  }>;
}

export interface TrustPolicyCratesIoReport {
  /** `'skipped'` when the token was missing; other values are per-crate statuses. */
  status: 'ran' | 'skipped';
  reason?: string;
  crates: Array<{
    name: string;
    status: 'ok' | 'mismatch' | 'skip-transient' | 'auth-failed';
    reason?: string;
    mismatches?: CratesTrustMismatch[];
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

  const workflows = findPublishWorkflows(opts.cwd);
  const trustPolicy = checkTrustPolicyLocal(workflows, issues);
  const trustPolicyDeclared = config
    ? checkTrustPolicyDeclared(config.packages, workflows, issues)
    : undefined;
  const trustPolicyCratesIo = config
    ? await checkTrustPolicyCratesIo(config.packages, issues, opts.cratesIoFetch)
    : undefined;

  return {
    ok: issues.length === 0,
    issues,
    packages,
    ...(artifacts !== undefined ? { artifacts } : {}),
    ...(trustPolicy !== undefined ? { trustPolicy } : {}),
    ...(trustPolicyDeclared !== undefined ? { trustPolicyDeclared } : {}),
    ...(trustPolicyCratesIo !== undefined ? { trustPolicyCratesIo } : {}),
  };
}

/**
 * Trust-policy (local) phase. Additive; runs after auth-availability.
 * Deferred to a follow-up: filename-vs-registry diff and environment-
 * name-vs-registry diff (Option C of #162).
 */
function checkTrustPolicyLocal(
  workflows: readonly WorkflowFile[],
  issues: string[],
): TrustPolicyReport | undefined {
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
  'note: declare `[package.trust_policy]` to have `doctor` diff workflow + environment against the config. Registry cross-check is crates.io-only (set `CRATES_IO_DOCTOR_TOKEN`); PyPI and npm are declaration-only.';

/**
 * Declared-diff phase (#189). For each package with a `[package.trust_policy]`
 * block, diffs the declaration against:
 *  - the local workflow file that `findPublishWorkflows` identified
 *  - `GITHUB_WORKFLOW_REF` when running inside Actions
 * Returns `undefined` when no package has a declaration.
 */
function checkTrustPolicyDeclared(
  packages: readonly Package[],
  workflows: readonly WorkflowFile[],
  issues: string[],
): TrustPolicyDeclaredReport | undefined {
  const declared = packages.filter((p) => p.trust_policy !== undefined);
  if (declared.length === 0) return undefined;
  const report: TrustPolicyDeclaredReport = { packages: [] };
  const localWorkflow = workflows[0]?.filename;
  const inferred = inferFromGithubWorkflowRef();
  for (const pkg of declared) {
    const policy = pkg.trust_policy;
    /* v8 ignore next -- filter guarantees trust_policy is set */
    if (policy === undefined) continue;
    const pkgIssues: string[] = [];
    let workflowOk = true;
    let environmentOk = true;
    let refOk = true;
    if (localWorkflow !== undefined) {
      const mismatch = diffWorkflowFilename(policy.workflow, localWorkflow);
      if (mismatch !== null) {
        workflowOk = false;
        pkgIssues.push(renderWorkflowMismatch(pkg.name, mismatch));
      }
    }
    if (policy.environment !== undefined) {
      for (const wf of workflows) {
        const envMismatch = diffEnvironment(policy.environment, wf);
        if (envMismatch !== null) {
          environmentOk = false;
          pkgIssues.push(renderEnvironmentMismatch(pkg.name, envMismatch));
          break;
        }
      }
    }
    if (inferred !== null && inferred.workflow !== policy.workflow) {
      refOk = false;
      pkgIssues.push(
        `trust-policy: ${pkg.name}: GITHUB_WORKFLOW_REF says the running workflow is ${inferred.workflow}, but [package.trust_policy].workflow is ${policy.workflow}`,
      );
    }
    for (const line of pkgIssues) issues.push(line);
    report.packages.push({
      name: pkg.name,
      workflow_ok: workflowOk,
      environment_ok: environmentOk,
      ref_ok: refOk,
      issues: pkgIssues,
    });
  }
  return report;
}

function renderWorkflowMismatch(pkgName: string, m: WorkflowFilenameMismatch): string {
  return `trust-policy: ${pkgName}: declared workflow ${m.declared} does not match local workflow ${m.actual} — update [package.trust_policy].workflow or rename the workflow file back`;
}

function renderEnvironmentMismatch(pkgName: string, m: EnvironmentMismatch): string {
  const actual = m.actual ?? '(none)';
  return `trust-policy: ${pkgName}: declared environment ${m.declared} does not match workflow ${m.workflow}'s environment ${actual}`;
}

/**
 * Opt-in crates.io cross-check (#189). Silent-skip when
 * `CRATES_IO_DOCTOR_TOKEN` is unset. For each `kind = "crates"` package
 * with a declared `trust_policy`, fetches the registered configs and
 * diffs against the declaration. Transient failures are neutral-skipped
 * so a bad crates.io minute doesn't turn doctor red; 401 fails.
 */
async function checkTrustPolicyCratesIo(
  packages: readonly Package[],
  issues: string[],
  fetchFn: typeof fetchCratesTrustPolicy = fetchCratesTrustPolicy,
): Promise<TrustPolicyCratesIoReport | undefined> {
  const crates = packages.filter(
    (p): p is Package & { kind: 'crates'; trust_policy: NonNullable<Package['trust_policy']> } =>
      p.kind === 'crates' && p.trust_policy !== undefined,
  );
  if (crates.length === 0) return undefined;
  const token = process.env.CRATES_IO_DOCTOR_TOKEN;
  if (token === undefined || token.length === 0) {
    return {
      status: 'skipped',
      reason: 'set CRATES_IO_DOCTOR_TOKEN to enable crates.io trust-policy cross-check',
      crates: [],
    };
  }
  const report: TrustPolicyCratesIoReport = { status: 'ran', crates: [] };
  for (const pkg of crates) {
    const crateName = pkg.name;
    const result = await fetchFn(crateName, token);
    if (result.kind === 'skip-transient') {
      report.crates.push({ name: crateName, status: 'skip-transient', reason: result.reason });
      continue;
    }
    if (result.kind === 'auth-failed') {
      report.crates.push({ name: crateName, status: 'auth-failed', reason: result.reason });
      issues.push(`trust-policy: ${crateName}: ${result.reason}`);
      continue;
    }
    const policy = pkg.trust_policy;
    const mismatches = diffCratesTrust(
      crateName,
      {
        workflow: policy.workflow,
        ...(policy.environment !== undefined ? { environment: policy.environment } : {}),
        ...(policy.repository !== undefined ? { repository: policy.repository } : {}),
      },
      result.configs,
    );
    if (mismatches.length === 0) {
      report.crates.push({ name: crateName, status: 'ok' });
    } else {
      report.crates.push({ name: crateName, status: 'mismatch', mismatches });
      for (const m of mismatches) {
        issues.push(
          `trust-policy: ${crateName}: crates.io has ${m.field} = ${m.registered ?? '(none)'}, config declares ${m.declared}`,
        );
      }
    }
  }
  return report;
}

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

/**
 * Shared env-var helpers.
 *
 * Handlers read auth/OIDC env vars out of both `ctx.env` (workflow-set)
 * and `process.env` (runner-set). The natural `a ?? b` pattern breaks
 * when `a === ''`: nullish coalescing only falls through on
 * null/undefined, so `Boolean('' ?? 'real-token')` is `false`. CI
 * harnesses often set `FOO: process.env.FOO ?? ''` to forward optional
 * env, which makes empty strings a common runtime reality.
 *
 * `nonEmpty()` normalizes that by treating empty strings as unset, so
 * the coalesce falls through correctly.
 */

export function nonEmpty(v: string | undefined): string | undefined {
  return v && v.length > 0 ? v : undefined;
}

/**
 * Env-var names passed through from the parent `process.env` to every
 * subprocess (cargo / twine / npm / git). Kept deliberately minimal
 * (#138): the default `{ ...process.env, ...ctx.env }` pattern leaks
 * every unrelated secret on the runner — GH_TOKEN from a previous
 * step, a user's local AWS_* creds, the whole lot — into publish
 * tooling that has no business seeing them.
 *
 * Entries here are the ones those tools actually need to function:
 *  - `PATH`                  executable resolution on every platform
 *  - `HOME`/`USERPROFILE`    cargo/npm/pip config discovery
 *  - `TMPDIR`/`TEMP`/`TMP`   scratch-space selection
 *  - `LANG`/`LC_*`           locale for tools that format output
 *  - `SystemRoot`/`windir`/`ComSpec` Windows basics
 *  - `CARGO_HOME`/`RUSTUP_HOME`      cargo/rustup data dirs
 *  - `npm_config_userconfig`/`NPM_CONFIG_USERCONFIG`  npm config path
 *
 * Secrets are NOT forwarded via this allowlist; they come in through
 * `ctx.env` explicit-passthrough (which the publish caller controls).
 */
const DEFAULT_ENV_PASSTHROUGH: readonly string[] = [
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TMPDIR',
  'TEMP',
  'TMP',
  // Windows basics
  'USERPROFILE',
  'SystemRoot',
  'SYSTEMROOT',
  'windir',
  'WINDIR',
  'ComSpec',
  'COMSPEC',
  'APPDATA',
  'LOCALAPPDATA',
  'PATHEXT',
  // Tool-config discovery (non-secret): cargo/rustup/npm look here
  // to find their own config.
  'CARGO_HOME',
  'RUSTUP_HOME',
  'npm_config_userconfig',
  'NPM_CONFIG_USERCONFIG',
];

/**
 * Build a minimal env for a subprocess spawn.
 *
 * Combines:
 *  1. The `DEFAULT_ENV_PASSTHROUGH` subset of the parent `process.env`.
 *  2. Everything in `ctxEnv` (workflow-declared passthroughs — this is
 *     where tokens and OIDC vars live).
 *  3. Any `extras` the handler needs to set (e.g. `TWINE_PASSWORD`).
 *
 * `ctxEnv` and `extras` override the baseline. Undefined values in
 * either are dropped so a handler can explicitly omit a var.
 *
 * #138.
 */
export function buildSubprocessEnv(
  ctxEnv: Record<string, string | undefined> = {},
  extras: Record<string, string | undefined> = {},
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of DEFAULT_ENV_PASSTHROUGH) {
    const v = process.env[name];
    if (typeof v === 'string') out[name] = v;
  }
  for (const [k, v] of Object.entries(ctxEnv)) {
    if (typeof v === 'string') out[k] = v;
  }
  for (const [k, v] of Object.entries(extras)) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}

/**
 * Env-var names a subprocess needs to perform GitHub Actions OIDC
 * trusted-publisher auth (e.g. `npm publish --provenance` minting a
 * short-lived registry token from npm's `/oidc/mint-token` endpoint).
 *
 * Deliberately separate from `DEFAULT_ENV_PASSTHROUGH`: handlers that
 * don't do OIDC-backed publishing (cargo, twine) shouldn't see these.
 * Call sites pass `oidcEnv()` into `buildSubprocessEnv`'s `extras`
 * argument *only* when they've detected OIDC and want it forwarded.
 *
 * `ACTIONS_ID_TOKEN_REQUEST_*` are the bearer-token exchange pair the
 * runner mints per-job. The `GITHUB_*` / `RUNNER_NAME` vars are public
 * CI metadata npm reads to populate provenance attestations.
 */
const OIDC_ENV_PASSTHROUGH: readonly string[] = [
  'ACTIONS_ID_TOKEN_REQUEST_TOKEN',
  'ACTIONS_ID_TOKEN_REQUEST_URL',
  'GITHUB_ACTIONS',
  'GITHUB_REPOSITORY',
  'GITHUB_REPOSITORY_ID',
  'GITHUB_REPOSITORY_OWNER',
  'GITHUB_REPOSITORY_OWNER_ID',
  'GITHUB_REF',
  'GITHUB_SHA',
  'GITHUB_RUN_ID',
  'GITHUB_RUN_ATTEMPT',
  'GITHUB_RUN_NUMBER',
  'GITHUB_WORKFLOW',
  'GITHUB_WORKFLOW_REF',
  'GITHUB_WORKFLOW_SHA',
  'GITHUB_SERVER_URL',
  'GITHUB_EVENT_NAME',
  'RUNNER_NAME',
  'RUNNER_OS',
  'RUNNER_ARCH',
];

export function oidcEnv(): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const name of OIDC_ENV_PASSTHROUGH) {
    const v = process.env[name];
    if (typeof v === 'string') out[name] = v;
  }
  return out;
}

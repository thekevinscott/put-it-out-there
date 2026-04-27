import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildSubprocessEnv, nonEmpty, oidcEnv } from './env.js';

describe('nonEmpty', () => {
  it('returns the string when non-empty', () => {
    expect(nonEmpty('x')).toBe('x');
  });

  it('returns undefined when empty string', () => {
    expect(nonEmpty('')).toBeUndefined();
  });

  it('returns undefined when undefined', () => {
    expect(nonEmpty(undefined)).toBeUndefined();
  });

  it('falls through with ?? so empty string does not shadow a real value', () => {
    // The exact pattern handlers use: ctx-scoped env first, process.env
    // second. Empty strings from the workflow harness must not shadow a
    // populated process.env value.
    const ctxEnv = { TOKEN: '' };
    const procEnv = { TOKEN: 'real' };
    const resolved = nonEmpty(ctxEnv.TOKEN) ?? nonEmpty(procEnv.TOKEN);
    expect(resolved).toBe('real');
  });
});

describe('buildSubprocessEnv (#138)', () => {
  const ENV_BAK = { ...process.env };
  beforeEach(() => {
    process.env.UNRELATED_AWS_SECRET = 'leak';
    process.env.PATH = process.env.PATH ?? '/usr/bin';
    process.env.HOME = process.env.HOME ?? '/tmp';
  });
  afterEach(() => {
    for (const k of Object.keys(process.env)) {
      if (!(k in ENV_BAK)) delete process.env[k];
    }
    Object.assign(process.env, ENV_BAK);
  });

  it('passes PATH / HOME through from the parent env', () => {
    const out = buildSubprocessEnv();
    expect(out.PATH).toBe(process.env.PATH);
    expect(out.HOME).toBe(process.env.HOME);
  });

  it('does not forward unrelated parent secrets', () => {
    const out = buildSubprocessEnv();
    expect(out.UNRELATED_AWS_SECRET).toBeUndefined();
  });

  it('forwards declared ctx.env vars (including tokens)', () => {
    const out = buildSubprocessEnv({ CARGO_REGISTRY_TOKEN: 'abc' });
    expect(out.CARGO_REGISTRY_TOKEN).toBe('abc');
  });

  it('merges extras last so handlers can set fixed overrides', () => {
    const out = buildSubprocessEnv(
      { CARGO_TERM_VERBOSE: 'false' },
      { CARGO_TERM_VERBOSE: 'true' },
    );
    expect(out.CARGO_TERM_VERBOSE).toBe('true');
  });

  it('drops undefined values from ctx.env and extras', () => {
    const out = buildSubprocessEnv(
      { DEFINED: 'yes', MISSING: undefined },
      { EXTRA: undefined },
    );
    expect(out.DEFINED).toBe('yes');
    expect(out.MISSING).toBeUndefined();
    expect(out.EXTRA).toBeUndefined();
  });
});

describe('oidcEnv', () => {
  const ENV_BAK = { ...process.env };
  beforeEach(() => {
    // Tear down any pre-set OIDC vars from the runner so the negative
    // path is testable.
    for (const k of [
      'ACTIONS_ID_TOKEN_REQUEST_TOKEN',
      'ACTIONS_ID_TOKEN_REQUEST_URL',
      'GITHUB_REPOSITORY',
      'GITHUB_RUN_ID',
      'RUNNER_NAME',
    ]) {
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of Object.keys(process.env)) {
      if (!(k in ENV_BAK)) delete process.env[k];
    }
    Object.assign(process.env, ENV_BAK);
  });

  it('returns OIDC + GitHub context vars when set on process.env', () => {
    process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN = 'token-xyz';
    process.env.ACTIONS_ID_TOKEN_REQUEST_URL = 'https://example.com/oidc';
    process.env.GITHUB_REPOSITORY = 'owner/repo';
    process.env.GITHUB_RUN_ID = '42';
    process.env.RUNNER_NAME = 'GitHub Actions 1';
    const out = oidcEnv();
    expect(out.ACTIONS_ID_TOKEN_REQUEST_TOKEN).toBe('token-xyz');
    expect(out.ACTIONS_ID_TOKEN_REQUEST_URL).toBe('https://example.com/oidc');
    expect(out.GITHUB_REPOSITORY).toBe('owner/repo');
    expect(out.GITHUB_RUN_ID).toBe('42');
    expect(out.RUNNER_NAME).toBe('GitHub Actions 1');
  });

  it('omits names not present on process.env', () => {
    process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN = 'token-only';
    const out = oidcEnv();
    expect(out.ACTIONS_ID_TOKEN_REQUEST_TOKEN).toBe('token-only');
    expect(out).not.toHaveProperty('GITHUB_REPOSITORY');
    expect(out).not.toHaveProperty('RUNNER_NAME');
  });

  it('returns an empty object when no OIDC vars are set', () => {
    expect(oidcEnv()).toEqual({});
  });

  it('flows through buildSubprocessEnv extras to npm subprocess (regression)', () => {
    // Regression for the ENEEDAUTH on putitoutthere self-publish: the
    // npm subprocess used to run with a stripped env that omitted
    // ACTIONS_ID_TOKEN_REQUEST_*, so `npm publish --provenance` could
    // not mint a registry token from npm's `/oidc/mint-token` endpoint
    // and fell through to "need auth" even with a trusted publisher
    // configured. The npm handler now forwards `oidcEnv()` as extras
    // when OIDC is detected.
    process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN = 'tok';
    process.env.ACTIONS_ID_TOKEN_REQUEST_URL = 'https://x';
    const out = buildSubprocessEnv({}, oidcEnv());
    expect(out.ACTIONS_ID_TOKEN_REQUEST_TOKEN).toBe('tok');
    expect(out.ACTIONS_ID_TOKEN_REQUEST_URL).toBe('https://x');
  });
});

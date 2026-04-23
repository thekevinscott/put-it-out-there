/**
 * Tests for `src/registries/crates-trust.ts` — the opt-in crates.io
 * trust-policy read + diff helper used by `doctor`. Issue #189.
 */

import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { USER_AGENT } from '../version.js';
import {
  diffCratesTrust,
  fetchCratesTrustPolicy,
  type CratesGithubConfig,
} from './crates-trust.js';

const API_BASE = 'https://crates.io.test';
const PATH = `${API_BASE}/api/v1/trusted_publishing/github_configs`;
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function cfg(overrides: Partial<CratesGithubConfig> = {}): CratesGithubConfig {
  return {
    id: 1,
    repository_owner: 'octo',
    repository_name: 'hello',
    workflow_filename: 'release.yml',
    environment: 'release',
    ...overrides,
  };
}

describe('fetchCratesTrustPolicy', () => {
  it('returns configs on 200', async () => {
    server.use(
      http.get(PATH, () =>
        HttpResponse.json({ github_configs: [cfg()] }),
      ),
    );
    const result = await fetchCratesTrustPolicy('hello', 'tok', { apiBase: API_BASE });
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.configs).toHaveLength(1);
    expect(result.configs[0]!.workflow_filename).toBe('release.yml');
  });

  it('sends the bearer token and the piot user-agent', async () => {
    let seenAuth = '';
    let seenUa = '';
    server.use(
      http.get(PATH, ({ request }) => {
        seenAuth = request.headers.get('authorization') ?? '';
        seenUa = request.headers.get('user-agent') ?? '';
        return HttpResponse.json({ github_configs: [] });
      }),
    );
    await fetchCratesTrustPolicy('hello', 'tok-123', { apiBase: API_BASE });
    expect(seenAuth).toBe('Bearer tok-123');
    expect(seenUa).toBe(USER_AGENT);
  });

  it('returns auth-failed on 401', async () => {
    server.use(
      http.get(PATH, () =>
        HttpResponse.json({ errors: [{ detail: 'bad' }] }, { status: 401 }),
      ),
    );
    const result = await fetchCratesTrustPolicy('hello', 'bad', { apiBase: API_BASE });
    expect(result.kind).toBe('auth-failed');
  });

  it('returns skip-transient on 5xx', async () => {
    server.use(
      http.get(PATH, () => HttpResponse.text('boom', { status: 502 })),
    );
    const result = await fetchCratesTrustPolicy('hello', 'tok', { apiBase: API_BASE });
    expect(result.kind).toBe('skip-transient');
    if (result.kind !== 'skip-transient') return;
    expect(result.reason).toContain('502');
  });

  it('returns skip-transient on unexpected 4xx (e.g. 404)', async () => {
    server.use(
      http.get(PATH, () => HttpResponse.text('nope', { status: 404 })),
    );
    const result = await fetchCratesTrustPolicy('hello', 'tok', { apiBase: API_BASE });
    expect(result.kind).toBe('skip-transient');
  });

  it('returns skip-transient on network error', async () => {
    server.use(
      http.get(PATH, () => HttpResponse.error()),
    );
    const result = await fetchCratesTrustPolicy('hello', 'tok', { apiBase: API_BASE });
    expect(result.kind).toBe('skip-transient');
  });

  it('returns skip-transient when the abort signal fires', async () => {
    const aborted = new AbortController();
    aborted.abort(new Error('timed out'));
    const result = await fetchCratesTrustPolicy('hello', 'tok', {
      apiBase: API_BASE,
      signal: aborted.signal,
    });
    expect(result.kind).toBe('skip-transient');
  });

  it('uses the default crates.io apiBase + 5s timeout when opts omitted', async () => {
    server.use(
      http.get('https://crates.io/api/v1/trusted_publishing/github_configs', () =>
        HttpResponse.json({ github_configs: [cfg()] }),
      ),
    );
    // No `opts` at all — exercises the `opts.apiBase ?? API_BASE` and
    // `opts.signal ?? AbortSignal.timeout(5000)` default branches.
    const result = await fetchCratesTrustPolicy('hello', 'tok');
    expect(result.kind).toBe('ok');
  });

  it('returns ok with empty configs when body omits github_configs', async () => {
    server.use(
      // Malformed / empty body — some API error paths return `{}`.
      http.get(PATH, () => HttpResponse.json({})),
    );
    const result = await fetchCratesTrustPolicy('hello', 'tok', { apiBase: API_BASE });
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.configs).toEqual([]);
  });
});

describe('diffCratesTrust', () => {
  const declared = {
    workflow: 'release.yml',
    environment: 'release',
    repository: 'octo/hello',
  };

  it('returns no mismatches when every field agrees', () => {
    expect(diffCratesTrust('hello', declared, [cfg()])).toEqual([]);
  });

  it('reports workflow_filename mismatch', () => {
    const out = diffCratesTrust('hello', declared, [cfg({ workflow_filename: 'patch.yml' })]);
    expect(out).toHaveLength(1);
    expect(out[0]!.field).toBe('workflow_filename');
    expect(out[0]!.registered).toBe('patch.yml');
  });

  it('reports environment mismatch', () => {
    const out = diffCratesTrust('hello', declared, [cfg({ environment: 'production' })]);
    expect(out.some((m) => m.field === 'environment')).toBe(true);
  });

  it('reports environment mismatch when registry is null and user declared one', () => {
    const out = diffCratesTrust('hello', declared, [cfg({ environment: null })]);
    const envMismatch = out.find((m) => m.field === 'environment');
    expect(envMismatch).toBeDefined();
    expect(envMismatch!.registered).toBeNull();
  });

  it('does not flag environment when user did not declare one', () => {
    const out = diffCratesTrust(
      'hello',
      { workflow: 'release.yml' },
      [cfg({ environment: null })],
    );
    expect(out.filter((m) => m.field === 'environment')).toEqual([]);
  });

  it('reports repository mismatch', () => {
    const out = diffCratesTrust('hello', declared, [cfg({ repository_name: 'other' })]);
    expect(out.some((m) => m.field === 'repository')).toBe(true);
  });

  it('returns a mismatch per disagreeing field per config', () => {
    const out = diffCratesTrust('hello', declared, [
      cfg({ workflow_filename: 'a.yml', environment: 'x' }),
      cfg({ repository_owner: 'mallory' }),
    ]);
    expect(out).toHaveLength(3);
  });
});

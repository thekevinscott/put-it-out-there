/**
 * Each handler in the scaffold throws "not implemented yet" on every
 * method. These tests pin the stub behavior so we notice if the contract
 * shape drifts, and they keep coverage >= 90% until #16–#19 land real
 * implementations.
 */

import { describe, expect, it } from 'vitest';
import { crates } from './crates.js';
import { npm } from './npm.js';
import { pypi } from './pypi.js';
import type { Ctx, PackageConfig } from '../types.js';

const PKG: PackageConfig = {
  name: 'fixture',
  kind: 'crates',
  path: '.',
  paths: ['**/*'],
};

const CTX: Ctx = {
  cwd: '.',
  dryRun: true,
  log: {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  },
  env: {},
  artifacts: {
    get: () => '',
    has: () => false,
  },
};

describe.each([
  ['crates', crates, /#16/],
  ['pypi', pypi, /#17/],
  ['npm', npm, /#18 \/ #19/],
] as const)('%s stub', (_name, handler, expectedIssue) => {
  it('isPublished throws a not-implemented error pointing at the follow-up issue', () => {
    expect(() => handler.isPublished(PKG, '0.1.0', CTX)).toThrow(expectedIssue);
  });
  it('writeVersion throws a not-implemented error pointing at the follow-up issue', () => {
    expect(() => handler.writeVersion(PKG, '0.1.0', CTX)).toThrow(expectedIssue);
  });
  it('publish throws a not-implemented error pointing at the follow-up issue', () => {
    expect(() => handler.publish(PKG, '0.1.0', CTX)).toThrow(expectedIssue);
  });
});

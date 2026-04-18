/**
 * crates.io handler. Real implementation lands in #16.
 * Scaffold: contract-shaped stub that throws on any method call so
 * callers link against the expected surface.
 */

import type { Handler } from '../types.js';

const NOT_IMPLEMENTED = (method: string): Error =>
  new Error(`crates handler '${method}' not implemented yet — see #16`);

export const crates: Handler = {
  kind: 'crates',
  isPublished() {
    throw NOT_IMPLEMENTED('isPublished');
  },
  writeVersion() {
    throw NOT_IMPLEMENTED('writeVersion');
  },
  publish() {
    throw NOT_IMPLEMENTED('publish');
  },
};

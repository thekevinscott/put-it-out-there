/**
 * PyPI handler. Real implementation lands in #17.
 */

import type { Handler } from '../types.js';

const NOT_IMPLEMENTED = (method: string): Error =>
  new Error(`pypi handler '${method}' not implemented yet — see #17`);

export const pypi: Handler = {
  kind: 'pypi',
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

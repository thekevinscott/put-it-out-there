/**
 * npm handler. Real implementation lands in #18 (vanilla) and #19
 * (napi + bundled-cli platform orchestration).
 */

import type { Handler } from '../types.js';

const NOT_IMPLEMENTED = (method: string): Error =>
  new Error(`npm handler '${method}' not implemented yet — see #18 / #19`);

export const npm: Handler = {
  kind: 'npm',
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

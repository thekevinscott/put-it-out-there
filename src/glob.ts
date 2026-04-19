/**
 * Glob matcher. Thin wrapper over minimatch with the flags putitoutthere
 * needs everywhere.
 *
 * Flags per plan.md §11.4:
 *   - dot: true       — real repos keep config under .github/, .config/, etc.
 *   - matchBase: false — patterns anchor at the repo root
 *
 * Double-star crosses directory boundaries; brace expansion is on.
 *
 * Issue #10.
 */

import { minimatch } from 'minimatch';

const OPTS = {
  dot: true,
  matchBase: false,
  nocomment: true, // putitoutthere.toml patterns aren't shell comments
} as const;

export function matchesGlob(pattern: string, path: string): boolean {
  return minimatch(path, pattern, OPTS);
}

export function matchesAny(patterns: readonly string[], path: string): boolean {
  for (const p of patterns) {
    if (matchesGlob(p, path)) return true;
  }
  return false;
}

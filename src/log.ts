/**
 * Structured logger for putitoutthere.
 *
 * JSON-per-line output in CI; human-readable text in TTYs. Every emitted
 * line is passed through a redactor that replaces any occurrence of a
 * known-secret env value (keys matching *TOKEN* / *SECRET* / *PASSWORD*
 * / *KEY*, case-insensitive) with `[REDACTED:<digest>]`, where `<digest>`
 * is a stable 8-hex-char SHA-256 prefix (#134). Operators can correlate
 * rotated tokens across log lines without ever seeing the value.
 *
 * Substring redaction (rather than Pino-style field-path redaction) is
 * deliberate: handlers capture child-process stdout/stderr and feed it
 * through the logger. A token leaked inside that stream must not escape
 * to CI logs regardless of which field it ended up in.
 *
 * Issue #11. Plan: §22.2, §22.5.
 */

import type { Writable } from 'node:stream';

import { tokenDigest } from './auth.js';
import type { Logger } from './types.js';

export type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface LoggerOptions {
  stream?: Writable;
  pretty?: boolean; // default: detect by stream.isTTY if available, else false
  level?: Level;    // default: 'info'
  /**
   * Extra env-like maps whose `*TOKEN*` / `*SECRET*` / `*PASSWORD*` /
   * `*KEY*` values should be redacted alongside `process.env`.
   * Handlers receive `ctx.env` as a separate layered environment; a
   * secret injected there but never exported to `process.env` would
   * otherwise slip through to CI logs (#136).
   */
  extraEnvs?: readonly NodeJS.ProcessEnv[];
}

export function createLogger(opts: LoggerOptions = {}): Logger {
  // Default to stderr so stdout stays clean for machine-readable
  // output from `plan --json` and `publish --json`.
  /* v8 ignore next -- tests always pass an explicit stream */
  const stream: Writable = opts.stream ?? process.stderr;
  const pretty = opts.pretty ?? isTty(stream);
  /* v8 ignore next -- 'info' default vs explicit level both exercised; the ?? branch is one of those */
  const minLevel = LEVEL_ORDER[opts.level ?? 'info'];
  const extraEnvs = opts.extraEnvs;

  const emit = (level: Level, msg: string, fields: Record<string, unknown>): void => {
    if (LEVEL_ORDER[level] < minLevel) return;
    const record = { level, time: new Date().toISOString(), msg, ...fields };
    const raw = pretty ? formatPretty(record) : `${JSON.stringify(record)}\n`;
    stream.write(extraEnvs ? redact(raw, [process.env, ...extraEnvs]) : redact(raw));
  };

  return {
    debug: (msg, fields = {}) => emit('debug', msg, fields),
    info: (msg, fields = {}) => emit('info', msg, fields),
    warn: (msg, fields = {}) => emit('warn', msg, fields),
    error: (msg, fields = {}) => emit('error', msg, fields),
  };
}

function isTty(stream: Writable): boolean {
  return Boolean((stream as { isTTY?: boolean }).isTTY);
}

function formatPretty(record: Record<string, unknown>): string {
  const { level, time: _t, msg, ...fields } = record;
  const pairs = Object.entries(fields)
    .map(([k, v]) => `${k}=${formatScalar(v)}`)
    .join(' ');
  const prefix = `[${String(level).toUpperCase()}]`;
  return pairs.length > 0 ? `${prefix} ${String(msg)}  ${pairs}\n` : `${prefix} ${String(msg)}\n`;
}

function formatScalar(v: unknown): string {
  if (typeof v === 'string') return v;
  /* v8 ignore next -- null/boolean primitive branches not all hit by current tests */
  if (typeof v === 'number' || typeof v === 'boolean' || v === null) return String(v);
  return JSON.stringify(v);
}

/* ----------------------------- redaction ----------------------------- */

const SECRET_KEY = /TOKEN|SECRET|PASSWORD|KEY/i;

/**
 * Replace every occurrence of a known-secret env value with
 * `[REDACTED:<digest>]` where `<digest>` is a stable 8-hex-char
 * SHA-256 prefix of the token. Operators can correlate rotated
 * tokens across log lines without ever seeing the value itself.
 * Empty / single-char values are skipped to avoid mangling unrelated
 * characters. Called on every log write.
 *
 * Accepts one or more env-like sources so callers can include
 * layered environments (e.g. `ctx.env`) alongside `process.env`
 * (#136).
 */
export function redact(s: string, envs: readonly NodeJS.ProcessEnv[] = [process.env]): string {
  let out = s;
  for (const env of envs) {
    for (const [k, v] of Object.entries(env)) {
      if (!SECRET_KEY.test(k)) continue;
      if (typeof v !== 'string' || v.length < 2) continue;
      if (!out.includes(v)) continue;
      // String.replaceAll expects a literal or a RegExp; use split/join to
      // avoid regex escaping every secret value.
      out = out.split(v).join(`[REDACTED:${tokenDigest(v)}]`);
    }
  }
  return out;
}

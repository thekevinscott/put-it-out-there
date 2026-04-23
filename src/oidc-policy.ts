/**
 * OIDC trust-policy local validation.
 *
 * `doctor` uses this module to check the locally-knowable structural
 * prerequisites of OIDC trusted publishing:
 *
 *   1. At least one `.github/workflows/*.yml` file invokes either
 *      `putitoutthere publish` (as a `run:` command) or the composite
 *      action `thekevinscott/put-it-out-there@...` with a `command:`
 *      input that implies publishing.
 *   2. That workflow's publishing job has `permissions: id-token: write`
 *      and `contents: write` (either job-level or workflow-level).
 *   3. The publishing job has an `environment:` key set. We cannot
 *      validate the *value* against the registry's trust policy — that
 *      requires a registry-policy-read API per registry, which is
 *      deferred (Option C, see follow-up to #162).
 *   4. A clearly-identifiable publish step exists — defends against
 *      edge cases like commented-out steps slipping past (1).
 *
 * The parser is intentionally regex/line-based rather than a full YAML
 * parse: the four checks above all reduce to substring/indentation
 * matches within a single jobs block. Adding a YAML dependency would
 * buy us very little here. If the check set grows beyond this (e.g.
 * "validate the environment value against a registry's trust policy"),
 * revisit.
 *
 * Issue #162 — Option D (locally-knowable checks only).
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface WorkflowFile {
  /** Absolute path to the workflow file on disk. */
  path: string;
  /** Basename, e.g. `release.yml`. */
  filename: string;
  /** Full file contents. */
  source: string;
  /** Parsed jobs (best-effort; top-level job keys + their raw bodies). */
  jobs: WorkflowJob[];
  /** Workflow-level `permissions:` block contents (empty if none). */
  workflowPermissions: string;
}

export interface WorkflowJob {
  /** Job key, e.g. `publish`. */
  name: string;
  /** Raw source of just that job block (everything indented under it). */
  source: string;
}

export interface PermissionIssue {
  kind: 'missing-permission';
  workflow: string;
  job: string;
  permission: 'id-token: write' | 'contents: write';
}

export interface EnvironmentIssue {
  kind: 'missing-environment';
  workflow: string;
  job: string;
}

export interface InvocationIssue {
  kind: 'no-publish-step';
  workflow: string;
}

/**
 * Scan `.github/workflows/*.yml` and `*.yaml` for workflows that invoke
 * `putitoutthere publish` or the composite action in a publish mode.
 *
 * Permissive by design: if a workflow *mentions* piot in any way that
 * looks like publishing, include it. Downstream checks then report
 * specifically. The cost of a false-positive is a spurious pass/fail
 * line in `doctor`; the cost of a false-negative is silently missing
 * the user's real publish workflow.
 */
export function findPublishWorkflows(repoRoot: string): WorkflowFile[] {
  const dir = join(repoRoot, '.github', 'workflows');
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }

  const workflows: WorkflowFile[] = [];
  for (const entry of entries) {
    if (!/\.ya?ml$/i.test(entry)) continue;
    const path = join(dir, entry);
    let source: string;
    try {
      source = readFileSync(path, 'utf8');
      /* v8 ignore next 3 -- defensive fallback for an unreadable workflow file (permissions, TOCTOU); can't produce in tests without mocking the fs module. */
    } catch {
      continue;
    }
    if (!looksLikePublishWorkflow(source)) continue;
    workflows.push({
      path,
      filename: entry,
      source,
      jobs: parseJobs(source),
      workflowPermissions: extractTopLevelBlock(source, 'permissions') ?? '',
    });
  }
  return workflows;
}

/**
 * Heuristic filter. Matches:
 *   - a `run:` step that contains `putitoutthere publish`
 *   - `uses: thekevinscott/put-it-out-there@...` combined with
 *     `command: publish` somewhere in the file (the composite action
 *     defaults to `plan`, so we only flag explicit `publish`)
 */
function looksLikePublishWorkflow(source: string): boolean {
  if (/\bputitoutthere\s+publish\b/.test(source)) return true;
  const usesPiot = /uses:\s*thekevinscott\/put-it-out-there@/.test(source);
  const commandPublish = /command:\s*['"]?publish['"]?/.test(source);
  return usesPiot && commandPublish;
}

/**
 * Best-effort jobs parser. Finds the top-level `jobs:` block and
 * extracts each direct-child key + its body. We use the two-space
 * indent convention GitHub Actions workflows follow. Workflows that
 * deviate (tabs, four-space) would miss — but `init` emits two-space,
 * which is what we're validating.
 */
export function parseJobs(source: string): WorkflowJob[] {
  const lines = source.split('\n');
  // Find the `jobs:` top-level key (unindented).
  let jobsStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^jobs\s*:\s*$/.test(lines[i]!)) {
      jobsStart = i + 1;
      break;
    }
  }
  if (jobsStart === -1) return [];

  const jobs: WorkflowJob[] = [];
  let current: { name: string; lines: string[] } | null = null;
  for (let i = jobsStart; i < lines.length; i++) {
    const line = lines[i]!;
    // Another top-level key ends the jobs block.
    if (/^\S/.test(line) && line.trim().length > 0) break;
    // A direct child job key: exactly 2-space indent + `name:`.
    const match = /^ {2}([A-Za-z_][\w-]*)\s*:\s*$/.exec(line);
    if (match) {
      if (current) jobs.push({ name: current.name, source: current.lines.join('\n') });
      current = { name: match[1]!, lines: [] };
      continue;
    }
    if (current) current.lines.push(line);
  }
  if (current) jobs.push({ name: current.name, source: current.lines.join('\n') });
  return jobs;
}

/**
 * Extract a top-level block's body (everything indented beneath a
 * given unindented key up to the next top-level key). Returns the
 * concatenated indented body, or `null` if the key is absent.
 */
function extractTopLevelBlock(source: string, key: string): string | null {
  const lines = source.split('\n');
  const re = new RegExp(`^${key}\\s*:\\s*(.*)$`);
  for (let i = 0; i < lines.length; i++) {
    const m = re.exec(lines[i]!);
    if (!m) continue;
    // Inline form: `permissions: read-all`. Return the inline value.
    if (m[1] && m[1].trim().length > 0) return m[1].trim();
    const body: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j]!;
      if (/^\S/.test(line) && line.trim().length > 0) break;
      body.push(line);
    }
    return body.join('\n');
  }
  return null;
}

/**
 * Check that the publishing job has (or inherits) the two permissions
 * that OIDC trusted publishing requires. The permissions may be set at
 * workflow level (top-level `permissions:`) and/or job level; this
 * function reports a missing permission only if *neither* scope
 * declares it. `write-all` satisfies both.
 */
export function checkPermissions(workflow: WorkflowFile): PermissionIssue[] {
  const publishJob = findPublishJob(workflow);
  if (publishJob === null) return [];

  const jobPerms = extractBlockFromJob(publishJob.source, 'permissions') ?? '';
  const combined = `${workflow.workflowPermissions}\n${jobPerms}`;

  const issues: PermissionIssue[] = [];
  if (!hasPermission(combined, 'id-token', 'write')) {
    issues.push({
      kind: 'missing-permission',
      workflow: workflow.filename,
      job: publishJob.name,
      permission: 'id-token: write',
    });
  }
  if (!hasPermission(combined, 'contents', 'write')) {
    issues.push({
      kind: 'missing-permission',
      workflow: workflow.filename,
      job: publishJob.name,
      permission: 'contents: write',
    });
  }
  return issues;
}

function hasPermission(block: string, name: string, level: 'write'): boolean {
  // `write-all` shortcut: every scope is `write`.
  if (/\bwrite-all\b/.test(block)) return true;
  const re = new RegExp(`\\b${name}\\s*:\\s*${level}\\b`);
  return re.test(block);
}

/**
 * Return `{ kind: 'missing' }` when the publish job lacks an
 * `environment:` key. Does NOT inspect the value — diff-vs-registry is
 * Option C.
 */
export function checkEnvironment(workflow: WorkflowFile): EnvironmentIssue | null {
  const publishJob = findPublishJob(workflow);
  if (publishJob === null) return null;
  if (hasKeyAtJobLevel(publishJob.source, 'environment')) return null;
  return {
    kind: 'missing-environment',
    workflow: workflow.filename,
    job: publishJob.name,
  };
}

/**
 * Sanity check: confirm the workflow has at least one clearly-
 * identifiable publish step. `findPublishWorkflows` already filters,
 * but this catches weird states like a `run:` that's been edited into
 * a comment while the composite-action `uses:` line still matches.
 */
export function checkPublishInvocation(workflow: WorkflowFile): InvocationIssue | null {
  // Strip comment-only lines and blank lines before matching. A
  // commented-out `run: putitoutthere publish` step shouldn't count.
  const uncommented = workflow.source
    .split('\n')
    .filter((l) => !/^\s*#/.test(l))
    .join('\n');

  const hasRunCmd = /\bputitoutthere\s+publish\b/.test(uncommented);
  if (hasRunCmd) return null;

  // Composite-action form with `command: publish` explicitly.
  const usesPiot = /uses:\s*thekevinscott\/put-it-out-there@/.test(uncommented);
  const commandPublish = /command:\s*['"]?publish['"]?/.test(uncommented);
  if (usesPiot && commandPublish) return null;

  return { kind: 'no-publish-step', workflow: workflow.filename };
}

/* ---------------------------- helpers ---------------------------- */

/**
 * Pick the job within a workflow that runs publish. If only one job
 * matches, return it. If multiple match, prefer the one whose name
 * contains `publish`; otherwise return the first.
 */
function findPublishJob(workflow: WorkflowFile): WorkflowJob | null {
  const matches = workflow.jobs.filter((j) => jobRunsPublish(j));
  if (matches.length === 0) return null;
  const named = matches.find((j) => /publish/i.test(j.name));
  return named ?? matches[0]!;
}

function jobRunsPublish(job: WorkflowJob): boolean {
  if (/\bputitoutthere\s+publish\b/.test(job.source)) return true;
  const usesPiot = /uses:\s*thekevinscott\/put-it-out-there@/.test(job.source);
  const commandPublish = /command:\s*['"]?publish['"]?/.test(job.source);
  return usesPiot && commandPublish;
}

/**
 * Whether the given job's source declares the key at the job scope
 * (exactly 4-space indent, matching the 2-space job indent + one level
 * further). Inline or block form both accepted.
 */
function hasKeyAtJobLevel(jobSource: string, key: string): boolean {
  const re = new RegExp(`^ {4}${key}\\s*:`, 'm');
  return re.test(jobSource);
}

/**
 * Extract a nested block from inside a job source — `permissions:` or
 * `environment:` below the 4-space indent.
 */
function extractBlockFromJob(jobSource: string, key: string): string | null {
  const lines = jobSource.split('\n');
  const headRe = new RegExp(`^ {4}${key}\\s*:\\s*(.*)$`);
  for (let i = 0; i < lines.length; i++) {
    const m = headRe.exec(lines[i]!);
    if (!m) continue;
    if (m[1] && m[1].trim().length > 0) return m[1].trim();
    const body: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j]!;
      // Any line indented 4 spaces or less (and non-empty) ends the block.
      if (line.trim().length > 0 && /^ {0,4}\S/.test(line)) break;
      body.push(line);
    }
    return body.join('\n');
  }
  return null;
}

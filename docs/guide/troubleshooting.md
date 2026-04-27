# Troubleshooting publish failures

Error-string-keyed index of common publish failures. Every entry gives
the literal message piot prints, the underlying cause, and the fix.

The reusable workflow handles artifact-naming, action versioning, and
runner toolchain setup internally — failure modes from those areas are
no longer reachable. This page covers the failures consumers can still
hit: registry-side trust-policy mismatches, dynamic-version pyproject
quirks, and a few engine-level diagnostics.

## OIDC publish fails with HTTP 400 / "trusted publisher mismatch"

Symptoms vary per registry. The shape:

- **PyPI:** `HTTPError: 400 Bad Request` from the OIDC token exchange,
  with a body referencing workflow / environment / repository claims.
- **crates.io:** `401 Unauthorized` with a `trusted publisher policy
  rejected the OIDC token` message.
- **npm:** `403 Forbidden` from the npm publish call after the OIDC
  exchange ostensibly succeeded.

**Cause.** All three registries pin the *caller* workflow filename
(and optionally the environment) in the trust-policy JWT claim. If you
renamed your `release.yml` (or migrated from a different filename),
the claim no longer matches. The registry side is a one-time out-of-
band step.

**Fix.** Two options:

1. **Re-register the trusted publisher** against the new workflow
   filename (and environment, if you set one).
2. **Rename the workflow** to match the existing trust policy. If you
   go this route, declare it in `[package.trust_policy]` so the engine
   catches drift on the next migration:

   ```toml
   [package.trust_policy]
   workflow    = "patch-release.yml"
   environment = "release"
   ```

The engine diffs the declared workflow against the local file and (in
CI) against `GITHUB_WORKFLOW_REF`. With the block in place, the
mismatch surfaces *before* the publish call, not after. See
[Authentication → Declaring trust-policy expectations](/guide/auth#declaring-trust-policy-expectations).

## Sdist named `<pkg>-X.Y.Z.devN.tar.gz` instead of `<pkg>-X.Y.Z.tar.gz`

**Cause.** Your `pyproject.toml` uses `[project].dynamic = ["version"]`
(hatch-vcs / setuptools-scm), and the build backend derived the version
from git instead of from piot's plan.

**Fix.** Pass the planned version through `SETUPTOOLS_SCM_PRETEND_VERSION`.
See [dynamic versions](/guide/dynamic-versions) for the recipe.

PyPI doesn't allow hard-delete; yank the `.devN` release via the
project's Release history page after fixing the env var.

## "Plan was empty, no packages cascaded"

Not strictly an error — the plan computed an empty matrix, build +
publish were skipped. Common when:

- The PR / commit didn't touch any file inside a `[[package]].paths`
  glob.
- A `release: skip` trailer was present.
- The `paths` globs are wrong.

If you *expected* a release, the most likely cause is a `paths`
mismatch. Double-check the globs against `git diff --name-only
origin/main` for the range you care about.

## A green workflow run did not publish anything

Workflow-run success alone is necessary but not sufficient — the signal
of a real release is a **tag push** (`{name}-v{version}`, or your
`tag_format`) plus a GitHub Release on the Releases page.

## "publish: GitHub Release creation failed" (warning)

**Cause.** The publish phase shipped to the registry and created the git
tag, but the subsequent GitHub Release creation failed — usually a
missing `contents: write` permission or a transient API hiccup.

**Fix.** Confirm the calling job has `permissions: contents: write,
id-token: write`. The publish itself succeeded — the registry has the
new version and the git tag is in place. The missing piece is just the
human-readable Release page; create it manually or re-run the release
job, which will short-circuit the publish via idempotency and retry
the Release creation.

## Empty `PYPI_API_TOKEN` / `NPM_TOKEN` shadowing OIDC

**Cause.** Almost never the cause, but worth noting: piot treats an
empty-string env var as unset, so an unset secret will not shadow OIDC.
If both OIDC and a long-lived token are configured, OIDC wins.

**Fix.** Once OIDC is working, delete the long-lived secret from the
repo so an accidental fall-through can't reach for it.

## Related

- [Authentication](/guide/auth) — OIDC trust policy registration, per
  registry.
- [Known gaps](/guide/gaps) — failure modes piot deliberately doesn't
  paper over.

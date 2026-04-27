# Bundled-CLI npm family

This page is for projects that ship **a compiled CLI binary as an
npm-installable tool** — `npm install -g my-tool` (or `npx
my-tool`) giving users a working binary on PATH. The esbuild /
biome / turborepo distribution shape.

Typical source is Rust or Go, but the publish-side shape is the
same regardless. Often paired with a plain crate on crates.io so
Rust users can `cargo install` the same binary.

## What piot covers

| Responsibility                                                                | piot   | Your workflow |
|-------------------------------------------------------------------------------|--------|---------------|
| Publish a per-platform family: `{name}-<triple>` × N + a top-level with `optionalDependencies` | ✅ | |
| Synthesise each sub-package's `package.json` with narrow `os` / `cpu` / `libc` | ✅    |               |
| Publish sub-packages first, then rewrite top-level `optionalDependencies`, then publish top-level | ✅ | |
| Emit a per-target build matrix with a sensible default runner per triple      | ✅     |               |
| OIDC trusted publishing to npm, with `--provenance`                           | ✅     |               |
| Skip-if-already-published idempotency on every package in the family          | ✅     |               |
| Provide the launcher script that `spawn`s the right per-platform binary       |        | ✅            |

The family layout is identical to `build = "napi"`; only the
payload differs — a statically-linked binary instead of a
`.node` addon. See [npm platform packages](/guide/npm-platform-packages)
for the shared mechanism.

## Configuration shape

One `[[package]]` entry per published top-level name. For a
plain CLI with no library sibling:

```toml
[putitoutthere]
version = 1

[[package]]
name = "my-cli"
kind = "npm"
npm  = "my-cli"                            # published top-level npm name
build = "bundled-cli"
path = "packages/ts-cli"
paths = ["packages/ts-cli/**", "crates/my-cli/**"]
targets = [
  "x86_64-unknown-linux-gnu",
  "aarch64-unknown-linux-gnu",
  "x86_64-apple-darwin",
  "aarch64-apple-darwin",
  "x86_64-pc-windows-msvc",
]
```

If you also publish the same binary as a crate, add a
`kind = "crates"` package and declare `depends_on = ["my-crate"]`
on the npm package so both cascade off Rust-source changes.

## The launcher script

piot publishes the family; piot does **not** write the runtime
shim that picks the right per-platform binary. That shim lives in
your top-level package's `bin` entry and you author it once. The
typical shape:

```js
// packages/ts-cli/bin/my-cli.js
#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const { platform, arch } = process;

const triples = {
  'linux-x64':   'x86_64-unknown-linux-gnu',
  'linux-arm64': 'aarch64-unknown-linux-gnu',
  'darwin-x64':  'x86_64-apple-darwin',
  'darwin-arm64':'aarch64-apple-darwin',
  'win32-x64':   'x86_64-pc-windows-msvc',
};

const triple = triples[`${platform}-${arch}`];
if (!triple) {
  console.error(`my-cli: unsupported platform ${platform}-${arch}`);
  process.exit(1);
}

const pkg = `my-cli-${triple}`;
const binary = require.resolve(`${pkg}/bin/my-cli${platform === 'win32' ? '.exe' : ''}`);
const result = spawnSync(binary, process.argv.slice(2), { stdio: 'inherit' });
process.exit(result.status ?? 1);
```

`package.json` points `bin` at this script:

```json
{
  "name": "my-cli",
  "bin": { "my-cli": "bin/my-cli.js" }
}
```

piot rewrites `optionalDependencies` to pin each `my-cli-<triple>`
at the published version. npm's resolver installs exactly one of
them at consumer install time, and the launcher `require.resolve`s
into it.

## One-time prerequisites before your first release

1. Register a [trusted publisher](/guide/auth#npm) on npm for
   the top-level name **and** every per-platform sub-package name
   you'll publish. npm trust policies are per-package; a policy
   registered only on `my-cli` won't let piot publish
   `my-cli-x86_64-unknown-linux-gnu`.
2. Declare `[package.trust_policy]` on the top-level so the engine
   catches a rename mismatch.
3. Delete any long-lived `NPM_TOKEN` repo secret once OIDC is
   working.

## Gotchas specific to this shape

- **Per-platform trusted publishers.** Easiest to miss: the npm
  trust policy has to exist on every sub-package name piot will
  publish. Register a pending publisher for each before the first
  release; the engine flags missing ones on the next publish.
- **Windows binary name.** The built binary is `my-cli.exe` on
  Windows but `my-cli` elsewhere. Your launcher has to branch on
  `process.platform` when calling `require.resolve`. The example
  above shows the pattern.
- **Executable bit on Unix.** `npm` preserves the executable bit
  during `publish` → `install`, but only if the file has it in
  the tarball. `cargo build` sets it; a `cp` or `install` step
  that loses mode bits means the binary ships as a non-executable
  file. Test with `npm pack` before relying on a real publish.
- **Cross-compiled aarch64-linux.** `ubuntu-latest` cannot cross-
  link to `aarch64-unknown-linux-gnu` reliably. Use the native-arm
  runner `ubuntu-24.04-arm` via an object-form `targets` entry:

  ```toml
  { triple = "aarch64-unknown-linux-gnu", runner = "ubuntu-24.04-arm" }
  ```

  piot defaults this for you; override only if you have a specific
  reason.
- **Mixing with a napi library under one top-level is not
  supported.** Each `[[package]]` picks one `build` mode. If you
  need `require('my-lib')` to load a native addon *and* `my-lib`
  on PATH to run the CLI, split into two top-level packages.

## Further reading

- [npm platform packages](/guide/npm-platform-packages) — the
  family mechanism shared with `build = "napi"`.
- [Configuration reference](/guide/configuration) —
  specifically [Target entries](/guide/configuration#target-entries)
  for per-runner overrides.

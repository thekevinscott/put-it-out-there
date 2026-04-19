# Concepts

## The loop

Every push to `main` triggers the release workflow, which runs three jobs:

1. **plan** — compute which packages need to ship and at what version. Output: a JSON matrix.
2. **build** — fan out across the matrix. User-owned build steps produce the artifacts.
3. **publish** — per package: write version file, run the handler's publish, create a git tag, create a GitHub Release.

## Cascade

Every package declares `paths` — globs that say "these files belong to me." When you merge a commit that touches any of those globs, the package **cascades** into the plan.

If another package declares `depends_on = ["this-package"]`, that downstream also cascades. Transitively. DFS-ordered, with cycle detection at config-load time.

## Trailer

The default behavior is **patch bump on cascade**. To override, add a `release:` trailer to the merge commit:

```
release: minor
```

Or scope it to specific packages:

```
release: major [dirsql-rust, dirsql-cli]
```

See [trailer guide](/guide/trailer) for the full grammar.

## Publishing order

Inside a single release, packages publish in **topological order** of their `depends_on` graph. If your Python wrapper depends on a Rust crate, crate publishes first.

## Idempotency

Every handler's first move is `isPublished` — check the registry for the target version. Already there? Skip cleanly. Lets you re-run failed releases without fighting the registry's immutable-publish semantics.

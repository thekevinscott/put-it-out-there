# Release trailer

Add a `release:` trailer to the merge commit body to override the default patch-on-cascade behavior.

## Grammar

```
release: <bump> [pkg1, pkg2, ...]
```

- `<bump>` is one of: `patch`, `minor`, `major`, `skip`.
- `[...]` is an optional list of package names to scope the bump to.

## Semantics

| Trailer                        | What happens                                                                 |
|--------------------------------|------------------------------------------------------------------------------|
| *none*                         | Every cascaded package releases at `patch`.                                   |
| `release: minor`               | Every cascaded package releases at `minor`.                                   |
| `release: major`               | Every cascaded package releases at `major`.                                   |
| `release: skip`                | No release this merge. Cascade ignored.                                       |
| `release: minor [a, b]`        | `a` and `b` bump `minor`. Other cascaded packages bump `patch`. Unlisted-and-uncascaded packages are force-included into the plan at the listed bump. |

## Examples

Feature work on the crate:

```
feat: add parser

release: minor
```

Breaking change in one package only; unrelated package still patched:

```
refactor: rework python API

release: major [my-py]
```

Docs-only change that shouldn't release anything:

```
docs: fix typo

release: skip
```

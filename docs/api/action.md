# GitHub Action

`thekevinscott/put-it-out-there@v0` wraps the CLI for use in GitHub Actions workflows.

## Inputs

| Input            | Default | Description                                                     |
|------------------|---------|-----------------------------------------------------------------|
| `command`        | `plan`  | `plan` \| `publish` \| `doctor`.                                |
| `dry_run`        | `false` | (publish) Skip side effects.                                    |
| `fail_on_error`  | `true`  | Exit non-zero on failure (otherwise log + continue at 0).       |

## Outputs

| Output   | Description                                           |
|----------|-------------------------------------------------------|
| `matrix` | (plan only) JSON array the `build` job can fan out across. |

## Permissions required

```yaml
permissions:
  contents: write    # publish: tag + release creation
  id-token: write    # OIDC trusted-publisher exchange
```

## Minimal workflow

```yaml
on: { push: { branches: [main] } }

jobs:
  plan:
    runs-on: ubuntu-latest
    outputs:
      matrix: ${{ steps.plan.outputs.matrix }}
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - id: plan
        uses: thekevinscott/put-it-out-there@v0
        with: { command: plan }

  publish:
    needs: plan
    if: fromJSON(needs.plan.outputs.matrix || '[]')[0] != null
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: thekevinscott/put-it-out-there@v0
        with: { command: publish }
```

The full three-job (plan → build → publish) workflow is what `putitoutthere init` writes. See [the workflow spec](/guide/concepts#the-loop).

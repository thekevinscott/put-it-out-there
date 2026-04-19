# SDK reference

The npm package also exports an SDK for programmatic use.

## Top-level exports

```ts
import { plan, publish, doctor, init, loadConfig } from 'putitoutthere';
```

### `plan(opts): Promise<MatrixRow[]>`

Compute the release plan.

```ts
const rows = await plan({ cwd: process.cwd() });
```

Returns one `MatrixRow` per `(package × target)` pair.

### `publish(opts): Promise<PublishOutput>`

Execute the plan. Delegates to per-kind handlers.

```ts
const r = await publish({ cwd: process.cwd(), dryRun: true });
```

### `doctor(opts): Promise<DoctorReport>`

Validate config + per-package auth.

```ts
const r = await doctor({ cwd: process.cwd() });
if (!r.ok) console.error(r.issues);
```

### `init(opts): InitResult`

Scaffold a fresh repo.

```ts
init({ cwd: process.cwd(), cadence: 'scheduled' });
```

### `loadConfig(path): Config`

Parse + validate `putitoutthere.toml`. Throws on unknown fields or schema violations.

## Handler kinds

- `crates` — crates.io (`src/handlers/crates.ts`).
- `pypi` — PyPI via twine (`src/handlers/pypi.ts`).
- `npm` — npm, both vanilla and platform-package orchestration (`src/handlers/npm.ts` + `npm-platform.ts`).

Each handler conforms to:

```ts
interface Handler {
  kind: 'crates' | 'pypi' | 'npm';
  isPublished(pkg, version, ctx): Promise<boolean>;
  writeVersion(pkg, version, ctx): Promise<string[]>;
  publish(pkg, version, ctx): Promise<PublishResult>;
}
```

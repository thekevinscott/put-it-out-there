# Docs authoring for Claude / LLM agents

This directory is a VitePress site. When you're asked to edit docs:

## Source of truth

Every API / behavior claim in `docs/` must be verifiable from the SDK source. Before writing, grep for the thing you're documenting in `src/`; if you can't find it, ask rather than invent.

Reference docs for behavior that *should* exist but doesn't are worse than no docs.

## Structure

- `index.md` — home page (hero + 3 features). Don't let it grow past a screen.
- `getting-started.md` — 30-minute "zero to shipping" guide.
- `guide/` — conceptual docs (cascade, trailer, configuration).
- `api/` — reference docs (CLI, action, SDK).

## Style

- Present tense, active voice.
- Code blocks get a language tag (` ```toml `, ` ```yaml `, ` ```ts `).
- Tables with `| Field | Type | Notes |` shape; left-align every column.
- Avoid `we` and `our`. Address the reader as "you."
- No emoji in body text (the home-page features block is the exception).

## Testing

Before PR: `pnpm --filter putitoutthere-docs test:unit && pnpm --filter putitoutthere-docs test:integration`.

- `tests/unit/` — vitest. Smoke tests for config parsing / link graph.
- `tests/integration/` — playwright. Loads the built site, clicks things, asserts visible content.

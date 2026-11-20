# ADR-0006: Dependency policy

Status: accepted (M1)

## Context

Supply-chain risk scales with dependency count. Contributors also audit what they install.

## Decision

- **Runtime dependencies are allowed only in `packages/core`**, and limited to:
  - `yaml` (YAML 1.2 parsing; strict mode, alias limits),
  - `ajv` (JSON Schema draft 2020-12 validation).
    Everything else (arg parsing via `util.parseArgs`, HTTP via built-in `fetch`, tests via
    `node:test`) uses the Node standard library.
- `packages/github-action` ships a **single bundled `dist/index.js` with zero runtime npm
  dependencies** (built by `scripts/build-action.mjs`).
- `packages/integrations` uses built-in `fetch` only — no Octokit.
- Dev-only tooling (TypeScript, ESLint, Prettier, types) is fine; it never ships.
- CI runs `npm audit` and the dependency-review workflow; the lockfile is committed.
- Any new runtime dependency requires an ADR amendment justifying it.

## Consequences

- Positive: small audit surface; fast installs; action bundle is inspectable.
- Negative: we re-implement small helpers (arg parsing wrappers, REST calls) instead of Octokit.
- Alternatives: Octokit (large transitive tree); zod + custom schema (duplicated authority with
  JSON Schema — we need the published schema anyway).

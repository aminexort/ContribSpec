# ADR-0007: Testing stack — `node:test` with compiled TypeScript tests

Status: accepted (M1)

## Context

Every core feature needs automated tests across unit, conformance, CLI integration, action
integration, security and backward-compatibility categories, on three operating systems. The
runner must not add heavy dev dependencies, and tests must exercise the shipped build output.

## Decision

- Runner: **`node:test`** (built-in) with `node:assert/strict`.
- Tests are written in **TypeScript** under `tests/` and compiled by `tsconfig.tests.json`
  into `dist-tests/`; `npm test` builds all packages first and runs
  `node --test dist-tests/tests` (recursive test discovery).
- Tests import **built package output** through workspace names
  (`@contribspec/core`, …), so what is tested is what is shipped.
- Fixture-driven conformance: `packages/test-fixtures` holds policy files, sample PR payloads
  and expected outcomes; `contribspec policy test` runs the same suite users can run against
  their own policies.
- GitHub Action tests run its `main()` in-process with a mocked `fetch` and synthetic
  `GITHUB_*` environment (no live network, no real repository).
- CI matrix: Ubuntu, Windows, macOS × Node 20 and 22.

## Consequences

- Positive: zero test-framework dependencies; conformance suite doubles as user-facing tool.
- Negative: we maintain the small TS→JS test build step.

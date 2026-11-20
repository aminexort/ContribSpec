# Development Setup

## Prerequisites

- Node.js ≥ 20.11 (CI runs 20 and 22)
- npm ≥ 10
- Any of Windows / macOS / Linux

## Build and test

```bash
npm install        # workspaces: packages/*
npm run build      # tsc project references + action bundle
npm test           # builds, then runs the full suite (99+ tests)
npm run lint       # eslint
npm run format     # prettier --write
```

Useful variants:

```bash
npm run test:only            # run tests without rebuilding
npm run codegen              # regenerate schema module from the JSON Schema
node --test dist-tests/tests/evaluate.test.js   # one test file
```

## Repository layout

```
packages/schema          JSON Schema (normative) + types + rule catalog
packages/core            engine: load/validate/evaluate/report/explain/conformance
packages/integrations    GitHub provider + evidence adapters
packages/cli             contribspec CLI
packages/github-action   action.yml + src + bundled dist/index.mjs
packages/test-fixtures   fixtures/ (conformance, policies, malformed, contributions)
tests/                   all automated tests (compiled to dist-tests/)
scripts/                 codegen + action bundling + action pinning helper
docs/                    specification, report format, threat model, guides
examples/                ready-to-use policies and workflow files
DECISIONS/               architecture decision records
```

## Test categories (map to files)

| Category                               | File                                                                               |
| -------------------------------------- | ---------------------------------------------------------------------------------- |
| Schema conformance                     | `tests/schema.test.ts`                                                             |
| Validation / malformed policies        | `tests/validate.test.ts`, fixtures in `packages/test-fixtures/fixtures/malformed/` |
| Evaluation engine                      | `tests/evaluate.test.ts`                                                           |
| Disclosure parsing                     | `tests/disclosures.test.ts`                                                        |
| Report contract + honesty              | `tests/report.test.ts`                                                             |
| Security (traversal, bombs, injection) | `tests/security.test.ts`                                                           |
| Policy conformance runner              | `tests/conformance.test.ts`                                                        |
| CLI integration                        | `tests/cli.test.ts`                                                                |
| GitHub Action integration (mocked API) | `tests/action.test.ts`                                                             |
| Backward compatibility                 | `tests/backcompat.test.ts`                                                         |

Tests run against **built output** (what ships), not sources in isolation.

## Workflow for a change

1. Read `docs/architecture/README.md` and the relevant spec section.
2. Add/adjust tests first when fixing a bug (regression test).
3. Implement; keep diffs reviewable (a few hundred lines per PR where possible).
4. `npm test && npm run lint`.
5. Update docs in the same change (`SPECIFICATION.md`, `CHANGELOG.md`).
6. New runtime dependency? It needs an ADR amendment (ADR-0006).

## Regenerating the schema module

The JSON Schema file `packages/schema/schema/contribspec-policy-v1.schema.json`
is the single source of truth. After editing it:

```bash
npm run codegen   # rewrites packages/schema/src/generated-schema.ts
```

CI verifies the generated file has no drift.

## Debugging tips

- `contribspec validate --format json` shows stable diagnostic codes.
- `contribspec check --emit-json` prints the full report alongside text output.
- The action is testable in-process: see `tests/action.test.ts` for the mocked
  fetch harness; no live repository is needed.

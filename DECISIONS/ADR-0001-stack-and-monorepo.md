# ADR-0001: TypeScript monorepo, Node ≥ 20.11, npm workspaces

Status: accepted (M0)

## Context

ContribSpec ships several artifacts that must evolve together but be released and consumed
separately: a schema package, a core engine, forge integrations, a CLI, a GitHub Action bundle,
and shared test fixtures. The core engine must not depend on GitHub APIs, so package boundaries
must be enforced by the build, not by convention. Contributors are international and
multi-platform; the toolchain must run on Windows, macOS and Linux with a minimal setup.

## Decision

- Language: **TypeScript** (strict; `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`).
- Runtime: **Node.js ≥ 20.11** (first release with stable `util.parseArgs` semantics and a
  stable built-in `fetch`; GitHub Actions `node20` runtime is compatible).
- Layout: **npm workspaces monorepo** — no extra monorepo tool (Nx/Turbo/Lerna). `tsc` project
  references enforce the dependency direction:
  `schema → core → integrations → cli | github-action`, with `test-fixtures` depending on
  nothing but files.
- Module system: **ESM** (`"type": "module"`, `moduleResolution: NodeNext`).
- Tests: **`node:test`** (built-in runner) — see ADR-0007.

## Consequences

- Positive: one `npm install`, one `npm test`, no framework lock-in; package boundaries are
  compiler-enforced; the GitHub Action can be bundled to a single dependency-free file.
- Negative: contributors need Node ≥ 20.11; we maintain our own `tsc -b` wiring.
- Alternatives considered: pnpm (better caching, but wider contributor friction); Yarn (extra
  tooling); Rust core (performance is not a bottleneck; TS lowers contribution barrier for the
  target audience).
# ADR-0002: YAML policy format, JSON Schema authority, versioning

Status: accepted (M1)

## Context

The policy format is the public contract of the project. It must be strict (unknown keys are
errors), versioned, editor-friendly, extensible without breaking existing files, and
machine-readable. YAML is the format used by the surrounding ecosystem (GitHub workflows,
existing draft policy formats) and is comfortable for maintainers.

## Decision

- Canonical file: **`contribspec.yml`** at the repository root (also accepting
  `contribspec.yaml` and `.contribspec/policy.yml` as fallbacks, first match wins).
- Format: **YAML 1.2 subset** parsed by the `yaml` package with `uniqueKeys: true`,
  alias-count limiting and document size caps (see `core/src/yaml.ts`).
- Authority: the **published JSON Schema** (`packages/schema/schema/contribspec-policy-v1.schema.json`,
  draft 2020-12) is the normative shape. The validator (`ajv`, draft 2020-12) enforces it and
  `additionalProperties: false` provides unknown-key detection.
- Extensibility: keys matching `x-` / `x_` at any object level are **preserved and ignored** by
  evaluation — the sanctioned way to attach vendor annotations without a schema change.
- Versioning: the policy declares `version: 1`. Readers MUST reject `version` values they do
  not support. Backward-compatibility rules are normative in `docs/SPECIFICATION.md` §9:
  - within v1, fields may be added only as **optional** with documented defaults;
  - meaning of existing fields never changes within a major version;
  - removals or semantic changes require `version: 2` and a dual-schema support window.
- Validation has two layers: **schema** (shape) and **semantic** (contradictions, unknown rule
  IDs in `severity_overrides`, uncompilable `title_pattern`). Both produce structured
  diagnostics with stable codes (`SCHEMA-*`, `SEM-*`).

## Consequences

- Positive: editors get completion via `$schema`; CI gets precise errors; future v2 can coexist.
- Negative: YAML has sharp edges (aliases, implicit typing) — mitigated by strict parsing and
  size caps.
- Alternatives: JSON (worse for comments/humans); TOML (weaker nested structures); pure custom
  DSL (tooling cost).

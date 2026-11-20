# ContribSpec — Architecture Decision Records

This directory records architectural decisions that shape ContribSpec. Each ADR is immutable
once accepted; superseding decisions get a new ADR that references the old one.

Format (lightweight MADR-inspired): Context → Decision → Consequences → Alternatives.

| ADR | Title | Status |
| --- | --- | --- |
| [ADR-0001](ADR-0001-stack-and-monorepo.md) | TypeScript monorepo, Node ≥ 20.11, npm workspaces | Accepted |
| [ADR-0002](ADR-0002-policy-format-and-versioning.md) | YAML policy format, JSON Schema authority, versioning | Accepted |
| [ADR-0003](ADR-0003-evidence-model.md) | Evidence model: binding to head SHA, missing ≠ failed | Accepted |
| [ADR-0004](ADR-0004-report-contract.md) | Versioned JSON report contract, no "safe/correct" verdicts | Accepted |
| [ADR-0005](ADR-0005-action-security-model.md) | GitHub Action trust model: base-commit policy, no fork execution | Accepted |
| [ADR-0006](ADR-0006-dependency-policy.md) | Dependency policy: `yaml` + `ajv` only in core, zero-dep action bundle | Accepted |
| [ADR-0007](ADR-0007-testing-stack.md) | `node:test` + compiled TypeScript tests, fixture-driven conformance | Accepted |
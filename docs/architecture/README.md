# ContribSpec Architecture

## Component overview

```
packages/schema          normative JSON Schema + TS types + rule catalog
      ▲
packages/core            policy loading · validation · evaluation engine
      ▲                   evidence model · reports · explain · conformance
      │
      ├── packages/integrations    forge providers (GitHub first) +
      │                            evidence normalization adapters
      │         ▲
      ├── packages/cli             contribspec command line
      └── packages/github-action   GitHub Action (single bundled file)

packages/test-fixtures   conformance suite + sample/hostile inputs (no deps)
```

Dependency direction is compiler-enforced (`tsc` project references):
`schema → core → integrations → cli | github-action`. **`core` contains no
forge-specific code** (ADR-0001); GitHub support is an implementation of the
`ForgeProvider` contract, so GitLab and Forgejo/Gitea adapters plug in without
touching the engine.

## Evaluation pipeline

```
policy bytes ──► parseYamlSafely ──► validate (schema + semantics) ──► resolvePolicy
                                                                          │
contribution metadata ─┐                                                  ▼
                       ├──► evaluateContribution ──► findings + evidence + summary
evidence[] ────────────┘        (rules PR/AI/ACC/VER/CMP)                  │
                                                                          ▼
                                                        renderJson / renderText / renderMarkdown
```

Key invariants (tested):

- evidence counts only when bound to the exact head commit (ADR-0003);
- `missing_evidence` is a distinct outcome from `fail`;
- every rendered string is sanitized/escaped (threat model T9);
- reports never use verdict vocabulary ("safe", "correct", "human-written").

## Security boundaries

| Boundary       | Enforcement                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Policy source  | GitHub Action loads the policy **only** at `pull_request.base.sha`; the PR head copy is never read (ADR-0005)            |
| Untrusted text | `sanitizeText`/`escapeMarkdown` caps + strips control/ANSI/bidi characters                                               |
| File paths     | `resolveWithin` (symlink-aware containment) for derived paths; explicit CLI paths must be absolute or inside the workdir |
| YAML           | strict 1.2 parse, unique keys, custom tags rejected, alias-expansion limit, size cap                                     |
| Execution      | no `eval`, no shell execution of content, no dynamic module loading from input                                           |

Full analysis: [`docs/THREAT_MODEL.md`](../THREAT_MODEL.md).

## Extension points

1. **Forge providers** — implement `ForgeProvider` (+ `CheckRunPublisher`) from
   `@contribspec/core`. Needed per forge: PR metadata, file-at-ref reads, check
   runs + statuses for a SHA, commit list. GitLab and Forgejo are the next
   targets (roadmap M4/M6).
2. **Evidence adapters** — pure functions in
   `packages/integrations/src/evidence/normalize.ts` that map a tool's artifact
   to the common `Evidence` record. New sources (SBOM checks, coverage
   services, in-toto attestations, SCPE/OCTP envelopes) are added here without
   engine changes.
3. **Policy extension keys** — `x-`/`x_` keys carry vendor data through
   validation and resolution untouched.
4. **Rule catalog** — rules are data (`RULES` in `@contribspec/schema`) with
   stable ids; new rules are additive and RFC-governed.

## Machine interfaces

| Interface         | Contract                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------- |
| Policy file       | [`docs/SPECIFICATION.md`](../SPECIFICATION.md) (schema id `…/contribspec-policy-v1.json`) |
| Evaluation report | [`docs/REPORT_FORMAT.md`](../REPORT_FORMAT.md) (`reportVersion 1.0`)                      |
| Validate output   | `{ ok, diagnostics: [{ code, path, message, severity, suggestion? }] }`                   |
| Action outputs    | `result`, `report`, `failing-rules`                                                       |

## Non-goals (architecturally)

- No hosted service, database, accounts, or telemetry.
- No AI-content detection — authorship cannot be inferred from code appearance.
- No repository-health scoring (OpenSSF Scorecard owns that; its output can
  become ContribSpec evidence).

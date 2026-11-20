# ADR-0004: Versioned JSON report contract; no safety verdicts

Status: accepted (M2/M3)

## Context

Tooling downstream (dashboards, bots, other actions) needs a stable machine-readable output.
At the same time, the project must never overstate what a passing evaluation means.

## Decision

- The report is JSON with a top-level **`reportVersion`** (currently `"1.0"`), documented in
  `docs/REPORT_FORMAT.md`. Within `1.x`, fields are only added; consumers must ignore unknown
  fields.
- Report structure: `reportVersion`, `generatedAt`, `tool`, `policy` (path, digest SHA-256,
  version, source commit), `subject` (provider, repository, number, title, headSha, baseSha),
  `summary` (counts per outcome + overall `result`), `findings[]`, `evidence[]`, `notes[]`.
- `findings[]` entries carry: `ruleId`, `requirement`, `title`, `status`, `severity`, `message`,
  `remediation`, `evidenceRefs[]`, `data{}`.
- Overall `result` ∈ `pass | fail | unverified | error` where `unverified` means at least one
  requirement could not be checked (distinct from `fail`).
- **Forbidden vocabulary:** the report never says a contribution is "safe", "secure", "correct",
  or "human-written", and never states that an attestation is true. Reports say what was
  checked, what evidence was found, and which commit it belongs to.
- Human output (terminal, Markdown) is rendered **from** the JSON report — one source of truth.

## Consequences

- Positive: stable integration surface; honest semantics enforced by tests
  (`tests/report.test.ts` asserts the forbidden terms never appear).
- Negative: consumers must handle a multi-valued result.
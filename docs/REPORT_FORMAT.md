# ContribSpec Report Format — contract `1.0`

The JSON report is the single source of truth. Text and Markdown output are
rendered from it. Compatibility rule (SPECIFICATION.md §12): within `1.x`
fields are only added; **consumers must ignore unknown fields**.

## Top-level shape

```jsonc
{
  "reportVersion": "1.0",
  "generatedAt": "2025-01-01T00:00:00.000Z", // ISO timestamp
  "tool": { "name": "contribspec", "version": "0.1.0" },

  "policy": {
    "path": "contribspec.yml", // resolved path
    "digest": "<sha256 hex of the exact policy bytes>",
    "version": 1, // policy format version
    "source": "base-commit:abc123def456", // or "local"
  },

  "subject": {
    "provider": "github | gitlab | forgejo | local",
    "repository": "owner/repo",
    "number": 42, // optional
    "title": "…",
    "body": "…",
    "author": "…", // sanitized text
    "headSha": "…",
    "baseSha": "…",
    "baseRef": "…",
    "changedFiles": 3,
    "changedLines": 50, // optional
    "commits": [{ "sha": "…", "message": "…", "signoffs": ["…"] }],
    "labels": ["…"],
  },

  "summary": {
    "result": "pass | fail | unverified | error",
    "mode": "report | advisory | enforce",
    "missingEvidenceMode": "report | warn | fail",
    "pass": 0,
    "fail": 0,
    "missingEvidence": 0,
    "notApplicable": 0,
    "error": 0,
  },

  "findings": [/* see below */],
  "evidence": [/* see below */],
  "notes": ["…"],
}
```

## Findings

One entry per evaluated rule instance (required checks produce one VER-001
finding per check):

```jsonc
{
  "ruleId": "VER-001", // stable rule id (SPECIFICATION §12.3)
  "requirement": "contributions.verification.required_checks[unit-tests]",
  "title": "Required check evidence",
  "status": "pass | fail | missing_evidence | not_applicable | error",
  "severity": "error | warning | notice",
  "message": "…", // what was checked and observed
  "remediation": "…", // actionable next step
  "evidenceRefs": ["ev-1"], // ids into report.evidence
  "data": { "check": "unit-tests", "headSha": "…" },
}
```

Notes on statuses (ADR-0003):

- `fail` — the requirement was checked and not met (including _failed evidence_).
- `missing_evidence` — the requirement **could not be verified** (no evidence,
  inconclusive evidence, or unavailable metadata). Never collapsed into `fail`
  unless policy opts in.
- `not_applicable` — the policy waived or does not enforce this requirement.
- `error` — the evaluator itself failed for this rule.

## Evidence

```jsonc
{
  "id": "ev-1", // stable within the report
  "kind": "check_run | commit_status | dco_signoff | cla_check | test_results | attestation | security_scan | documentation_check | statement | other",
  "source": "github-check-run", // producing system
  "name": "unit-tests",
  "subjectSha": "…", // the commit this evidence speaks about
  "status": "pass | fail | neutral | skipped | unknown",
  "collectedAt": "…", // optional
  "summary": "…", // optional, sanitized
  "detailsUrl": "…", // optional
  "claim": { "stated": "…", "location": "…", "by": "…" }, // self-declarations only
  "applicable": true, // false = bound to a different commit
}
```

`applicable: false` evidence is never counted toward a requirement; it appears
in the report so reviewers can see it was found and rejected (with VER-002).

## Honesty constraints

Rendered reports (JSON, text, Markdown) must never assert that a contribution
is safe, secure, correct, or human-/AI-written, and must never state that a
claim is true. This is enforced by tests (`tests/report.test.ts`).

## Exit codes (CLI) and conclusions (GitHub Check)

| Situation                               | CLI exit | Check conclusion  |
| --------------------------------------- | -------- | ----------------- |
| Evaluation ok (any mode without gating) | 0        | `success`         |
| `enforce` mode, overall `fail`          | 1        | `failure`         |
| Policy invalid/missing, misuse          | 2        | `action_required` |
| Evaluator error                         | 2        | `action_required` |

## Stability

`reportVersion` changes only with breaking changes (e.g. `2.0`). Additive
changes keep `1.x` and are listed in `CHANGELOG.md`.

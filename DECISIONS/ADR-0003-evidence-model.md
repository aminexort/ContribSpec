# ADR-0003: Evidence model — bind to head SHA, missing ≠ failed

Status: accepted (M1/M3)

## Context

ContribSpec consumes artifacts produced by other tools (check runs, commit statuses, DCO
trailers, CLA checks, test results, signed attestations). Two failure modes must be avoided:
(a) counting evidence that belongs to a different commit, and (b) reporting "not verified" the
same way as "verified and failed". Real review decisions depend on the difference.

## Decision

- Every normalized **Evidence** record carries: `kind`, `source`, `name`, `subjectSha`
  (the exact commit it speaks about), `status` (`pass | fail | neutral | skipped | unknown`),
  `collectedAt`, `summary`, `detailsRef`, `raw` (size-capped).
- The evaluator accepts evidence for a requirement **only** when `subjectSha` equals the
  evaluated change's head SHA. Non-matching evidence is listed in the report as
  `not_applicable` with the SHA it actually belongs to.
- Requirement outcomes are five-valued: `pass | fail | missing_evidence | not_applicable | error`.
  `missing_evidence` is never collapsed into `fail` by default; policy can opt in via
  `enforcement.missing_evidence: fail`.
- Adapters normalize; they never judge. A mature external tool (DCO bot, CLA bot, test runner)
  keeps owning its verdict; ContribSpec records "tool X reports Y for commit Z".
- Attestations and disclosures are recorded as **claims**, with explicit wording that
  ContribSpec does not verify their truthfulness and does not infer authorship.

## Consequences

- Positive: reports are honest and auditable; evidence interoperability is a clean adapter
  boundary; GitLab/Forgejo support maps onto the same model.
- Negative: more outcomes to render and test than a boolean gate.
- Alternatives: boolean pass/fail (loses the missing/failed distinction — rejected explicitly by
  project goals); treating any check run as evidence regardless of SHA (spoofable — see threat
  model T2).
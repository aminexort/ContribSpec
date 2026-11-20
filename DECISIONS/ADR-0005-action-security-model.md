# ADR-0005: GitHub Action trust model — base-commit policy, no fork execution

Status: accepted (M3)

## Context

The most dangerous failure mode of a PR-gating action is letting the pull request influence its
own evaluation or executing untrusted fork code with access to secrets (the
`pull_request_target` + checkout-head antipattern).

## Decision

- The action runs on **`pull_request`** events only. Recommended workflows grant
  `contents: read`, `pull-requests: read`, `checks: write` — nothing else.
- The policy is fetched via the Contents API at **`pull_request.base.sha`** (the trusted target
  branch). The PR head copy of the policy is never read. If the policy is missing at the base
  commit, the action reports `unverified` with an actionable message — it does not fall back to
  the head.
- The action **never checks out** the repository and never executes PR code. It is a metadata
  evaluation over the REST API using Node's built-in `fetch`, with zero npm runtime
  dependencies in the bundle (ADR-0006).
- All PR-derived strings pass through `sanitizeText`/`escapeMarkdown` before entering logs,
  check-run summaries or outputs (threat model T9).
- Check runs are created for the exact `head_sha` of the PR, and evidence is only accepted when
  bound to that SHA (ADR-0003).
- Without `checks: write`, the action degrades gracefully: it writes the report to the job
  summary and sets outputs instead of failing opaquely.
- Event payloads are validated: unsupported event types fail closed (threat model T16).

## Consequences

- Positive: fork PRs can be evaluated safely; policy manipulation by the PR is structurally
  impossible.
- Negative: same-repo workflow changes need a merge before taking effect (desired).
- Alternatives: `pull_request_target` with head checkout (rejected: secret exposure + RCE);
  evaluating head policy (rejected: T1).

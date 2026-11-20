# Maintainer Guide

How to operate this project. Complements `GOVERNANCE.md` (roles and decisions)
and `docs/RELEASING.md` (release mechanics).

## Current maintainers

| Name                                               | Area       | Contact    |
| -------------------------------------------------- | ---------- | ---------- |
| _repository owner_ (fill in before public release) | everything | via GitHub |

**Before public release:** configure the real mailboxes referenced in
`SECURITY.md` (security@) and `CODE_OF_CONDUCT.md` (conduct@), and replace this
table. These placeholders are deliberate — no fake people are listed.

## Responsibilities

1. **Triage** — label and route issues within a week; keep `good first issue`
   populated with genuinely approachable work.
2. **Review** — spec/security-affecting changes need a maintainer who has read
   the relevant ADRs; keep PRs reviewable and ask for splits.
3. **Compatibility stewardship** — enforce `docs/SPECIFICATION.md` §12 in
   review: no breaking changes to v1 policy semantics or the 1.x report
   contract without an accepted `version: 2` RFC.
4. **Releases** — follow `docs/RELEASING.md`; never publish without the owner's
   explicit authorization; verify the quickstart in a clean environment.
5. **Security** — monitor private reports (GitHub Private Vulnerability
   Reporting), acknowledge within 72h, coordinate disclosure.
6. **Honesty guardrails** — reject changes that make reports claim more than
   evidence supports, or that introduce authorship detection.

## Routine operations

| Cadence     | Task                                                                   |
| ----------- | ---------------------------------------------------------------------- |
| Weekly      | Issue/PR triage; dependency alerts review                              |
| Per release | Threat-model re-read; docs-vs-behavior check; changelog review         |
| Monthly     | Check roadmap honesty (move/rewrite stale items, never silently)       |
| Quarterly   | Re-run the competitive analysis sweep (`docs/COMPETITIVE_ANALYSIS.md`) |

## CI you should know

- `ci.yml` — build, lint, typecheck, tests on Node 20/22 × 3 OSes, schema
  freshness check, `npm audit`.
- `codeql.yml` — static analysis for TS/JS.
- `dependency-review.yml` — blocks risky new dependencies on PRs.
- `release.yml` — tag-triggered packaging; publish step requires manual
  approval input.
- Third-party actions are pinned to commit SHAs (`scripts/pin-actions.mjs`).

## Handling contributions with AI assistance

Allowed and expected — with the disclosure template in `CONTRIBUTING.md`.
Review the change on its merits: tests pass, human understands and explains it,
scope matches the disclosure. The disclosure is a claim you weigh in review; it
is not something the tooling verifies, and `CONTRIBUTING.md` says so plainly.

## Cutting a release

Follow the checklist in `docs/RELEASING.md`. One extra maintainer duty: after
publishing, run the quickstart in a clean directory against the published
package and paste the result into the release notes.

## Deprecation policy

- Policy fields: deprecate in docs first, keep working one major version
  (SPECIFICATION §12).
- CLI flags: warn for one minor, remove in the next major.
- Rule ids: never repurpose; add new ids instead.

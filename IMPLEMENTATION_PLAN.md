# Implementation Plan

Working document: Epic → Feature → Task → Subtask, with acceptance criteria.
Kept synchronized with `ROADMAP.md` (milestone status) and the code.

## Epic 1 — Specification foundation (M1)

| Feature               | Acceptance criterion                                                                                                                   | Status |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| YAML policy format    | Parses `contribspec.yml`; rejects bombs/tags/dup keys/oversize with actionable errors (`tests/security.test.ts`)                       | ✅     |
| JSON Schema v1        | Published schema validates all example policies; unknown keys fail with suggestions (`tests/schema.test.ts`, `tests/validate.test.ts`) | ✅     |
| Defaults & resolution | Every default documented in SPECIFICATION §11 and pinned by `tests/backcompat.test.ts`                                                 | ✅     |
| Conformance fixtures  | 9 cases across all AI policies + evidence states pass (`tests/conformance.test.ts`)                                                    | ✅     |

## Epic 2 — CLI (M2)

| Feature       | Acceptance criterion                                                                                                     | Status |
| ------------- | ------------------------------------------------------------------------------------------------------------------------ | ------ |
| init          | Non-interactive + interactive; never clobbers without `--force`; generated policy always validates (`tests/cli.test.ts`) | ✅     |
| validate      | Exit 1 + exact paths + suggestions on bad policies; JSON contract                                                        | ✅     |
| explain       | Text/Markdown/JSON; shows requirement, resolved value, severity, remediation                                             | ✅     |
| check (local) | Evaluates contribution + evidence files; `--mode enforce` exits 1 on violations                                          | ✅     |
| check (PR)    | Uses GitHub API; policy from base commit; report JSON per REPORT_FORMAT                                                  | ✅     |
| policy test   | Runs built-in and custom suites; exits 1 on failures                                                                     | ✅     |

## Epic 3 — GitHub Action (M3)

| Feature               | Acceptance criterion                                                                                                  | Status                                    |
| --------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Trust model           | `pull_request_target` refused; policy fetched at base sha only; tests assert the request URL (`tests/action.test.ts`) | ✅                                        |
| Evidence collection   | Check runs + statuses + DCO trailers normalized and SHA-bound                                                         | ✅                                        |
| Check Run reporting   | Published for head sha; degrades to summary/outputs without `checks: write`                                           | ✅                                        |
| Enforcement config    | `report                                                                                                               | advisory                                  | enforce`+`missing_evidence` semantics per SPECIFICATION §10 | ✅  |
| Hostile input         | Malicious PR titles/bodies/oversize payloads sanitized/rejected (action + security tests)                             | ✅                                        |
| Independent test repo | Real-repository validation                                                                                            | ⬜ needs owner-authorized test repository |

## Epic 4 — Ecosystem readiness (M4)

| Feature               | Acceptance criterion                                                               | Status |
| --------------------- | ---------------------------------------------------------------------------------- | ------ |
| Docs set              | Quickstart reproduces end-to-end flow; spec is normative; report format documented | ✅     |
| Example policies      | 5 ecosystem profiles + `examples/`                                                 | ✅     |
| Release automation    | Tag-triggered workflow; publish gated on owner authorization; rollback documented  | ✅     |
| Security self-audit   | Written findings reviewed against threat model                                     | ⬜     |
| Dependency automation | Renovate/Dependabot config                                                         | ⬜     |

## Epic 5 — Release (M5) / Community (M6)

See `ROADMAP.md`. Not started; no claims are made about adoption, downloads,
contributors, or production readiness before the defined gates are met.

## Method notes

- Each task lands as a reviewable commit/PR with tests and doc updates together.
- Regression tests are written before fixes where practical (see the smoke-test
  fixes in the CLI/engine history: severity caps, key suggestions, path rules).
- No feature is marked done because it compiles; every row above names the test
  or document that demonstrates it.

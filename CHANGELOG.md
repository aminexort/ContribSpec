# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Two contracts are versioned independently (see `docs/RELEASING.md`): the npm
packages use semver, the policy format declares `version: 1`, and the JSON
report declares `reportVersion: "1.0"`.

## [Unreleased]

### Added

- Policy format v1: `contribspec.yml` with JSON Schema
  (`https://contribspec.dev/schema/contribspec-policy-v1.json`), strict
  validation, unknown-key detection with suggestions, documented defaults,
  `x-` extension keys (SPECIFICATION.md).
- Rule catalog (14 rules: PR-001…005, AI-001…003, ACC-001…002, VER-001…002,
  CMP-001…002) with stable ids and configurable severities.
- Core engine: secure YAML parsing, two-layer validation, requirement
  evaluation with distinct `missing_evidence` outcomes, evidence binding to the
  exact head commit, JSON/text/Markdown reports (`reportVersion 1.0`).
- CLI `contribspec`: `init` (interactive/non-interactive, 6 profiles),
  `validate`, `explain`, `check` (local + GitHub PR), `policy test`, `version`.
- GitHub Action: base-commit policy loading, check-run/commit-status/DCO
  evidence collection, Check Run reporting with graceful degradation,
  `report|advisory|enforce` modes, refusal of `pull_request_target`.
- Evidence normalization adapters (check runs, commit statuses, DCO sign-offs,
  CLA checks, test results, security scans, attestations).
- Conformance suite (`contribspec policy test`) with 9 built-in cases.
- Security posture: threat model, path-traversal containment, YAML bomb/tag
  defenses, output sanitization, 99 automated tests across 10 suites.
- Documentation: specification, report format, quickstart, architecture,
  development, releasing/rollback, RFC process, maintainer guide, competitive
  analysis, threat model.
- Governance: CONTRIBUTING, CODE_OF_CONDUCT (Contributor Covenant 2.1),
  SECURITY, GOVERNANCE, ROADMAP; issue and PR templates.

[Unreleased]: https://github.com/contribspec/contribspec/compare/HEAD...HEAD

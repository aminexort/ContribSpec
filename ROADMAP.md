# Roadmap

Status is reported as it actually is. Items move to _Done_ only when they are
implemented, tested, and documented. Updated at each milestone.

## M0 — Research and product definition ✅ done

- [x] Competitive analysis (`docs/COMPETITIVE_ANALYSIS.md`) — verified against
      live sources; scope adjusted to _consume_ disclosure/provenance formats
      rather than compete with them
- [x] Product requirements (this roadmap + `IMPLEMENTATION_PLAN.md`)
- [x] Threat model (`docs/THREAT_MODEL.md`)
- [x] Specification design (`docs/SPECIFICATION.md`)
- [x] Architecture decisions (`DECISIONS/ADR-0001` … `ADR-0007`)

## M1 — Specification foundation ✅ done

- [x] YAML policy format with strict parsing (custom tags, duplicate keys,
      alias bombs, size caps rejected)
- [x] JSON Schema v1 (draft 2020-12) + embedded module + codegen freshness test
- [x] Core validation engine (schema + semantic layers, suggestions)
- [x] Conformance fixtures (9 cases covering all AI policies and evidence states)

## M2 — CLI ✅ done

- [x] `init` (interactive + non-interactive, 6 profiles, never clobbers)
- [x] `validate` (text/JSON, actionable diagnostics)
- [x] `explain` (text/Markdown/JSON)
- [x] `check` (local contribution/evidence files + GitHub PR mode)
- [x] `policy test` (built-in + custom conformance suites)
- [x] `version` (tool, schema, report contract versions)

## M3 — GitHub Action ✅ done (pre-release validation pending)

- [x] Pull request integration with base-commit policy loading (trust model
      tested, incl. refusal of `pull_request_target`)
- [x] Evidence collection (check runs, commit statuses, DCO trailers)
- [x] Check Run reporting with graceful degradation without `checks: write`
- [x] Enforcement configuration (report/advisory/enforce + rule severities)
- [ ] **External validation on an independent test repository** — requires the
      repository owner to set up the test repository and authorize installation

## M4 — Ecosystem readiness 🔶 in progress

- [x] Documentation set (spec, report format, quickstart, architecture,
      development, releasing, threat model, maintainer guide)
- [x] Example policies for TypeScript, Python, Go, Rust, docs-only
- [ ] Security self-audit pass with written findings
- [ ] Integration interface freeze review (ForgeProvider for external adapters)
- [x] Release automation workflow (publish step gated on owner authorization)
- [ ] Dependency-update automation (Dependabot/Renovate config)

## M5 — Public release ⬜ not started

- [ ] Release candidate (v0.x) published with owner authorization
- [ ] External testing period with real repositories
- [ ] Bug fixes from external feedback
- [ ] Version 1.0 criteria checklist completed (`docs/RELEASING.md`)
- [ ] Public documentation site (optional; repo docs are canonical)

## M6 — Community growth ⬜ not started

- [ ] Recruit external maintainers (`GOVERNANCE.md` update)
- [ ] GitLab adapter; [ ] Forgejo/Gitea adapter (interface ready since M1)
- [ ] Language-specific integrations (Python/Go/Rust policy linters or hooks)
- [ ] Public roadmap automation; regular release cadence

## Prioritized future improvements

1. GitLab and Forgejo providers (highest-value integration gap)
2. Evidence adapters: in-toto/SLSA attestations, JUnit XML, SCPE/OCTP envelopes
3. Optional GitHub App allow-listing for required checks (anti-spoofing)
4. RE2-style linear-time regex option for `title_pattern`
5. Policy profiles inheritance (`extends`) — local files only, no remote fetch
6. Comment-located disclosure parsing (`pull_request_comment`) via API
7. SARIF output for code-scanning-style annotation display

## Non-goals (permanent)

- AI-content detection of any kind
- Hosted services, accounts, telemetry
- Repository-health scoring (see OpenSSF Scorecard; we may consume its output)

# ContribSpec — Threat Model

Status: living document, reviewed at each milestone. Companion to
`docs/SPECIFICATION.md` (semantics) and `docs/architecture/README.md` (components).

## 1. What ContribSpec is (and is not)

ContribSpec evaluates **declared contribution requirements against available evidence** for a
specific pull request / change request. It records claims and evidence; it does **not** prove
authorship, does not detect AI-generated code, and never labels a contribution "safe",
"correct", or "secure".

## 2. Assets to protect

| Asset | Why it matters |
| --- | --- |
| Repository secrets / `GITHUB_TOKEN` | Leak enables supply-chain compromise |
| Integrity of the policy decision | A manipulated policy or spoofed evidence could wrongly gate (or wrongly pass) contributions |
| Maintainer and contributor metadata | PR text, usernames, emails are personal data |
| Build artifacts of this project | Published packages / action bundles are supply-chain targets |
| Evaluation correctness | Silent mis-evaluation destroys trust in reports |

## 3. Actors and trust levels

| Actor / input | Trust | Notes |
| --- | --- | --- |
| Policy file at **base commit** (target branch) | **Trusted** | Written by maintainers; the only policy authority |
| Policy file in the **PR head** | **Untrusted** | Never read; a PR cannot modify the policy that judges it |
| PR title, body, comments, branch names, filenames, commit messages, usernames | **Untrusted** | Attacker-controlled text; may contain terminal escapes, Markdown/HTML injection, path traversal, huge payloads |
| Fork PR code / workflows | **Untrusted** | Never checked out, never executed |
| Check runs / commit statuses on head SHA | **Semi-trusted** | Written by other apps/workflows with write access; bound to an exact SHA; a `passing` check is evidence a tool ran, not proof of quality |
| Signed attestations / trailers | **Semi-trusted** | Self-declared claims; verified only for integrity and attribution, not truth |
| GitHub REST API responses | **Trusted-with-validation** | Validated: size caps, type checks, SHA format checks |
| Environment variables / action inputs | **Trusted** | Set by workflow author; still validated and length-capped |

## 4. Trust boundaries

1. **Fork boundary** — everything originating from a pull request head is hostile input.
2. **Policy boundary** — policy resolution happens exclusively against the trusted base commit
   (`pull_request.base.sha` or maintainer-supplied ref).
3. **Evidence boundary** — evidence is only accepted when bound to the evaluated head SHA;
   evidence for any other commit is reported as *not applicable*, never merged into the result.
4. **Rendering boundary** — untrusted strings are sanitized before reaching logs, check-run
   summaries, terminal output or Markdown.

## 5. Threats and mitigations (STRIDE)

| # | Threat (STRIDE) | Scenario | Mitigation | Where |
| --- | --- | --- | --- | --- |
| T1 | Tampering | PR modifies `contribspec.yml` to disable enforcement | Policy always loaded from base commit SHA; head copy ignored | `github-action/src/main.ts`, `integrations/src/github/*` |
| T2 | Tampering | Evidence (check run) attached to a different commit counts toward the PR | Evidence carries `subjectSha`; evaluator requires exact match with head SHA, otherwise `missing_evidence` | `core/src/evaluate.ts` |
| T3 | Spoofing | Attacker crafts a check run name resembling a required check | Matching is by exact declared name **and** source; check provenance documented as semi-trusted; optional app allow-list is roadmap | `core/src/evaluate.ts`, `docs/SPECIFICATION.md` |
| T4 | Information disclosure | Secret values echoed into report/logs | Report serializes only declared fields; no env/token values ever read into reports; token only in `Authorization` header | `github-action/src/main.ts` |
| T5 | Information disclosure | Action runs on `pull_request_target` with secrets | Recommended workflow uses `pull_request` only; documented explicitly; action refuses nothing but the docs mandate it | `.github/workflows/*`, `docs/` |
| T6 | Denial of service | YAML alias (billion-laughs) bomb in policy file | YAML parsed with `maxAliasCount` and document size cap; parse errors are actionable | `core/src/yaml.ts` |
| T7 | Denial of service | Huge PR (100k files) or huge strings exhaust memory/CPU | All fetches and fields are capped (files page limit, string caps, body caps); regex patterns capped at 200 chars | `integrations/src/github/api.ts`, `core/src/sanitize.ts` |
| T8 | Denial of service | Catastrophic regex backtracking in `title_pattern` | Pattern length cap, compile-time validation, evaluation on capped input, `RegExp` timeout not available in JS → capped lengths bound worst case; documented | `core/src/validate.ts` |
| T9 | Injection | PR title contains `` ` ``/`<script>`/ANSI escapes → XSS in check summary or terminal spoofing | `sanitizeText` strips control/ANSI chars; `escapeMarkdown` escapes Markdown/HTML metacharacters; rendered output is Markdown-only (GitHub sanitizes HTML); CLI prints plain text | `core/src/sanitize.ts`, `core/src/report.ts` |
| T10 | Injection | Malicious file path (e.g. `../../etc/passwd`) via `--policy` or fixture paths | `resolveWithin` rejects paths escaping the allowed root; symlinks resolved before comparison | `core/src/paths.ts` |
| T11 | RCE | Executing untrusted content (PR code, policy strings) | No `child_process`, `eval`, `Function`, dynamic `import()` of untrusted paths anywhere in runtime packages; policy strings are data only | enforced by lint rules + tests |
| T12 | Repudiation | Report cannot be audited later | Report includes policy digest (SHA-256), head/base SHAs, report contract version, and per-finding rule IDs | `core/src/report.ts` |
| T13 | Elevation of privilege | Action token over-scoped | Least-privilege documented: `contents: read`, `checks: write`, `pull-requests: read`; action degrades gracefully without `checks: write` | `action.yml`, `docs/` |
| T14 | Tampering | Supply-chain attack via third-party Actions | Production workflows pin third-party actions to commit SHAs (see `scripts/pin-actions.mjs` and release docs); our action bundles zero runtime npm dependencies | `.github/workflows/*`, `scripts/pin-actions.mjs` |
| T15 | Tampering | Dependency compromise in published packages | Minimal dependency set (`yaml`, `ajv` in core only), `npm audit` in CI, dependency-review workflow, lockfile committed | root CI |
| T16 | Spoofing | Non-PR events mis-evaluated as PRs | Event type validated; unsupported events fail closed with a clear message | `github-action/src/main.ts` |

## 6. Data flows

```
                       ┌────────────────────────────────────────────┐
                       │ GitHub (or other forge)                    │
                       │                                          │
  base commit ─────────►  GET contents?ref=<base_sha>   TRUSTED     │
                       │  GET pulls/<n>                 UNTRUSTED  │
  pull request ────────►  GET pulls/<n>/files           UNTRUSTED  │
                       │  GET commits/<sha>/...                   │
                       │  GET commits/<sha>/check-runs  SEMI       │
                       │  GET commits/<sha>/statuses    SEMI       │
                       │                                          │
                       │  POST check-runs (report)      WRITE      │
                       └────────────────────────────────────────────┘
                                     │
                        policy + metadata + evidence
                                     ▼
                       ┌────────────────────────────────────────────┐
                       │ ContribSpec core (local / CI)              │
                       │  parse → validate → evaluate → report      │
                       └────────────────────────────────────────────┘
                                     │
                    report JSON / Markdown / terminal output
                                     ▼
                       Check run summary · job summary · stdout
```

Information accessed by the GitHub integration (documented per `docs/SPECIFICATION.md`):

- **Read:** repository contents at the base SHA (policy file only), PR metadata (number, title,
  body, author login, base/head SHA, changed files, commit messages), check runs and commit
  statuses for the head SHA.
- **Write:** one check run for the head SHA, plus CI log/summary output.
- **Never accessed:** secrets values, fork code contents beyond diff metadata, other
  repositories, user emails beyond what the API returns for PR metadata.

No telemetry. No network calls other than the forge API of the repository being evaluated.
No repository source code is transmitted to any third party.

## 7. Explicit non-goals (and why)

- **AI-content detection.** Authorship cannot be reliably inferred from code appearance; using
  it as an enforcement mechanism produces false accusations. ContribSpec verifies requirements
  and evidence only.
- **Attestation truthfulness.** A disclosure or "I ran the tests" claim is recorded as a claim.
  The system never asserts that a claim is true.
- **Cryptographic identity verification** (beyond what evidence sources provide). SCPE/OCTP
  class verification is an evidence adapter concern, roadmap M4+.

## 8. Residual risks

| Risk | Residual exposure | Handling |
| --- | --- | --- |
| A passing required check was produced by a compromised workflow | Possible on any forge | Documented as semi-trusted; recommend branch protection + required reviews; app allow-listing on roadmap |
| Contributor lies in disclosure/attestation | Unavoidable | Out of scope by design; reports state "claim recorded", not "verified truth" |
| Maintainer writes a weak policy | Possible | `explain` + conformance tests + warnings for contradictory settings |
| Regex DoS with pathological patterns under 200 chars | Low | Input caps; documented; future RE2 option on roadmap |

## 9. Security reporting

See `SECURITY.md` for private reporting channels and disclosure policy. This threat model is
reviewed in every release (`docs/RELEASING.md` checklist).
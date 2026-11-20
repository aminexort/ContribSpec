# ContribSpec — Competitive Analysis

Status: complete for M0. Sources were inspected during M0 research (public repositories and
documentation listed below). This analysis is descriptive; it does not copy any other project's
implementation or documentation text.

## 1. Scope of review

ContribSpec is a **vendor-neutral, machine-readable standard and toolchain for defining,
validating, and enforcing open-source contribution policies**, with a focus on evidence
verification rather than authorship detection.

The question this analysis answers: _does the ecosystem already provide this, and if so where
does ContribSpec add unique value?_

## 2. Landscape

### 2.1 Human-readable policy documents

Projects increasingly publish prose policies for AI-assisted contributions:

| Project / artifact                                   | What it does                                                                           | Format   | Enforcement                   |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------- | -------- | ----------------------------- |
| `nodejs/node` `doc/contributing/ai-guidelines.md`    | Disclosure expectations for AI-assisted contributions, DCO still applies               | Markdown | Human review                  |
| `modelcontextprotocol` `AI_POLICY.md`                | Mandatory disclosure of any AI assistance plus human-understanding expectations        | Markdown | Human review                  |
| `apache/fory` `AI_POLICY.md`                         | Disclosure, provenance confirmation, evidence of validation, structured AI review loop | Markdown | Human review + CI conventions |
| `hermetoproject/hermeto` `AI_CONTRIBUTION_POLICY.md` | Mandatory disclosure via commit trailers                                               | Markdown | CI + resubmission             |

**Limitations:** every one of these is prose. There is no machine-readable contract, no
validator, no portable tooling, and no way for a forge integration or AI coding agent to
understand the requirements programmatically. Each project re-invents wording, scope and
enforcement.

### 2.2 Catalogs of policies

- `melissawm/open-source-ai-contribution-policies` (the widely referenced
  _awesome-ai-contribution-policies_ list) — a comparative table of project policies
  (allowed? disclosure? copyright statement? human in the loop?).
- Related datasets/dumps (e.g. `sujeito-operator/ai-contribution-policy`,
  `jrjsmrtn/ai-contribution-policies`) screen large numbers of repositories for written
  AI-contribution rules.

**Overlap with ContribSpec:** none directly — these are catalogs, not toolchains.
**Limitation:** the awesome list itself notes its classification columns are "inadequate … only
a general guide"; there is no authoritative machine-readable policy behind the table.

### 2.3 Machine-readable disclosure / declaration formats

| Project                                 | Artifact                             | Focus                                                                                                                | Limitations                                                                                      |
| --------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `Declare-AI/declare-ai`                 | `declare-ai.json`                    | Disclosure "nutrition label" for arbitrary web _content_ (widget, extension, portal)                                 | Content provenance, not contribution governance; hosted service oriented                         |
| `ai-declaration.org` (`aidecl`)         | `aidecl.yaml`                        | Declares which AI tools a _project_ used; CI validation of the declaration                                           | Project-level disclosure, not per-contribution policy or evidence                                |
| `Rubiss/art50-ci`                       | `.art50-ci.yml`                      | CI checks for AI-transparency controls and C2PA provenance on delivered pages                                        | UI/regression testing of disclosure surfaces, not contribution policy                            |
| `ecogetaway/oss-ai-contribution-policy` | `ai-contribution-policy.yml` (draft) | Per-asset-class stance (code/docs/translations/media), disclosure channel, attestations, non-disclosure consequences | Draft format; no published validator, conformance suite, evidence layer or forge integration yet |

**Overlap with ContribSpec:** `ecogetaway/oss-ai-contribution-policy` and `aidecl` overlap on the
idea of a YAML policy/declaration file. ContribSpec overlaps on _shape_, not on _function_.

### 2.4 Signed provenance and evidence containers

| Project             | Artifact               | Focus                                                                                                                                                                        | Limitations                                                                |
| ------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `augbastos/scpe`    | `SPEC.md` (`scpe/0.1`) | Portable, cryptographically signed _evidence container_ for one contribution (diff subject, forge identity, AI disclosure, typed attestations) verified offline via SSH keys | Per-contribution artifact; says nothing about what a _repository requires_ |
| `openoctp/spec`     | `OCTP-v0.1`            | Provenance-vs-verification envelope bound to a commit                                                                                                                        | Envelope format; no policy layer, no forge integration                     |
| `tarnover/TrustVer` | `TRUSTVER_SPEC`        | Trust/verification spec with per-commit provenance arrays                                                                                                                    | Specification-only                                                         |

**Interoperability opportunity:** these projects produce exactly the kind of **evidence** that
ContribSpec should _consume_, not re-implement. ContribSpec's evidence model is designed so a
signed attestation or an SCPE manifest is one evidence `kind` among many.

### 2.5 Legal / origin compliance tooling

- **DCO** (`probot/dco` and successors): verifies each commit carries a `Signed-off-by`
  trailer matching the commit author; publishes a check run. Simple, per-commit, no patent
  grant.
- **CLA tooling** (`cla-assistant` and forge-native CLA): out-of-band signed agreement, CLA bot
  comments/status per PR.

**Limitations:** they answer exactly one question ("is the legal origin mechanism satisfied?")
and know nothing about the rest of a project's contribution requirements.

### 2.6 Repository health scoring

- **OpenSSF Scorecard** (`ossf/scorecard`): ~20 automated checks (Branch-Protection,
  Code-Review, Dangerous-Workflow, Pinned-Dependencies, Token-Permissions, Vulnerabilities,
  …) producing a project security-posture score.

**Limitations:** Scorecard measures _repository hygiene_, not _contribution requirements_. It
does not evaluate an individual pull request against a declared contribution policy, and it
does not normalize per-contribution evidence.

### 2.7 Forge primitives

- **GitHub repository rulesets** — required status checks (optionally restricted to a specific
  GitHub App as the source), required reviews, file-path restrictions, merge restrictions.
- **GitHub Checks API** — check runs with `head_sha` binding; `checks:write` is available to
  GitHub Apps (including the `GITHUB_TOKEN` in Actions when granted) but not to plain OAuth
  tokens or user PATs.

**Limitations:** rulesets enforce _that_ a check ran, not _what it means_. Nothing ties a set of
checks to a declared, versioned policy with explainable semantics.

## 3. Feature overlap matrix

| Capability                                                                  | Prose AI policies | awesome list | declared-ai / aidecl | SCPE / OCTP    | DCO/CLA bots   | Scorecard      | GitHub rulesets | **ContribSpec**     |
| --------------------------------------------------------------------------- | ----------------- | ------------ | -------------------- | -------------- | -------------- | -------------- | --------------- | ------------------- |
| Machine-readable contribution policy                                        | –                 | –            | partial              | –              | –              | –              | –               | **yes**             |
| Strict schema + validator + actionable errors                               | –                 | –            | partial              | –              | –              | –              | –               | **yes**             |
| Per-requirement rule IDs and severities                                     | –                 | –            | –                    | –              | –              | –              | –               | **yes**             |
| Evaluate a specific PR against policy                                       | –                 | –            | –                    | –              | check only     | –              | gate only       | **yes**             |
| Normalized evidence layer (checks, statuses, DCO, CLA, tests, attestations) | –                 | –            | –                    | container only | single kind    | –              | –               | **yes**             |
| Distinguishes **missing** vs **failed** evidence                            | –                 | –            | –                    | –              | –              | –              | –               | **yes**             |
| Structured verification report (JSON, versioned)                            | –                 | –            | –                    | –              | –              | –              | –               | **yes**             |
| Human-readable explanation of requirements                                  | prose             | –            | –                    | –              | –              | –              | –               | **yes** (`explain`) |
| Conformance test suite for policies                                         | –                 | –            | –                    | –              | –              | –              | –               | **yes**             |
| Forge-neutral core (GitHub, GitLab, Forgejo)                                | –                 | –            | –                    | key lookup     | GitHub-focused | GitHub/limited | GitHub          | **yes**             |
| Trust model: policy from base commit, never from PR                         | –                 | –            | –                    | –              | n/a            | n/a            | n/a             | **yes**             |

## 4. Unsolved / poorly addressed needs

1. **No canonical machine-readable contribution policy.** Projects write prose; tools cannot
   consume it. The one draft format found (`ai-contribution-policy.yml`) has no published
   validator, conformance suite, or integration surface.
2. **No evidence normalization.** DCO checks, CLA checks, test results, security scans and
   signed attestations are produced by different tools in incompatible shapes. Nothing
   aggregates them against a declared policy.
3. **No honest reporting.** Existing gates report pass/fail of a single check. Nobody reports
   "requirement X could not be verified because evidence Y is missing" as a distinct outcome
   from "evidence Y failed".
4. **No portability across forges.** GitHub rulesets and checks do not transfer to GitLab or
   Forgejo; policy text does not transfer at all.
5. **No conformance story.** A policy file has no way to prove it behaves as maintainers expect.
6. **Detection dead-ends.** Several initiatives orbit "was this written by AI?" — an
   undecidable question from code appearance. Needs center on _requirements and evidence_.

## 5. Differentiation and scope decision

Research confirms a viable, differentiated scope. ContribSpec's charter:

1. **Policy-first:** a versioned YAML policy with a published JSON Schema, strict validation,
   unknown-key detection, documented defaults, and a backward-compatibility promise.
2. **Evidence, not detection:** ContribSpec verifies declared _requirements and their evidence_.
   It deliberately does not attempt AI-content detection, and it treats self-attestation as a
   record of a claim — never as proof of authorship or understanding.
3. **Normalization layer:** adapters turn external artifacts (GitHub check runs, commit
   statuses, DCO trailers, CLA checks, test results, signed attestations) into one evidence
   model bound to an exact commit SHA.
4. **Honest verification reports:** every requirement ends as `pass`, `fail`,
   `missing_evidence`, `not_applicable` or `error`; reports state what was checked, what was
   found, and which commit the evidence belongs to. Reports never claim a contribution is
   "safe" or "correct".
5. **Trust-first GitHub Action:** policy loaded from the trusted base commit, `pull_request`
   (never `pull_request_target`), least-privilege tokens, no execution of fork code.
6. **Conformance suite:** policies ship with test fixtures that prove their behavior.

**Scope adjustments adopted after research (rather than cloning neighbors):**

- ContribSpec **consumes** disclosure formats rather than competing with them: `declare-ai` /
  `aidecl`-style declarations and SCPE/OCTP-style signed envelopes are planned evidence
  sources (`docs/SPECIFICATION.md` §7, roadmap M4+).
- No hosted service, portal, or account system — unlike `declare-ai`'s planned stack. Local
  and CI only.
- No repository-health scoring — Scorecard owns that; ContribSpec may consume Scorecard output
  as evidence later.

## 6. Licensing notes

- Reviewed projects are predominantly Apache-2.0, MIT, or CC-BY-4.0 (datasets).
- ContribSpec uses **Apache License 2.0** (patent grant matters for a specification others
  implement).
- No code, documentation text, or schema structure was copied from any reviewed project. Only
  publicly documented concepts (DCO trailers, check runs, rulesets) are referenced as
  interoperability points.

## 7. Sources reviewed

- `https://github.com/Declare-AI/declare-ai` — declare-ai.json standard
- `https://declare-ai.github.io/declare-ai/` — Declare AI project site
- `https://ai-declaration.org/` — aidecl.yaml project declaration format
- `https://github.com/marketplace/actions/art50-ci-ai-transparency-checks` — art50-ci
- `https://github.com/melissawm/open-source-ai-contribution-policies` — policy catalog
- `https://github.com/ecogetaway/oss-ai-contribution-policy` — draft machine-readable AI
  contribution policy (`ai-contribution-policy.yml`)
- `https://github.com/augbastos/scpe` — SCPE evidence container spec + DCO comparison
- `https://github.com/openoctp/spec` — OCTP provenance/verification envelope
- `https://github.com/tarnover/TrustVer` — TrustVer spec
- `https://github.com/ossf/scorecard` (+ `docs/checks.md`) — OpenSSF Scorecard
- `https://github.com/probot/dco` — DCO GitHub App
- `https://github.com/cla-assistant/cla-assistant` — CLA assistant
- `https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets` — rulesets
- `https://docs.github.com/en/rest/checks/runs` — Checks API (GitHub Apps only for writes)
- `https://nodejs/node/blob/main/doc/contributing/ai-guidelines.md`,
  `https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/AI_POLICY.md`,
  `https://github.com/apache/fory/blob/main/AI_POLICY.md`,
  `https://github.com/hermetoproject/hermeto/blob/main/AI_CONTRIBUTION_POLICY.md` — prose
  policy examples

# ContribSpec Contribution Policy Specification — Version 1

Status: **stable for v1**. This document is normative. Changes follow the
[RFC process](RFC.md) and the compatibility rules in §10.

ContribSpec verifies **declared requirements and their evidence** for a specific
change. It does not detect authorship, does not decide whether code was written
by a human or an AI, and never certifies that a contribution is safe or correct.

## 1. Policy file

- Canonical location: `contribspec.yml` at the repository root.
- Fallbacks (first match wins): `contribspec.yaml`, `.contribspec/policy.yml`,
  `.contribspec/policy.yaml`.
- Format: a single YAML 1.2 mapping (key/value object), parsed strictly:
  duplicate keys, custom tags, multi-document streams and alias expansion are
  rejected (see `packages/core/src/yaml.ts`).
- Size limit: 256 KiB.

Editors can add `$schema: "https://contribspec.dev/schema/contribspec-policy-v1.json"`
for completion and inline validation.

## 2. Document structure

```yaml
version: 1 # required — policy format major version
project: # required
  name: string # required
  description: string # optional
  repository: string # optional, e.g. "github:owner/repo"
  homepage: string # optional
contributions: # optional (all defaults)
  pull_requests: { ... }
  ai_assistance: { ... }
  accountability: { ... }
  verification: { ... }
  compliance: { ... }
enforcement: # optional
  default_mode: report
  missing_evidence: report
  severity_overrides: {}
metadata: # optional
  description: string
  maintainers: [string]
  last_reviewed: YYYY-MM-DD
```

Every object also accepts **extension keys**: any key starting with `x-` or
`x_` is preserved but never interpreted by ContribSpec. This is the sanctioned
way to attach tool/vendor data without waiting for a schema release.

Unknown keys that are not extension keys are **errors** (typo protection).

## 3. Requirement levels

Several settings share one vocabulary:

| Level          | Meaning                | Violation outcome                                    |
| -------------- | ---------------------- | ---------------------------------------------------- |
| `required`     | Must hold              | `fail` at **error** severity (gates in enforce mode) |
| `encouraged`   | Recommended            | `fail` at **notice** severity (never gates)          |
| `optional`     | Recorded when provided | `not_applicable`                                     |
| `not_required` | Explicitly waived      | `not_applicable`                                     |

Severity can be changed per rule with `enforcement.severity_overrides`
(rule ids like `PR-002`; `off` disables a rule entirely).

## 4. `contributions.pull_requests`

| Key                 | Type              | Default      | Rule   | Semantics                                                                                                      |
| ------------------- | ----------------- | ------------ | ------ | -------------------------------------------------------------------------------------------------------------- |
| `issue_reference`   | level             | `encouraged` | PR-001 | A tracking issue (`#123`, `GH-45`, `issue 45`) appears in the title or body                                    |
| `max_changed_files` | int 1–10000       | unset        | PR-002 | Changed files ≤ limit                                                                                          |
| `max_changed_lines` | int 1–1000000     | unset        | PR-003 | Added + removed lines ≤ limit                                                                                  |
| `title_pattern`     | regex ≤ 200 chars | unset        | PR-004 | Title matches the pattern (anchored semantics are the author's; evaluated on a sanitized, length-capped title) |
| `body_min_length`   | int 0–10000       | unset        | PR-005 | Non-whitespace characters in the description ≥ value                                                           |

`title_pattern` is a JavaScript regular expression. It must compile; the length
cap bounds worst-case evaluation cost. Do not write patterns with pathological
backtracking.

## 5. `contributions.ai_assistance`

| Key                    | Type                                                                | Default               | Rule                      |
| ---------------------- | ------------------------------------------------------------------- | --------------------- | ------------------------- |
| `policy`               | enum (below)                                                        | `allow`               | AI-001                    |
| `disclosure_locations` | list of locations (§6)                                              | `[pull_request_body]` | AI-003                    |
| `required_fields`      | list of `tools`, `scope`, `verification`, `review_process`, `other` | `[]`                  | AI-002                    |
| `attestation_terms`    | string ≤ 2000                                                       | unset                 | recorded with disclosures |

`policy` values:

| Value                        | Semantics                                                                                                                                                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `allow`                      | AI assistance permitted; nothing is required (AI-001 is `not_applicable`)                                                                                                                                                     |
| `allow_with_disclosure`      | Permitted **when disclosed**. A negative statement ("no AI assistance") passes. Absence of any statement is **missing evidence** — ContribSpec cannot determine whether AI assistance was used and does not pretend otherwise |
| `require_human_verification` | Permitted when disclosed **and** a human records responsibility and what they verified. This raises `accountability.*` levels to `required` for the evaluated change                                                          |
| `prohibit`                   | AI-assisted contributions are not accepted. An affirmative disclosure fails AI-001. Absence of any statement is missing evidence                                                                                              |
| `advisory_only`              | Guidance; nothing gates (AI-001 is `not_applicable`)                                                                                                                                                                          |

**Honesty rule.** A passing AI-001 means _a statement exists_, recorded as a
claim. It is never evidence about who or what produced the code. ContribSpec
does not implement AI-content detection and will not add it.

## 6. Disclosure channels and parsing

ContribSpec searches exactly these channels:

1. the pull request **body** (`pull_request_body`);
2. **commit trailers** named `AI-Assisted`, `AI-Assistance`, `AI-Tools`,
   `AI-Used`, `AI-Generated`, `Generated-With`, `Generated-By`
   (`commit_trailer`).

`disclosure_locations` accepts: `pull_request_body`, `pull_request_comment`,
`commit_trailer`, `issue_body`, `issue_comment`, `other`. AI-003 passes when at
least one statement was found in an accepted location.

The parser recognizes a recommended template and common phrasings:

```markdown
## AI assistance

AI tools: copilot
Scope: generated the first draft of tests/
Verification: ran the full test suite locally and read every changed line
```

Named tools ("generated with ChatGPT", "tools: copilot") are strong affirmative
signals; explicit negative statements ("No AI assistance was used",
"Not AI-generated") classify as negative; unrecognized text produces **no**
statement (and therefore `missing_evidence` where a statement is needed).
Field extraction recognizes `tools:`, `scope:`, `verification:`,
`review:`/`review process:` labels.

## 7. `contributions.accountability`

| Key                               | Type  | Default      | Rule    |
| --------------------------------- | ----- | ------------ | ------- |
| `human_responsibility`            | level | `encouraged` | ACC-001 |
| `human_understanding_attestation` | level | `encouraged` | ACC-002 |

Satisfied by: a `Signed-off-by` trailer / responsibility phrasing ("I take
responsibility", "I certify", "on behalf of") for ACC-001; an understanding
phrasing ("I understand the change") for ACC-002. These are **claims**.
ContribSpec records them; it does not verify identity or understanding and does
not treat them as proof of anything.

## 8. `contributions.verification`

| Key                      | Type        | Default | Rule    |
| ------------------------ | ----------- | ------- | ------- |
| `required_checks`        | list (≤ 50) | `[]`    | VER-001 |
| `require_head_sha_match` | bool        | `true`  | VER-002 |

A required check entry is a name string (shorthand for `{name, source: any}`) or
an object `{name, source: check_run|commit_status|any, severity, description}`.

For each required check, the evaluator looks for **evidence bound to the exact
head commit** (§9):

- evidence `pass` → `pass`;
- evidence `fail` → `fail` (this is _failed evidence_);
- evidence present but inconclusive (queued, neutral…) → `missing_evidence`;
- no evidence → `missing_evidence` (_missing evidence_, reported distinctly);
- evidence for another commit → not counted; a VER-002 finding names the stale
  evidence and the commit it belongs to.

## 9. Evidence model

An evidence record is what some system reported about some commit:

```
{ kind, source, name, subjectSha, status(pass|fail|neutral|skipped|unknown),
  collectedAt?, summary?, detailsUrl?, claim? }
```

Adapters (in `@contribspec/integrations`) normalize external artifacts — GitHub
check runs, commit statuses, DCO trailers, CLA checks, test results, security
scans, signed attestations — into this shape. Adapters normalize; they never
judge. Evidence is accepted only when `subjectSha` equals the evaluated head
commit (unless `require_head_sha_match: false`, which is discouraged).

The verification report states: what was checked, what evidence was found, which
commit the evidence belongs to, and which requirements passed, failed, or could
not be verified. Evidence for other commits is listed as not applicable.

## 10. Evaluation outcomes

Per finding: `pass | fail | missing_evidence | not_applicable | error`.
Overall: `pass | fail | unverified | error` where `unverified` means at least
one requirement could not be checked. Missing evidence becomes `fail` overall
only when `enforcement.missing_evidence: fail`.

`enforcement`:

| Key                  | Values                          | Default  | Meaning                                                       |
| -------------------- | ------------------------------- | -------- | ------------------------------------------------------------- |
| `default_mode`       | `report`, `advisory`, `enforce` | `report` | report/advisory never gate; `enforce` gates on overall `fail` |
| `missing_evidence`   | `report`, `warn`, `fail`        | `report` | how unverifiable requirements affect the result               |
| `severity_overrides` | `{ RULE-ID: severity }`         | `{}`     | per-rule severity; `off` disables                             |

## 11. Defaults (complete list)

Everything not listed in §4–§8 falls back to:

```
pull_requests.issue_reference            encouraged
ai_assistance.policy                     allow
ai_assistance.disclosure_locations       [pull_request_body]
ai_assistance.required_fields            []
accountability.human_responsibility      encouraged
accountability.human_understanding_attestation  encouraged
verification.required_checks             []
verification.require_head_sha_match      true
compliance.dco                           not_required
compliance.cla                           not_required
compliance.license_confirmation          not_required
enforcement.default_mode                 report
enforcement.missing_evidence             report
enforcement.severity_overrides           {}
```

Defaults are covered by tests (`tests/backcompat.test.ts`) and are part of the
compatibility contract.

## 12. Versioning and backward compatibility

1. `version` is a major version of the **format**. Readers reject versions they
   do not support (a `version: 2` file is an error for a v1 reader — never
   guessed at).
2. Within v1: fields are **only added**, always optional, with defaults that
   preserve existing behavior. The meaning of existing fields never changes.
   Deprecated fields keep working for at least one major version.
3. Rule ids are stable public contract. New rules may be added; existing ids
   never change meaning. Severity defaults may only change in a major release.
4. The JSON report contract is versioned separately (`reportVersion`, currently
   `1.0`) and is **additive** within `1.x`: consumers must ignore unknown
   fields.
5. Extension keys (`x-`/`x_`) are always preserved and never interpreted.
6. Removing or repurposing anything above requires `version: 2`, an RFC, and a
   documented migration path with a dual-schema support window.

## 13. Machine-readable output

- `contribspec validate --format json` → `{ ok, diagnostics[] }` with stable
  diagnostic codes (`SCHEMA-*`, `SEM-*`, `YAML-PARSE`).
- `contribspec check --format json` → the evaluation report
  (`docs/REPORT_FORMAT.md`).
- `contribspec explain --format json` → resolved requirements per rule.

## 14. Security constraints on implementations

Parsers and renderers MUST treat policy files, PR metadata and evidence as
untrusted input: bounded sizes, no code execution, no shell interpolation,
sanitized terminal/Markdown output, and path containment for file inputs.
`docs/THREAT_MODEL.md` is the companion threat model for this specification.

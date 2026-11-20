# ContribSpec

**A vendor-neutral, machine-readable standard and toolchain for defining,
validating, and enforcing open-source contribution policies.**

ContribSpec lets maintainers declare contribution requirements **once** — what a
good contribution looks like, what evidence must accompany it, and how strict
the project is — and makes those requirements understandable and enforceable
across development tools and Git hosting platforms.

> Core principle: **verify contribution requirements and evidence, not the
> presumed identity of the author.** ContribSpec does not attempt to detect
> whether code was written by a human or an AI. It checks declared requirements
> against real evidence, bound to an exact commit.

## Why

Reviewing contributions — especially AI-assisted ones — is getting harder.
Projects answer with prose policies, ad-hoc checklists, and trust debates.
None of it is machine-readable, none of it is portable, and detection-based
approaches produce false accusations. ContribSpec gives the ecosystem one
strict, versioned policy format, one honest evaluation model
(_missing evidence ≠ failed evidence_), and one structured verification report.

See [`docs/COMPETITIVE_ANALYSIS.md`](docs/COMPETITIVE_ANALYSIS.md) for how this
fits the existing landscape.

## What you get

| Piece                                 | What it does                                                                                                                                               |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Policy format** (`contribspec.yml`) | Versioned, strictly validated, unknown-key detection, documented defaults, extension keys — [specification](docs/SPECIFICATION.md)                         |
| **CLI** (`contribspec`)               | `init`, `validate`, `explain`, `check`, `policy test`, `version` — text / JSON / Markdown output                                                           |
| **GitHub Action**                     | Evaluates every pull request against the policy from the **trusted base commit**, publishes a verification report as a Check — [guide](docs/QUICKSTART.md) |
| **Evidence adapters**                 | Normalize check runs, commit statuses, DCO/CLA results, test results, attestations into one evidence model — [report format](docs/REPORT_FORMAT.md)        |
| **Conformance suite**                 | Prove a policy behaves as its maintainers expect                                                                                                           |

## Install & first run

```bash
npm install -g @contribspec/cli
contribspec init --profile node --name my-project --yes
contribspec validate
contribspec explain
```

Full walkthrough: [`docs/QUICKSTART.md`](docs/QUICKSTART.md).

## A policy in 20 lines

```yaml
version: 1
project:
  name: my-project

contributions:
  pull_requests:
    issue_reference: encouraged
    max_changed_files: 50
  ai_assistance:
    policy: allow_with_disclosure
    disclosure_locations: [pull_request_body]
    required_fields: [tools, scope]
  accountability:
    human_responsibility: required
  verification:
    required_checks: [unit-tests, type-check]
  compliance:
    dco: required

enforcement:
  default_mode: report
```

`contribspec explain` turns this into a plain-language checklist contributors
can actually follow. `contribspec check` evaluates a pull request against it and
reports exactly what was checked, what evidence was found, and which commit the
evidence belongs to.

## Honest by design

- A passing evaluation means **the configured checks reported results** — nothing
  more. Reports never claim a contribution is safe, correct, or human-written.
- Self-declarations (AI disclosures, understanding attestations) are recorded as
  **claims**, never verified as facts.
- **Missing evidence is not failure.** Requirements that could not be verified
  are reported as `unverified`, distinctly from `fail`, by default.

## Security

The GitHub Action reads the policy from the **base commit** (a pull request
cannot modify the policy that judges it), runs on `pull_request` only, never
executes fork code, uses least-privilege tokens, and sanitizes every untrusted
string. Threat model: [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md).
Report vulnerabilities via [`SECURITY.md`](SECURITY.md).

## Documentation

- [Quickstart](docs/QUICKSTART.md) — install → policy → report in minutes
- [Specification](docs/SPECIFICATION.md) — normative policy format (v1)
- [Report format](docs/REPORT_FORMAT.md) — versioned JSON contract
- [Architecture](docs/architecture/README.md) — components and extension points
- [Development](docs/DEVELOPMENT.md) — build, test, contribute code
- [Releasing](docs/RELEASING.md) — release and rollback procedures
- [Threat model](docs/THREAT_MODEL.md) · [Competitive analysis](docs/COMPETITIVE_ANALYSIS.md)
- [Governance](GOVERNANCE.md) · [Roadmap](ROADMAP.md) · [RFC process](docs/RFC.md)

## Project status

Pre-1.0. The v1 policy schema and the 1.0 report contract are frozen per the
[compatibility rules](docs/SPECIFICATION.md#12-versioning-and-backward-compatibility);
everything else may still change before 1.0. See [`ROADMAP.md`](ROADMAP.md) for
milestone status — reported as it actually is, not aspirationally.

## Contributing

Contributions are welcome — from policy examples to forge adapters to docs in
any language. Start with [`CONTRIBUTING.md`](CONTRIBUTING.md) and the
[good first issues](CONTRIBUTING.md#good-first-issues) list. All important
changes require accountable human review.

## License

Apache License 2.0 — see [`LICENSE`](LICENSE).

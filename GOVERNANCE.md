# Governance

ContribSpec is a vendor-neutral open-source project. Governance is intentionally
lightweight so that it can grow with the community — and honest, so that no
pretend structure is announced before there is a real community to run it.

## Roles

| Role            | Who                            | Responsibilities                                                   |
| --------------- | ------------------------------ | ------------------------------------------------------------------ |
| **Maintainer**  | Named in `docs/MAINTAINERS.md` | Merge authority, releases, security response, spec stewardship     |
| **Reviewer**    | Trusted contributors           | Review PRs in their area of expertise; no merge authority required |
| **Contributor** | Everyone                       | Issues, PRs, policy examples, docs, discussion                     |

There are currently no external maintainers; this section takes effect as
maintainers are added (roadmap M6). No individual or organization speaks for
the project outside what is recorded here.

## Decision making

- Day-to-day: lazy consensus in pull requests — a maintainer approval plus no
  outstanding objection merges it.
- Spec/report/rule changes: [RFC process](docs/RFC.md) (docs/RFC.md).
- Anything else contentious: discussion in an issue; a maintainer calls
  consensus after all objections are addressed in writing.

## Conflict resolution

1. Discussion in the issue/PR, focused on technical trade-offs.
2. If unresolved, a maintainer not involved writes a short summary of positions
   and proposes a resolution with rationale.
3. If still unresolved, maintainers vote; simple majority decides; the decision
   and its rationale are recorded in `DECISIONS/`.

## Becoming a maintainer

Maintainers are contributors who have shown sustained, high-quality
involvement, sound judgment about compatibility and security, and the trust of
existing maintainers. There is no numeric threshold. When the first external
maintainer is appointed, this section is updated with the actual process.

## Project assets

- **Name and trademarks:** "ContribSpec" is used to describe this project; no
  trademark enforcement is claimed at this stage.
- **Domains/accounts:** currently none beyond the repository. Any future
  service requires an RFC and a funding statement here.
- **Funding:** the project currently has no funding or sponsorship. If that
  changes, it is disclosed here and in `README.md`.

## Transparency

- All governance decisions are recorded in this repository (`DECISIONS/`).
- Roadmap status in `ROADMAP.md` reflects reality, including what is not done.
- We do not publish adoption numbers we cannot verify.

## Code of Conduct

Enforcement follows [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

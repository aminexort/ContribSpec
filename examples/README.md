# ContribSpec examples

Ready-to-use material. Copy, adjust to what your repository actually requires,
and validate with `contribspec validate`.

## Policies (`policies/`)

| File                  | Ecosystem                  | Requires                                                         |
| --------------------- | -------------------------- | ---------------------------------------------------------------- |
| `typescript-node.yml` | TypeScript / Node.js       | `unit-tests`, `type-check` checks; DCO                           |
| `python.yml`          | Python                     | `pytest`, `lint` checks; DCO                                     |
| `go.yml`              | Go                         | `test`, `vet` checks; DCO                                        |
| `rust.yml`            | Rust                       | `test`, `clippy` checks; DCO                                     |
| `docs-only.yml`       | Documentation repositories | no code checks; disclosure only                                  |
| `strict.yml`          | High-assurance projects    | AI assistance prohibited, enforcement on, missing evidence fails |

All examples use `allow_with_disclosure` (or `prohibit` in `strict.yml`) and
report-only enforcement except `strict.yml`. **Do not copy requirements your
project does not have** — a docs repository should not demand unit tests.

## Workflows (`workflows/`)

| File                   | Behavior                                               |
| ---------------------- | ------------------------------------------------------ |
| `report-workflow.yml`  | Reports on every PR without gating (recommended start) |
| `enforce-workflow.yml` | Fails the check on required-rule violations            |

Replace `YOUR_ORG/contribspec` with the repository you install from.

## Contribution input (`contribution/`)

`contribution.json` + `evidence.json` demonstrate the local check mode:

```bash
contribspec check \
  --policy examples/policies/typescript-node.yml \
  --contribution examples/contribution/contribution.json \
  --evidence examples/contribution/evidence.json
```

The shapes are documented in `docs/REPORT_FORMAT.md` (subject + evidence).

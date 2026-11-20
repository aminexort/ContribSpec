# ContribSpec Quickstart

From zero to a contribution report in five minutes. Requires Node.js ≥ 20.11.

## 1. Install

```bash
npm install -g @contribspec/cli
# or without installing:
npx @contribspec/cli --help
```

(From a clone of this repository: `npm install && npm run build`, then use
`node packages/cli/dist/main.js`.)

## 2. Create a policy

```bash
cd your-project
contribspec init --profile node --name your-project --yes
```

Profiles: `minimal`, `node`, `python`, `go`, `rust`, `docs`. Drop `--yes` for
interactive prompts. This writes `contribspec.yml` — edit it to match what your
repository actually requires (and nothing more).

## 3. Validate and understand it

```bash
contribspec validate     # strict schema + semantic checks, actionable errors
contribspec explain      # plain-language list of what contributors must do
```

## 4. Evaluate a contribution locally

```bash
contribspec check --contribution contribution.json --evidence evidence.json
```

`contribution.json` is a contribution description (title, body, commits,
changed-file counts); `evidence.json` is an array of evidence records
(`docs/REPORT_FORMAT.md`). Add `--format json` for machine output or
`--mode enforce` to make violations exit non-zero.

## 5. Add the GitHub workflow

Create `.github/workflows/contribspec.yml`:

```yaml
name: ContribSpec
on:
  pull_request:
    types: [opened, synchronize, reopened, edited]

permissions:
  contents: read
  pull-requests: read
  checks: write

jobs:
  contribspec:
    runs-on: ubuntu-latest
    steps:
      # No checkout needed: the action never executes pull request code.
      - name: Evaluate contribution policy
        uses: YOUR_ORG/contribspec/packages/github-action@v0.1.0
        with:
          policy-path: contribspec.yml
```

Notes:

- Use `pull_request`, never `pull_request_target` (the action refuses the latter).
- The policy is read from the **base commit** of the pull request — a PR cannot
  change the policy that judges it.
- `checks: write` lets the action publish the verification report as a GitHub
  Check; without it the report still lands in the job summary and outputs.

## 6. See the report

Open the pull request: the **ContribSpec verification** check contains what was
checked, what evidence was found, which commit the evidence belongs to, and
which requirements passed / failed / could not be verified.

## 7. Gate merges (optional)

When you are ready:

```yaml
enforcement:
  default_mode: enforce # violations fail the check
  missing_evidence: fail # optional: unverifiable requirements fail too
```

Then add `ContribSpec verification` to the repository ruleset's required
status checks. Start in `report` mode and tighten later — the report is useful
before it gates anything.

## Conformance-test your policy

```bash
contribspec policy test --fixtures path/to/cases
```

A case directory holds `policy.yml`, `contribution.json`, optional
`evidence.json`, and `expected.json` with the rule outcomes you want pinned
(`{ "findings": [{ "ruleId": "AI-001", "status": "missing_evidence" }] }`).
The built-in suite (`contribspec policy test`) shows the format.

# Contributing to ContribSpec

Thank you for your interest. ContribSpec is used by maintainers who must be able
to trust it, so we favor careful, reviewable changes — and we welcome
contributors from any platform, language, and background.

## Ways to contribute

- **Policy examples** for ecosystems we do not cover yet (`examples/`)
- **Evidence adapters** for tools whose output should count as evidence
- **Forge adapters** (GitLab, Forgejo/Gitea) implementing `ForgeProvider`
- **Docs**: fixes, translations, clearer explanations
- **Tests**: regression cases, hostile-input cases, conformance fixtures
- **Bug reports and feature requests** via issues

You do not need to write TypeScript to help. Policy writing, documentation, and
real-world testing are first-class contributions.

## Getting started

```bash
npm install
npm test
```

Full setup details: [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).

## Ground rules

1. **No AI-detection features.** ContribSpec verifies requirements and
   evidence; it never attempts to determine authorship. Proposals in that
   direction will be declined.
2. **Honesty constraints hold.** Reports must not claim more than the evidence
   supports (`docs/REPORT_FORMAT.md`).
3. **Security is foundational.** Untrusted input handling, least privilege and
   path containment are not optional (`docs/THREAT_MODEL.md`).
4. **Backward compatibility** follows `docs/SPECIFICATION.md` §12. Use the
   [RFC process](docs/RFC.md) for spec changes.
5. **AI-assisted contributions are welcome — with disclosure.** This project
   eats its own cooking: use the template below. A human must understand and
   stand behind every change; all important changes require accountable human
   review.

### AI assistance disclosure (for contributions to this repo)

Add to your pull request description:

```markdown
## AI assistance

AI tools: <which tools, or "none">
Scope: <what they produced>
Verification: <what you personally checked>
```

This is a claim we record and review — not a test we run on you.

## Pull request process

1. Open an issue first for large changes (or an RFC — see above).
2. Keep PRs focused; a few hundred lines of reviewable diff beats one giant one.
3. Include tests for behavior changes; bug fixes need a regression test.
4. Update docs in the same PR (`CHANGELOG.md` under _Unreleased_).
5. Fill in the PR template. Be specific about what you tested.

## Development commands

| Command                           | Purpose                                                         |
| --------------------------------- | --------------------------------------------------------------- |
| `npm run build`                   | Compile all packages + bundle the GitHub Action                 |
| `npm test`                        | Full suite (schema, engine, security, CLI, action, conformance) |
| `npm run lint` / `npm run format` | ESLint / Prettier                                               |
| `npm run codegen`                 | Regenerate schema module after editing the JSON Schema          |

## Good first issues

Look for the `good first issue` label. Ideas that are usually approachable:

- New conformance fixture cases for `packages/test-fixtures/fixtures/conformance/`
- Example policies for an ecosystem we lack (`examples/`)
- Error-message improvements (find a diagnostic that confused you)
- Documentation translations of `docs/QUICKSTART.md`

If an issue lacks context, ask — maintainers are expected to answer.

## Review expectations

- Small PRs: initial response within a week.
- Every change affecting the spec, report contract, or security posture needs
  review from a maintainer with the relevant expertise (see `docs/MAINTAINERS.md`).
- Reviews judge the change, not the contributor. Disagreements escalate through
  `GOVERNANCE.md`'s conflict-resolution section.

## Reporting security issues

Do **not** open a public issue. See [`SECURITY.md`](SECURITY.md).

## License

By contributing, you agree that your contributions are licensed under the
Apache License 2.0 (see `LICENSE`), and that you have the right to submit them
(DCO sign-off is required on commits where the policy in the repository
requires it).

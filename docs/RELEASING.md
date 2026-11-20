# Releasing and Rollback

Releases are cut by maintainers only. **Never publish packages or create public
releases without the repository owner's explicit authorization.**

## Versioning

Semantic versioning across two contracts:

| Artifact                        | Version             | Breaks when                                     |
| ------------------------------- | ------------------- | ----------------------------------------------- |
| npm packages (`@contribspec/*`) | semver              | public API of `core`/`cli` changes incompatibly |
| Policy format                   | `version: 1`        | removed/repurposed fields (SPECIFICATION §12)   |
| Report contract                 | `reportVersion 1.x` | removed/renamed fields                          |

The policy format and the 1.x report contract are frozen per
`docs/SPECIFICATION.md` §12; additive changes only until a v2 RFC.

## Release checklist

1. All CI green on `main` (tests on Node 20/22 × Ubuntu/Windows/macOS, lint,
   typecheck, build, package validation, CodeQL, dependency review).
2. Review `CHANGELOG.md`: every user-visible change under the right heading,
   with rule ids and diagnostic codes called out where relevant.
3. Re-read `docs/THREAT_MODEL.md`; confirm nothing shipped contradicts it.
4. Verify docs match behavior (spec defaults vs `tests/backcompat.test.ts`).
5. Tag: `git tag -a vX.Y.Z -m "vX.Y.Z"` (annotated, signed if available).
6. Push the tag; the release workflow builds, re-runs tests, and — only with
   owner authorization — publishes npm packages and creates the GitHub release
   with generated notes.
7. Verify the release: `npm install -g @contribspec/cli@X.Y.Z` in a clean
   environment and run the quickstart end-to-end.

## Release automation

- `.github/workflows/release.yml` builds and packages on tag push; the publish
  step is gated behind a manual `workflow_dispatch` approval input and a
  configured npm token — it never publishes implicitly.
- Chelog entries are maintained incrementally (Keep a Changelog format);
  release notes are generated from them plus commit metadata.

## Pinning third-party Actions

Production workflows pin third-party actions to immutable commit SHAs:

```bash
node scripts/pin-actions.mjs .github/workflows   # prints suggested pins
```

After upgrading any action, re-run the pin script and commit the SHA-pinned
references with the version noted in a trailing comment.

## Rollback

| Scenario                  | Procedure                                                                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Bad npm release           | `npm deprecate @contribspec/cli@X.Y.Z "reason"` immediately; fix-forward with a patch release; only unpublish within npm's 72h window for catastrophic cases |
| Bad GitHub Action release | Re-point the major version tag (`v0`) to the last good commit; announce in the release notes of the fix                                                      |
| Bad policy schema change  | Schema changes are additive within v1; if a mistake ships, restore the previous semantics in a patch and document it in `CHANGELOG.md` under _Fixed_         |
| Security incident         | Follow `SECURITY.md`; prepare advisories via GitHub Security Advisories; rotate any exposed token (none are embedded in this project by design)              |

Post-rollback: write a short incident note in `DECISIONS/` describing what
happened, what was reverted, and what prevents a repeat.

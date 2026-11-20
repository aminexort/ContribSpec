# ContribSpec RFC Process

Changes to the **policy specification**, the **report contract**, **rule
catalog**, or the **public package APIs** go through an RFC. Everything else
(bug fixes, docs, adapters within an existing interface) uses ordinary pull
requests.

## When an RFC is required

- Adding, removing or repurposing a policy field or rule id.
- Changing evaluation semantics or default severities.
- Changing the report contract beyond additive fields.
- Changing the `ForgeProvider` contract or adding a new machine interface.
- Any proposal marked "needs RFC" by a maintainer in discussion.

## Lifecycle

1. **Draft** — open a pull request adding `DECISIONS/rfcs/NNNN-short-name.md`
   (next free number). Use the template below. State motivation, proposal,
   compatibility impact, security impact, and alternatives.
2. **Discussion** — at least one maintainer and one non-author reviewer weigh
   in. Minimum discussion window: 7 days for schema-affecting changes.
3. **Accepted / Rejected / Deferred** — a maintainer records the outcome in the
   RFC header and merges the PR (including rejected RFCs; the record matters).
4. **Implemented** — implementation PRs reference the RFC. An accepted RFC is
   not complete until it is implemented with tests and docs.

## RFC template

```markdown
# RFC NNNN: <title>

- Status: draft | accepted | rejected | deferred | implemented
- Start date: YYYY-MM-DD
- Authors: <name(s)>
- Compatibility: additive | breaking (version: N)

## Motivation

## Proposal

## Compatibility and migration

## Security considerations

## Alternatives considered

## Unresolved questions
```

## Stability promises

Once `version: 1` of the policy format and `reportVersion 1.x` are published,
the compatibility rules in `docs/SPECIFICATION.md` §12 are normative; breaking
them requires a `version: 2` RFC with a migration path and a dual-support
window.

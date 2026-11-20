# Security Policy

ContribSpec is used to gate contributions to other projects. A security
weakness here can weaken the review process everywhere it is used, so we treat
security reports with priority.

## Supported versions

Until 1.0, security fixes land on `main` only. After 1.0, the two most recent
minor releases receive security fixes.

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.**

- Preferred: use GitHub's **Private Vulnerability Reporting** on this
  repository (Security → Report a vulnerability).
- Alternative: email **security@contribspec.dev** (placeholder — maintainers
  must configure a real mailbox before public release; see `docs/MAINTAINERS.md`).

Include: affected component/version, reproduction steps or a proof of concept,
impact assessment if you have one, and any suggested fix. We will acknowledge
within **72 hours**, keep you informed, and credit you in the advisory unless
you prefer otherwise.

## Scope (examples in scope)

- Policy/YAML parsing vulnerabilities (code execution, resource exhaustion)
- Path traversal or arbitrary file read/write via CLI flags, fixtures, or the
  GitHub Action
- Secret exposure or malicious pull-request metadata injection through the
  GitHub Action
- Policy evaluation tampering (e.g. a pull request influencing its own
  evaluation)
- Supply-chain issues in our build/release pipeline

## Out of scope

- Findings that require a maintainer to run arbitrary code from an untrusted
  source by design (that is outside the trust model)
- Social engineering of individual maintainers
- Denial of service against GitHub itself

## Security design commitments

- No repository source code, secrets, or telemetry leave the machine/CI except
  the forge API calls documented in `docs/THREAT_MODEL.md` §6.
- The GitHub Action never executes pull request code and never reads the policy
  from the pull request head.
- Runtime dependencies are minimal and audited (`DECISIONS/ADR-0006`);
  CI runs `npm audit` and dependency review on every change.

The full threat model lives in [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md).

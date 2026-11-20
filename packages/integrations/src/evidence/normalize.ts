/**
 * Evidence normalization adapters.
 *
 * These functions turn tool-specific artifacts (GitHub check runs, commit
 * statuses, DCO sign-offs, test results, security scans, signed attestations)
 * into ContribSpec's common Evidence representation (ADR-0003). Adapters
 * normalize; they never judge — the producing tool's verdict is preserved as-is.
 */

import { parseSignoffs, type Evidence, type CommitInfo } from '@contribspec/core';

/** Maps GitHub check-run conclusions to normalized evidence statuses. */
export function normalizeCheckConclusion(
  status: string | undefined,
  conclusion: string | undefined,
): Evidence['status'] {
  if (status && status !== 'completed') {
    return 'unknown'; // queued / in_progress: inconclusive, NOT a failure
  }
  switch (conclusion) {
    case 'success':
      return 'pass';
    case 'failure':
    case 'timed_out':
    case 'action_required':
      return 'fail';
    case 'cancelled':
      return 'fail';
    case 'neutral':
    case 'skipped':
      return 'skipped';
    default:
      return 'unknown';
  }
}

/** Maps GitHub commit-status states to normalized evidence statuses. */
export function normalizeStatusState(state: string | undefined): Evidence['status'] {
  switch (state) {
    case 'success':
      return 'pass';
    case 'failure':
    case 'error':
      return 'fail';
    case 'pending':
      return 'unknown';
    default:
      return 'unknown';
  }
}

export interface RawCheckRun {
  name: string;
  status?: string;
  conclusion?: string;
  head_sha?: string;
  started_at?: string;
  completed_at?: string;
  html_url?: string;
  output?: { title?: string; summary?: string };
}

export function checkRunToEvidence(run: RawCheckRun, fallbackSha: string): Evidence {
  return {
    kind: 'check_run',
    source: 'github-check-run',
    name: run.name,
    subjectSha: run.head_sha || fallbackSha,
    status: normalizeCheckConclusion(run.status, run.conclusion),
    ...((run.completed_at ?? run.started_at)
      ? { collectedAt: run.completed_at ?? run.started_at }
      : {}),
    ...(run.output?.title || run.output?.summary
      ? { summary: `${run.output.title ?? ''} ${run.output.summary ?? ''}`.trim() }
      : {}),
    ...(run.html_url ? { detailsUrl: run.html_url } : {}),
  };
}

export interface RawCommitStatus {
  context: string;
  state?: string;
  description?: string;
  target_url?: string;
  updated_at?: string;
}

export function commitStatusToEvidence(status: RawCommitStatus, sha: string): Evidence {
  return {
    kind: 'commit_status',
    source: 'github-commit-status',
    name: status.context,
    subjectSha: sha,
    status: normalizeStatusState(status.state),
    ...(status.updated_at ? { collectedAt: status.updated_at } : {}),
    ...(status.description ? { summary: status.description } : {}),
    ...(status.target_url ? { detailsUrl: status.target_url } : {}),
  };
}

/**
 * Derives DCO evidence from commit sign-off trailers. Every commit must carry
 * a `Signed-off-by:` trailer for the aggregate to pass.
 */
export function commitsToDcoEvidence(commits: CommitInfo[]): Evidence | undefined {
  if (commits.length === 0) {
    return undefined;
  }
  const unsigned = commits.filter((c) => !(c.signoffs && c.signoffs.length > 0));
  return {
    kind: 'dco_signoff',
    source: 'commit-trailer',
    name: 'DCO sign-off',
    subjectSha: commits[commits.length - 1]?.sha ?? '',
    status: unsigned.length === 0 ? 'pass' : 'fail',
    summary:
      unsigned.length === 0
        ? `All ${commits.length} commit(s) carry Signed-off-by trailers (claims recorded by the committers).`
        : `${unsigned.length} of ${commits.length} commit(s) lack Signed-off-by trailers.`,
  };
}

export interface RawTestResults {
  name: string;
  sha: string;
  passed: number;
  failed: number;
  skipped?: number;
  durationMs?: number;
  reportUrl?: string;
}

/** Normalizes aggregated test-run results (e.g. from a CI summary artifact). */
export function testResultsToEvidence(results: RawTestResults): Evidence {
  const status: Evidence['status'] =
    results.failed > 0 ? 'fail' : results.passed > 0 ? 'pass' : 'unknown';
  return {
    kind: 'test_results',
    source: 'test-results',
    name: results.name,
    subjectSha: results.sha,
    status,
    summary:
      `tests: ${results.passed} passed, ${results.failed} failed` +
      (results.skipped !== undefined ? `, ${results.skipped} skipped` : ''),
    ...(results.reportUrl ? { detailsUrl: results.reportUrl } : {}),
  };
}

export interface RawAttestation {
  name: string;
  sha: string;
  /** Predicate type URI, e.g. an in-toto/SLSA predicate type. */
  predicateType: string;
  issuer?: string;
  /** Human-readable statement the attestation carries. */
  statement: string;
  subject?: string;
}

/**
 * Normalizes a signed attestation. The signature verification status is the
 * producing verifier's verdict; ContribSpec records the claim and its issuer.
 */
export function attestationToEvidence(att: RawAttestation): Evidence {
  return {
    kind: 'attestation',
    source: 'attestation',
    name: att.name,
    subjectSha: att.sha,
    status: 'neutral',
    summary: `${att.predicateType}${att.issuer ? ` from ${att.issuer}` : ''}`,
    claim: {
      stated: att.statement,
      location: `attestation:${att.predicateType}`,
      by: att.issuer ?? 'unknown issuer',
    },
    ...(att.subject ? { detailsUrl: att.subject } : {}),
  };
}

export interface RawSecurityScan {
  name: string;
  sha: string;
  status: 'pass' | 'fail' | 'unknown';
  findings: { severity: string; count: number }[];
  reportUrl?: string;
}

/** Normalizes a security scan summary (e.g. CodeQL / dependency review output). */
export function securityScanToEvidence(scan: RawSecurityScan): Evidence {
  const summary =
    scan.findings.length === 0
      ? 'no findings'
      : scan.findings.map((f) => `${f.count} ${f.severity}`).join(', ');
  return {
    kind: 'security_scan',
    source: 'security-scan',
    name: scan.name,
    subjectSha: scan.sha,
    status: scan.status,
    summary,
    ...(scan.reportUrl ? { detailsUrl: scan.reportUrl } : {}),
  };
}

export interface RawClaCheck {
  name: string;
  sha: string;
  state: 'pass' | 'fail' | 'unknown';
  summary?: string;
  url?: string;
}

/** Normalizes a CLA bot result. */
export function claCheckToEvidence(cla: RawClaCheck): Evidence {
  return {
    kind: 'cla_check',
    source: 'cla-check',
    name: cla.name,
    subjectSha: cla.sha,
    status: cla.state,
    ...(cla.summary ? { summary: cla.summary } : {}),
    ...(cla.url ? { detailsUrl: cla.url } : {}),
  };
}

/** Re-exported for adapter consumers. */
export { parseSignoffs };

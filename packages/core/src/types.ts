/**
 * Domain types for the ContribSpec core engine.
 *
 * Semantics are documented normatively in docs/SPECIFICATION.md.
 * Honesty constraints (ADR-0004): outcomes never assert authorship, safety or
 * the truthfulness of self-declarations.
 */

import type {
  AiPolicy,
  CheckSource,
  DisclosureField,
  DisclosureLocation,
  EnforcementMode,
  MissingEvidenceMode,
  PolicyDocument,
  RequirementLevel,
  RuleId,
  Severity,
} from '@contribspec/schema';

// ---------------------------------------------------------------------------
// Diagnostics (validation)
// ---------------------------------------------------------------------------

export type DiagnosticCode = string;

export interface Diagnostic {
  /** Stable code, e.g. "SCHEMA-UNKNOWN-KEY", "SEM-CONTRADICTION". */
  code: DiagnosticCode;
  /** JSON-pointer-ish location in the policy document. */
  path: string;
  message: string;
  severity: 'error' | 'warning';
  /** Optional "did you mean" suggestion. */
  suggestion?: string;
}

// ---------------------------------------------------------------------------
// Evidence (ADR-0003)
// ---------------------------------------------------------------------------

export type EvidenceKind =
  | 'check_run'
  | 'commit_status'
  | 'dco_signoff'
  | 'cla_check'
  | 'test_results'
  | 'attestation'
  | 'security_scan'
  | 'documentation_check'
  | 'statement'
  | 'other';

export type EvidenceStatus = 'pass' | 'fail' | 'neutral' | 'skipped' | 'unknown';

/** A claim recorded by a human (disclosure, attestation). Never verified for truth. */
export interface Claim {
  /** What was stated, sanitized. */
  stated: string;
  /** Where it was stated (e.g. "pull_request_body", "commit_trailer"). */
  location: string;
  /** Who stated it (login or author string), sanitized. */
  by: string;
}

export interface Evidence {
  kind: EvidenceKind;
  /** System that produced the evidence, e.g. "github-check-run", "commit-trailer". */
  source: string;
  /** Declared identifier (check name, attestation type, …). */
  name: string;
  /** Exact commit this evidence speaks about. */
  subjectSha: string;
  status: EvidenceStatus;
  /** ISO timestamp when the source produced it, if known. */
  collectedAt?: string;
  summary?: string;
  detailsUrl?: string;
  /** For self-declared claims only. */
  claim?: Claim;
  /** Report correlation id (assigned during normalization). */
  id?: string;
  /** Whether the evidence was counted for the evaluated head commit. */
  applicable?: boolean;
}

// ---------------------------------------------------------------------------
// Contribution subject
// ---------------------------------------------------------------------------

export type ProviderId = 'github' | 'gitlab' | 'forgejo' | 'local';

export interface CommitInfo {
  sha: string;
  message: string;
  authorName?: string;
  /** Sign-offs parsed from `Signed-off-by:` trailers. */
  signoffs?: string[];
}

export interface ContributionSubject {
  provider: ProviderId;
  /** Repository identifier, e.g. "owner/repo". */
  repository: string;
  number?: number;
  title: string;
  body: string;
  /** Author login or name (untrusted; sanitized before rendering). */
  author: string;
  headSha: string;
  baseSha?: string;
  baseRef?: string;
  changedFiles?: number;
  /** Total added + removed lines. */
  changedLines?: number;
  commits?: CommitInfo[];
  labels?: string[];
}

// ---------------------------------------------------------------------------
// Disclosure parsing
// ---------------------------------------------------------------------------

export type DisclosureKind = 'affirmative' | 'negative';

export interface Disclosure {
  kind: DisclosureKind;
  location: DisclosureLocation;
  /** Sanitized raw text of the disclosure. */
  text: string;
  /** Extracted fields for affirmative disclosures. */
  fields: Partial<Record<DisclosureField, string>>;
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export type FindingStatus = 'pass' | 'fail' | 'missing_evidence' | 'not_applicable' | 'error';

export interface Finding {
  ruleId: RuleId;
  /** Policy key this finding evaluates. */
  requirement: string;
  title: string;
  status: FindingStatus;
  severity: Severity;
  message: string;
  remediation: string;
  /** Ids of evidence records referenced (see report.evidence). */
  evidenceRefs: string[];
  data: Record<string, string | number | boolean>;
}

export type OverallResult = 'pass' | 'fail' | 'unverified' | 'error';

export interface PolicyRef {
  /** Path as resolved (relative to the working directory when possible). */
  path: string;
  /** sha256 hex digest of the exact policy bytes evaluated. */
  digest: string;
  /** Policy format version. */
  version: number;
  /** Where the policy was loaded from (forge ref or "local"). */
  source: string;
}

export interface EvaluationReport {
  reportVersion: string;
  generatedAt: string;
  tool: { name: string; version: string };
  policy: PolicyRef;
  subject: ContributionSubject;
  summary: {
    result: OverallResult;
    mode: EnforcementMode;
    missingEvidenceMode: MissingEvidenceMode;
    pass: number;
    fail: number;
    missingEvidence: number;
    notApplicable: number;
    error: number;
  };
  findings: Finding[];
  evidence: Evidence[];
  notes: string[];
}

// ---------------------------------------------------------------------------
// Resolved requirements (defaults applied) — used by the evaluator
// ---------------------------------------------------------------------------

export interface ResolvedPolicy {
  document: PolicyDocument;
  raw: string;
  digest: string;
  path: string;
  source: string;
  pullRequests: {
    issueReference: RequirementLevel;
    maxChangedFiles?: number;
    maxChangedLines?: number;
    titlePattern?: RegExp;
    titlePatternSource?: string;
    bodyMinLength?: number;
  };
  ai: {
    policy: AiPolicy;
    disclosureLocations: DisclosureLocation[];
    requiredFields: DisclosureField[];
    attestationTerms?: string;
  };
  accountability: {
    humanResponsibility: RequirementLevel;
    humanUnderstandingAttestation: RequirementLevel;
  };
  verification: {
    requiredChecks: { name: string; source: CheckSource; severity?: Severity; description?: string }[];
    requireHeadShaMatch: boolean;
  };
  compliance: {
    dco: RequirementLevel;
    cla: RequirementLevel;
    licenseConfirmation: RequirementLevel;
  };
  enforcement: {
    mode: EnforcementMode;
    missingEvidence: MissingEvidenceMode;
    severityOverrides: Record<string, Severity>;
  };
}
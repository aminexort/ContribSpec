/**
 * @contribspec/schema — normative types, constants and rule catalog for the
 * ContribSpec contribution policy format (v1).
 *
 * The JSON Schema in `schema/contribspec-policy-v1.schema.json` is the normative
 * shape; the types below are its TypeScript mirror maintained alongside it.
 */

export { policySchemaJson } from './generated-schema.js';

/** Policy format major version supported by this build. */
export const POLICY_SCHEMA_VERSION = 1;

/** JSON Schema document id of the v1 policy format. */
export const POLICY_SCHEMA_ID = 'https://contribspec.dev/schema/contribspec-policy-v1.json';

/** Versioned contract version of machine-readable evaluation reports (ADR-0004). */
export const REPORT_CONTRACT_VERSION = '1.0';

/** Canonical policy file name (fallbacks: contribspec.yaml, .contribspec/policy.yml). */
export const POLICY_FILE_NAME = 'contribspec.yml';

/** Ordered fallback locations searched when no explicit path is given. */
export const POLICY_FILE_CANDIDATES = [
  'contribspec.yml',
  'contribspec.yaml',
  '.contribspec/policy.yml',
  '.contribspec/policy.yaml',
] as const;

// ---------------------------------------------------------------------------
// Policy types (TypeScript mirror of the JSON Schema)
// ---------------------------------------------------------------------------

export type RequirementLevel = 'required' | 'encouraged' | 'optional' | 'not_required';
export type Severity = 'error' | 'warning' | 'notice' | 'off';
export type AiPolicy =
  | 'allow'
  | 'allow_with_disclosure'
  | 'require_human_verification'
  | 'prohibit'
  | 'advisory_only';
export type DisclosureLocation =
  | 'pull_request_body'
  | 'pull_request_comment'
  | 'commit_trailer'
  | 'issue_body'
  | 'issue_comment'
  | 'other';
export type DisclosureField = 'tools' | 'scope' | 'verification' | 'review_process' | 'other';
export type CheckSource = 'check_run' | 'commit_status' | 'any';
export type EnforcementMode = 'report' | 'advisory' | 'enforce';
export type MissingEvidenceMode = 'report' | 'warn' | 'fail';

/** Extension bag: `x-`/`x_` prefixed keys are preserved but never interpreted. */
export type ExtensionBag = { [key: `x${string}`]: unknown };

export interface PolicyProject extends ExtensionBag {
  name: string;
  description?: string;
  repository?: string;
  homepage?: string;
}

export interface PullRequestRequirements extends ExtensionBag {
  issue_reference?: RequirementLevel;
  max_changed_files?: number;
  max_changed_lines?: number;
  title_pattern?: string;
  body_min_length?: number;
}

export interface AiAssistanceRequirements extends ExtensionBag {
  policy?: AiPolicy;
  disclosure_locations?: DisclosureLocation[];
  required_fields?: DisclosureField[];
  attestation_terms?: string;
}

export interface AccountabilityRequirements extends ExtensionBag {
  human_responsibility?: RequirementLevel;
  human_understanding_attestation?: RequirementLevel;
}

export interface RequiredCheck extends ExtensionBag {
  name: string;
  source?: CheckSource;
  severity?: Severity;
  description?: string;
}

export interface VerificationRequirements extends ExtensionBag {
  required_checks?: (string | RequiredCheck)[];
  require_head_sha_match?: boolean;
}

export interface ComplianceRequirements extends ExtensionBag {
  dco?: RequirementLevel;
  cla?: RequirementLevel;
  license_confirmation?: RequirementLevel;
}

export interface ContributionRequirements extends ExtensionBag {
  pull_requests?: PullRequestRequirements;
  ai_assistance?: AiAssistanceRequirements;
  accountability?: AccountabilityRequirements;
  verification?: VerificationRequirements;
  compliance?: ComplianceRequirements;
}

export interface EnforcementSettings extends ExtensionBag {
  default_mode?: EnforcementMode;
  missing_evidence?: MissingEvidenceMode;
  severity_overrides?: { [ruleId: string]: Severity };
}

export interface PolicyMetadata extends ExtensionBag {
  description?: string;
  maintainers?: string[];
  last_reviewed?: string;
}

export interface PolicyDocument extends ExtensionBag {
  $schema?: string;
  version: number;
  project: PolicyProject;
  contributions?: ContributionRequirements;
  enforcement?: EnforcementSettings;
  metadata?: PolicyMetadata;
}

// ---------------------------------------------------------------------------
// Rule catalog — stable public contract
// ---------------------------------------------------------------------------

export type RuleId =
  | 'PR-001'
  | 'PR-002'
  | 'PR-003'
  | 'PR-004'
  | 'PR-005'
  | 'AI-001'
  | 'AI-002'
  | 'AI-003'
  | 'ACC-001'
  | 'ACC-002'
  | 'VER-001'
  | 'VER-002'
  | 'CMP-001'
  | 'CMP-002';

export interface RuleInfo {
  id: RuleId;
  /** Short human title used by `explain` and reports. */
  title: string;
  /** Policy key this rule reads. */
  requirement: string;
  /** Severity applied to a violation unless overridden or capped by requirement level. */
  defaultSeverity: Severity;
  /** What the rule checks. Never claims more than the evidence supports. */
  description: string;
  /** Actionable remediation shown when the rule does not pass. */
  remediation: string;
}

export const RULES: Record<RuleId, RuleInfo> = {
  'PR-001': {
    id: 'PR-001',
    title: 'Issue reference',
    requirement: 'contributions.pull_requests.issue_reference',
    defaultSeverity: 'notice',
    description:
      'Whether the pull request references a tracking issue (issue number in the title or body).',
    remediation: 'Reference a tracking issue, e.g. include "Fixes #123" in the pull request body.',
  },
  'PR-002': {
    id: 'PR-002',
    title: 'Changed file count',
    requirement: 'contributions.pull_requests.max_changed_files',
    defaultSeverity: 'error',
    description: 'The number of changed files must not exceed the declared maximum.',
    remediation: 'Split the change into smaller pull requests, or request a maintainer exception.',
  },
  'PR-003': {
    id: 'PR-003',
    title: 'Changed line count',
    requirement: 'contributions.pull_requests.max_changed_lines',
    defaultSeverity: 'error',
    description: 'Total added + removed lines must not exceed the declared maximum.',
    remediation: 'Split the change into smaller pull requests, or request a maintainer exception.',
  },
  'PR-004': {
    id: 'PR-004',
    title: 'Title pattern',
    requirement: 'contributions.pull_requests.title_pattern',
    defaultSeverity: 'error',
    description: 'The pull request title must match the declared regular expression.',
    remediation: 'Retitle the pull request to match the project convention.',
  },
  'PR-005': {
    id: 'PR-005',
    title: 'Description length',
    requirement: 'contributions.pull_requests.body_min_length',
    defaultSeverity: 'notice',
    description: 'The pull request description must contain at least the declared number of characters.',
    remediation: 'Describe the motivation and the change in the pull request body.',
  },
  'AI-001': {
    id: 'AI-001',
    title: 'AI assistance policy',
    requirement: 'contributions.ai_assistance.policy',
    defaultSeverity: 'error',
    description:
      'Evaluates the declared stance: disclosure presence for allow_with_disclosure / require_human_verification, or a recorded statement for prohibit. Never inspects code to infer authorship.',
    remediation:
      'Follow the project disclosure instructions in the pull request body, or state that no AI assistance was used if that is the project convention.',
  },
  'AI-002': {
    id: 'AI-002',
    title: 'Disclosure fields',
    requirement: 'contributions.ai_assistance.required_fields',
    defaultSeverity: 'warning',
    description: 'When a disclosure is present, it must state the required fields (tools, scope, …).',
    remediation: 'Extend the disclosure to cover every required field.',
  },
  'AI-003': {
    id: 'AI-003',
    title: 'Disclosure location',
    requirement: 'contributions.ai_assistance.disclosure_locations',
    defaultSeverity: 'warning',
    description: 'The disclosure must appear in at least one of the accepted locations.',
    remediation: 'Move or repeat the disclosure in an accepted location.',
  },
  'ACC-001': {
    id: 'ACC-001',
    title: 'Human responsibility',
    requirement: 'contributions.accountability.human_responsibility',
    defaultSeverity: 'error',
    description:
      'A named human must take responsibility for the contribution (e.g. Signed-off-by or an explicit statement). Recorded as a claim, not verified identity.',
    remediation: 'Add the required sign-off or responsibility statement.',
  },
  'ACC-002': {
    id: 'ACC-002',
    title: 'Understanding attestation',
    requirement: 'contributions.accountability.human_understanding_attestation',
    defaultSeverity: 'notice',
    description:
      'The contributor is asked to state that they understand the change. ContribSpec records the claim; it does not verify understanding.',
    remediation: 'Add the requested understanding statement to the pull request.',
  },
  'VER-001': {
    id: 'VER-001',
    title: 'Required check evidence',
    requirement: 'contributions.verification.required_checks',
    defaultSeverity: 'error',
    description:
      'Each required check must have passing evidence bound to the exact head commit of the evaluated change.',
    remediation: 'Run the required checks on the current head commit and wait for their results.',
  },
  'VER-002': {
    id: 'VER-002',
    title: 'Evidence commit binding',
    requirement: 'contributions.verification.require_head_sha_match',
    defaultSeverity: 'warning',
    description:
      'Evidence found for commits other than the evaluated head commit is not counted (it is listed as not applicable).',
    remediation: 'Re-run checks on the current head commit; stale evidence does not transfer.',
  },
  'CMP-001': {
    id: 'CMP-001',
    title: 'DCO sign-off',
    requirement: 'contributions.compliance.dco',
    defaultSeverity: 'error',
    description:
      'Developer Certificate of Origin expectation: Signed-off-by trailers / DCO check evidence for the head commit.',
    remediation: 'Sign off your commits (git commit -s) or complete the project DCO process.',
  },
  'CMP-002': {
    id: 'CMP-002',
    title: 'CLA',
    requirement: 'contributions.compliance.cla',
    defaultSeverity: 'error',
    description: 'Contributor License Agreement expectation: CLA check evidence for the head commit.',
    remediation: 'Sign the project CLA as instructed in the contribution guide.',
  },
};

/** All rule ids in stable display order. */
export const RULE_IDS: RuleId[] = Object.keys(RULES) as RuleId[];

/** Regex that severity_overrides keys must satisfy (mirrors the JSON Schema). */
export const RULE_ID_PATTERN = /^[A-Z]{2,4}-[0-9]{3}$/;

export function isRuleId(value: string): value is RuleId {
  return Object.prototype.hasOwnProperty.call(RULES, value);
}
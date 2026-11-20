/**
 * Requirement evaluation engine.
 *
 * Rules read the resolved policy and evaluate one contribution subject against
 * the evidence collected for it. Design constraints (ADR-0003 / ADR-0004):
 *
 *  - evidence counts only when bound to the exact head commit;
 *  - "missing evidence" is a distinct outcome from "failed evidence";
 *  - self-declarations are recorded as claims and never verified;
 *  - nothing here judges authorship, safety or correctness.
 */

import { RULES, type RuleId, type Severity } from '@contribspec/schema';
import {
  collectDisclosures,
  hasIssueReference,
  hasResponsibilityClaim,
  hasUnderstandingClaim,
} from './disclosures.js';
import { sanitizeDataValue, sanitizeInline, sanitizeText } from './sanitize.js';
import type {
  ContributionSubject,
  Disclosure,
  EvaluationReport,
  Evidence,
  Finding,
  FindingStatus,
  OverallResult,
  ResolvedPolicy,
} from './types.js';

export interface EvaluationOptions {
  /** ISO timestamp override (tests). */
  generatedAt?: string;
  /** Tool version recorded in the report. */
  toolVersion?: string;
}

export interface EvaluationInput {
  policy: ResolvedPolicy;
  subject: ContributionSubject;
  evidence: Evidence[];
  options?: EvaluationOptions;
}

const SEVERITY_RANK: Record<Severity, number> = { off: 0, notice: 1, warning: 2, error: 3 };

function minSeverity(a: Severity, b: Severity): Severity {
  return SEVERITY_RANK[a] <= SEVERITY_RANK[b] ? a : b;
}

interface RuleContext {
  policy: ResolvedPolicy;
  subject: ContributionSubject;
  /** Evidence indexed by id, applicable entries only. */
  evidence: Evidence[];
  /** Evidence that exists but is bound to a different commit. */
  staleEvidence: Evidence[];
  disclosures: Disclosure[];
  notes: string[];
  disabled: Set<RuleId>;
}

class FindingBuilder {
  readonly findings: Finding[] = [];

  constructor(private readonly ctx: RuleContext) {}

  private severityFor(ruleId: RuleId, base: Severity, cap?: Severity): Severity {
    const override = this.ctx.policy.enforcement.severityOverrides[ruleId];
    let severity = override ?? base;
    if (cap) {
      severity = minSeverity(severity, cap);
    }
    return severity;
  }

  /** Emits a finding, unless the rule is disabled (severity "off"). */
  emit(
    ruleId: RuleId,
    status: FindingStatus,
    message: string,
    opts: {
      severity?: Severity | undefined;
      cap?: Severity | undefined;
      remediation?: string | undefined;
      evidenceRefs?: string[] | undefined;
      data?: Record<string, string | number | boolean> | undefined;
      requirement?: string | undefined;
    } = {},
  ): void {
    const rule = RULES[ruleId];
    const severity = this.severityFor(ruleId, opts.severity ?? rule.defaultSeverity, opts.cap);
    if (severity === 'off') {
      return;
    }
    // Informational outcomes never carry a gating severity.
    const effective = status === 'not_applicable' ? 'notice' : severity;
    this.findings.push({
      ruleId,
      requirement: opts.requirement ?? rule.requirement,
      title: rule.title,
      status,
      severity: effective,
      message: sanitizeText(message, 2000),
      remediation: sanitizeText(opts.remediation ?? rule.remediation, 1000),
      evidenceRefs: opts.evidenceRefs ?? [],
      data: Object.fromEntries(
        Object.entries(opts.data ?? {}).map(([k, v]) => [k, sanitizeDataValue(v)]),
      ),
    });
  }
}

type RequirementLevelLike = 'required' | 'encouraged' | 'optional' | 'not_required';

/** Maps a requirement level to evaluation behavior. */
function levelBehavior(level: RequirementLevelLike): 'evaluate' | 'waived' | 'record-only' {
  switch (level) {
    case 'required':
    case 'encouraged':
      return 'evaluate';
    case 'optional':
      return 'record-only';
    case 'not_required':
      return 'waived';
  }
}

function levelCap(level: RequirementLevelLike): Severity | undefined {
  return level === 'encouraged' ? 'notice' : undefined;
}

function levelNote(level: RequirementLevelLike): string {
  return level === 'encouraged' ? ' (requirement level: encouraged — informational)' : '';
}

/** Finds evidence matching a required check by name and source. */
function matchCheckEvidence(
  ctx: RuleContext,
  name: string,
  source: 'check_run' | 'commit_status' | 'any',
): { matching: Evidence[]; stale: Evidence[] } {
  const sourceOk = (e: Evidence): boolean =>
    source === 'any' ||
    (source === 'check_run' && e.kind === 'check_run') ||
    (source === 'commit_status' && e.kind === 'commit_status');

  const matching = ctx.evidence.filter((e) => e.name === name && sourceOk(e));
  const stale = ctx.staleEvidence.filter((e) => e.name === name && sourceOk(e));
  return { matching, stale };
}

function evaluatePullRequests(ctx: RuleContext, b: FindingBuilder): void {
  const { policy, subject } = ctx;

  // PR-001 issue reference
  const issueLevel = policy.pullRequests.issueReference;
  const issueBehavior = levelBehavior(issueLevel);
  if (issueBehavior === 'waived') {
    b.emit('PR-001', 'not_applicable', `Issue references are explicitly not required by policy.`);
  } else if (issueBehavior === 'record-only') {
    b.emit('PR-001', 'not_applicable', 'Issue references are optional; recorded only when present.');
  } else {
    const found = hasIssueReference(subject.title, subject.body);
    b.emit(
      'PR-001',
      found ? 'pass' : 'fail',
      found
        ? `Found a tracking issue reference in the pull request title or description.`
        : `No tracking issue reference was found in the pull request title or description.${levelNote(issueLevel)}`,
      {
        cap: levelCap(issueLevel),
        requirement: 'contributions.pull_requests.issue_reference',
      },
    );
  }

  // PR-002 max changed files
  const maxFiles = policy.pullRequests.maxChangedFiles;
  if (maxFiles !== undefined) {
    if (subject.changedFiles === undefined) {
      b.emit('PR-002', 'missing_evidence', 'Changed-file count was not available in the collected metadata.', {
        data: { limit: maxFiles },
      });
    } else {
      const ok = subject.changedFiles <= maxFiles;
      b.emit(
        'PR-002',
        ok ? 'pass' : 'fail',
        ok
          ? `Changed files: ${subject.changedFiles} (limit ${maxFiles}).`
          : `Changed files: ${subject.changedFiles} exceeds the limit of ${maxFiles}.`,
        {
          data: { changedFiles: subject.changedFiles, limit: maxFiles },
          ...(ok ? {} : { remediation: RULES['PR-002'].remediation }),
        },
      );
    }
  }

  // PR-003 max changed lines
  const maxLines = policy.pullRequests.maxChangedLines;
  if (maxLines !== undefined) {
    if (subject.changedLines === undefined) {
      b.emit('PR-003', 'missing_evidence', 'Changed-line count was not available in the collected metadata.', {
        data: { limit: maxLines },
      });
    } else {
      const ok = subject.changedLines <= maxLines;
      b.emit(
        'PR-003',
        ok ? 'pass' : 'fail',
        ok
          ? `Changed lines: ${subject.changedLines} (limit ${maxLines}).`
          : `Changed lines: ${subject.changedLines} exceeds the limit of ${maxLines}.`,
        { data: { changedLines: subject.changedLines, limit: maxLines } },
      );
    }
  }

  // PR-004 title pattern
  const pattern = policy.pullRequests.titlePattern;
  const patternSource = policy.pullRequests.titlePatternSource;
  if (pattern && patternSource !== undefined) {
    const ok = pattern.test(sanitizeInline(subject.title, 500));
    b.emit(
      'PR-004',
      ok ? 'pass' : 'fail',
      ok
        ? `Title matches the required pattern.`
        : `Title does not match the required pattern: ${patternSource}`,
      { data: { pattern: patternSource } },
    );
  }

  // PR-005 body minimum length
  const minBody = policy.pullRequests.bodyMinLength;
  if (minBody !== undefined) {
    const length = sanitizeText(subject.body).replace(/\s+/g, '').length;
    const ok = length >= minBody;
    b.emit(
      'PR-005',
      ok ? 'pass' : 'fail',
      ok
        ? `Description length ${length} meets the minimum of ${minBody} characters.`
        : `Description length ${length} is below the minimum of ${minBody} characters.`,
      { data: { bodyLength: length, minimum: minBody } },
    );
  }
}

function evaluateAiAssistance(ctx: RuleContext, b: FindingBuilder): void {
  const { policy, disclosures } = ctx;
  const aiPolicy = policy.ai.policy;

  if (aiPolicy === 'allow') {
    b.emit('AI-001', 'not_applicable', 'AI assistance is permitted without disclosure under this policy.');
    return;
  }
  if (aiPolicy === 'advisory_only') {
    b.emit(
      'AI-001',
      'not_applicable',
      'The AI assistance policy is advisory only; nothing is required or gated.',
    );
    return;
  }

  const affirmative = disclosures.filter((d) => d.kind === 'affirmative');
  const negative = disclosures.filter((d) => d.kind === 'negative');
  const anyDisclosure = [...affirmative, ...negative];

  if (aiPolicy === 'prohibit') {
    if (affirmative.length > 0) {
      b.emit(
        'AI-001',
        'fail',
        `A disclosure states AI assistance was used, but this policy prohibits AI-assisted contributions. ` +
          `The statement is recorded as a claim; ContribSpec does not verify or detect authorship.`,
        {
          evidenceRefs: affirmative.map((_, i) => `statement:${i}`),
          remediation:
            'Resubmit the contribution without AI assistance, or ask maintainers to revisit the policy.',
        },
      );
    } else if (negative.length > 0) {
      b.emit(
        'AI-001',
        'pass',
        'A statement records that no AI assistance was used. Recorded as a claim; not independently verified.',
        { evidenceRefs: negative.map((_, i) => `statement:${i}`) },
      );
    } else {
      b.emit(
        'AI-001',
        'missing_evidence',
        'No statement about AI assistance was found in the searched locations, so this requirement could not be verified. ' +
          'ContribSpec does not attempt to detect AI-generated code.',
        {
          remediation:
            'Add a statement about AI assistance in the pull request body (see the project contribution guide).',
        },
      );
    }
    return;
  }

  // allow_with_disclosure | require_human_verification
  const requireVerification = aiPolicy === 'require_human_verification';

  if (affirmative.length === 0 && negative.length === 0) {
    b.emit(
      'AI-001',
      'missing_evidence',
      'No statement about AI assistance was found in the searched locations (pull request body, commit trailers), ' +
        'so this requirement could not be verified. This is reported as missing evidence, not as a failure, because ' +
        'ContribSpec cannot determine whether AI assistance was used.',
      {
        remediation:
          'State in the pull request body whether AI assistance was used (and disclose tools and scope if it was).',
      },
    );
    return;
  }

  b.emit(
    'AI-001',
    'pass',
    affirmative.length > 0
      ? 'AI assistance disclosed. The disclosure is recorded as a claim; ContribSpec does not verify its truthfulness.'
      : 'A statement records that no AI assistance was used. Recorded as a claim; not independently verified.',
    { evidenceRefs: anyDisclosure.map((_, i) => `statement:${i}`) },
  );

  // AI-002 required fields (affirmative disclosures only)
  const requiredFields = policy.ai.requiredFields;
  if (affirmative.length > 0 && requiredFields.length > 0) {
    const presentFields = new Set<string>();
    for (const d of affirmative) {
      for (const key of Object.keys(d.fields)) {
        presentFields.add(key);
      }
    }
    const missing = requiredFields.filter((f) => !presentFields.has(f));
    b.emit(
      'AI-002',
      missing.length === 0 ? 'pass' : 'fail',
      missing.length === 0
        ? `Disclosure states all required fields (${requiredFields.join(', ')}).`
        : `Disclosure is missing required fields: ${missing.join(', ')}.`,
      {
        data: { missingFields: missing.join(',') || 'none' },
        ...(missing.length > 0
          ? {
              remediation: `Add the missing fields to the disclosure as "field: description" lines, e.g. "tools: <which tools>".`,
            }
          : {}),
      },
    );
  }

  // AI-003 disclosure location
  const allowed = policy.ai.disclosureLocations;
  const located = anyDisclosure.filter((d) => allowed.includes(d.location));
  b.emit(
    'AI-003',
    located.length > 0 ? 'pass' : 'fail',
    located.length > 0
      ? `Statement found in an accepted location (${located.map((d) => d.location).join(', ')}).`
      : `Statements were found only in locations not accepted by policy (accepted: ${allowed.join(', ')}).`,
    {
      data: { allowedLocations: allowed.join(','), foundLocations: anyDisclosure.map((d) => d.location).join(',') },
    },
  );

  if (requireVerification) {
    ctx.notes.push(
      'AI policy "require_human_verification" raises accountability requirements to required for this contribution.',
    );
  }
}

function evaluateAccountability(ctx: RuleContext, b: FindingBuilder): void {
  const { policy, subject } = ctx;
  const forced = policy.ai.policy === 'require_human_verification';

  // ACC-001 human responsibility
  let respLevel = policy.accountability.humanResponsibility;
  if (forced && respLevel !== 'required') {
    respLevel = 'required';
  }
  const respBehavior = levelBehavior(respLevel);
  if (respBehavior === 'waived') {
    b.emit('ACC-001', 'not_applicable', 'Human responsibility statements are explicitly waived by policy.');
  } else if (respBehavior === 'record-only') {
    b.emit('ACC-001', 'not_applicable', 'Human responsibility statements are optional; recorded when present.');
  } else {
    const hasData = subject.body.length > 0 || (subject.commits?.length ?? 0) > 0;
    const claimed = hasResponsibilityClaim(subject.body, subject.commits);
    if (claimed) {
      b.emit(
        'ACC-001',
        'pass',
        'A responsibility claim (sign-off or statement) was found. Recorded as a claim; ContribSpec does not verify identity.',
        { cap: levelCap(respLevel), data: { claimPresent: true } },
      );
    } else if (!hasData) {
      b.emit('ACC-001', 'missing_evidence', 'Neither pull request description nor commit metadata was available.', {
        cap: levelCap(respLevel),
      });
    } else {
      b.emit(
        'ACC-001',
        'fail',
        `No responsibility claim (sign-off or statement) was found in the searched locations.${levelNote(respLevel)}`,
        {
          cap: levelCap(respLevel),
          data: { claimPresent: false },
          ...(forced
            ? {
                remediation:
                  'Take responsibility explicitly in the pull request description and sign off your commits (git commit -s).',
              }
            : {}),
        },
      );
    }
  }

  // ACC-002 understanding attestation
  let undLevel = policy.accountability.humanUnderstandingAttestation;
  if (forced && undLevel !== 'required') {
    undLevel = 'required';
  }
  const undBehavior = levelBehavior(undLevel);
  if (undBehavior === 'waived') {
    b.emit('ACC-002', 'not_applicable', 'Understanding attestations are explicitly waived by policy.');
  } else if (undBehavior === 'record-only') {
    b.emit('ACC-002', 'not_applicable', 'Understanding attestations are optional; recorded when present.');
  } else {
    const claimed = hasUnderstandingClaim(subject.body, subject.commits);
    b.emit(
      'ACC-002',
      claimed ? 'pass' : 'fail',
      claimed
        ? 'An understanding claim was recorded. ContribSpec records the claim; it does not verify understanding.'
        : `No understanding claim was found in the searched locations.${levelNote(undLevel)}`,
      {
        cap: levelCap(undLevel),
        data: { claimPresent: claimed },
        ...(forced && !claimed
          ? { remediation: 'State in the pull request description that you understand the change.' }
          : {}),
      },
    );
  }
}

function evaluateVerification(ctx: RuleContext, b: FindingBuilder): void {
  const { policy, subject } = ctx;
  const checks = policy.verification.requiredChecks;

  for (const check of checks) {
    const { matching, stale } = matchCheckEvidence(ctx, check.name, check.source);
    const requirement = `contributions.verification.required_checks[${check.name}]`;
    const data = { check: check.name, source: check.source, headSha: subject.headSha };

    const passing = matching.find((e) => e.status === 'pass');
    const failing = matching.find((e) => e.status === 'fail');

    if (passing) {
      b.emit('VER-001', 'pass', `Check "${check.name}" has passing evidence for commit ${subject.headSha}.`, {
        severity: check.severity,
        requirement,
        evidenceRefs: [passing.id ?? ''],
        data,
      });
    } else if (failing) {
      b.emit('VER-001', 'fail', `Check "${check.name}" reports failure for commit ${subject.headSha}.`, {
        severity: check.severity,
        requirement,
        evidenceRefs: [failing.id ?? ''],
        data,
      });
    } else if (matching.length > 0) {
      const statuses = [...new Set(matching.map((e) => e.status))].join(', ');
      b.emit(
        'VER-001',
        'missing_evidence',
        `Check "${check.name}" has evidence for commit ${subject.headSha}, but it is inconclusive (status: ${statuses}). ` +
          `Missing or inconclusive evidence is not the same as a failed check.`,
        { severity: check.severity, requirement, evidenceRefs: matching.map((e) => e.id ?? ''), data },
      );
    } else {
      b.emit(
        'VER-001',
        'missing_evidence',
        `No evidence found for required check "${check.name}" bound to commit ${subject.headSha}. ` +
          `This is reported as missing evidence, not as a failure.`,
        { severity: check.severity, requirement, data },
      );
    }

    // VER-002 stale evidence that looks like it satisfies the check
    if (stale.length > 0 && policy.verification.requireHeadShaMatch) {
      for (const s of stale) {
        b.emit(
          'VER-002',
          'fail',
          `Evidence "${s.name}" exists for commit ${s.subjectSha}, but the evaluated head commit is ${subject.headSha}. ` +
            `Evidence bound to another commit does not count and is listed as not applicable.`,
          {
            evidenceRefs: [s.id ?? ''],
            data: { check: check.name, evidenceSha: s.subjectSha, headSha: subject.headSha },
          },
        );
      }
    }
  }
}

function evaluateCompliance(ctx: RuleContext, b: FindingBuilder): void {
  const { policy, subject, evidence } = ctx;

  // CMP-001 DCO
  const dcoLevel = policy.compliance.dco;
  const dcoBehavior = levelBehavior(dcoLevel);
  if (dcoBehavior === 'waived') {
    b.emit('CMP-001', 'not_applicable', 'DCO sign-off is explicitly waived by policy.');
  } else if (dcoBehavior === 'record-only') {
    b.emit('CMP-001', 'not_applicable', 'DCO sign-off is optional; recorded when present.');
  } else {
    const commits = subject.commits;
    const dcoEvidence = evidence.filter(
      (e) => e.kind === 'dco_signoff' || /dco/i.test(e.name),
    );
    const dcoPass = dcoEvidence.find((e) => e.status === 'pass');
    const dcoFail = dcoEvidence.find((e) => e.status === 'fail');

    if (commits && commits.length > 0) {
      const unsigned = commits.filter((c) => !(c.signoffs && c.signoffs.length > 0));
      if (unsigned.length === 0) {
        b.emit(
          'CMP-001',
          'pass',
          `All ${commits.length} commit(s) carry Signed-off-by trailers. Recorded as claims; identity is not verified here.`,
          {
            cap: levelCap(dcoLevel),
            data: { commits: commits.length, unsigned: 0 },
          },
        );
      } else {
        b.emit(
          'CMP-001',
          'fail',
          `${unsigned.length} of ${commits.length} commit(s) lack Signed-off-by trailers.`,
          {
            cap: levelCap(dcoLevel),
            data: { commits: commits.length, unsigned: unsigned.length },
          },
        );
      }
    } else if (dcoPass) {
      b.emit('CMP-001', 'pass', `DCO evidence "${dcoPass.name}" reports success for commit ${subject.headSha}.`, {
        cap: levelCap(dcoLevel),
        evidenceRefs: [dcoPass.id ?? ''],
      });
    } else if (dcoFail) {
      b.emit('CMP-001', 'fail', `DCO evidence "${dcoFail.name}" reports failure for commit ${subject.headSha}.`, {
        cap: levelCap(dcoLevel),
        evidenceRefs: [dcoFail.id ?? ''],
      });
    } else {
      b.emit(
        'CMP-001',
        'missing_evidence',
        'Commit metadata was unavailable and no DCO evidence was found for this commit.',
        { cap: levelCap(dcoLevel) },
      );
    }
  }

  // CMP-002 CLA
  const claLevel = policy.compliance.cla;
  const claBehavior = levelBehavior(claLevel);
  if (claBehavior === 'waived') {
    b.emit('CMP-002', 'not_applicable', 'A CLA is explicitly not required by policy.');
  } else if (claBehavior === 'record-only') {
    b.emit('CMP-002', 'not_applicable', 'A CLA is optional; recorded when evidence exists.');
  } else {
    const claEvidence = evidence.filter((e) => e.kind === 'cla_check' || /\bcla\b/i.test(e.name));
    const pass = claEvidence.find((e) => e.status === 'pass');
    const fail = claEvidence.find((e) => e.status === 'fail');
    if (pass) {
      b.emit('CMP-002', 'pass', `CLA evidence "${pass.name}" reports success for commit ${subject.headSha}.`, {
        cap: levelCap(claLevel),
        evidenceRefs: [pass.id ?? ''],
      });
    } else if (fail) {
      b.emit('CMP-002', 'fail', `CLA evidence "${fail.name}" reports failure for commit ${subject.headSha}.`, {
        cap: levelCap(claLevel),
        evidenceRefs: [fail.id ?? ''],
      });
    } else {
      b.emit(
        'CMP-002',
        'missing_evidence',
        'No CLA evidence was found for this commit. If the project uses a CLA bot, ensure it reports on the head commit.',
        { cap: levelCap(claLevel) },
      );
    }
  }
}

function computeResult(findings: Finding[], policy: ResolvedPolicy): OverallResult {
  const has = (status: FindingStatus): boolean => findings.some((f) => f.status === status);
  const hasError = findings.some((f) => f.status === 'error');
  if (hasError) {
    return 'error';
  }
  const failingRequired = findings.some((f) => f.status === 'fail' && f.severity === 'error');
  if (failingRequired) {
    return 'fail';
  }
  const missing = findings.filter((f) => f.status === 'missing_evidence');
  if (missing.length > 0) {
    return policy.enforcement.missingEvidence === 'fail' ? 'fail' : 'unverified';
  }
  if (has('fail')) {
    // Lower-severity (warning/notice) violations only.
    return 'pass';
  }
  return 'pass';
}

/**
 * Evaluates one contribution against a resolved policy.
 *
 * The returned evidence array carries stable ids and applicability flags;
 * findings reference evidence by those ids.
 */
export function evaluateContribution(input: EvaluationInput): EvaluationReport {
  const { policy, subject, options } = input;

  const headSha = subject.headSha;
  const requireShaMatch = policy.verification.requireHeadShaMatch;

  const evidence: Evidence[] = input.evidence.map((e, i) => {
    const applicable = !requireShaMatch || e.subjectSha === headSha;
    return {
      ...e,
      name: sanitizeInline(e.name, 200),
      ...(e.summary !== undefined ? { summary: sanitizeInline(e.summary, 500) } : {}),
      id: `ev-${i + 1}`,
      applicable,
    };
  });

  const applicableEvidence = evidence.filter((e) => e.applicable === true);
  const staleEvidence = requireShaMatch ? evidence.filter((e) => e.applicable === false) : [];

  const disclosures = collectDisclosures(subject.body, subject.commits);
  const notes: string[] = [];
  if (disclosures.length > 0) {
    notes.push(
      'Disclosure and attestation statements are recorded as claims. ContribSpec does not verify their truthfulness and does not attempt to detect AI-generated code.',
    );
  }

  const ctx: RuleContext = {
    policy,
    subject,
    evidence: applicableEvidence,
    staleEvidence,
    disclosures,
    notes,
    disabled: new Set<RuleId>(),
  };

  // Record disclosure statements as evidence entries (claims).
  disclosures.forEach((d, i) => {
    evidence.push({
      kind: 'statement',
      source: d.location,
      name: d.kind === 'affirmative' ? 'ai-disclosure' : 'ai-none-statement',
      subjectSha: headSha,
      status: 'neutral',
      claim: { stated: d.text, location: d.location, by: subject.author },
      applicable: true,
      id: `statement:${i}`,
    });
  });

  // Detect disabled rules from severity overrides.
  for (const [ruleId, severity] of Object.entries(policy.enforcement.severityOverrides)) {
    if (severity === 'off' && ruleId in RULES) {
      ctx.disabled.add(ruleId as RuleId);
    }
  }

  const b = new FindingBuilder(ctx);
  for (const ruleId of ctx.disabled) {
    notes.push(`Rule ${ruleId} is disabled by policy (severity override "off") and was not evaluated.`);
  }

  evaluatePullRequests(ctx, b);
  evaluateAiAssistance(ctx, b);
  evaluateAccountability(ctx, b);
  evaluateVerification(ctx, b);
  evaluateCompliance(ctx, b);

  const findings = b.findings;
  const result = computeResult(findings, policy);

  const count = (status: FindingStatus): number => findings.filter((f) => f.status === status).length;

  return {
    reportVersion: '1.0',
    generatedAt: options?.generatedAt ?? new Date().toISOString(),
    tool: { name: 'contribspec', version: options?.toolVersion ?? '0.1.0' },
    policy: {
      path: policy.path,
      digest: policy.digest,
      version: policy.document.version,
      source: policy.source,
    },
    subject: {
      ...subject,
      title: sanitizeInline(subject.title, 500),
      body: sanitizeText(subject.body),
      author: sanitizeInline(subject.author, 200),
    },
    summary: {
      result,
      mode: policy.enforcement.mode,
      missingEvidenceMode: policy.enforcement.missingEvidence,
      pass: count('pass'),
      fail: count('fail'),
      missingEvidence: count('missing_evidence'),
      notApplicable: count('not_applicable'),
      error: count('error'),
    },
    findings,
    evidence,
    notes,
  };
}
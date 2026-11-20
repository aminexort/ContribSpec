/**
 * `contribspec explain` — turns a resolved policy into human-readable text.
 *
 * The explanation always includes: the requirement, the resolved value (after
 * defaults), the rule id that evaluates it, its severity, and what a violation
 * means. Output never claims more than the evaluation can verify.
 */

import { RULES, RULE_IDS, type RuleId, type Severity } from '@contribspec/schema';
import type { ResolvedPolicy } from './types.js';
import { escapeMarkdown, sanitizeInline } from './sanitize.js';

export type ExplainFormat = 'text' | 'markdown' | 'json';

interface RuleExplanation {
  ruleId: RuleId;
  title: string;
  requirement: string;
  configured: string;
  severity: Severity | 'disabled';
  meaning: string;
  remediation: string;
}

function configuredValue(policy: ResolvedPolicy, ruleId: RuleId): string {
  switch (ruleId) {
    case 'PR-001':
      return `issue_reference: ${policy.pullRequests.issueReference}`;
    case 'PR-002':
      return policy.pullRequests.maxChangedFiles !== undefined
        ? `max_changed_files: ${policy.pullRequests.maxChangedFiles}`
        : 'not configured';
    case 'PR-003':
      return policy.pullRequests.maxChangedLines !== undefined
        ? `max_changed_lines: ${policy.pullRequests.maxChangedLines}`
        : 'not configured';
    case 'PR-004':
      return policy.pullRequests.titlePatternSource !== undefined
        ? `title_pattern: ${policy.pullRequests.titlePatternSource}`
        : 'not configured';
    case 'PR-005':
      return policy.pullRequests.bodyMinLength !== undefined
        ? `body_min_length: ${policy.pullRequests.bodyMinLength}`
        : 'not configured';
    case 'AI-001':
      return `ai_assistance.policy: ${policy.ai.policy}`;
    case 'AI-002':
      return `required_fields: ${policy.ai.requiredFields.length > 0 ? policy.ai.requiredFields.join(', ') : 'none'}`;
    case 'AI-003':
      return `disclosure_locations: ${policy.ai.disclosureLocations.join(', ')}`;
    case 'ACC-001':
      return `human_responsibility: ${policy.accountability.humanResponsibility}`;
    case 'ACC-002':
      return `human_understanding_attestation: ${policy.accountability.humanUnderstandingAttestation}`;
    case 'VER-001':
      return policy.verification.requiredChecks.length > 0
        ? `required_checks: ${policy.verification.requiredChecks.map((c) => c.name).join(', ')}`
        : 'no required checks';
    case 'VER-002':
      return `require_head_sha_match: ${policy.verification.requireHeadShaMatch}`;
    case 'CMP-001':
      return `dco: ${policy.compliance.dco}`;
    case 'CMP-002':
      return `cla: ${policy.compliance.cla}`;
  }
}

function isRuleActive(policy: ResolvedPolicy, ruleId: RuleId): boolean {
  const override = policy.enforcement.severityOverrides[ruleId];
  return override !== 'off';
}

function explanations(policy: ResolvedPolicy): RuleExplanation[] {
  return RULE_IDS.filter((id) => isRuleActive(policy, id)).map((ruleId) => {
    const rule = RULES[ruleId];
    const override = policy.enforcement.severityOverrides[ruleId];
    return {
      ruleId,
      title: rule.title,
      requirement: rule.requirement,
      configured: configuredValue(policy, ruleId),
      severity: (override ?? rule.defaultSeverity) as Severity,
      meaning: rule.description,
      remediation: rule.remediation,
    };
  });
}

/** Renders the explanation in the requested format. */
export function explainPolicy(policy: ResolvedPolicy, format: ExplainFormat = 'text'): string {
  const rules = explanations(policy);
  const mode = policy.enforcement.mode;

  if (format === 'json') {
    return `${JSON.stringify(
      {
        policyPath: policy.path,
        policyDigest: policy.digest,
        project: policy.document.project.name,
        enforcementMode: mode,
        missingEvidenceMode: policy.enforcement.missingEvidence,
        rules,
        disclaimer:
          'ContribSpec verifies declared requirements and their evidence. It does not detect authorship and does not certify that a contribution is safe or correct.',
      },
      null,
      2,
    )}\n`;
  }

  if (format === 'markdown') {
    const lines: string[] = [];
    lines.push(`### Contribution requirements — ${escapeMarkdown(policy.document.project.name, 120)}`);
    lines.push('');
    lines.push(
      `Enforcement mode: **${mode}**. Missing evidence is treated as: **${policy.enforcement.missingEvidence}**.`,
    );
    lines.push('');
    lines.push('| Rule | Requirement | Configured as | Severity | What it means |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const r of rules) {
      lines.push(
        `| \`${r.ruleId}\` | \`${escapeMarkdown(r.requirement, 120)}\` | ${escapeMarkdown(r.configured, 120)} | ${r.severity} | ${escapeMarkdown(r.meaning, 300)} |`,
      );
    }
    lines.push('');
    lines.push(
      '> These are the requirements this repository declared. ContribSpec checks them against available ' +
        'evidence for a specific commit; it does not detect authorship and does not certify correctness.',
    );
    return `${lines.join('\n')}\n`;
  }

  const lines: string[] = [];
  lines.push(`Contribution requirements for ${sanitizeInline(policy.document.project.name, 120)}`);
  lines.push(`Policy: ${sanitizeInline(policy.path, 200)} (version ${policy.document.version})`);
  lines.push(`Enforcement mode: ${mode}; missing evidence is treated as: ${policy.enforcement.missingEvidence}.`);
  lines.push('');
  for (const r of rules) {
    lines.push(`[${r.ruleId}] ${r.title}`);
    lines.push(`    requirement: ${r.requirement} = ${sanitizeInline(r.configured, 200)}`);
    lines.push(`    severity:    ${r.severity}`);
    lines.push(`    meaning:     ${sanitizeInline(r.meaning, 500)}`);
    lines.push(`    if unmet:    ${sanitizeInline(r.remediation, 300)}`);
    lines.push('');
  }
  lines.push(
    'ContribSpec verifies declared requirements and their evidence for a specific commit. ' +
      'It does not detect authorship and does not certify that a contribution is safe or correct.',
  );
  return `${lines.join('\n')}\n`;
}
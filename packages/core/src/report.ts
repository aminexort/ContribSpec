/**
 * Report rendering (ADR-0004).
 *
 * The JSON report is the single source of truth; text and Markdown output are
 * rendered from it. All untrusted text is sanitized/escaped again at render
 * time (defense in depth, threat model T9).
 */

import type { EvaluationReport, Finding, FindingStatus, OverallResult } from './types.js';
import { codeFence, escapeMarkdown, sanitizeInline } from './sanitize.js';

/** Machine-readable report (stable contract within reportVersion 1.x). */
export function renderJson(report: EvaluationReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

const STATUS_LABEL: Record<FindingStatus, string> = {
  pass: 'PASS',
  fail: 'FAIL',
  missing_evidence: 'MISSING EVIDENCE',
  not_applicable: 'NOT APPLICABLE',
  error: 'ERROR',
};

const RESULT_LABEL: Record<OverallResult, string> = {
  pass: 'pass',
  fail: 'fail',
  unverified: 'unverified',
  error: 'error',
};

function findingLine(f: Finding): string {
  const dataEntries = Object.entries(f.data);
  const dataText =
    dataEntries.length > 0 ? ` [${dataEntries.map(([k, v]) => `${k}=${v}`).join(' ')}]` : '';
  return (
    `  ${STATUS_LABEL[f.status].padEnd(15)} ${f.ruleId} ${f.title} (${f.severity})${dataText}\n` +
    `      ${sanitizeInline(f.message, 500)}\n` +
    (f.status === 'fail' || f.status === 'missing_evidence'
      ? `      → ${sanitizeInline(f.remediation, 300)}\n`
      : '')
  );
}

/** Human-readable terminal output (plain text, no ANSI — safe for logs). */
export function renderText(report: EvaluationReport): string {
  const lines: string[] = [];
  const s = report.summary;
  lines.push(`ContribSpec report ${report.reportVersion}`);
  lines.push(
    `Subject: ${sanitizeInline(report.subject.repository, 120)}` +
      (report.subject.number !== undefined ? ` #${report.subject.number}` : '') +
      ` @ ${report.subject.headSha.slice(0, 12)}`,
  );
  lines.push(
    `Policy:  ${sanitizeInline(report.policy.path, 200)} (sha256:${report.policy.digest.slice(0, 12)}…)`,
  );
  lines.push(`Result:  ${RESULT_LABEL[s.result]} (mode: ${s.mode})`);
  lines.push(
    `Counts:  pass=${s.pass} fail=${s.fail} missing-evidence=${s.missingEvidence} ` +
      `not-applicable=${s.notApplicable} error=${s.error}`,
  );
  lines.push('');
  for (const f of report.findings) {
    lines.push(findingLine(f));
  }
  if (report.notes.length > 0) {
    lines.push('Notes:');
    for (const note of report.notes) {
      lines.push(`  - ${sanitizeInline(note, 500)}`);
    }
  }
  lines.push('');
  lines.push(
    'This report states what was checked and what evidence was found for the listed commit. ' +
      'It makes no judgment about authorship, safety, or correctness of the contribution.',
  );
  return `${lines.join('\n')}\n`;
}

function evidenceTable(report: EvaluationReport): string {
  if (report.evidence.length === 0) {
    return 'No evidence was collected for this evaluation.';
  }
  const rows = report.evidence.map((e) => {
    const sha = e.subjectSha ? e.subjectSha.slice(0, 12) : '(none)';
    return `| ${escapeMarkdown(e.kind, 40)} | ${escapeMarkdown(e.name, 80)} | ${sha} | ${escapeMarkdown(e.status, 20)} | ${e.applicable ? 'yes' : 'no'} |`;
  });
  return [
    '| Kind | Name | Commit | Source status | Counted |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

/** Markdown rendering for check-run summaries and job summaries. */
export function renderMarkdown(report: EvaluationReport): string {
  const s = report.summary;
  const lines: string[] = [];
  const badge =
    s.result === 'pass'
      ? '✅ pass'
      : s.result === 'fail'
        ? '❌ fail'
        : s.result === 'unverified'
          ? '⚠️ unverified'
          : '💥 error';
  lines.push(`### ContribSpec verification report — ${badge}`);
  lines.push('');
  lines.push(
    `- **Subject:** ${escapeMarkdown(report.subject.repository, 120)}` +
      (report.subject.number !== undefined ? ` #${report.subject.number}` : '') +
      ` — ${escapeMarkdown(report.subject.title, 200)}`,
  );
  lines.push(`- **Head commit:** \`${sanitizeInline(report.subject.headSha, 64)}\``);
  if (report.subject.baseSha) {
    lines.push(`- **Base commit:** \`${sanitizeInline(report.subject.baseSha, 64)}\``);
  }
  lines.push(
    `- **Policy:** \`${escapeMarkdown(report.policy.path, 200)}\` (v${report.policy.version}, ` +
      `sha256 \`${report.policy.digest.slice(0, 16)}…\`, from \`${escapeMarkdown(report.policy.source, 120)}\`)`,
  );
  lines.push(
    `- **Counts:** pass ${s.pass} · fail ${s.fail} · missing evidence ${s.missingEvidence} · ` +
      `not applicable ${s.notApplicable} · error ${s.error} (mode: ${s.mode})`,
  );
  lines.push('');

  lines.push('#### Requirements');
  lines.push('');
  lines.push('| Status | Rule | Requirement | Severity | Message |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const f of report.findings) {
    const icon =
      f.status === 'pass'
        ? '✅ pass'
        : f.status === 'fail'
          ? '❌ fail'
          : f.status === 'missing_evidence'
            ? '⚠️ missing evidence'
            : f.status === 'not_applicable'
              ? '➖ n/a'
              : '💥 error';
    lines.push(
      `| ${icon} | \`${f.ruleId}\` | ${escapeMarkdown(f.title, 120)} | ${f.severity} | ${escapeMarkdown(f.message, 400)} |`,
    );
  }
  lines.push('');

  const actionable = report.findings.filter(
    (f) => f.status === 'fail' || f.status === 'missing_evidence',
  );
  if (actionable.length > 0) {
    lines.push('#### How to proceed');
    lines.push('');
    for (const f of actionable) {
      lines.push(
        `- **${f.ruleId}** (${STATUS_LABEL[f.status].toLowerCase()}): ${escapeMarkdown(f.remediation, 400)}`,
      );
    }
    lines.push('');
  }

  lines.push('#### Evidence');
  lines.push('');
  lines.push(evidenceTable(report));
  lines.push('');

  if (report.notes.length > 0) {
    lines.push('#### Notes');
    lines.push('');
    for (const note of report.notes) {
      lines.push(`- ${escapeMarkdown(note, 500)}`);
    }
    lines.push('');
  }

  lines.push(
    '> This report states what was checked and what evidence was found for the listed commit. ' +
      'It makes no judgment about authorship, safety, or correctness of the contribution. ' +
      'Passing requirements mean the configured checks reported results — nothing more.',
  );
  return `${lines.join('\n')}\n`;
}

export interface GateDecision {
  /** Process exit code for CLI/Action. */
  exitCode: number;
  /** GitHub check-run conclusion to publish. */
  conclusion: 'success' | 'failure' | 'action_required';
  /** Short explanation for logs. */
  rationale: string;
}

/**
 * Translates an evaluation result into gating behavior.
 *
 * - report:    never gates (exit 0), report only.
 * - advisory:  never gates (exit 0); violations are visible as warnings.
 * - enforce:   gates on overall result "fail" (exit 1).
 *
 * Missing evidence never gates unless policy sets `enforcement.missing_evidence: fail`
 * (which is reflected in the overall result).
 */
export function gateDecision(report: EvaluationReport): GateDecision {
  const mode = report.summary.mode;
  const result = report.summary.result;

  if (result === 'error') {
    return { exitCode: 2, conclusion: 'action_required', rationale: 'Evaluation produced errors.' };
  }
  if (mode === 'enforce' && result === 'fail') {
    return {
      exitCode: 1,
      conclusion: 'failure',
      rationale: 'Enforcement mode: required rules failed.',
    };
  }
  if (mode === 'report') {
    return {
      exitCode: 0,
      conclusion: 'success',
      rationale: 'Report-only mode: results are informational.',
    };
  }
  return {
    exitCode: 0,
    conclusion: 'success',
    rationale:
      mode === 'advisory'
        ? 'Advisory mode: violations are reported as warnings.'
        : 'Enforcement mode: no required rule failed.',
  };
}

/** JSON report as an object with the contract version attached (for outputs). */
export function reportToJsonString(report: EvaluationReport): string {
  return renderJson(report);
}

/** Compact one-line summary for logs. */
export function summarize(report: EvaluationReport): string {
  const s = report.summary;
  return (
    `contribspec: result=${s.result} mode=${s.mode} pass=${s.pass} fail=${s.fail} ` +
    `missing-evidence=${s.missingEvidence} not-applicable=${s.notApplicable}`
  );
}

/** Renders untrusted text safely into a fenced block (used by explain/report extras). */
export function safeCodeBlock(content: unknown): string {
  return codeFence(content);
}

/** Re-export for consumers rendering their own output. */
export { sanitizeText } from './sanitize.js';

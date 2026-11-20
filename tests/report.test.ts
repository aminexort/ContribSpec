/**
 * Report contract tests (ADR-0004): JSON shape, honesty constraints, and safe
 * Markdown rendering of untrusted content.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateContribution,
  loadPolicyText,
  renderJson,
  renderMarkdown,
  renderText,
  type ContributionSubject,
  type EvaluationReport,
} from '@contribspec/core';
import { REPORT_CONTRACT_VERSION } from '@contribspec/schema';

const SHA = 'a'.repeat(40);

function buildReport(subjectOverrides: Partial<ContributionSubject> = {}): EvaluationReport {
  const loaded = loadPolicyText(
    `version: 1\nproject:\n  name: demo\ncontributions:\n  verification:\n    required_checks: [unit-tests]\n`,
    { path: 'contribspec.yml', source: 'test' },
  );
  assert.ok(loaded.resolved);
  return evaluateContribution({
    policy: loaded.resolved,
    subject: {
      provider: 'github',
      repository: 'acme/demo',
      number: 7,
      title: 'Add thing',
      body: 'Adds a thing.',
      author: 'alice',
      headSha: SHA,
      baseSha: 'c'.repeat(40),
      ...subjectOverrides,
    },
    evidence: [
      {
        kind: 'check_run',
        source: 'github-check-run',
        name: 'unit-tests',
        subjectSha: SHA,
        status: 'pass',
      },
    ],
    options: { generatedAt: '2025-01-01T00:00:00Z', toolVersion: 'test' },
  });
}

test('JSON report matches the documented contract shape', () => {
  const report = buildReport();
  const json = JSON.parse(renderJson(report)) as Record<string, unknown>;
  assert.equal(json.reportVersion, REPORT_CONTRACT_VERSION);
  assert.ok(json.generatedAt);
  assert.deepEqual(json.tool, { name: 'contribspec', version: 'test' });

  const policy = json.policy as Record<string, unknown>;
  assert.equal(policy.path, 'contribspec.yml');
  assert.match(String(policy.digest), /^[0-9a-f]{64}$/);
  assert.equal(policy.version, 1);

  const subjectJson = json.subject as Record<string, unknown>;
  assert.equal(subjectJson.headSha, SHA);

  const summary = json.summary as Record<string, unknown>;
  for (const key of ['result', 'mode', 'missingEvidenceMode', 'pass', 'fail', 'missingEvidence', 'notApplicable', 'error']) {
    assert.ok(key in summary, `summary.${key} missing`);
  }

  const findings = json.findings as Record<string, unknown>[];
  assert.ok(findings.length > 0);
  for (const f of findings) {
    for (const key of ['ruleId', 'requirement', 'title', 'status', 'severity', 'message', 'remediation', 'evidenceRefs', 'data']) {
      assert.ok(key in f, `finding.${key} missing`);
    }
  }

  const evidenceList = json.evidence as Record<string, unknown>[];
  assert.equal(evidenceList.length, 1);
  assert.ok(evidenceList[0]?.id);
});

test('report never uses forbidden verdict vocabulary', () => {
  const report = buildReport({
    title: 'Huge change',
    body: 'Generated with ChatGPT. I take responsibility and I understand it.',
    changedFiles: 10,
  });
  const rendered = JSON.stringify(report) + renderMarkdown(report) + renderText(report);
  const forbidden = [/\bis safe\b/i, /\bis secure\b/i, /\bis correct\b/i, /human-written/i, /\bproves?\b/i];
  for (const pattern of forbidden) {
    assert.ok(!pattern.test(rendered), `rendered output must not contain ${pattern}`);
  }
});

test('markdown rendering escapes untrusted content (no raw markup injection)', () => {
  const evil = buildReport({
    title: '<script>alert(1)</script>[click](https://evil.example) `code`',
    body: '![img](x) <b>bold</b>',
    author: 'evil_user](https://evil) - #',
  });
  const md = renderMarkdown(evil);
  assert.ok(!md.includes('<script>'));
  assert.ok(!md.includes('<b>bold</b>'));
  // Untrusted link syntax must be escaped, not rendered as a link.
  assert.ok(!/\[click\]\(https:\/\/evil\.example\)/.test(md));
  assert.ok(md.includes('\\['), 'brackets are escaped');
});

test('terminal rendering strips ANSI escapes from untrusted text', () => {
  const report = buildReport({ title: '\u001b[31mFAKE ERROR\u001b[0m legit title' });
  const text = renderText(report);
  assert.ok(!text.includes('\u001b'), 'no escape sequences in terminal output');
});

test('long untrusted strings are capped in output', () => {
  const report = buildReport({ body: 'x'.repeat(50_000) });
  const text = renderText(report);
  assert.ok(text.length < 20_000, `terminal output should be bounded, got ${text.length}`);
});

test('evidence list marks applicability and findings carry evidence refs', () => {
  const report = buildReport();
  assert.equal(report.evidence[0]?.applicable, true);
  const verFinding = report.findings.find((f) => f.ruleId === 'VER-001');
  assert.equal(verFinding?.status, 'pass');
  assert.ok((verFinding?.evidenceRefs.length ?? 0) > 0);
});
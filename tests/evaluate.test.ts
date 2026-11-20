/**
 * Evaluation engine tests: rule behavior, evidence binding (ADR-0003),
 * requirement-level severity caps, and result computation.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateContribution,
  gateDecision,
  loadPolicyText,
  type ContributionSubject,
  type Evidence,
  type Finding,
  type ResolvedPolicy,
} from '@contribspec/core';

const SHA = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);

function resolve(policyYaml: string): ResolvedPolicy {
  const loaded = loadPolicyText(policyYaml, { path: 'contribspec.yml', source: 'test' });
  assert.ok(loaded.resolved, `policy should resolve: ${JSON.stringify(loaded.diagnostics)}`);
  return loaded.resolved;
}

function subject(
  overrides: { [K in keyof ContributionSubject]?: ContributionSubject[K] | undefined } = {},
): ContributionSubject {
  const base: ContributionSubject = {
    provider: 'github',
    repository: 'acme/demo',
    title: 'Add thing',
    body: 'Adds a thing.',
    author: 'alice',
    headSha: SHA,
  };
  return Object.assign(base, overrides);
}

function evidence(items: Partial<Evidence>[] = []): Evidence[] {
  return items.map((e, i) => ({
    kind: 'check_run',
    source: 'github-check-run',
    name: `check-${i}`,
    subjectSha: SHA,
    status: 'pass',
    ...e,
  })) as Evidence[];
}

function find(findings: Finding[], ruleId: string): Finding[] {
  return findings.filter((f) => f.ruleId === ruleId);
}

const VERIFICATION_POLICY = `
version: 1
project:
  name: demo
contributions:
  verification:
    required_checks:
      - name: unit-tests
`;

test('required check with passing evidence for the head SHA passes', () => {
  const report = evaluateContribution({
    policy: resolve(VERIFICATION_POLICY),
    subject: subject(),
    evidence: evidence([{ name: 'unit-tests', status: 'pass' }]),
    options: { generatedAt: '2025-01-01T00:00:00Z' },
  });
  assert.equal(find(report.findings, 'VER-001')[0]?.status, 'pass');
});

test('failing evidence is FAIL, not missing evidence', () => {
  const report = evaluateContribution({
    policy: resolve(VERIFICATION_POLICY),
    subject: subject(),
    evidence: evidence([{ name: 'unit-tests', status: 'fail' }]),
    options: { generatedAt: '2025-01-01T00:00:00Z' },
  });
  const f = find(report.findings, 'VER-001')[0];
  assert.equal(f?.status, 'fail');
  assert.equal(report.summary.result, 'fail');
});

test('absent evidence is MISSING EVIDENCE, distinct from failure', () => {
  const report = evaluateContribution({
    policy: resolve(VERIFICATION_POLICY),
    subject: subject(),
    evidence: [],
    options: { generatedAt: '2025-01-01T00:00:00Z' },
  });
  assert.equal(find(report.findings, 'VER-001')[0]?.status, 'missing_evidence');
  assert.equal(report.summary.result, 'unverified');
});

test('evidence bound to another commit never counts; VER-002 flags it', () => {
  const report = evaluateContribution({
    policy: resolve(VERIFICATION_POLICY),
    subject: subject(),
    evidence: evidence([{ name: 'unit-tests', status: 'pass', subjectSha: OTHER }]),
    options: { generatedAt: '2025-01-01T00:00:00Z' },
  });
  assert.equal(find(report.findings, 'VER-001')[0]?.status, 'missing_evidence');
  assert.equal(find(report.findings, 'VER-002')[0]?.status, 'fail');
  const stale = report.evidence.find((e) => e.name === 'unit-tests');
  assert.equal(stale?.applicable, false);
});

test('inconclusive evidence (queued check) is missing evidence, not failure', () => {
  const report = evaluateContribution({
    policy: resolve(VERIFICATION_POLICY),
    subject: subject(),
    evidence: evidence([{ name: 'unit-tests', status: 'unknown' }]),
    options: { generatedAt: '2025-01-01T00:00:00Z' },
  });
  assert.equal(find(report.findings, 'VER-001')[0]?.status, 'missing_evidence');
  assert.equal(report.summary.result, 'unverified');
});

test('enforcement.missing_evidence: fail escalates unverified to fail', () => {
  const policy = resolve(`${VERIFICATION_POLICY}enforcement:\n  missing_evidence: fail\n`);
  const report = evaluateContribution({
    policy,
    subject: subject(),
    evidence: [],
    options: { generatedAt: '2025-01-01T00:00:00Z' },
  });
  assert.equal(find(report.findings, 'VER-001')[0]?.status, 'missing_evidence');
  assert.equal(report.summary.result, 'fail');
});

test('requirement level "encouraged" caps violations at notice severity', () => {
  const policy = resolve('version: 1\nproject:\n  name: demo\ncontributions:\n  pull_requests:\n    issue_reference: encouraged\n');
  const report = evaluateContribution({
    policy,
    subject: subject(),
    evidence: [],
    options: { generatedAt: '2025-01-01T00:00:00Z' },
  });
  const f = find(report.findings, 'PR-001')[0];
  assert.equal(f?.status, 'fail');
  assert.equal(f?.severity, 'notice');
  assert.equal(report.summary.result, 'pass', 'notice-level failures never gate');
});

test('requirement level "required" keeps error severity', () => {
  const policy = resolve('version: 1\nproject:\n  name: demo\ncontributions:\n  pull_requests:\n    issue_reference: required\n');
  const report = evaluateContribution({
    policy,
    subject: subject(),
    evidence: [],
    options: { generatedAt: '2025-01-01T00:00:00Z' },
  });
  assert.equal(find(report.findings, 'PR-001')[0]?.severity, 'error');
  assert.equal(report.summary.result, 'fail');
});

test('levels "optional" and "not_required" produce not_applicable findings', () => {
  const policy = resolve(
    'version: 1\nproject:\n  name: demo\ncontributions:\n  compliance:\n    dco: not_required\n    cla: optional\n',
  );
  const report = evaluateContribution({
    policy,
    subject: subject(),
    evidence: [],
    options: { generatedAt: '2025-01-01T00:00:00Z' },
  });
  assert.equal(find(report.findings, 'CMP-001')[0]?.status, 'not_applicable');
  assert.equal(find(report.findings, 'CMP-002')[0]?.status, 'not_applicable');
  // not_applicable findings never carry gating severity.
  for (const f of report.findings.filter((x) => x.status === 'not_applicable')) {
    assert.notEqual(f.severity, 'error');
  }
});

test('severity overrides change the effective severity and "off" disables a rule', () => {
  const policy = resolve(
    'version: 1\nproject:\n  name: demo\ncontributions:\n  pull_requests:\n    issue_reference: required\nenforcement:\n  severity_overrides:\n    PR-001: warning\n',
  );
  const report = evaluateContribution({
    policy,
    subject: subject(),
    evidence: [],
    options: { generatedAt: '2025-01-01T00:00:00Z' },
  });
  assert.equal(find(report.findings, 'PR-001')[0]?.severity, 'warning');
  assert.equal(report.summary.result, 'pass');

  const disabled = resolve(
    'version: 1\nproject:\n  name: demo\ncontributions:\n  pull_requests:\n    issue_reference: required\nenforcement:\n  severity_overrides:\n    PR-001: off\n',
  );
  const report2 = evaluateContribution({
    policy: disabled,
    subject: subject(),
    evidence: [],
    options: { generatedAt: '2025-01-01T00:00:00Z' },
  });
  assert.equal(find(report2.findings, 'PR-001').length, 0);
  assert.ok(report2.notes.some((n) => n.includes('PR-001')));
});

test('AI prohibit policy fails on a disclosure and passes on a no-AI claim', () => {
  const policy = resolve('version: 1\nproject:\n  name: demo\ncontributions:\n  ai_assistance:\n    policy: prohibit\n');
  const withDisclosure = evaluateContribution({
    policy,
    subject: subject({ body: 'This was generated with ChatGPT.' }),
    evidence: [],
    options: { generatedAt: '2025-01-01T00:00:00Z' },
  });
  assert.equal(find(withDisclosure.findings, 'AI-001')[0]?.status, 'fail');

  const withClaim = evaluateContribution({
    policy,
    subject: subject({ body: 'No AI assistance was used for this change.' }),
    evidence: [],
    options: { generatedAt: '2025-01-01T00:00:00Z' },
  });
  assert.equal(find(withClaim.findings, 'AI-001')[0]?.status, 'pass');
});

test('allow_with_disclosure reports missing disclosure as missing evidence (unknowable fact)', () => {
  const policy = resolve(
    'version: 1\nproject:\n  name: demo\ncontributions:\n  ai_assistance:\n    policy: allow_with_disclosure\n    disclosure_locations: [pull_request_body]\n    required_fields: [tools]\n',
  );
  const report = evaluateContribution({
    policy,
    subject: subject({ body: 'Fixes a bug in the parser.' }),
    evidence: [],
    options: { generatedAt: '2025-01-01T00:00:00Z' },
  });
  const f = find(report.findings, 'AI-001')[0];
  assert.equal(f?.status, 'missing_evidence');
  assert.equal(report.summary.result, 'unverified');
});

test('disclosure fields and locations are checked separately from presence', () => {
  const policy = resolve(
    'version: 1\nproject:\n  name: demo\ncontributions:\n  ai_assistance:\n    policy: allow_with_disclosure\n    disclosure_locations: [pull_request_body]\n    required_fields: [tools, scope]\n',
  );
  const report = evaluateContribution({
    policy,
    subject: subject({ body: 'AI tools: copilot' }),
    evidence: [],
    options: { generatedAt: '2025-01-01T00:00:00Z' },
  });
  assert.equal(find(report.findings, 'AI-001')[0]?.status, 'pass');
  assert.equal(find(report.findings, 'AI-002')[0]?.status, 'fail');
  assert.match(find(report.findings, 'AI-002')[0]?.message ?? '', /scope/);
});

test('require_human_verification forces accountability requirements', () => {
  const policy = resolve(
    'version: 1\nproject:\n  name: demo\ncontributions:\n  ai_assistance:\n    policy: require_human_verification\n    disclosure_locations: [pull_request_body]\n    required_fields: [tools, verification]\n  accountability:\n    human_responsibility: encouraged\n    human_understanding_attestation: encouraged\n',
  );
  const report = evaluateContribution({
    policy,
    subject: subject({
      body: 'AI tools: copilot\nVerification: ran tests',
      commits: [{ sha: SHA, message: 'feat: x', signoffs: [] }],
    }),
    evidence: [],
    options: { generatedAt: '2025-01-01T00:00:00Z' },
  });
  assert.equal(find(report.findings, 'ACC-001')[0]?.status, 'fail');
  assert.equal(find(report.findings, 'ACC-001')[0]?.severity, 'error', 'forced to required');
  assert.equal(find(report.findings, 'ACC-002')[0]?.status, 'fail');
});

test('DCO evaluation uses commit trailers; DCO evidence is a fallback', () => {
  const policy = resolve('version: 1\nproject:\n  name: demo\ncontributions:\n  compliance:\n    dco: required\n');

  const signed = evaluateContribution({
    policy,
    subject: subject({
      commits: [{ sha: SHA, message: 'feat: x\n\nSigned-off-by: A <a@b.c>', signoffs: ['A <a@b.c>'] }],
    }),
    evidence: [],
    options: { generatedAt: '2025-01-01T00:00:00Z' },
  });
  assert.equal(find(signed.findings, 'CMP-001')[0]?.status, 'pass');

  const unsigned = evaluateContribution({
    policy,
    subject: subject({ commits: [{ sha: SHA, message: 'feat: x', signoffs: [] }] }),
    evidence: [],
    options: { generatedAt: '2025-01-01T00:00:00Z' },
  });
  assert.equal(find(unsigned.findings, 'CMP-001')[0]?.status, 'fail');

  const viaEvidence = evaluateContribution({
    policy,
    subject: subject({ commits: undefined }),
    evidence: evidence([{ kind: 'dco_signoff', name: 'DCO', status: 'pass' }]),
    options: { generatedAt: '2025-01-01T00:00:00Z' },
  });
  assert.equal(find(viaEvidence.findings, 'CMP-001')[0]?.status, 'pass');
});

test('gate decisions respect enforcement mode', () => {
  const failingSubject = subject({ changedFiles: 100 });
  const policy = resolve(
    'version: 1\nproject:\n  name: demo\ncontributions:\n  pull_requests:\n    max_changed_files: 5\n',
  );
  const report = evaluateContribution({
    policy,
    subject: failingSubject,
    evidence: [],
    options: { generatedAt: '2025-01-01T00:00:00Z' },
  });
  assert.equal(report.summary.result, 'fail');
  assert.equal(gateDecision(report).exitCode, 0, 'report mode never gates');

  const enforcing = evaluateContribution({
    policy: resolve(
      'version: 1\nproject:\n  name: demo\ncontributions:\n  pull_requests:\n    max_changed_files: 5\nenforcement:\n  default_mode: enforce\n',
    ),
    subject: failingSubject,
    evidence: [],
    options: { generatedAt: '2025-01-01T00:00:00Z' },
  });
  const decision = gateDecision(enforcing);
  assert.equal(decision.exitCode, 1);
  assert.equal(decision.conclusion, 'failure');
});

test('missing policy fields produce data for report consumers', () => {
  const report = evaluateContribution({
    policy: resolve('version: 1\nproject:\n  name: demo\ncontributions:\n  pull_requests:\n    max_changed_files: 5\n'),
    subject: subject({ changedFiles: undefined }),
    evidence: [],
    options: { generatedAt: '2025-01-01T00:00:00Z' },
  });
  assert.equal(find(report.findings, 'PR-002')[0]?.status, 'missing_evidence');
});
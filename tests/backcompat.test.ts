/**
 * Backward-compatibility tests (docs/SPECIFICATION.md §9):
 *
 *  - existing v1 policy files keep validating;
 *  - documented defaults are stable;
 *  - the 1.x report contract only grows (consumers may ignore unknown fields);
 *  - extension keys keep working across engine versions.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateContribution,
  loadPolicyText,
  renderJson,
  validatePolicyText,
} from '@contribspec/core';
import { REPORT_CONTRACT_VERSION } from '@contribspec/schema';

/** The illustrative policy from the original product brief must stay valid. */
const ORIGINAL_EXAMPLE_POLICY = `version: 1

project:
  name: example-project

contributions:
  pull_requests:
    issue_reference: encouraged
    max_changed_files: 50

  ai_assistance:
    policy: allow_with_disclosure
    disclosure_location: pull_request_body
    required_fields:
      - tools
      - scope

  accountability:
    human_responsibility: required
    human_understanding_attestation: encouraged

  verification:
    required_checks:
      - unit-tests
      - type-check

  compliance:
    dco: required
    cla: optional

enforcement:
  default_mode: report
`;

test('a v1 policy from the original brief shape is accepted (modulo renamed keys)', () => {
  // `disclosure_location` (singular) was renamed to `disclosure_locations`
  // before the schema was published; everything else matches the brief.
  const adapted = ORIGINAL_EXAMPLE_POLICY.replace(
    'disclosure_location: pull_request_body',
    'disclosure_locations: [pull_request_body]',
  );
  const result = validatePolicyText(adapted);
  assert.ok(result.ok, JSON.stringify(result.diagnostics));
});

test('renamed keys produce actionable diagnostics, not silent acceptance', () => {
  const result = validatePolicyText(ORIGINAL_EXAMPLE_POLICY);
  assert.ok(!result.ok);
  const unknown = result.diagnostics.find((d) => d.code === 'SCHEMA-UNKNOWN-KEY');
  assert.ok(unknown);
  assert.match(unknown.suggestion ?? '', /disclosure_locations/);
});

test('documented defaults are stable', () => {
  const minimal = loadPolicyText('version: 1\nproject:\n  name: x\n', { path: 'p', source: 't' });
  assert.ok(minimal.resolved);
  const r = minimal.resolved;
  assert.equal(r.pullRequests.issueReference, 'encouraged');
  assert.equal(r.ai.policy, 'allow');
  assert.deepEqual(r.ai.disclosureLocations, ['pull_request_body']);
  assert.deepEqual(r.ai.requiredFields, []);
  assert.equal(r.accountability.humanResponsibility, 'encouraged');
  assert.equal(r.accountability.humanUnderstandingAttestation, 'encouraged');
  assert.deepEqual(r.verification.requiredChecks, []);
  assert.equal(r.verification.requireHeadShaMatch, true);
  assert.equal(r.compliance.dco, 'not_required');
  assert.equal(r.compliance.cla, 'not_required');
  assert.equal(r.enforcement.mode, 'report');
  assert.equal(r.enforcement.missingEvidence, 'report');
});

test('policies with extension keys from other tools keep evaluating identically', () => {
  const withExtensions = loadPolicyText(
    `version: 1\nproject:\n  name: x\nx-vendor-tool:\n  config: anything\ncontributions:\n  pull_requests:\n    issue_reference: required\n    x-internal: 42\n`,
    { path: 'p', source: 't' },
  );
  assert.ok(withExtensions.resolved);
  assert.equal(withExtensions.resolved.pullRequests.issueReference, 'required');
});

test('report contract 1.x is additive: unknown fields can be ignored by consumers', () => {
  const loaded = loadPolicyText('version: 1\nproject:\n  name: x\n', { path: 'p', source: 't' });
  assert.ok(loaded.resolved);
  const report = evaluateContribution({
    policy: loaded.resolved,
    subject: {
      provider: 'local',
      repository: 'acme/x',
      title: 't',
      body: 'b',
      author: 'a',
      headSha: 'a'.repeat(40),
    },
    evidence: [],
    options: { generatedAt: '2025-01-01T00:00:00Z' },
  });
  const json = JSON.parse(renderJson(report)) as Record<string, unknown>;
  // A naive consumer reading only the documented core fields still works.
  assert.equal(json.reportVersion, REPORT_CONTRACT_VERSION);
  assert.ok(json.summary);
  assert.ok(Array.isArray(json.findings));
  // Unknown fields must be ignored, not fatal — simulate by deleting them.
  const copy = { ...json };
  delete copy.notes;
  delete copy.evidence;
  assert.ok(copy.summary);
});

test('policy digest is deterministic for identical content', () => {
  const text = 'version: 1\nproject:\n  name: x\n';
  const a = loadPolicyText(text, { path: 'p', source: 't' });
  const b = loadPolicyText(text, { path: 'p', source: 't' });
  assert.equal(a.resolved?.digest, b.resolved?.digest);
});

test('evaluation output is deterministic for fixed timestamps', () => {
  const loaded = loadPolicyText('version: 1\nproject:\n  name: x\n', { path: 'p', source: 't' });
  assert.ok(loaded.resolved);
  const run = () =>
    JSON.stringify(
      evaluateContribution({
        policy: loaded.resolved!,
        subject: {
          provider: 'local',
          repository: 'acme/x',
          title: 't',
          body: 'b',
          author: 'a',
          headSha: 'a'.repeat(40),
        },
        evidence: [],
        options: { generatedAt: '2025-01-01T00:00:00Z' },
      }),
    );
  assert.equal(run(), run());
});
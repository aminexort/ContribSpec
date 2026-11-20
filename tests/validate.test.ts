/**
 * Policy validation tests: schema layer, unknown-key detection with
 * suggestions, and the semantic layer.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editDistance, validatePolicyText, validatePolicyValue } from '@contribspec/core';

function codes(text: string): string[] {
  return validatePolicyText(text).diagnostics.map((d) => d.code);
}

test('a minimal policy validates', () => {
  const result = validatePolicyText('version: 1\nproject:\n  name: demo\n');
  assert.ok(result.ok);
  assert.equal(result.document?.project.name, 'demo');
});

test('missing required properties are reported with exact paths', () => {
  const result = validatePolicyText('project:\n  name: demo\n');
  assert.ok(!result.ok);
  const missing = result.diagnostics.find((d) => d.code === 'SCHEMA-MISSING');
  assert.ok(missing);
  assert.equal(missing.path, 'version');
});

test('unknown keys fail with a "did you mean" suggestion', () => {
  const result = validatePolicyText(
    'version: 1\nproject:\n  name: demo\ncontributions:\n  pull_request:\n    issue_reference: required\n',
  );
  assert.ok(!result.ok);
  const unknown = result.diagnostics.find((d) => d.code === 'SCHEMA-UNKNOWN-KEY');
  assert.ok(unknown);
  assert.equal(unknown.path, 'contributions.pull_request');
  assert.match(unknown.suggestion ?? '', /pull_requests/);
});

test('unknown keys nested inside arrays are caught', () => {
  const result = validatePolicyText(
    'version: 1\nproject:\n  name: demo\ncontributions:\n  verification:\n    required_checks:\n      - name: unit-tests\n        severrity: error\n',
  );
  assert.ok(!result.ok);
  const unknown = result.diagnostics.find((d) => d.code === 'SCHEMA-UNKNOWN-KEY');
  assert.ok(unknown);
  assert.match(unknown.suggestion ?? '', /severity/);
});

test('x- extension keys are allowed anywhere and preserved', () => {
  const result = validatePolicyText(
    'version: 1\nproject:\n  name: demo\nx-custom: {nested: true}\ncontributions:\n  pull_requests:\n    x-internal-note: hello\n    issue_reference: required\n',
  );
  assert.ok(result.ok, JSON.stringify(result.diagnostics));
  const doc = result.document as unknown as Record<string, unknown>;
  assert.deepEqual(doc['x-custom'], { nested: true });
});

test('invalid enum values list the allowed set', () => {
  const result = validatePolicyText(
    'version: 1\nproject:\n  name: demo\ncontributions:\n  ai_assistance:\n    policy: allow_with_magic\n',
  );
  assert.ok(!result.ok);
  const diag = result.diagnostics.find((d) => d.code === 'SCHEMA-TYPE');
  assert.ok(diag);
  assert.match(diag.message, /allow_with_disclosure/);
});

test('wrong value types are rejected (string where integer expected)', () => {
  const result = validatePolicyText(
    'version: 1\nproject:\n  name: demo\ncontributions:\n  pull_requests:\n    max_changed_files: "fifty"\n',
  );
  assert.ok(!result.ok);
  assert.ok(result.diagnostics.some((d) => d.code === 'SCHEMA-TYPE'));
});

test('policy version must be 1 — future versions are rejected, not guessed', () => {
  assert.ok(codes('version: 2\nproject:\n  name: demo\n').includes('SCHEMA-TYPE'));
});

test('semantic layer rejects an uncompilable title_pattern', () => {
  const result = validatePolicyText(
    'version: 1\nproject:\n  name: demo\ncontributions:\n  pull_requests:\n    title_pattern: "([unclosed"\n',
  );
  assert.ok(!result.ok);
  assert.ok(result.diagnostics.some((d) => d.code === 'SEM-REGEX'));
});

test('semantic layer warns about unknown rule ids in severity_overrides', () => {
  const result = validatePolicyText(
    'version: 1\nproject:\n  name: demo\nenforcement:\n  severity_overrides:\n    PR-002: warning\n    ZZ-999: error\n',
  );
  assert.ok(result.ok, 'unknown rule id is forward-compatible, not fatal');
  const warn = result.diagnostics.find((d) => d.code === 'SEM-UNKNOWN-RULE');
  assert.ok(warn);
  assert.equal(warn.severity, 'warning');
});

test('semantic layer flags contradictory AI settings as warnings', () => {
  const result = validatePolicyText(
    'version: 1\nproject:\n  name: demo\ncontributions:\n  ai_assistance:\n    policy: prohibit\n    required_fields: [tools]\n',
  );
  assert.ok(result.ok, 'contradictions are warnings, not errors');
  assert.ok(result.diagnostics.some((d) => d.code === 'SEM-CONTRADICTION'));
});

test('rejects non-object policies with a clear message', () => {
  for (const text of ['- a\n- list\n', 'just a string\n', '42\n']) {
    const result = validatePolicyText(text);
    assert.ok(!result.ok);
    assert.ok((result.diagnostics[0]?.message ?? '').length > 0);
  }
});

test('editDistance suggests close keys but not distant ones', () => {
  assert.equal(editDistance('pull_request', 'pull_requests'), 1);
  assert.ok(editDistance('completely', 'different') >= 3);
  assert.equal(validatePolicyValue({}).diagnostics.length > 0, true);
});

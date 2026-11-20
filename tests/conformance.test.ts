/**
 * Conformance suite tests: the built-in cases pass against the current
 * engine, and the runner itself reports honest results.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import {
  loadConformanceCases,
  runConformanceCase,
  runConformanceSuite,
  ConformanceFormatError,
} from '@contribspec/core';
import { conformanceDir } from '@contribspec/test-fixtures';
import { makeTempDir, cleanupTempDir, writeTempFile } from './helpers.js';

test('the built-in conformance suite loads and every case passes', () => {
  const cases = loadConformanceCases(conformanceDir());
  assert.ok(cases.length >= 9, `expected at least 9 cases, got ${cases.length}`);
  const results = runConformanceSuite(cases);
  for (const result of results) {
    assert.ok(result.passed, `case ${result.name} failed: ${result.failures.join('; ')}`);
  }
});

test('the suite covers the AI policies and the evidence states', () => {
  const names = loadConformanceCases(conformanceDir()).map((c) => c.name);
  for (const expected of [
    'minimal-pass',
    'ai-disclosure-missing',
    'ai-disclosure-incomplete',
    'ai-prohibited',
    'human-verification-required',
    'check-evidence-failed',
    'check-evidence-stale',
    'dco-missing',
    'pr-limits-exceeded',
  ]) {
    assert.ok(names.includes(expected), `missing case ${expected}`);
  }
});

test('the conformance runner reports failures honestly (negative control)', () => {
  const dir = makeTempDir();
  try {
    const caseDir = join(dir, 'wrong-expectation');
    writeTempFile(
      caseDir,
      'policy.yml',
      'version: 1\nproject:\n  name: x\ncontributions:\n  pull_requests:\n    issue_reference: required\n',
    );
    writeTempFile(
      caseDir,
      'contribution.json',
      JSON.stringify({
        provider: 'local',
        repository: 'acme/x',
        title: 'no issue ref',
        body: 'none',
        author: 'a',
        headSha: 'a'.repeat(40),
      }),
    );
    writeTempFile(
      caseDir,
      'expected.json',
      JSON.stringify({ findings: [{ ruleId: 'PR-001', status: 'pass' }] }),
    );
    const [case1] = loadConformanceCases(dir);
    assert.ok(case1);
    const result = runConformanceCase(case1);
    assert.ok(!result.passed);
    assert.ok(result.failures.some((f) => f.includes('PR-001')));
  } finally {
    cleanupTempDir(dir);
  }
});

test('incomplete case directories are rejected with a format error', () => {
  const dir = makeTempDir();
  try {
    writeTempFile(join(dir, 'broken'), 'policy.yml', 'version: 1\n');
    assert.throws(() => loadConformanceCases(dir), ConformanceFormatError);
  } finally {
    cleanupTempDir(dir);
  }
});

test('a case with an invalid policy fails cleanly (no crash)', () => {
  const result = runConformanceCase({
    name: 'invalid-policy',
    policyText: 'version: 99\nproject:\n  name: x\n',
    subject: {
      provider: 'local',
      repository: 'acme/x',
      title: 't',
      body: 'b',
      author: 'a',
      headSha: 'a'.repeat(40),
    },
    evidence: [],
    expected: { result: 'pass' },
  });
  assert.ok(!result.passed);
  assert.ok(result.failures[0]?.includes('policy did not validate'));
});

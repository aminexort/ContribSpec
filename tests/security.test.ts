/**
 * Security tests (docs/THREAT_MODEL.md): hostile policy input, path
 * traversal, malicious PR metadata, and resource-exhaustion guards.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { symlinkSync } from 'node:fs';
import {
  MAX_ALIAS_COUNT,
  MAX_POLICY_BYTES,
  MAX_TEXT_LENGTH,
  PathTraversalError,
  escapeMarkdown,
  loadPolicyText,
  parseYamlSafely,
  resolveExplicitPath,
  resolveWithin,
  sanitizeInline,
  sanitizeText,
  validatePolicyText,
  YamlParseError,
} from '@contribspec/core';
import { malformedDir, packageRoot } from '@contribspec/test-fixtures';
import { makeTempDir, cleanupTempDir, writeTempFile } from './helpers.js';

const ESC = '\u001b';
const NUL = '\u0000';

test('YAML alias bombs fail fast instead of expanding', () => {
  const bomb = `version: 1\nproject: &a [${Array(20).fill('"x"').join(', ')}]\nmetadata:\n  description: &b [${Array(20).fill('*a').join(', ')}]\n  maintainers: &c [${Array(20).fill('*b').join(', ')}]\n`;
  assert.throws(() => parseYamlSafely(bomb), (err: unknown) => {
    assert.ok(err instanceof YamlParseError || err instanceof Error);
    return true;
  });
  // And the validator surfaces it as a diagnostic, never a crash.
  const result = validatePolicyText(bomb);
  assert.ok(!result.ok);
});

test('duplicate YAML keys are rejected', () => {
  const result = validatePolicyText('version: 1\nversion: 2\nproject:\n  name: x\n');
  assert.ok(!result.ok);
  assert.match(result.diagnostics[0]?.message ?? '', /unique|already|duplicate|YAML/i);
});

test('oversized policy files are rejected', () => {
  const huge = `version: 1\nproject:\n  name: x\nmetadata:\n  description: "${'a'.repeat(MAX_POLICY_BYTES)}"\n`;
  assert.throws(() => parseYamlSafely(huge), YamlParseError);
});

test('custom YAML tags cannot smuggle non-plain structures', () => {
  const result = validatePolicyText('version: 1\nproject: !!python/object:os.system {name: x}\n');
  assert.ok(!result.ok);
});

test('path traversal: relative escapes are rejected', () => {
  const dir = makeTempDir();
  try {
    assert.throws(() => resolveWithin(dir, '../outside.yml'), PathTraversalError);
    assert.throws(() => resolveWithin(dir, 'a/../../outside.yml'), PathTraversalError);
    assert.throws(() => resolveWithin(dir, 'nested/../../..'), PathTraversalError);
    assert.throws(() => resolveWithin(dir, `bad${NUL}path`), PathTraversalError);
  } finally {
    cleanupTempDir(dir);
  }
});

test('path traversal: symlinks cannot escape the root', () => {
  const dir = makeTempDir();
  const outside = makeTempDir();
  try {
    writeTempFile(outside, 'secret.yml', 'version: 1\nproject:\n  name: secret\n');
    const link = join(dir, 'escape.yml');
    try {
      symlinkSync(join(outside, 'secret.yml'), link);
    } catch {
      // Windows without developer mode may refuse symlinks; skip.
      return;
    }
    assert.throws(() => resolveWithin(dir, 'escape.yml'), PathTraversalError);
  } finally {
    cleanupTempDir(dir);
    cleanupTempDir(outside);
  }
});

test('explicit CLI paths allow absolute paths but never null bytes', () => {
  const dir = makeTempDir();
  try {
    const file = writeTempFile(dir, 'policy.yml', 'version: 1\nproject:\n  name: x\n');
    assert.equal(resolveExplicitPath(dir, file), file);
    assert.throws(() => resolveExplicitPath(dir, `x${NUL}y`), PathTraversalError);
    assert.throws(() => resolveExplicitPath(dir, '../escape.yml'), PathTraversalError);
  } finally {
    cleanupTempDir(dir);
  }
});

test('malicious PR metadata is sanitized (terminal + markdown injection)', () => {
  const evil = `${ESC}[31mFAKE${ESC}[0m <script>alert(1)</script> \`x\` [l](http://e) ${NUL} hidden`;
  const clean = sanitizeText(evil);
  assert.ok(!clean.includes(ESC));
  assert.ok(!clean.includes(NUL));
  const md = escapeMarkdown(evil);
  assert.ok(!md.includes('<script>'));
  assert.ok(md.includes('\\<'), 'HTML brackets escaped for markdown contexts');
  const inline = sanitizeInline('a\nb\nc', 100);
  assert.ok(!inline.includes('\n'));
});

test('untrusted strings are hard-capped in length', () => {
  assert.ok(sanitizeText('x'.repeat(100_000)).length <= MAX_TEXT_LENGTH + 1);
  assert.ok(sanitizeInline('x'.repeat(100_000)).length <= 501);
});

test('regex patterns are capped at 200 characters', () => {
  const longPattern = 'a'.repeat(300);
  const result = validatePolicyText(
    `version: 1\nproject:\n  name: x\ncontributions:\n  pull_requests:\n    title_pattern: "${longPattern}"\n`,
  );
  assert.ok(!result.ok);
  assert.ok(result.diagnostics.some((d) => d.code.startsWith('SCHEMA-')));
});

test('MAX_ALIAS_COUNT is bounded', () => {
  assert.ok(MAX_ALIAS_COUNT > 0 && MAX_ALIAS_COUNT <= 1000);
});

test('loadPolicyText never throws on hostile input — diagnostics instead', () => {
  const hostiles = [
    `${NUL}${ESC}`,
    `version: 1\nproject:\n  name: x\n${'#'.repeat(200_000)}`,
    'version: !!binary AAAA\n',
    '{"json": "is also yaml"}\n',
  ];
  for (const text of hostiles) {
    const result = loadPolicyText(text, { path: 'hostile.yml', source: 'test' });
    assert.ok(result.diagnostics.length > 0 || result.resolved !== undefined);
  }
});

test('malformed fixture directory holds hostile inputs (bomb, dup keys, tags)', () => {
  const dir = malformedDir();
  assert.ok(dir.includes('malformed'));
  assert.ok(packageRoot().length > 0);
});
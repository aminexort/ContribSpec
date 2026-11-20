/**
 * Schema conformance tests: the normative schema, the generated module, and
 * the sample policy fixtures.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  POLICY_SCHEMA_ID,
  POLICY_SCHEMA_VERSION,
  REPORT_CONTRACT_VERSION,
  RULES,
  RULE_IDS,
  RULE_ID_PATTERN,
  policySchemaJson,
} from '@contribspec/schema';
import { validatePolicyText } from '@contribspec/core';
import { malformedDir, packageRoot, policiesDir } from '@contribspec/test-fixtures';

const schemaPkgRoot = join(packageRoot(), '..', 'schema');
const repoRoot = join(packageRoot(), '..', '..');

test('schema constants are stable public contract', () => {
  assert.equal(POLICY_SCHEMA_VERSION, 1);
  assert.equal(REPORT_CONTRACT_VERSION, '1.0');
  assert.equal(POLICY_SCHEMA_ID, 'https://contribspec.dev/schema/contribspec-policy-v1.json');
});

test('embedded schema matches the normative JSON file', () => {
  const jsonPath = join(schemaPkgRoot, 'schema', 'contribspec-policy-v1.schema.json');
  const fromDisk = JSON.parse(readFileSync(jsonPath, 'utf8')) as unknown;
  assert.deepEqual(policySchemaJson, fromDisk);
});

test('schema codegen is fresh (generated module has no drift)', () => {
  const before = readFileSync(join(schemaPkgRoot, 'src', 'generated-schema.ts'), 'utf8');
  execFileSync(process.execPath, [join(repoRoot, 'scripts', 'gen-schema-module.mjs')], {
    cwd: repoRoot,
  });
  const after = readFileSync(join(schemaPkgRoot, 'src', 'generated-schema.ts'), 'utf8');
  assert.equal(after, before, 'run "node scripts/gen-schema-module.mjs" and commit the result');
});

test('schema is valid draft 2020-12 with required meta fields', () => {
  const schema = policySchemaJson as Record<string, unknown>;
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.$id, POLICY_SCHEMA_ID);
  assert.deepEqual(schema.required, ['version', 'project']);
});

test('every rule in the catalog has a unique id and stable fields', () => {
  const seen = new Set<string>();
  for (const id of RULE_IDS) {
    const rule = RULES[id];
    assert.ok(!seen.has(id), `duplicate rule id ${id}`);
    seen.add(id);
    assert.match(id, RULE_ID_PATTERN);
    assert.equal(rule.id, id);
    assert.ok(rule.title.length > 0);
    assert.ok(rule.description.length > 20);
    assert.ok(rule.remediation.length > 10);
  }
  // 14 rules in v1.
  assert.equal(RULE_IDS.length, 14);
});

test('all sample policy fixtures validate', () => {
  const dir = policiesDir();
  const files = readdirSync(dir).filter((f) => f.endsWith('.yml'));
  assert.ok(files.length >= 3);
  for (const file of files) {
    const result = validatePolicyText(readFileSync(join(dir, file), 'utf8'));
    assert.ok(result.ok, `${file} should validate: ${JSON.stringify(result.diagnostics)}`);
  }
});

test('all malformed policy fixtures fail validation with useful diagnostics', () => {
  const dir = malformedDir();
  const files = readdirSync(dir).filter((f) => f.endsWith('.yml'));
  assert.ok(files.length >= 8);
  for (const file of files) {
    const result = validatePolicyText(readFileSync(join(dir, file), 'utf8'));
    assert.ok(!result.ok, `${file} should NOT validate`);
    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    assert.ok(errors.length > 0, `${file} must produce error diagnostics`);
    for (const d of errors) {
      assert.ok(d.code.length > 0, 'diagnostic needs a code');
      assert.ok(d.path.length > 0, 'diagnostic needs a path');
      assert.ok(d.message.length > 0, 'diagnostic needs a message');
    }
  }
});
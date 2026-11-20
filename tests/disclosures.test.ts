/**
 * Disclosure parsing tests — heuristics over untrusted text; output is always
 * a recorded claim, never a verified fact.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyStatement,
  collectDisclosures,
  hasIssueReference,
  hasResponsibilityClaim,
  hasUnderstandingClaim,
  parseSignoffs,
} from '@contribspec/core';

test('negative AI statements are recognized', () => {
  for (const text of [
    'No AI assistance was used.',
    'This change was written without AI help.',
    'AI usage: none',
    'Not AI-generated.',
    'Written entirely by humans.',
  ]) {
    assert.equal(classifyStatement(text)?.kind, 'negative', text);
  }
});

test('affirmative AI statements are recognized and fields extracted', () => {
  const result = classifyStatement(
    'AI tools: copilot, chatgpt\nScope: generated the parser module\nVerification: ran unit tests',
  );
  assert.equal(result?.kind, 'affirmative');
  assert.equal(result?.fields.tools, 'copilot, chatgpt');
  assert.equal(result?.fields.scope, 'generated the parser module');
  assert.equal(result?.fields.verification, 'ran unit tests');
});

test('unrelated text makes no statement', () => {
  assert.equal(classifyStatement('Fixes a typo in the README.'), undefined);
});

test('commit trailers are collected as disclosure locations', () => {
  const disclosures = collectDisclosures('', [
    { sha: 'a'.repeat(40), message: 'feat: x\n\nAI-Assisted: yes\nTools: copilot', signoffs: [] },
  ]);
  assert.equal(disclosures.length, 1);
  assert.equal(disclosures[0]?.location, 'commit_trailer');
  assert.equal(disclosures[0]?.kind, 'affirmative');
});

test('sign-off trailers are parsed', () => {
  const signoffs = parseSignoffs('feat: x\n\nSigned-off-by: Alice <alice@example.com>\nSigned-off-by: Bob <bob@example.com>\n');
  assert.deepEqual(signoffs, ['Alice <alice@example.com>', 'Bob <bob@example.com>']);
});

test('issue references are detected in title or body', () => {
  assert.ok(hasIssueReference('Fix parser #42', ''));
  assert.ok(hasIssueReference('Fix parser', 'Fixes #123'));
  assert.ok(hasIssueReference('Fix parser', 'See GH-45 for context'));
  assert.ok(!hasIssueReference('Fix parser', 'No related issue.'));
});

test('responsibility and understanding claims are detected separately', () => {
  const body = 'I take responsibility for this change and I understand the change.';
  assert.ok(hasResponsibilityClaim(body, undefined));
  assert.ok(hasUnderstandingClaim(body, undefined));

  const signoffOnly = 'Responsible? sure.';
  assert.ok(!hasResponsibilityClaim(signoffOnly, undefined));

  assert.ok(
    hasResponsibilityClaim('', [{ sha: 'a'.repeat(40), message: 'x', signoffs: ['A <a@b>'] }]),
    'a sign-off counts as a responsibility claim',
  );
});

test('disclosure text is sanitized (control chars stripped)', () => {
  const disclosures = collectDisclosures('AI tools: copilot\u0000\u001b[31m red', undefined);
  assert.equal(disclosures.length, 1);
  assert.ok(!disclosures[0]?.text.includes('\u0000'));
  assert.ok(!disclosures[0]?.text.includes('\u001b'));
});
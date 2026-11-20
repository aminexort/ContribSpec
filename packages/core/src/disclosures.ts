/**
 * Disclosure and attestation parsing.
 *
 * These parsers recognize a recommended disclosure template and a few common
 * phrasings. They are heuristics over untrusted text, and their output is
 * recorded as *claims* — ContribSpec never asserts that a claim is true and
 * never infers authorship from it (docs/SPECIFICATION.md §6).
 */

import type { DisclosureField } from '@contribspec/schema';
import type { Disclosure, CommitInfo } from './types.js';
import { sanitizeInline, sanitizeText } from './sanitize.js';

/** Field labels recognized in affirmative disclosures. */
const FIELD_PATTERNS: Record<Exclude<DisclosureField, 'other'>, RegExp> = {
  tools: /\b(?:ai\s+)?tools?\s*:\s*(.+)/i,
  scope: /\bscope\s*:\s*(.+)/i,
  verification: /\bverifi(?:cation|ed)\s*:\s*(.+)/i,
  review_process: /\breview(?:\s+process)?\s*:\s*(.+)/i,
};

/** Phrasings that state AI assistance was NOT used. */
const NEGATIVE_PATTERNS: RegExp[] = [
  /\bno\s+(?:ai|llm|generative\s+ai)[-\s]?(?:assistance|assisted|generated|usage|used|tools?)?\b/i,
  /\bwithout\s+(?:ai|llm)\s+(?:assistance|help|tools?)\b/i,
  /\b(?:ai|llm)\s+(?:assistance|usage|tools?)\s*:\s*(?:no|none|n\/a)\b/i,
  /\bnot\s+(?:ai|llm)[-\s]?(?:generated|assisted)\b/i,
  /\bwritten\s+(?:entirely\s+)?by\s+(?:a\s+)?humans?\b/i,
];

/** Phrasings that state AI assistance WAS used. */
const AFFIRMATIVE_PATTERNS: RegExp[] = [
  /\b(?:ai|llm)\s+(?:assistance|usage|tools?|generated\s+\w+)\s*:\s*(?:yes|true|used)\b/i,
  /\b(?:ai|llm)[-\s](?:assisted|generated|aided)\b/i,
  /\bgenerated\s+(?:with|by)\s+(?:an?\s+)?(?:ai|llm|chatgpt|copilot|claude|gemini|codex)\b/i,
  /\b(?:used|using|with)\s+(?:the\s+)?(?:ai|chatgpt|copilot|claude|gemini|codex|cursor|llm)\b/i,
  /\b(?:tools?|ai)\s*:\s*[^\n]*(?:chatgpt|copilot|claude|gemini|codex|cursor|llm)\b/i,
  /^\s*[-*]\s*\[[xX]\]\s*[^\n]{0,40}\b(?:ai|llm)\b[^\n]{0,60}(?:used|assisted|generated|yes)\b/m,
];

const UNDERSTANDING_PATTERN = /\bI\s+(?:have\s+)?understand\b|\bunderstand(?:s|ing)?\s+(?:the|this)\s+(?:change|contribution|code)\b/i;
const RESPONSIBILITY_PATTERN =
  /\bI\s+(?:take|accept)\s+responsibility\b|\bI\s+certify\b|\bon\s+behalf\s+of\b|\bsigned[- ]off\b|\bmy\s+(?:own\s+)?contribution\b/i;
const ISSUE_PATTERN = /#\d{1,7}\b|\b(?:GH|issue)[-\s#]?\d{1,7}\b/i;

function extractFields(text: string): Partial<Record<DisclosureField, string>> {
  const fields: Partial<Record<DisclosureField, string>> = {};
  for (const [field, pattern] of Object.entries(FIELD_PATTERNS) as [
    Exclude<DisclosureField, 'other'>,
    RegExp,
  ][]) {
    const match = text.match(pattern);
    if (match?.[1]) {
      fields[field] = sanitizeInline(match[1], 500);
    }
  }
  return fields;
}

/**
 * Classifies a block of text. Returns undefined when the text makes no
 * recognizable statement about AI assistance.
 */
export function classifyStatement(
  text: string,
): { kind: 'affirmative' | 'negative'; fields: Partial<Record<DisclosureField, string>> } | undefined {
  const affirmative = AFFIRMATIVE_PATTERNS.some((p) => p.test(text));
  const negative = NEGATIVE_PATTERNS.some((p) => p.test(text));
  if (affirmative) {
    return { kind: 'affirmative', fields: extractFields(text) };
  }
  if (negative) {
    return { kind: 'negative', fields: {} };
  }
  return undefined;
}

/** Parses commit trailers relevant to AI disclosure (e.g. `AI-Assisted: yes`). */
const TRAILER_PATTERN = /^([A-Za-z][A-Za-z0-9-]{1,40}):\s*(.*)$/;

const AI_TRAILER_NAMES = new Set([
  'ai-assisted',
  'ai-assistance',
  'ai-tools',
  'ai-used',
  'generated-with',
  'generated-by',
  'ai-generated',
]);

/**
 * Collects disclosure statements from the pull request body and commit
 * trailers. Only the channels listed here are searched; a statement found
 * elsewhere is not counted (documented in docs/SPECIFICATION.md §6).
 */
export function collectDisclosures(
  body: string,
  commits: CommitInfo[] | undefined,
): Disclosure[] {
  const out: Disclosure[] = [];

  const cleanBody = sanitizeText(body);
  if (cleanBody.trim()) {
    const classified = classifyStatement(cleanBody);
    if (classified) {
      out.push({
        kind: classified.kind,
        location: 'pull_request_body',
        text: sanitizeText(cleanBody, 2000),
        fields: classified.fields,
      });
    }
  }

  for (const commit of commits ?? []) {
    const lines = commit.message.split('\n');
    for (const line of lines) {
      const match = TRAILER_PATTERN.exec(line.trim());
      if (!match) {
        continue;
      }
      const name = (match[1] ?? '').toLowerCase();
      const value = match[2] ?? '';
      if (!AI_TRAILER_NAMES.has(name)) {
        continue;
      }
      const classified = classifyStatement(`${name}: ${value}`) ?? {
        kind: 'affirmative' as const,
        fields: extractFields(value),
      };
      out.push({
        kind: classified.kind,
        location: 'commit_trailer',
        text: sanitizeInline(`${name}: ${value}`, 1000),
        fields: classified.fields,
      });
    }
  }

  return out;
}

/** True when the text contains a tracking-issue reference. */
export function hasIssueReference(title: string, body: string): boolean {
  return ISSUE_PATTERN.test(title) || ISSUE_PATTERN.test(body);
}

/** True when the text records a human-responsibility claim. */
export function hasResponsibilityClaim(body: string, commits: CommitInfo[] | undefined): boolean {
  if (RESPONSIBILITY_PATTERN.test(body)) {
    return true;
  }
  return (commits ?? []).some(
    (c) => c.signoffs && c.signoffs.length > 0,
  );
}

/** True when the text records an understanding claim. */
export function hasUnderstandingClaim(body: string, commits: CommitInfo[] | undefined): boolean {
  if (UNDERSTANDING_PATTERN.test(body)) {
    return true;
  }
  return (commits ?? []).some((c) => UNDERSTANDING_PATTERN.test(c.message));
}

/** Parses `Signed-off-by:` trailers from a commit message. */
export function parseSignoffs(message: string): string[] {
  const out: string[] = [];
  for (const line of message.split('\n')) {
    const match = /^Signed-off-by:\s*(.+)$/i.exec(line.trim());
    if (match?.[1]) {
      out.push(sanitizeInline(match[1], 200));
    }
  }
  return out;
}
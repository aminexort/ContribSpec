/**
 * Sanitization primitives for untrusted strings (threat model T7/T9).
 *
 * Everything that originates from a pull request — title, body, author login,
 * branch names, commit messages — passes through these helpers before it is
 * logged, rendered into Markdown/HTML, or written into a report.
 */

/** Hard cap for any single untrusted string kept in memory or output. */
export const MAX_TEXT_LENGTH = 10_000;

/** Cap for large blobs (e.g. commit messages) summarized into reports. */
export const MAX_SUMMARY_LENGTH = 2_000;

/* eslint-disable no-control-regex -- sanitizers must match control characters */
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g;
// ANSI/VT escape sequences (CSI, OSC, single-char escapes).
const ANSI_SEQUENCES =
  /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*(?:\u0007|\u001b\\)|\u001b[@-Z\\-_]/g;
const BIDI_OVERRIDES = /[\u202a-\u202e\u2066-\u2069]/g;
/* eslint-enable no-control-regex */

/**
 * Strips control characters, terminal escape sequences and bidi overrides,
 * normalizes newlines, and caps the length. Never throws.
 */
export function sanitizeText(input: unknown, maxLength: number = MAX_TEXT_LENGTH): string {
  if (typeof input !== 'string') {
    return '';
  }
  const cleaned = input
    .replace(/\r\n?/g, '\n')
    .replace(ANSI_SEQUENCES, '')
    .replace(CONTROL_CHARS, '')
    .replace(BIDI_OVERRIDES, '');
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength)}…` : cleaned;
}

/** Single-line variant: newlines collapse to spaces (for logs and inline fields). */
export function sanitizeInline(input: unknown, maxLength: number = 500): string {
  return sanitizeText(input, maxLength).replace(/\n+/g, ' ').trim();
}

/**
 * Escapes Markdown/HTML metacharacters so untrusted text cannot inject markup
 * into check-run summaries or generated Markdown documents.
 */
export function escapeMarkdown(input: unknown, maxLength: number = MAX_TEXT_LENGTH): string {
  const text = sanitizeText(input, maxLength);
  return text.replace(/[\\`*_{}[\]()#+\-.!|<>~^$&%]/g, (ch) => `\\${ch}`);
}

/** Renders a code-fenced block that cannot be broken out of by backticks in the content. */
export function codeFence(content: unknown, maxLength: number = MAX_TEXT_LENGTH): string {
  const text = sanitizeText(content, maxLength);
  // A fence of three backticks is escaped by using four when content contains triples.
  const fence = text.includes('```') ? '````' : '```';
  return `${fence}\n${text}\n${fence}`;
}

/** Enforces a numeric/boolean/string data value is safe for report data bags. */
export function sanitizeDataValue(value: unknown): string | number | boolean {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  return sanitizeInline(value, 300);
}

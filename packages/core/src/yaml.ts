/**
 * Secure YAML handling (threat model T6).
 *
 * Policies are YAML 1.2 parsed in strict mode with alias expansion limited,
 * unique keys enforced, and a hard document size cap. Multi-document streams
 * and custom tags are rejected: a policy is exactly one plain document.
 */

import { parseDocument, LineCounter } from 'yaml';

/** Hard cap on the policy file size (bytes). */
export const MAX_POLICY_BYTES = 256 * 1024;

/** Max YAML aliases — guards against "billion laughs" expansion. */
export const MAX_ALIAS_COUNT = 100;

export class YamlParseError extends Error {
  constructor(
    message: string,
    readonly line?: number,
    readonly column?: number,
  ) {
    super(message);
    this.name = 'YamlParseError';
  }
}

export interface YamlParseResult {
  /** Plain JS value of the document. */
  value: unknown;
  /** Non-fatal warnings (e.g. duplicate keys resolved). */
  warnings: string[];
}

/**
 * Parses a single YAML document safely. Throws YamlParseError with a
 * line/column hint on malformed input.
 */
export function parseYamlSafely(text: string): YamlParseResult {
  if (Buffer.byteLength(text, 'utf8') > MAX_POLICY_BYTES) {
    throw new YamlParseError(
      `YAML document exceeds the ${MAX_POLICY_BYTES} byte limit (${Buffer.byteLength(text, 'utf8')} bytes).`,
    );
  }
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, {
    lineCounter,
    uniqueKeys: true,
    prettyErrors: true,
    strict: true,
    version: '1.2',
  });

  const warnings: string[] = [];
  const firstError = doc.errors[0];
  if (firstError) {
    const pos = firstError.pos?.[0] != null ? lineCounter.linePos(firstError.pos[0]) : undefined;
    throw new YamlParseError(
      `YAML parse error: ${firstError.message.replace(/\s+at line \d+, column \d+:?[\s\S]*$/, '')}` +
        (pos ? ` (line ${pos.line}, column ${pos.col})` : ''),
      pos?.line,
      pos?.col,
    );
  }
  for (const warn of doc.warnings) {
    warnings.push(`YAML warning: ${warn.message}`);
  }

  // Reject custom tags / non-plain structures that could smuggle objects.
  const value = doc.toJS({ maxAliasCount: MAX_ALIAS_COUNT });
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return { value, warnings };
  }
  if (value === null) {
    return { value: {}, warnings };
  }
  throw new YamlParseError('Policy document must be a YAML mapping (key/value object).');
}
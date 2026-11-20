/**
 * Secure YAML handling (threat model T6).
 *
 * Policies are YAML 1.2 parsed in strict mode with alias expansion limited,
 * unique keys enforced, and a hard document size cap. Multi-document streams
 * and custom tags are rejected: a policy is exactly one plain document.
 */

import { parseDocument, visit as yamlVisit, LineCounter, type Document } from 'yaml';

/** Walks every node of a parsed YAML document (used for tag checks). */
function visitInternal(doc: Document, onNode: (node: unknown) => void): void {
  yamlVisit(doc, {
    Node: (node, _key, _parent) => {
      if (node !== null && typeof node === 'object') {
        onNode(node);
      }
    },
  });
}

/** YAML 1.2 core-schema tags a policy may use. Everything else is rejected. */
const ALLOWED_TAGS = new Set([
  'tag:yaml.org,2002:str',
  'tag:yaml.org,2002:int',
  'tag:yaml.org,2002:float',
  'tag:yaml.org,2002:bool',
  'tag:yaml.org,2002:null',
  'tag:yaml.org,2002:map',
  'tag:yaml.org,2002:seq',
  'tag:yaml.org,2002:set',
  'tag:yaml.org,2002:timestamp',
  'tag:yaml.org,2002:binary',
]);

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
  // Reject custom/unresolved YAML tags: a policy is plain data, never
  // constructed objects (threat model T6).
  for (const warn of doc.warnings) {
    if (/unresolved tag/i.test(warn.message)) {
      const tagMatch = /tag:\s*([^\s]+)|"([^"\n]+)"/.exec(warn.message);
      const tag = tagMatch?.[1] ?? tagMatch?.[2] ?? 'unknown';
      throw new YamlParseError(
        // eslint-disable-next-line no-control-regex
        `Custom YAML tag "${tag.replace(/[\u0000-\u001f]/g, '')}" is not allowed in policy files.`,
      );
    }
  }
  visitInternal(doc, (node) => {
    const tag = (node as { tag?: string }).tag;
    if (tag && !ALLOWED_TAGS.has(tag)) {
      throw new YamlParseError(
        // eslint-disable-next-line no-control-regex
        `Custom YAML tag "${tag.replace(/[\u0000-\u001f]/g, '')}" is not allowed in policy files.`,
      );
    }
  });

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

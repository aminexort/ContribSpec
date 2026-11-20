/**
 * Policy validation: JSON Schema layer + semantic layer.
 *
 * Every diagnostic carries a stable code, an exact path and an actionable
 * message (and a "did you mean" suggestion where useful). Unknown keys are
 * errors — with one exception: `x-`/`x_` prefixed extension keys are allowed
 * anywhere (ADR-0002).
 */

import { Ajv2020 } from 'ajv/dist/2020.js';
import type { ErrorObject, ValidateFunction } from 'ajv';
import { policySchemaJson, RULE_ID_PATTERN, RULES } from '@contribspec/schema';
import type { PolicyDocument } from '@contribspec/schema';
import type { Diagnostic } from './types.js';
import { parseYamlSafely } from './yaml.js';

/** Object keys that may appear at each level (mirrors the JSON Schema). */
const KNOWN_KEYS: Record<string, string[]> = {
  root: ['$schema', 'version', 'project', 'contributions', 'enforcement', 'metadata'],
  project: ['name', 'description', 'repository', 'homepage'],
  contributions: ['pull_requests', 'ai_assistance', 'accountability', 'verification', 'compliance'],
  pull_requests: [
    'issue_reference',
    'max_changed_files',
    'max_changed_lines',
    'title_pattern',
    'body_min_length',
  ],
  ai_assistance: ['policy', 'disclosure_locations', 'required_fields', 'attestation_terms'],
  accountability: ['human_responsibility', 'human_understanding_attestation'],
  verification: ['required_checks', 'require_head_sha_match'],
  requiredCheck: ['name', 'source', 'severity', 'description'],
  compliance: ['dco', 'cla', 'license_confirmation'],
  enforcement: ['default_mode', 'missing_evidence', 'severity_overrides'],
  metadata: ['description', 'maintainers', 'last_reviewed'],
  // severity_overrides keys are rule ids, checked by schema pattern instead.
  severity_overrides: [],
};

const NESTED_KEY_MAP: Record<string, string> = {
  project: 'project',
  contributions: 'contributions',
  pull_requests: 'pull_requests',
  ai_assistance: 'ai_assistance',
  accountability: 'accountability',
  verification: 'verification',
  compliance: 'compliance',
  enforcement: 'enforcement',
  metadata: 'metadata',
};

function isExtensionKey(key: string): boolean {
  return key.startsWith('x-') || key.startsWith('x_');
}

/** Classic Levenshtein distance, capped — used only for "did you mean" hints. */
export function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 3) {
    return 99;
  }
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i += 1) {
    const cur = [i];
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    prev = cur;
  }
  return prev[n] ?? 99;
}

function suggestKey(key: string, known: string[]): string | undefined {
  let best: string | undefined;
  let bestDist = 3;
  for (const candidate of known) {
    const d = editDistance(key.toLowerCase(), candidate.toLowerCase());
    if (d < bestDist) {
      bestDist = d;
      best = candidate;
    }
  }
  return best;
}

interface KeyIssue {
  path: string;
  key: string;
  known: string[];
}

/** Recursively finds keys that are neither known nor `x-` extensions. */
function findUnknownKeys(value: unknown, level: string, path: string, out: KeyIssue[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, i) => {
      const itemLevel = level === 'verification.required_checks' ? 'requiredCheck' : level;
      findUnknownKeys(item, itemLevel, `${path}[${i}]`, out);
    });
    return;
  }
  if (value === null || typeof value !== 'object') {
    return;
  }
  const known = KNOWN_KEYS[level] ?? [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (isExtensionKey(key)) {
      continue;
    }
    const childPath = path ? `${path}.${key}` : key;
    if (level === 'severity_overrides') {
      // Keys here are rule ids; the schema pattern validates their shape.
      continue;
    }
    if (!known.includes(key)) {
      out.push({ path: childPath, key, known });
      continue;
    }
    const childLevel =
      key === 'severity_overrides'
        ? 'severity_overrides'
        : (NESTED_KEY_MAP[key] ??
          (key === 'required_checks' ? 'verification.required_checks' : level));
    findUnknownKeys(child, childLevel, childPath, out);
  }
}

function formatAjvError(error: ErrorObject): Diagnostic {
  const basePath = error.instancePath.replace(/^\//, '').replace(/\//g, '.');
  const path = basePath || 'root';
  switch (error.keyword) {
    case 'required': {
      const missing = String(error.params.missingProperty);
      return {
        code: 'SCHEMA-MISSING',
        path: basePath ? `${basePath}.${missing}` : missing,
        message: `Missing required property "${missing}".`,
        severity: 'error',
      };
    }
    case 'const':
      return {
        code: 'SCHEMA-TYPE',
        path,
        message: `Expected value ${JSON.stringify(error.params.allowedValue)}.`,
        severity: 'error',
      };
    case 'enum':
      return {
        code: 'SCHEMA-TYPE',
        path,
        message: `Expected one of: ${(error.params.allowedValues as unknown[]).map((v) => JSON.stringify(v)).join(', ')}.`,
        severity: 'error',
      };
    case 'type':
      return {
        code: 'SCHEMA-TYPE',
        path,
        message: `Wrong type: ${error.message ?? 'invalid value'}.`,
        severity: 'error',
      };
    case 'pattern':
      return {
        code: 'SCHEMA-VALUE',
        path,
        message: `Value does not match the required pattern ${String(error.params.pattern)}.`,
        severity: 'error',
      };
    default:
      return {
        code: 'SCHEMA-INVALID',
        path,
        message: error.message ?? 'Invalid value.',
        severity: 'error',
      };
  }
}

export interface ValidationResult {
  ok: boolean;
  diagnostics: Diagnostic[];
  /** Present only when `ok` is true. */
  document?: PolicyDocument;
}

let cachedValidator: ValidateFunction | undefined;
function getValidator(): ValidateFunction {
  if (!cachedValidator) {
    const ajv = new Ajv2020({
      allErrors: true,
      strict: false,
      validateFormats: false,
      allowUnionTypes: true,
    });
    cachedValidator = ajv.compile(policySchemaJson as object);
  }
  return cachedValidator;
}
/** Semantic checks that a JSON Schema cannot express. */
function semanticDiagnostics(doc: PolicyDocument): Diagnostic[] {
  const out: Diagnostic[] = [];

  const pr = doc.contributions?.pull_requests;
  if (pr?.title_pattern !== undefined) {
    try {
      new RegExp(pr.title_pattern);
    } catch (err) {
      out.push({
        code: 'SEM-REGEX',
        path: 'contributions.pull_requests.title_pattern',
        message: `Not a valid regular expression: ${(err as Error).message}`,
        severity: 'error',
      });
    }
  }

  const overrides = doc.enforcement?.severity_overrides ?? {};
  for (const key of Object.keys(overrides)) {
    if (!RULE_ID_PATTERN.test(key)) {
      out.push({
        code: 'SEM-UNKNOWN-RULE',
        path: `enforcement.severity_overrides.${key}`,
        message: `"${key}" is not a rule id (expected e.g. "PR-002").`,
        severity: 'warning',
        suggestion: `Known rule ids: ${Object.keys(RULES).join(', ')}`,
      });
    } else if (!(key in RULES)) {
      out.push({
        code: 'SEM-UNKNOWN-RULE',
        path: `enforcement.severity_overrides.${key}`,
        message: `"${key}" matches the rule id format but no such rule exists in this build. The override is kept for forward compatibility but has no effect.`,
        severity: 'warning',
      });
    }
  }

  const ai = doc.contributions?.ai_assistance;
  if (
    ai?.policy === 'allow_with_disclosure' &&
    (!ai.disclosure_locations || ai.disclosure_locations.length === 0)
  ) {
    out.push({
      code: 'SEM-CONTRADICTION',
      path: 'contributions.ai_assistance.disclosure_locations',
      message:
        'policy is "allow_with_disclosure" but no disclosure_locations are declared; disclosures cannot be located. Defaulting to pull_request_body.',
      severity: 'warning',
      suggestion: 'Add disclosure_locations: [pull_request_body]',
    });
  }
  if (ai?.policy === 'allow' && (ai.required_fields?.length ?? 0) > 0) {
    out.push({
      code: 'SEM-CONTRADICTION',
      path: 'contributions.ai_assistance.required_fields',
      message:
        'policy is "allow" (no disclosure expected) but required_fields are declared; the fields will not be checked.',
      severity: 'warning',
    });
  }
  if (ai?.policy === 'prohibit' && (ai.required_fields?.length ?? 0) > 0) {
    out.push({
      code: 'SEM-CONTRADICTION',
      path: 'contributions.ai_assistance.required_fields',
      message: 'policy is "prohibit"; required_fields have no effect.',
      severity: 'warning',
    });
  }

  const acc = doc.contributions?.accountability;
  if (
    ai?.policy === 'require_human_verification' &&
    acc?.human_understanding_attestation === 'not_required'
  ) {
    out.push({
      code: 'SEM-CONTRADICTION',
      path: 'contributions.accountability.human_understanding_attestation',
      message:
        'policy is "require_human_verification" but the understanding attestation is waived ("not_required"). Consider "encouraged" or "required".',
      severity: 'warning',
    });
  }

  return out;
}

/**
 * Validates a parsed policy value against the JSON Schema and semantic rules.
 * Returns diagnostics; `document` is set only when validation passed.
 */
export function validatePolicyValue(value: unknown): ValidationResult {
  const diagnostics: Diagnostic[] = [];

  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return {
      ok: false,
      diagnostics: [
        {
          code: 'SCHEMA-INVALID',
          path: 'root',
          message: 'Policy must be a YAML/JSON object with at least "version" and "project".',
          severity: 'error',
        },
      ],
    };
  }

  // Unknown-key detection with suggestions (friendlier than raw ajv output).
  const keyIssues: KeyIssue[] = [];
  findUnknownKeys(value, 'root', '', keyIssues);
  for (const issue of keyIssues) {
    const suggestion = suggestKey(issue.key, issue.known);
    diagnostics.push({
      code: 'SCHEMA-UNKNOWN-KEY',
      path: issue.path,
      message: `Unknown property "${issue.key}". ContribSpec is strict so typos fail fast.`,
      severity: 'error',
      ...(suggestion ? { suggestion: `Did you mean "${suggestion}"?` } : {}),
    });
  }

  const validate = getValidator();
  const schemaOk = validate(value);
  if (!schemaOk && validate.errors) {
    for (const err of validate.errors) {
      // Unknown-key errors are reported above with suggestions.
      if (err.keyword === 'additionalProperties' || err.keyword === 'additionalItems') {
        continue;
      }
      diagnostics.push(formatAjvError(err));
    }
  }

  diagnostics.push(...semanticDiagnostics(value as PolicyDocument));

  const hasErrors = diagnostics.some((d) => d.severity === 'error');
  return {
    ok: !hasErrors,
    diagnostics,
    ...(hasErrors ? {} : { document: value as PolicyDocument }),
  };
}

/** Validates YAML policy text. Parse errors become diagnostics (never throws). */
export function validatePolicyText(text: string): ValidationResult {
  let value: unknown;
  try {
    value = parseYamlSafely(text).value;
  } catch (err) {
    return {
      ok: false,
      diagnostics: [
        {
          code: 'YAML-PARSE',
          path: 'root',
          message: (err as Error).message,
          severity: 'error',
        },
      ],
    };
  }
  return validatePolicyValue(value);
}

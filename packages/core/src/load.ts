/**
 * Policy loading and default resolution (docs/SPECIFICATION.md §3 defaults).
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  POLICY_FILE_CANDIDATES,
  type CheckSource,
  type PolicyDocument,
  type RequiredCheck,
  type Severity,
} from '@contribspec/schema';
import type { Diagnostic, ResolvedPolicy } from './types.js';
import { isFile, resolveWithin } from './paths.js';
import { validatePolicyText } from './validate.js';

export class PolicyNotFoundError extends Error {
  constructor(searched: string[]) {
    super(
      `No contribution policy found. Looked for: ${searched.join(', ')}. ` +
        `Create one with "contribspec init".`,
    );
    this.name = 'PolicyNotFoundError';
  }
}

export interface LoadResult {
  /** Present only when the policy validated cleanly. */
  resolved?: ResolvedPolicy;
  diagnostics: Diagnostic[];
}

export interface ResolveOptions {
  path: string;
  source?: string;
}

/** Applies documented defaults to a validated policy document. */
export function resolvePolicy(doc: PolicyDocument, raw: string, opts: ResolveOptions): ResolvedPolicy {
  const pr = doc.contributions?.pull_requests;
  const ai = doc.contributions?.ai_assistance;
  const acc = doc.contributions?.accountability;
  const ver = doc.contributions?.verification;
  const comp = doc.contributions?.compliance;
  const enf = doc.enforcement;

  let titlePattern: RegExp | undefined;
  if (pr?.title_pattern !== undefined) {
    try {
      titlePattern = new RegExp(pr.title_pattern);
    } catch {
      titlePattern = undefined;
    }
  }

  const checks = (ver?.required_checks ?? []).map((entry): ResolvedPolicy['verification']['requiredChecks'][number] => {
    if (typeof entry === 'string') {
      const check: RequiredCheck = { name: entry, source: 'any' };
      return { name: check.name, source: 'any' };
    }
    const source: CheckSource = entry.source ?? 'any';
    return {
      name: entry.name,
      source,
      ...(entry.severity ? { severity: entry.severity as Severity } : {}),
      ...(entry.description ? { description: entry.description } : {}),
    };
  });

  return {
    document: doc,
    raw,
    digest: createHash('sha256').update(raw, 'utf8').digest('hex'),
    path: opts.path,
    source: opts.source ?? 'local',
    pullRequests: {
      issueReference: pr?.issue_reference ?? 'encouraged',
      ...(pr?.max_changed_files !== undefined ? { maxChangedFiles: pr.max_changed_files } : {}),
      ...(pr?.max_changed_lines !== undefined ? { maxChangedLines: pr.max_changed_lines } : {}),
      ...(titlePattern ? { titlePattern } : {}),
      ...(pr?.title_pattern !== undefined ? { titlePatternSource: pr.title_pattern } : {}),
      ...(pr?.body_min_length !== undefined ? { bodyMinLength: pr.body_min_length } : {}),
    },
    ai: {
      policy: ai?.policy ?? 'allow',
      disclosureLocations: ai?.disclosure_locations ?? ['pull_request_body'],
      requiredFields: ai?.required_fields ?? [],
      ...(ai?.attestation_terms !== undefined ? { attestationTerms: ai.attestation_terms } : {}),
    },
    accountability: {
      humanResponsibility: acc?.human_responsibility ?? 'encouraged',
      humanUnderstandingAttestation: acc?.human_understanding_attestation ?? 'encouraged',
    },
    verification: {
      requiredChecks: checks,
      requireHeadShaMatch: ver?.require_head_sha_match ?? true,
    },
    compliance: {
      dco: comp?.dco ?? 'not_required',
      cla: comp?.cla ?? 'not_required',
      licenseConfirmation: comp?.license_confirmation ?? 'not_required',
    },
    enforcement: {
      mode: enf?.default_mode ?? 'report',
      missingEvidence: enf?.missing_evidence ?? 'report',
      severityOverrides: enf?.severity_overrides ?? {},
    },
  };
}

/** Loads and resolves a policy from raw text. */
export function loadPolicyText(text: string, opts: ResolveOptions): LoadResult {
  const result = validatePolicyText(text);
  if (!result.ok || !result.document) {
    return { diagnostics: result.diagnostics };
  }
  return {
    resolved: resolvePolicy(result.document, text, opts),
    diagnostics: result.diagnostics,
  };
}

/**
 * Loads the policy file from disk. `explicitPath` must resolve inside `rootDir`
 * (path-traversal protection). Without an explicit path the standard candidate
 * list is searched in order.
 */
export function loadPolicyFile(rootDir: string, explicitPath?: string): LoadResult {
  let path: string;
  if (explicitPath) {
    path = resolveWithin(rootDir, explicitPath);
    if (!isFile(path)) {
      throw new PolicyNotFoundError([explicitPath]);
    }
  } else {
    const searched: string[] = [];
    let found: string | undefined;
    for (const candidate of POLICY_FILE_CANDIDATES) {
      searched.push(candidate);
      const p = resolveWithin(rootDir, candidate);
      if (isFile(p)) {
        found = p;
        break;
      }
    }
    if (!found) {
      throw new PolicyNotFoundError(searched);
    }
    path = found;
  }
  const raw = readFileSync(path, 'utf8');
  return loadPolicyText(raw, { path, source: 'local' });
}

/** Resolves the default policy path candidates against a root directory. */
export function findPolicyPath(rootDir: string): string | undefined {
  for (const candidate of POLICY_FILE_CANDIDATES) {
    const p = join(rootDir, candidate);
    if (isFile(p)) {
      return p;
    }
  }
  return undefined;
}
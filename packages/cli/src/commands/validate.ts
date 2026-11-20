/**
 * `contribspec validate` — validate a policy file against the official schema.
 */

import { loadPolicyFile, PolicyNotFoundError, type Diagnostic } from '@contribspec/core';
import type { CommandOutput } from '../output.js';

export interface ValidateOptions {
  rootDir: string;
  policyPath?: string;
}

function renderDiagnostic(d: Diagnostic): string {
  const suggestion = d.suggestion ? `\n      ${d.suggestion}` : '';
  return `  ${d.severity === 'error' ? '✖' : '⚠'} ${d.path}: ${d.message} [${d.code}]${suggestion}`;
}

export function runValidate(opts: ValidateOptions): CommandOutput {
  try {
    const result = loadPolicyFile(opts.rootDir, opts.policyPath);
    const warnings = result.diagnostics.filter((d) => d.severity === 'warning');

    if (!result.resolved) {
      const errors = result.diagnostics.filter((d) => d.severity === 'error');
      return {
        text:
          `Policy is INVALID (${errors.length} error(s)):\n` +
          errors.map(renderDiagnostic).join('\n') +
          '\n',
        json: { ok: false, diagnostics: result.diagnostics },
        markdown:
          `### Policy validation — ❌ invalid\n\n` +
          errors.map((d) => `- \`${d.path}\`: ${d.message} (${d.code})`).join('\n') +
          '\n',
        exitCode: 1,
      };
    }

    const warningText =
      warnings.length > 0 ? `\nWarnings:\n${warnings.map(renderDiagnostic).join('\n')}\n` : '';
    return {
      text: `Policy is valid: ${result.resolved.path} (version ${result.resolved.document.version}).${warningText}`,
      json: {
        ok: true,
        path: result.resolved.path,
        policyVersion: result.resolved.document.version,
        digest: result.resolved.digest,
        diagnostics: result.diagnostics,
      },
      markdown:
        `### Policy validation — ✅ valid\n\n` +
        `Path: \`${result.resolved.path}\` · policy version ${result.resolved.document.version}\n` +
        (warnings.length > 0
          ? `\nWarnings:\n${warnings.map((d) => `- \`${d.path}\`: ${d.message}`).join('\n')}\n`
          : ''),
      exitCode: 0,
    };
  } catch (err) {
    if (err instanceof PolicyNotFoundError) {
      return {
        text: `${err.message}\n`,
        json: { ok: false, error: 'POLICY-NOT-FOUND', message: err.message },
        markdown: `### Policy validation — ❌ not found\n\n${err.message}\n`,
        exitCode: 1,
      };
    }
    throw err;
  }
}

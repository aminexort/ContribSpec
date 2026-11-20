/**
 * `contribspec policy test` — run conformance tests against policy fixtures.
 */

import {
  isConformanceDir,
  loadConformanceCases,
  runConformanceSuite,
  type ConformanceCaseResult,
} from '@contribspec/core';
import type { CommandOutput } from '../output.js';

export interface PolicyTestOptions {
  /** Directory containing conformance case directories. */
  fixturesDir: string;
}

function renderCase(result: ConformanceCaseResult): string {
  const mark = result.passed ? '✔' : '✘';
  const failures = result.failures.map((f) => `\n      ${f}`).join('');
  return `  ${mark} ${result.name}${result.passed ? '' : failures}`;
}

export function runPolicyTest(opts: PolicyTestOptions): CommandOutput {
  if (!isConformanceDir(opts.fixturesDir)) {
    return {
      text: `Fixtures directory not found: ${opts.fixturesDir}\n`,
      json: { ok: false, error: 'FIXTURES-NOT-FOUND', path: opts.fixturesDir },
      markdown: `### Conformance — ❌ fixtures not found\n`,
      exitCode: 2,
    };
  }

  let results: ConformanceCaseResult[];
  try {
    results = runConformanceSuite(loadConformanceCases(opts.fixturesDir));
  } catch (err) {
    return {
      text: `Conformance suite error: ${(err as Error).message}\n`,
      json: { ok: false, error: 'SUITE-INVALID', message: (err as Error).message },
      markdown: `### Conformance — ❌ suite invalid\n\n${(err as Error).message}\n`,
      exitCode: 2,
    };
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  const text =
    `Conformance results (${passed}/${results.length} passed):\n` +
    results.map(renderCase).join('\n') +
    '\n';
  const markdown =
    `### Conformance results — ${passed}/${results.length} passed\n\n` +
    results
      .map(
        (r) =>
          `- ${r.passed ? '✅' : '❌'} **${r.name}**` +
          (r.passed ? '' : ` — ${r.failures.join('; ')}`),
      )
      .join('\n') +
    '\n';
  return {
    text,
    json: {
      ok: failed === 0,
      total: results.length,
      passed,
      failed,
      cases: results.map((r) => ({ name: r.name, passed: r.passed, failures: r.failures })),
    },
    markdown,
    exitCode: failed === 0 ? 0 : 1,
  };
}
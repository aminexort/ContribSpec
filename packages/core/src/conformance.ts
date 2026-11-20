/**
 * Conformance test runner (`contribspec policy test`).
 *
 * A conformance case directory contains:
 *
 *   policy.yml         — the policy under test
 *   contribution.json  — a ContributionSubject
 *   evidence.json      — optional Evidence[] (default: [])
 *   expected.json      — { result?, findings?: [{ ruleId, status }] }
 *
 * Expectations are subset assertions: listed findings must have the expected
 * status; unlisted findings are ignored. This lets policy authors pin the
 * behavior they care about without mirroring every informational rule.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { evaluateContribution } from './evaluate.js';
import { loadPolicyText } from './load.js';
import { isFile, resolveWithin } from './paths.js';
import type {
  ContributionSubject,
  EvaluationReport,
  Evidence,
  FindingStatus,
  OverallResult,
} from './types.js';

export interface ConformanceExpectation {
  result?: OverallResult;
  findings?: { ruleId: string; status: FindingStatus }[];
}

export interface ConformanceCase {
  name: string;
  policyText: string;
  subject: ContributionSubject;
  evidence: Evidence[];
  expected: ConformanceExpectation;
}

export interface ConformanceCaseResult {
  name: string;
  passed: boolean;
  failures: string[];
  report?: EvaluationReport;
}

export class ConformanceFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConformanceFormatError';
  }
}

function readJson<T>(path: string, what: string): T {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch (err) {
    throw new ConformanceFormatError(
      `${what} (${path}) is not valid JSON: ${(err as Error).message}`,
    );
  }
}

/** Loads every case directory inside `rootDir` (sorted by name). */
export function loadConformanceCases(rootDir: string): ConformanceCase[] {
  const entries = readdirSync(rootDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  const cases: ConformanceCase[] = [];
  for (const name of entries) {
    const dir = resolveWithin(rootDir, name);
    const policyPath = resolveWithin(dir, 'policy.yml');
    const contributionPath = resolveWithin(dir, 'contribution.json');
    const expectedPath = resolveWithin(dir, 'expected.json');
    if (!isFile(policyPath) || !isFile(contributionPath) || !isFile(expectedPath)) {
      throw new ConformanceFormatError(
        `Case "${name}" is incomplete: needs policy.yml, contribution.json and expected.json.`,
      );
    }
    const evidencePath = join(dir, 'evidence.json');
    cases.push({
      name,
      policyText: readFileSync(policyPath, 'utf8'),
      subject: readJson<ContributionSubject>(contributionPath, 'contribution.json'),
      evidence: isFile(evidencePath) ? readJson<Evidence[]>(evidencePath, 'evidence.json') : [],
      expected: readJson<ConformanceExpectation>(expectedPath, 'expected.json'),
    });
  }
  return cases;
}

/** Runs one conformance case. Never throws for evaluation problems. */
export function runConformanceCase(testCase: ConformanceCase): ConformanceCaseResult {
  const failures: string[] = [];
  const loaded = loadPolicyText(testCase.policyText, {
    path: `${testCase.name}/policy.yml`,
    source: 'conformance',
  });
  if (!loaded.resolved) {
    return {
      name: testCase.name,
      passed: false,
      failures: [
        `policy did not validate: ${loaded.diagnostics.map((d) => `${d.path}: ${d.message}`).join('; ')}`,
      ],
    };
  }

  const report = evaluateContribution({
    policy: loaded.resolved,
    subject: testCase.subject,
    evidence: testCase.evidence,
    options: { generatedAt: '1970-01-01T00:00:00.000Z', toolVersion: 'conformance' },
  });

  if (
    testCase.expected.result !== undefined &&
    report.summary.result !== testCase.expected.result
  ) {
    failures.push(
      `expected overall result "${testCase.expected.result}", got "${report.summary.result}"`,
    );
  }

  for (const expectation of testCase.expected.findings ?? []) {
    const matches = report.findings.filter((f) => f.ruleId === expectation.ruleId);
    if (matches.length === 0) {
      failures.push(`expected a finding for rule ${expectation.ruleId}, but none was produced`);
      continue;
    }
    const ok = matches.some((f) => f.status === expectation.status);
    if (!ok) {
      failures.push(
        `rule ${expectation.ruleId}: expected status "${expectation.status}", got ` +
          matches.map((f) => `"${f.status}"`).join(', '),
      );
    }
  }

  return { name: testCase.name, passed: failures.length === 0, failures, report };
}

/** Runs a whole suite of cases. */
export function runConformanceSuite(cases: ConformanceCase[]): ConformanceCaseResult[] {
  return cases.map((c) => runConformanceCase(c));
}

/** Reads a directory of case directories; helper used by CLI and tests. */
export function isConformanceDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

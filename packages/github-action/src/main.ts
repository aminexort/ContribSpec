/**
 * ContribSpec GitHub Action.
 *
 * Trust model (ADR-0005, docs/THREAT_MODEL.md):
 *  - runs on `pull_request` events only; refuses `pull_request_target`;
 *  - reads the policy at the trusted BASE commit, never at the PR head;
 *  - never checks out or executes code from the pull request;
 *  - sanitizes every untrusted string before rendering or logging;
 *  - degrades gracefully when the token lacks `checks: write`.
 *
 * The action has no npm runtime dependencies in its bundle: it uses the Node
 * built-in fetch and filesystem APIs only (ADR-0006).
 */

import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import {
  evaluateContribution,
  gateDecision,
  loadPolicyText,
  renderJson,
  renderMarkdown,
  renderText,
  sanitizeInline,
  summarize,
  type ContributionSubject,
  type Evidence,
  type EvaluationReport,
} from '@contribspec/core';
import {
  GitHubProvider,
  splitRepository,
  commitsToDcoEvidence,
} from '@contribspec/integrations';

export const MAX_EVENT_BYTES = 10 * 1024 * 1024;

export interface ActionDeps {
  env: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  log?: (message: string) => void;
}

export interface ActionResult {
  exitCode: number;
  report?: EvaluationReport;
  result: 'pass' | 'fail' | 'unverified' | 'error';
  checkPublished: boolean;
  outputs: Record<string, string>;
}

interface PullRequestEvent {
  action?: string;
  number?: number;
  pull_request?: {
    number?: number;
    title?: string;
    body?: string | null;
    user?: { login?: string };
    head?: { sha?: string; ref?: string };
    base?: { sha?: string; ref?: string };
  };
  repository?: { full_name?: string };
}

function readEventPayload(path: string): PullRequestEvent {
  if (!existsSync(path)) {
    throw new Error(`Event payload not found at ${sanitizeInline(path, 200)}.`);
  }
  const raw = readFileSync(path, 'utf8');
  if (raw.length > MAX_EVENT_BYTES) {
    throw new Error(`Event payload too large (${raw.length} bytes).`);
  }
  return JSON.parse(raw) as PullRequestEvent;
}

function appendStepSummary(env: Record<string, string | undefined>, markdown: string): void {
  const path = env.GITHUB_STEP_SUMMARY;
  if (path && existsSync(path)) {
    appendFileSync(path, markdown, 'utf8');
  }
}

function writeOutputs(env: Record<string, string | undefined>, outputs: Record<string, string>): void {
  const path = env.GITHUB_OUTPUT;
  if (!path || !existsSync(path)) {
    return;
  }
  const lines = Object.entries(outputs)
    .map(([key, value]) => {
      // Heredoc-style delimiter keeps multi-line values (JSON report) safe.
      const safe = value.length > 500_000 ? `${value.slice(0, 500_000)}` : value;
      return `${key}<<__CONTRIBSPEC_EOF__\n${safe}\n__CONTRIBSPEC_EOF__`;
    })
    .join('\n');
  appendFileSync(path, `${lines}\n`, 'utf8');
}

/** Runs the action. Never throws for evaluation problems; throws only on configuration errors. */
export async function runAction(deps: ActionDeps): Promise<ActionResult> {
  const env = deps.env;
  const log = deps.log ?? ((m: string) => process.stdout.write(`${m}\n`));
  const outputs: Record<string, string> = {};

  const eventName = env.GITHUB_EVENT_NAME ?? '';
  if (eventName === 'pull_request_target') {
    throw new Error(
      'ContribSpec must not run on pull_request_target events (secret exposure risk). ' +
        'Use a "pull_request" workflow — see docs/QUICKSTART.md.',
    );
  }
  if (eventName !== 'pull_request') {
    throw new Error(
      `ContribSpec evaluates pull requests; got event "${sanitizeInline(eventName, 50)}". ` +
        'Trigger the workflow with `on: pull_request`.',
    );
  }

  const eventPath = env.GITHUB_EVENT_PATH;
  if (!eventPath) {
    throw new Error('GITHUB_EVENT_PATH is not set; cannot identify the pull request.');
  }
  const event = readEventPayload(eventPath);
  const prNumber = event.pull_request?.number ?? event.number;
  const repoFullName = event.repository?.full_name ?? env.GITHUB_REPOSITORY ?? '';
  const headShaFromEvent = event.pull_request?.head?.sha ?? '';

  if (prNumber === undefined || !repoFullName) {
    throw new Error('Event payload does not identify a pull request and repository.');
  }
  const { owner, repo } = splitRepository(repoFullName);

  const policyPath = env['INPUT_POLICY-PATH'] ?? 'contribspec.yml';
  const modeOverride = env['INPUT-MODE'] ?? '';
  const reportName = (env['INPUT_REPORT-NAME'] ?? 'ContribSpec verification').slice(0, 100);
  const token = env['INPUT_TOKEN'] ?? env.GITHUB_TOKEN ?? '';
  const apiBaseUrl = env.GITHUB_API_URL || undefined;

  if (!/^[A-Za-z0-9._/-]{1,300}$/.test(policyPath)) {
    throw new Error(`Invalid policy-path input: ${sanitizeInline(policyPath, 100)}`);
  }

  const provider = new GitHubProvider({
    owner,
    repo,
    token,
    ...(apiBaseUrl ? { apiBaseUrl } : {}),
    ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
    userAgent: 'contribspec-action',
  });

  // Pull request metadata (untrusted text; sanitized by the provider/core).
  const subject: ContributionSubject = await provider.getPullRequest(prNumber);
  if (headShaFromEvent && subject.headSha && headShaFromEvent !== subject.headSha) {
    log(
      'Note: the pull request head moved since this workflow started; ' +
        `evaluating the current head ${sanitizeInline(subject.headSha, 12)}.`,
    );
  }

  // Trust boundary: policy from the BASE commit only (never the PR head).
  const baseSha = subject.baseSha;
  if (!baseSha) {
    throw new Error('Cannot determine the trusted base commit for this pull request.');
  }
  const policyText = await provider.getFileText(baseSha, policyPath);
  if (policyText === null) {
    const message =
      `No contribution policy "${policyPath}" at base commit ${baseSha}. ` +
      'The policy is deliberately not read from the pull request head. ' +
      'Add the policy to the target branch ("contribspec init").';
    outputs.result = 'error';
    outputs['failing-rules'] = '';
    log(`ContribSpec: ${message}`);
    await provider.publishCheckRun({
      sha: subject.headSha,
      name: reportName,
      title: 'Policy not found at base commit',
      summary: `⚠️ ${message}`,
      conclusion: 'action_required',
    });
    outputs.report = JSON.stringify({ error: 'POLICY-NOT-FOUND-AT-BASE', message, policyPath });
    writeOutputs(env, outputs);
    return { exitCode: 1, result: 'error', checkPublished: true, outputs };
  }

  const loaded = loadPolicyText(policyText, {
    path: policyPath,
    source: `base-commit:${baseSha.slice(0, 12)}`,
  });
  if (!loaded.resolved) {
    const details = loaded.diagnostics.map((d) => `${d.path}: ${d.message}`).join('; ');
    log(`ContribSpec: policy at base commit is invalid: ${details}`);
    outputs.result = 'error';
    outputs['failing-rules'] = '';
    outputs.report = JSON.stringify({ error: 'POLICY-INVALID-AT-BASE', diagnostics: loaded.diagnostics });
    writeOutputs(env, outputs);
    await provider.publishCheckRun({
      sha: subject.headSha,
      name: reportName,
      title: 'Policy at base commit is invalid',
      summary: `⚠️ The contribution policy at the base commit is invalid: ${sanitizeInline(details, 1000)}`,
      conclusion: 'action_required',
    });
    return { exitCode: 1, result: 'error', checkPublished: true, outputs };
  }

  // Evidence collection — only artifacts bound to the head commit count.
  const evidence: Evidence[] = [
    ...(await provider.getCheckRunEvidence(subject.headSha)),
    ...(await provider.getCommitStatusEvidence(subject.headSha)),
  ];
  const dco = commitsToDcoEvidence(subject.commits ?? []);
  if (dco) {
    evidence.push(dco);
  }

  const mode =
    modeOverride === 'report' || modeOverride === 'advisory' || modeOverride === 'enforce'
      ? modeOverride
      : loaded.resolved.enforcement.mode;

  const report = evaluateContribution({
    policy: {
      ...loaded.resolved,
      enforcement: { ...loaded.resolved.enforcement, mode },
    },
    subject,
    evidence,
  });

  const decision = gateDecision(report);
  const markdown = renderMarkdown(report);
  log(sanitizeInline(summarize(report), 300));

  const failingRules = report.findings
    .filter((f) => f.status === 'fail' || f.status === 'missing_evidence')
    .map((f) => f.ruleId);
  outputs.result = report.summary.result;
  outputs.report = renderJson(report);
  outputs['failing-rules'] = [...new Set(failingRules)].join(',');
  writeOutputs(env, outputs);
  appendStepSummary(env, markdown);

  const published = await provider.publishCheckRun({
    sha: subject.headSha,
    name: reportName,
    title: `ContribSpec: ${report.summary.result}`,
    summary: markdown,
    conclusion: decision.conclusion,
  });
  if (!published) {
    log(
      'ContribSpec: could not publish a check run (token lacks checks:write?). ' +
        'The report was written to the job summary and action outputs instead.',
    );
    process.stdout.write(renderText(report));
  }

  return {
    exitCode: decision.exitCode,
    report,
    result: report.summary.result,
    checkPublished: published,
    outputs,
  };
}

/** CLI-style entry used by the bundled action. */
export async function main(): Promise<void> {
  try {
    const result = await runAction({ env: process.env });
    process.exitCode = result.exitCode;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stdout.write(`ContribSpec error: ${sanitizeInline(message, 500)}\n`);
    process.exitCode = 1;
  }
}

// Run only when executed directly (not when imported by tests).
const invokedDirectly =
  typeof process !== 'undefined' &&
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith('index.mjs') || process.argv[1].endsWith('main.js'));
if (invokedDirectly) {
  void main();
}
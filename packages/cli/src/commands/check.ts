/**
 * `contribspec check` — evaluate a contribution against the declared policy.
 *
 * Local mode reads a contribution description (JSON) and optional evidence.
 * PR mode talks to GitHub and loads the policy from the trusted base commit.
 */

import { readFileSync } from 'node:fs';
import {
  evaluateContribution,
  gateDecision,
  loadPolicyFile,
  loadPolicyText,
  PolicyNotFoundError,
  renderJson,
  renderMarkdown,
  renderText,
  resolveExplicitPath,
  summarize,
  type ContributionSubject,
  type Evidence,
  type EvaluationReport,
} from '@contribspec/core';
import { GitHubProvider, splitRepository, commitsToDcoEvidence } from '@contribspec/integrations';
import type { CommandOutput } from '../output.js';
import { TOOL_VERSION } from '../version.js';

export interface CheckOptions {
  rootDir: string;
  policyPath?: string;
  /** Local: contribution JSON path. */
  contributionPath?: string;
  /** Local: evidence JSON path. */
  evidencePath?: string;
  /** Remote: pull request number. */
  pr?: number;
  /** Remote: "owner/repo". */
  repo?: string;
  /** Remote: API token (prefer tokenEnv in shared environments). */
  token?: string;
  apiBaseUrl?: string;
  /** Override the policy's enforcement mode. */
  mode?: 'report' | 'advisory' | 'enforce';
  /** Emit full report JSON on stdout in text/markdown modes too. */
  emitJson?: boolean;
}

function readJsonFile<T>(rootDir: string, path: string, what: string): T {
  const abs = resolveExplicitPath(rootDir, path);
  try {
    return JSON.parse(readFileSync(abs, 'utf8')) as T;
  } catch (err) {
    throw new Error(`Could not read ${what} at ${path}: ${(err as Error).message}`);
  }
}

function reportOutput(
  report: EvaluationReport,
  emitJson: boolean,
  text: string,
  markdown: string,
  exitCode: number,
): CommandOutput {
  return {
    text: emitJson ? `${text}\n${renderJson(report)}` : text,
    json: JSON.parse(renderJson(report)) as Record<string, unknown>,
    markdown,
    exitCode,
  };
}

export async function runCheck(opts: CheckOptions): Promise<CommandOutput> {
  // --- remote (GitHub pull request) -------------------------------------
  if (opts.pr !== undefined) {
    if (!opts.repo || !opts.token) {
      throw new Error('PR mode requires --repo owner/repo and --token (or --token-env).');
    }
    const { owner, repo } = splitRepository(opts.repo);
    const provider = new GitHubProvider({
      owner,
      repo,
      token: opts.token,
      ...(opts.apiBaseUrl ? { apiBaseUrl: opts.apiBaseUrl } : {}),
    });

    const subject = await provider.getPullRequest(opts.pr);
    // Trust boundary (ADR-0005): the policy is read at the BASE commit only.
    const baseSha = subject.baseSha;
    if (!baseSha) {
      throw new Error('Cannot determine the trusted base commit for this pull request.');
    }
    const policyPath = opts.policyPath ?? 'contribspec.yml';
    const policyText = await provider.getFileText(baseSha, policyPath);
    if (policyText === null) {
      return {
        text:
          `No contribution policy found at the base commit ${baseSha} (${policyPath}).\n` +
          `The policy is intentionally not read from the pull request head. ` +
          `Add ${policyPath} to the target branch, or run "contribspec init".\n`,
        json: {
          error: 'POLICY-NOT-FOUND-AT-BASE',
          message: `Policy ${policyPath} not found at base commit ${baseSha}.`,
          policyPath,
          baseSha,
        },
        markdown:
          `### ContribSpec — ⚠️ no policy at base commit\n\n` +
          `No \`${policyPath}\` exists at base commit \`${subject.baseSha}\`. ` +
          `The policy is never read from the pull request head.\n`,
        exitCode: 2,
      };
    }
    const loaded = loadPolicyText(policyText, {
      path: policyPath,
      source: `base-commit:${baseSha.slice(0, 12)}`,
    });
    if (!loaded.resolved) {
      return {
        text: `Policy at base commit is invalid:\n${loaded.diagnostics.map((d) => `  ${d.path}: ${d.message}`).join('\n')}\n`,
        json: { error: 'POLICY-INVALID-AT-BASE', diagnostics: loaded.diagnostics },
        markdown: `### ContribSpec — ❌ policy at base commit is invalid\n`,
        exitCode: 2,
      };
    }

    const evidence: Evidence[] = [
      ...(await provider.getCheckRunEvidence(subject.headSha)),
      ...(await provider.getCommitStatusEvidence(subject.headSha)),
    ];
    const dco = commitsToDcoEvidence(subject.commits ?? []);
    if (dco) {
      evidence.push(dco);
    }

    const report = evaluateContribution({
      policy: {
        ...loaded.resolved,
        ...(opts.mode ? { enforcement: { ...loaded.resolved.enforcement, mode: opts.mode } } : {}),
      },
      subject,
      evidence,
      options: { toolVersion: TOOL_VERSION },
    });
    const decision = gateDecision(report);
    return reportOutput(
      report,
      opts.emitJson ?? false,
      renderText(report),
      renderMarkdown(report),
      decision.exitCode,
    );
  }

  // --- local (contribution file) ---------------------------------------
  const subject = readJsonFile<ContributionSubject>(
    opts.rootDir,
    opts.contributionPath ?? 'contribution.json',
    'contribution file',
  );
  const evidence = opts.evidencePath
    ? readJsonFile<Evidence[]>(opts.rootDir, opts.evidencePath, 'evidence file')
    : [];

  let loaded;
  try {
    loaded = loadPolicyFile(opts.rootDir, opts.policyPath);
  } catch (err) {
    if (err instanceof PolicyNotFoundError) {
      return {
        text: `${err.message}\n`,
        json: { error: 'POLICY-NOT-FOUND', message: err.message },
        markdown: `### ContribSpec — ❌ policy not found\n\n${err.message}\n`,
        exitCode: 2,
      };
    }
    throw err;
  }
  if (!loaded.resolved) {
    return {
      text: `Policy is invalid:\n${loaded.diagnostics.map((d) => `  ${d.path}: ${d.message}`).join('\n')}\n`,
      json: { error: 'POLICY-INVALID', diagnostics: loaded.diagnostics },
      markdown: `### ContribSpec — ❌ policy invalid\n`,
      exitCode: 2,
    };
  }

  const report = evaluateContribution({
    policy: {
      ...loaded.resolved,
      ...(opts.mode ? { enforcement: { ...loaded.resolved.enforcement, mode: opts.mode } } : {}),
    },
    subject,
    evidence,
    options: { toolVersion: TOOL_VERSION },
  });
  const decision = gateDecision(report);
  if (opts.emitJson) {
    process.stdout.write(renderJson(report));
  }
  return reportOutput(report, false, renderText(report), renderMarkdown(report), decision.exitCode);
}

/** Helper used by the action to turn a report into outputs. */
export { summarize };

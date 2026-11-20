/**
 * Forge provider interface (ADR-0001: core must not depend on any forge API).
 *
 * Implementations live in @contribspec/integrations (GitHub first; GitLab and
 * Forgejo adapters implement the same interface later). The GitHub Action and
 * the CLI only ever talk to a provider through this contract.
 */

import type { ContributionSubject, Evidence, ProviderId } from './types.js';

export interface ForgeProvider {
  readonly id: ProviderId;
  /** Repository identifier this provider serves ("owner/repo"). */
  readonly repository: string;

  /** Fetches pull request metadata normalized to a ContributionSubject. */
  getPullRequest(number: number): Promise<ContributionSubject>;

  /**
   * Fetches a text file at an arbitrary ref. The ref must be supplied by the
   * caller from a trusted source (e.g. the base commit SHA) — implementations
   * must not resolve refs from untrusted input on their own.
   */
  getFileText(ref: string, path: string): Promise<string | null>;

  /** Normalized evidence from check runs bound to `sha`. */
  getCheckRunEvidence(sha: string): Promise<Evidence[]>;

  /** Normalized evidence from commit statuses bound to `sha`. */
  getCommitStatusEvidence(sha: string): Promise<Evidence[]>;

  /** Commit list for a pull request (messages + parsed sign-offs). */
  getPullRequestCommits(number: number): Promise<ContributionSubject['commits']>;
}

export interface CheckRunPublisher {
  /**
   * Publishes a check run for `sha`. Returns false when the token lacks the
   * `checks: write` permission (callers then degrade gracefully).
   */
  publishCheckRun(input: {
    sha: string;
    name: string;
    summary: string;
    title: string;
    conclusion: 'success' | 'failure' | 'action_required';
    detailsUrl?: string;
  }): Promise<boolean>;
}

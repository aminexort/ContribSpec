/**
 * GitHub forge provider — implements the forge-neutral ForgeProvider contract
 * from @contribspec/core (ADR-0001 / ADR-0005).
 *
 * Trust model: callers pass refs/SHAs from trusted sources. Policy files are
 * only ever read at an explicit ref (the base commit) — never at the PR head.
 */

import type {
  CheckRunPublisher,
  ContributionSubject,
  CommitInfo,
  Evidence,
  ForgeProvider,
} from '@contribspec/core';
import { parseSignoffs, sanitizeInline, sanitizeText } from '@contribspec/core';
import {
  GitHubClient,
  numberField,
  type GitHubClientOptions,
} from './client.js';
import {
  checkRunToEvidence,
  commitsToDcoEvidence,
  commitStatusToEvidence,
  type RawCheckRun,
  type RawCommitStatus,
} from '../evidence/normalize.js';

/** Caps on metadata collection (threat model T7). */
export const MAX_COMMITS = 300;
export const MAX_CHECK_RUNS = 200;
export const MAX_STATUSES = 200;
export const MAX_POLICY_TEXT_BYTES = 256 * 1024;

export interface GitHubProviderOptions extends GitHubClientOptions {
  owner: string;
  repo: string;
}

type Json = Record<string, unknown>;

function asArray(value: unknown): Json[] {
  return Array.isArray(value) ? value.filter((v): v is Json => typeof v === 'object' && v !== null) : [];
}

export class GitHubProvider implements ForgeProvider, CheckRunPublisher {
  readonly id = 'github' as const;
  readonly repository: string;
  private readonly client: GitHubClient;
  private readonly owner: string;
  private readonly repo: string;

  constructor(options: GitHubProviderOptions) {
    this.owner = options.owner;
    this.repo = options.repo;
    this.repository = `${options.owner}/${options.repo}`;
    this.client = new GitHubClient(options);
  }

  async getPullRequest(number: number): Promise<ContributionSubject> {
    const pr = await this.client.getJson(`/repos/${this.owner}/${this.repo}/pulls/${number}`);
    const head = (pr.head ?? {}) as Json;
    const base = (pr.base ?? {}) as Json;
    const user = (pr.user ?? {}) as Json;
    const labels = asArray(pr.labels).map((l) => sanitizeInline(l.name ?? '', 100));

    const subject: ContributionSubject = {
      provider: 'github',
      repository: this.repository,
      number,
      title: sanitizeText(pr.title ?? '', 500),
      body: sanitizeText(pr.body ?? ''),
      author: sanitizeInline(user.login ?? '', 200),
      headSha: String(head.sha ?? ''),
      baseSha: String(base.sha ?? ''),
      baseRef: sanitizeInline(base.ref ?? '', 200),
      labels,
    };
    const changedFiles = numberField(pr, 'changed_files');
    if (changedFiles !== undefined) {
      subject.changedFiles = changedFiles;
    }
    const additions = numberField(pr, 'additions');
    const deletions = numberField(pr, 'deletions');
    if (additions !== undefined && deletions !== undefined) {
      subject.changedLines = additions + deletions;
    }
    subject.commits = await this.getPullRequestCommits(number);
    return subject;
  }

  async getPullRequestCommits(number: number): Promise<CommitInfo[]> {
    const payload = await this.client.getJson(
      `/repos/${this.owner}/${this.repo}/pulls/${number}/commits?per_page=100`,
    );
    return asArray(payload)
      .slice(0, MAX_COMMITS)
      .map((entry) => {
        const commit = (entry.commit ?? {}) as Json;
        const message = sanitizeText(commit.message ?? '', 10_000);
        return {
          sha: String(entry.sha ?? ''),
          message,
          authorName: sanitizeInline(((commit.author ?? {}) as Json).name ?? '', 200),
          signoffs: parseSignoffs(message),
        };
      });
  }

  /**
   * Fetches a text file at an explicit ref. The ref MUST come from a trusted
   * caller (e.g. the base commit SHA). Returns null for missing files.
   */
  async getFileText(ref: string, path: string): Promise<string | null> {
    if (!/^[0-9a-f]{7,64}$/.test(ref) && !/^[A-Za-z0-9._/-]{1,200}$/.test(ref)) {
      throw new Error(`Refusing to read file at untrusted ref: ${sanitizeInline(ref, 100)}`);
    }
    if (!/^[A-Za-z0-9._/-]{1,300}$/.test(path)) {
      throw new Error(`Refusing to read file with unsafe path: ${sanitizeInline(path, 100)}`);
    }
    let payload: Json;
    try {
      payload = await this.client.getJson(
        `/repos/${this.owner}/${this.repo}/contents/${path}?ref=${encodeURIComponent(ref)}`,
      );
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 404) {
        return null;
      }
      throw err;
    }
    const encoding = String(payload.encoding ?? '');
    const content = String(payload.content ?? '');
    if (encoding === 'base64') {
      const text = Buffer.from(content.replace(/\n/g, ''), 'base64').toString('utf8');
      return text.length > MAX_POLICY_TEXT_BYTES ? text.slice(0, MAX_POLICY_TEXT_BYTES) : text;
    }
    if (typeof payload.content === 'string') {
      return payload.content;
    }
    return null;
  }

  async getCheckRunEvidence(sha: string): Promise<Evidence[]> {
    const payload = await this.client.getJson(
      `/repos/${this.owner}/${this.repo}/commits/${sha}/check-runs?per_page=100`,
    );
    const runs = asArray(payload.check_runs).slice(0, MAX_CHECK_RUNS) as unknown as RawCheckRun[];
    return runs.map((run) => checkRunToEvidence(run, sha));
  }

  async getCommitStatusEvidence(sha: string): Promise<Evidence[]> {
    const payload = await this.client.getJson(
      `/repos/${this.owner}/${this.repo}/commits/${sha}/statuses?per_page=100`,
    );
    const statuses = asArray(payload).slice(0, MAX_STATUSES) as unknown as RawCommitStatus[];
    return statuses.map((s) => commitStatusToEvidence(s, sha));
  }

  /** Convenience: DCO evidence derived from the PR's commit trailers. */
  async getDcoEvidence(number: number): Promise<Evidence[]> {
    const commits = await this.getPullRequestCommits(number);
    const dco = commitsToDcoEvidence(commits);
    return dco ? [dco] : [];
  }

  /** Publishes a check run; returns false when the token lacks checks:write. */
  async publishCheckRun(input: {
    sha: string;
    name: string;
    summary: string;
    title: string;
    conclusion: 'success' | 'failure' | 'action_required';
    detailsUrl?: string;
  }): Promise<boolean> {
    const result = await this.client.postJsonOptional(`/repos/${this.owner}/${this.repo}/check-runs`, {
      name: input.name.slice(0, 100),
      head_sha: input.sha,
      status: 'completed',
      conclusion: input.conclusion,
      output: {
        title: input.title.slice(0, 255),
        // GitHub caps check-run summaries at 65535 characters.
        summary: input.summary.slice(0, 65_000),
      },
      ...(input.detailsUrl ? { details_url: input.detailsUrl } : {}),
    });
    return result.ok;
  }
}

/** Parses "owner/repo" into its parts. */
export function splitRepository(repository: string): { owner: string; repo: string } {
  const parts = repository.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1] || !/^[A-Za-z0-9._-]+$/.test(parts[0]) || !/^[A-Za-z0-9._-]+$/.test(parts[1])) {
    throw new Error(`Invalid repository identifier: ${sanitizeInline(repository, 100)} (expected "owner/repo")`);
  }
  return { owner: parts[0], repo: parts[1] };
}
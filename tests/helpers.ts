/**
 * Shared test helpers: temp workspaces and a route-based fake fetch for
 * GitHub API integration tests (no network access in tests).
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function makeTempDir(prefix = 'contribspec-test-'): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return dir;
}

export function cleanupTempDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

export function writeTempFile(dir: string, name: string, content: string): string {
  const path = join(dir, name);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content, 'utf8');
  return path;
}

// ---------------------------------------------------------------------------
// Fake GitHub fetch
// ---------------------------------------------------------------------------

export interface FakeRoute {
  method: 'GET' | 'POST';
  /** Matched with String.includes against "method url". */
  pattern: string;
  status?: number;
  body?: unknown;
}

export interface FakeFetch {
  fetchImpl: typeof fetch;
  calls: { method: string; url: string; body?: string }[];
}

export function fakeFetch(routes: FakeRoute[]): FakeFetch {
  const calls: FakeFetch['calls'] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? init.body : undefined;
    calls.push({ method, url, ...(body !== undefined ? { body } : {}) });

    for (const route of routes) {
      if (route.method === method && url.includes(route.pattern)) {
        return new Response(JSON.stringify(route.body ?? {}), {
          status: route.status ?? 200,
          headers: { 'content-type': 'application/json' },
        });
      }
    }
    return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

/** Standard test identities. */
export const T = {
  sha: 'a'.repeat(40),
  otherSha: 'b'.repeat(40),
  baseSha: 'c'.repeat(40),
  policy: `version: 1\nproject:\n  name: fixture-project\n`,
};

export function b64(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64');
}

/** GitHub API routes that describe one healthy pull request. */
export function healthyPullRequestRoutes(overrides: {
  policyText?: string;
  checkRuns?: unknown[];
  statuses?: unknown[];
  prBody?: string;
  commits?: unknown[];
} = {}): FakeRoute[] {
  const policyText = overrides.policyText ?? T.policy;
  return [
    {
      method: 'GET',
      pattern: '/repos/acme/demo/pulls/42/commits',
      body: overrides.commits ?? [
        {
          sha: T.sha,
          commit: {
            message: 'feat: add thing\n\nSigned-off-by: Alice <alice@example.com>',
            author: { name: 'Alice' },
          },
        },
      ],
    },
    {
      method: 'GET',
      pattern: '/repos/acme/demo/pulls/42',
      body: {
        number: 42,
        title: 'Add thing',
        body: overrides.prBody ?? 'Adds a thing.',
        user: { login: 'alice' },
        head: { sha: T.sha, ref: 'feature' },
        base: { sha: T.baseSha, ref: 'main' },
        changed_files: 3,
        additions: 40,
        deletions: 10,
        labels: [],
      },
    },
    {
      method: 'GET',
      pattern: '/repos/acme/demo/contents/contribspec.yml',
      body: { encoding: 'base64', content: b64(policyText) },
    },
    {
      method: 'GET',
      pattern: '/check-runs',
      body: { check_runs: overrides.checkRuns ?? [] },
    },
    {
      method: 'GET',
      pattern: '/statuses',
      body: overrides.statuses ?? [],
    },
    {
      method: 'POST',
      pattern: '/check-runs',
      status: 201,
      body: { id: 1 },
    },
  ];
}
/**
 * GitHub Action integration tests (ADR-0005 trust model).
 *
 * The action's runAction() is executed in-process against a mocked GitHub API
 * and synthetic GITHUB_* environment. No network, no real repository.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runAction, MAX_EVENT_BYTES } from '@contribspec/github-action';
import { packageRoot } from '@contribspec/test-fixtures';
import {
  T,
  b64,
  cleanupTempDir,
  fakeFetch,
  healthyPullRequestRoutes,
  makeTempDir,
  writeTempFile,
  type FakeRoute,
} from './helpers.js';

const ESC = '\u001b';

interface Harness {
  env: Record<string, string>;
  outputPath: string;
  summaryPath: string;
  readOutput(): string;
  readSummary(): string;
}

function harness(dir: string, overrides: Record<string, string> = {}): Harness {
  const eventPath = writeTempFile(
    dir,
    'event.json',
    JSON.stringify({
      action: 'opened',
      number: 42,
      pull_request: {
        number: 42,
        title: 'Add thing',
        body: 'Adds a thing.',
        user: { login: 'alice' },
        head: { sha: T.sha, ref: 'feature' },
        base: { sha: T.baseSha, ref: 'main' },
      },
      repository: { full_name: 'acme/demo' },
    }),
  );
  const outputPath = join(dir, 'gh_output');
  const summaryPath = join(dir, 'gh_summary');
  writeFileSync(outputPath, '');
  writeFileSync(summaryPath, '');
  return {
    env: {
      GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_REPOSITORY: 'acme/demo',
      GITHUB_OUTPUT: outputPath,
      GITHUB_STEP_SUMMARY: summaryPath,
      'INPUT_POLICY-PATH': 'contribspec.yml',
      'INPUT-MODE': '',
      'INPUT_REPORT-NAME': 'ContribSpec verification',
      INPUT_TOKEN: 'test-token',
      ...overrides,
    },
    outputPath,
    summaryPath,
    readOutput: () => readFileSync(outputPath, 'utf8'),
    readSummary: () => readFileSync(summaryPath, 'utf8'),
  };
}

function routesWith(
  overrides: Parameters<typeof healthyPullRequestRoutes>[0] = {},
  extra: FakeRoute[] = [],
): FakeRoute[] {
  return [...healthyPullRequestRoutes(overrides), ...extra];
}

test('healthy pull request: report is produced, check published, outputs written', async () => {
  const dir = makeTempDir();
  try {
    const h = harness(dir);
    const { fetchImpl, calls } = fakeFetch(
      routesWith({
        policyText: `version: 1\nproject:\n  name: demo\ncontributions:\n  verification:\n    required_checks: [unit-tests]\n`,
        checkRuns: [
          {
            name: 'unit-tests',
            status: 'completed',
            conclusion: 'success',
            head_sha: T.sha,
            output: { title: 'ok' },
          },
        ],
      }),
    );
    const result = await runAction({ env: h.env, fetchImpl, log: () => {} });
    assert.equal(result.result, 'pass');
    assert.equal(result.exitCode, 0);
    assert.equal(result.checkPublished, true);

    // Policy must be requested at the BASE commit — never the head.
    const contentCall = calls.find((c) => c.url.includes('/contents/'));
    assert.ok(contentCall);
    assert.ok(
      contentCall.url.includes(`ref=${T.baseSha}`),
      `policy must load at base sha: ${contentCall.url}`,
    );
    assert.ok(!contentCall.url.includes(`ref=${T.sha}`));

    const output = h.readOutput();
    assert.match(output, /result<</);
    assert.match(output, /"reportVersion": "1\.0"/);

    const posted = calls.find((c) => c.method === 'POST' && c.url.includes('/check-runs'));
    assert.ok(posted);
    assert.ok(posted.body?.includes(T.sha), 'check run is bound to the head sha');
  } finally {
    cleanupTempDir(dir);
  }
});

test('pull_request_target events are refused (secret exposure risk)', async () => {
  const dir = makeTempDir();
  try {
    const h = harness(dir, { GITHUB_EVENT_NAME: 'pull_request_target' });
    await assert.rejects(
      () => runAction({ env: h.env, fetchImpl: fakeFetch([]).fetchImpl, log: () => {} }),
      /pull_request_target/,
    );
  } finally {
    cleanupTempDir(dir);
  }
});

test('non-pull-request events are refused', async () => {
  const dir = makeTempDir();
  try {
    const h = harness(dir, { GITHUB_EVENT_NAME: 'push' });
    await assert.rejects(
      () => runAction({ env: h.env, fetchImpl: fakeFetch([]).fetchImpl, log: () => {} }),
      /pull request/i,
    );
  } finally {
    cleanupTempDir(dir);
  }
});

test('missing policy at base commit fails closed — never falls back to the head', async () => {
  const dir = makeTempDir();
  try {
    const h = harness(dir);
    const routes = routesWith({ policyText: 'version: 1' }).map((r) =>
      r.method === 'GET' && r.pattern.includes('/contents/')
        ? { ...r, status: 404, body: { message: 'Not Found' } }
        : r,
    );
    const { fetchImpl } = fakeFetch(routes);
    const result = await runAction({ env: h.env, fetchImpl, log: () => {} });
    assert.equal(result.result, 'error');
    assert.equal(result.exitCode, 1);
    assert.match(h.readOutput(), /POLICY-NOT-FOUND-AT-BASE/);
  } finally {
    cleanupTempDir(dir);
  }
});

test('invalid policy at base commit is reported, not guessed at', async () => {
  const dir = makeTempDir();
  try {
    const h = harness(dir);
    const { fetchImpl } = fakeFetch(routesWith({ policyText: 'version: 99\nbad: true\n' }));
    const result = await runAction({ env: h.env, fetchImpl, log: () => {} });
    assert.equal(result.result, 'error');
    assert.match(h.readOutput(), /POLICY-INVALID-AT-BASE/);
  } finally {
    cleanupTempDir(dir);
  }
});

test('stale evidence is not counted; missing evidence is distinct from failure', async () => {
  const dir = makeTempDir();
  try {
    const h = harness(dir);
    const { fetchImpl } = fakeFetch(
      routesWith({
        policyText: `version: 1\nproject:\n  name: demo\ncontributions:\n  verification:\n    required_checks: [unit-tests]\n`,
        checkRuns: [
          {
            name: 'unit-tests',
            status: 'completed',
            conclusion: 'success',
            head_sha: T.otherSha, // evidence for a DIFFERENT commit
          },
        ],
      }),
    );
    const result = await runAction({ env: h.env, fetchImpl, log: () => {} });
    assert.equal(result.result, 'unverified');
    assert.equal(result.exitCode, 0, 'missing evidence does not gate by default');
    assert.match(h.readOutput(), /VER-002/);
  } finally {
    cleanupTempDir(dir);
  }
});

test('mode override input changes gating behavior', async () => {
  const dir = makeTempDir();
  try {
    const h = harness(dir, { 'INPUT-MODE': 'enforce' });
    const { fetchImpl } = fakeFetch(
      routesWith({
        policyText: `version: 1\nproject:\n  name: demo\ncontributions:\n  pull_requests:\n    max_changed_files: 1\n`,
      }),
    );
    const result = await runAction({ env: h.env, fetchImpl, log: () => {} });
    // PR has 3 changed files > limit 1 → violation → enforce gates.
    assert.equal(result.result, 'fail');
    assert.equal(result.exitCode, 1);
  } finally {
    cleanupTempDir(dir);
  }
});

test('without checks:write the action degrades gracefully to outputs + summary', async () => {
  const dir = makeTempDir();
  try {
    const h = harness(dir);
    const routes = routesWith({}).map((r) =>
      r.method === 'POST' ? { ...r, status: 403, body: { message: 'Resource not accessible' } } : r,
    );
    const { fetchImpl } = fakeFetch(routes);
    const result = await runAction({ env: h.env, fetchImpl, log: () => {} });
    assert.equal(result.checkPublished, false);
    assert.equal(result.result, 'pass');
    assert.ok(h.readOutput().length > 0, 'outputs still written');
  } finally {
    cleanupTempDir(dir);
  }
});

test('malicious PR metadata cannot inject into the job summary', async () => {
  const dir = makeTempDir();
  try {
    const h = harness(dir);
    const evilBody = `${ESC}[31mINJECTED${ESC}[0m <script>alert(1)</script> ${'x'.repeat(20000)}`;
    const routes = healthyPullRequestRoutes({
      prBody: evilBody,
      policyText: 'version: 1\nproject:\n  name: demo\n',
    });
    const { fetchImpl } = fakeFetch(routes);
    await runAction({ env: h.env, fetchImpl, log: () => {} });
    const summary = h.readSummary();
    assert.ok(!summary.includes(ESC), 'no ANSI escapes in job summary');
    assert.ok(!summary.includes('<script>'), 'no raw HTML injection in job summary');
  } finally {
    cleanupTempDir(dir);
  }
});

test('huge event payloads are rejected', async () => {
  const dir = makeTempDir();
  try {
    const h = harness(dir);
    writeFileSync(h.env.GITHUB_EVENT_PATH as string, 'x'.repeat(MAX_EVENT_BYTES + 1));
    await assert.rejects(
      () => runAction({ env: h.env, fetchImpl: fakeFetch([]).fetchImpl, log: () => {} }),
      /too large/,
    );
  } finally {
    cleanupTempDir(dir);
  }
});

test('token never appears in outputs or summaries', async () => {
  const dir = makeTempDir();
  try {
    const h = harness(dir, { INPUT_TOKEN: 'super-secret-token-value' });
    const { fetchImpl, calls } = fakeFetch(routesWith({}));
    await runAction({ env: h.env, fetchImpl, log: () => {} });
    assert.ok(!h.readOutput().includes('super-secret-token-value'));
    assert.ok(!h.readSummary().includes('super-secret-token-value'));
    // The token is only present in the Authorization header of API calls.
    for (const call of calls) {
      assert.ok(!call.url.includes('super-secret-token-value'));
    }
  } finally {
    cleanupTempDir(dir);
  }
});

test('the bundled action file exists for distribution', () => {
  const bundle = join(packageRoot(), '..', 'github-action', 'dist', 'index.mjs');
  assert.ok(existsSync(bundle), 'run "npm run build" to produce the action bundle');
  const content = readFileSync(bundle, 'utf8');
  assert.ok(content.length > 10_000);
});

test('appendFileSync-safe output format keeps multi-line JSON intact', async () => {
  const dir = makeTempDir();
  try {
    const h = harness(dir);
    const { fetchImpl } = fakeFetch(routesWith({}));
    await runAction({ env: h.env, fetchImpl, log: () => {} });
    const raw = h.readOutput();
    const match = /report<<__CONTRIBSPEC_EOF__\n([\s\S]*?)\n__CONTRIBSPEC_EOF__/.exec(raw);
    assert.ok(match?.[1], 'report output uses heredoc delimiters');
    const report = JSON.parse(match[1]) as Record<string, unknown>;
    assert.equal(report.reportVersion, '1.0');
    // Sanity: writing more outputs later must not corrupt earlier ones.
    appendFileSync(h.outputPath, 'later<<__CONTRIBSPEC_EOF__\nvalue\n__CONTRIBSPEC_EOF__\n');
    assert.ok(readFileSync(h.outputPath, 'utf8').includes('"reportVersion"'));
  } finally {
    cleanupTempDir(dir);
  }
});

// Keep T/b64 referenced for type-checkers of the helper surface.
void T;
void b64;

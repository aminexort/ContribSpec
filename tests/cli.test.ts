/**
 * CLI integration tests: the shipped CLI binary is executed end-to-end on
 * temporary workspaces (spawning processes with shell disabled).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { packageRoot, policiesDir, malformedDir } from '@contribspec/test-fixtures';
import { makeTempDir, cleanupTempDir } from './helpers.js';

const CLI = join(packageRoot(), '..', 'cli', 'dist', 'main.js');

function run(
  dir: string,
  args: string[],
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd: dir,
    encoding: 'utf8',
    shell: false,
    timeout: 60_000,
  });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

test('version prints tool, schema and contract versions', () => {
  const dir = makeTempDir();
  try {
    const r = run(dir, ['version']);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /contribspec \d+\.\d+\.\d+/);
    assert.match(r.stdout, /policy-schema 1/);
    assert.match(r.stdout, /report-contract 1\.0/);
  } finally {
    cleanupTempDir(dir);
  }
});

test('init (non-interactive) → validate → explain happy path', () => {
  const dir = makeTempDir();
  try {
    const init = run(dir, ['init', '--profile', 'node', '--name', 'demo', '--yes']);
    assert.equal(init.status, 0, init.stderr);
    assert.ok(existsSync(join(dir, 'contribspec.yml')));

    const validate = run(dir, ['validate']);
    assert.equal(validate.status, 0, validate.stdout + validate.stderr);
    assert.match(validate.stdout, /valid/);

    const explain = run(dir, ['explain']);
    assert.equal(explain.status, 0);
    assert.match(explain.stdout, /\[PR-001\]/);
    assert.match(explain.stdout, /\[VER-001\]/);
  } finally {
    cleanupTempDir(dir);
  }
});

test('init refuses to overwrite without --force', () => {
  const dir = makeTempDir();
  try {
    assert.equal(run(dir, ['init', '--yes']).status, 0);
    const second = run(dir, ['init', '--yes']);
    assert.equal(second.status, 1);
    assert.match(second.stdout + second.stderr, /--force/);
    assert.equal(run(dir, ['init', '--yes', '--force']).status, 0);
  } finally {
    cleanupTempDir(dir);
  }
});

test('validate reports unknown keys with suggestions and exits 1', () => {
  const dir = makeTempDir();
  try {
    writeFileSync(
      join(dir, 'contribspec.yml'),
      readFileSync(join(malformedDir(), 'unknown-key.yml'), 'utf8'),
    );
    const r = run(dir, ['validate']);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /pull_request/);
    assert.match(r.stdout, /pull_requests/);
    assert.match(r.stdout, /Did you mean/);
  } finally {
    cleanupTempDir(dir);
  }
});

test('validate --format json emits a machine-readable contract', () => {
  const dir = makeTempDir();
  try {
    writeFileSync(
      join(dir, 'contribspec.yml'),
      readFileSync(join(malformedDir(), 'bad-version.yml'), 'utf8'),
    );
    const r = run(dir, ['validate', '--format', 'json']);
    assert.equal(r.status, 1);
    const json = JSON.parse(r.stdout) as Record<string, unknown>;
    assert.equal(json.ok, false);
    assert.ok(Array.isArray(json.diagnostics));
  } finally {
    cleanupTempDir(dir);
  }
});

test('explain --format markdown produces a requirements table', () => {
  const dir = makeTempDir();
  try {
    writeFileSync(
      join(dir, 'contribspec.yml'),
      readFileSync(join(policiesDir(), 'node-policy.yml'), 'utf8'),
    );
    const r = run(dir, ['explain', '--format', 'markdown']);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /\| Rule \| Requirement \|/);
    assert.match(r.stdout, /`VER-001`/);
  } finally {
    cleanupTempDir(dir);
  }
});

test('check (local) evaluates a contribution file and emits JSON', () => {
  const dir = makeTempDir();
  try {
    writeFileSync(
      join(dir, 'contribspec.yml'),
      readFileSync(join(policiesDir(), 'node-policy.yml'), 'utf8'),
    );
    const contributions = join(packageRoot(), 'fixtures', 'contributions');
    const r = run(dir, [
      'check',
      '--contribution',
      join(contributions, 'pr-basic.json'),
      '--evidence',
      join(contributions, 'evidence-basic.json'),
      '--format',
      'json',
    ]);
    assert.equal(r.status, 0, r.stderr);
    const json = JSON.parse(r.stdout) as Record<string, unknown>;
    assert.equal(json.reportVersion, '1.0');
    assert.equal((json.summary as Record<string, unknown>).result, 'pass');
  } finally {
    cleanupTempDir(dir);
  }
});

test('check --mode enforce exits 1 on violations', () => {
  const dir = makeTempDir();
  try {
    writeFileSync(
      join(dir, 'contribspec.yml'),
      'version: 1\nproject:\n  name: x\ncontributions:\n  pull_requests:\n    max_changed_files: 1\n',
    );
    writeFileSync(
      join(dir, 'contribution.json'),
      JSON.stringify({
        provider: 'local',
        repository: 'acme/x',
        title: 'big',
        body: 'big change',
        author: 'a',
        headSha: 'a'.repeat(40),
        changedFiles: 50,
      }),
    );
    const r = run(dir, ['check', '--contribution', 'contribution.json', '--mode', 'enforce']);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /PR-002/);
  } finally {
    cleanupTempDir(dir);
  }
});

test('policy test runs the built-in conformance suite', () => {
  const dir = makeTempDir();
  try {
    const r = run(dir, ['policy', 'test']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /passed/);
  } finally {
    cleanupTempDir(dir);
  }
});

test('unknown commands exit 2 with usage; missing policy is actionable', () => {
  const dir = makeTempDir();
  try {
    const unknown = run(dir, ['frobnicate']);
    assert.equal(unknown.status, 2);
    assert.match(unknown.stdout, /Usage: contribspec/);

    const noPolicy = run(dir, ['validate']);
    assert.equal(noPolicy.status, 1);
    assert.match(noPolicy.stdout + noPolicy.stderr, /contribspec init/);
  } finally {
    cleanupTempDir(dir);
  }
});

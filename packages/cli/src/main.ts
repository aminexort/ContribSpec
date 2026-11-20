#!/usr/bin/env node
/**
 * contribspec — vendor-neutral contribution policy toolchain.
 *
 * Exit codes: 0 = ok, 1 = findings gate/invalid policy, 2 = usage or
 * operational error. All output formats (text/json/markdown) share the same
 * semantics; the JSON contract is documented in docs/REPORT_FORMAT.md.
 */

import { parseArgs } from 'node:util';
import { cwd } from 'node:process';
import { conformanceDir } from '@contribspec/test-fixtures';
import { emit, isOutputFormat, type OutputFormat } from './output.js';
import { runInit } from './commands/init.js';
import { runValidate } from './commands/validate.js';
import { runCheck } from './commands/check.js';
import { runPolicyTest } from './commands/policy-test.js';
import { explainPolicy, loadPolicyFile, PolicyNotFoundError, type ExplainFormat } from '@contribspec/core';
import { PROFILE_IDS, type ProfileId } from './profiles.js';
import { TOOL_VERSION } from './version.js';

const USAGE = `contribspec ${TOOL_VERSION} — contribution policy toolchain

Usage: contribspec <command> [options]

Commands:
  init                Generate an initial contribution policy
  validate            Validate the policy against the official schema
  explain             Explain the contribution requirements in plain language
  check               Evaluate a contribution against the policy
  policy test         Run conformance tests against policy fixtures
  version             Print version information

Common options:
  --policy <path>     Policy file (default: contribspec.yml in the working directory)
  --format <fmt>      Output format: text | json | markdown (default: text)
  --help              Show this help

init options:
  --profile <id>      minimal | node | python | go | rust | docs (default: minimal)
  --name <name>       Project name (default: directory name)
  --output <path>     Where to write the policy (default: contribspec.yml)
  --force             Overwrite an existing policy file
  --yes               Non-interactive mode

check options:
  --contribution <f>  Contribution JSON (local mode)
  --evidence <f>      Evidence JSON array (local mode)
  --pr <number>       Pull request number (GitHub mode)
  --repo <o/r>        Repository "owner/repo" (GitHub mode)
  --token-env <name>  Env var holding the API token (default: GITHUB_TOKEN)
  --api-base <url>    GitHub API base URL (GHES / testing)
  --mode <mode>       Override enforcement mode: report | advisory | enforce
  --emit-json         Also print the full JSON report in text mode

policy test options:
  --fixtures <dir>    Conformance case directory (default: built-in suite)

Examples:
  contribspec init --profile node --name my-project --yes
  contribspec validate
  contribspec explain --format markdown
  contribspec check --contribution pr.json --evidence evidence.json
  contribspec check --pr 42 --repo acme/widgets
  contribspec policy test
`;

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

async function run(): Promise<number> {
  const argv = process.argv.slice(2);
  const positionals: string[] = [];
  const values: Record<string, string | undefined> = {};
  let boolEmitJson = false;
  let boolForce = false;
  let boolYes = false;

  // Manual pre-scan so "policy test" works as a two-word command with
  // util.parseArgs handling the flags afterwards.
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--emit-json') boolEmitJson = true;
    if (arg === '--force') boolForce = true;
    if (arg === '--yes' || arg === '-y') boolYes = true;
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(USAGE);
      return 0;
    }
    if (arg?.startsWith('--') && !arg.includes('=')) {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        values[arg.slice(2)] = next;
        i += 1;
        continue;
      }
    }
    if (arg?.startsWith('--') && arg.includes('=')) {
      const [key, val] = arg.split(/=(.*)/s);
      values[(key ?? '').slice(2)] = val;
      continue;
    }
    if (arg && !arg.startsWith('-')) {
      positionals.push(arg);
    }
  }

  const command = positionals[0];
  const subcommand = positionals[1];
  const format: OutputFormat = isOutputFormat(values.format) ? values.format : 'text';
  const rootDir = cwd();

  switch (command) {
    case 'version': {
      process.stdout.write(
        `contribspec ${TOOL_VERSION}\npolicy-schema 1\nreport-contract 1.0\nnode ${process.version}\n`,
      );
      return 0;
    }
    case 'init': {
      const profileRaw = values.profile ?? 'minimal';
      if (!(PROFILE_IDS as string[]).includes(profileRaw)) {
        fail(`Unknown profile "${profileRaw}". Available: ${PROFILE_IDS.join(', ')}`);
      }
      const output = await runInit({
        rootDir,
        outputPath: values.output ?? 'contribspec.yml',
        profile: profileRaw as ProfileId,
        ...(values.name ? { projectName: values.name } : {}),
        force: boolForce,
        interactive: !boolYes,
      });
      return emit(format, output, (s) => process.stdout.write(s));
    }
    case 'validate': {
      const output = runValidate({
        rootDir,
        ...(values.policy ? { policyPath: values.policy } : {}),
      });
      return emit(format, output, (s) => process.stdout.write(s));
    }
    case 'explain': {
      let loaded;
      try {
        loaded = loadPolicyFile(rootDir, values.policy);
      } catch (err) {
        if (err instanceof PolicyNotFoundError) {
          process.stderr.write(`${err.message}\n`);
          return 1;
        }
        throw err;
      }
      if (!loaded.resolved) {
        process.stderr.write(
          `Policy is invalid:\n${loaded.diagnostics.map((d) => `  ${d.path}: ${d.message}`).join('\n')}\n`,
        );
        return 1;
      }
      const explainFormat: ExplainFormat = format === 'json' ? 'json' : format === 'markdown' ? 'markdown' : 'text';
      process.stdout.write(explainPolicy(loaded.resolved, explainFormat));
      return 0;
    }
    case 'check': {
      const pr = values.pr !== undefined ? Number(values.pr) : undefined;
      if (pr !== undefined && !Number.isInteger(pr)) {
        fail('--pr must be an integer');
      }
      const tokenEnv = values['token-env'] ?? 'GITHUB_TOKEN';
      const token = values.token ?? process.env[tokenEnv];
      const output = await runCheck({
        rootDir,
        ...(values.policy ? { policyPath: values.policy } : {}),
        ...(values.contribution ? { contributionPath: values.contribution } : {}),
        ...(values.evidence ? { evidencePath: values.evidence } : {}),
        ...(pr !== undefined ? { pr } : {}),
        ...(values.repo ? { repo: values.repo } : {}),
        ...(token ? { token } : {}),
        ...(values['api-base'] ? { apiBaseUrl: values['api-base'] } : {}),
        ...(values.mode === 'report' || values.mode === 'advisory' || values.mode === 'enforce'
          ? { mode: values.mode }
          : {}),
        emitJson: boolEmitJson,
      });
      return emit(format, output, (s) => process.stdout.write(s));
    }
    case 'policy': {
      if (subcommand !== 'test') {
        fail(`Unknown subcommand "policy ${subcommand ?? ''}". Try: contribspec policy test`);
      }
      const output = runPolicyTest({
        fixturesDir: values.fixtures ?? conformanceDir(),
      });
      return emit(format, output, (s) => process.stdout.write(s));
    }
    default:
      process.stdout.write(USAGE);
      return command === undefined ? 0 : 2;
  }
}

// Parse check to validate flags early (also catches typos in flag names).
try {
  parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    strict: false,
    options: {},
  });
} catch {
  fail('Could not parse arguments. Run "contribspec --help".');
}

run()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`contribspec: ${message}\n`);
    process.exitCode = 2;
  });
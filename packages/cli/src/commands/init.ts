/**
 * `contribspec init` — generate an initial contribution policy.
 *
 * Interactive and non-interactive modes. Never overwrites an existing policy
 * without --force, and only ever writes inside the working directory.
 */

import { existsSync, writeFileSync } from 'node:fs';
import { basename, relative } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { loadPolicyText, resolveWithin } from '@contribspec/core';
import { PROFILES, PROFILE_IDS, renderProfile, type ProfileId } from '../profiles.js';
import type { CommandOutput } from '../output.js';

export interface InitOptions {
  rootDir: string;
  outputPath: string;
  profile?: ProfileId;
  projectName?: string;
  force: boolean;
  interactive: boolean;
}

function isProfileId(value: string): value is ProfileId {
  return (PROFILE_IDS as string[]).includes(value);
}

async function prompt(
  rl: ReturnType<typeof createInterface>,
  question: string,
  fallback: string,
): Promise<string> {
  const answer = (await rl.question(`${question} [${fallback}]: `)).trim();
  return answer || fallback;
}

export async function runInit(opts: InitOptions): Promise<CommandOutput> {
  let profileId: ProfileId = opts.profile ?? 'minimal';
  let projectName = opts.projectName ?? basename(opts.rootDir);
  let interactiveUsed = false;

  if (opts.interactive) {
    const rl = createInterface({ input: stdin, output: stdout });
    try {
      interactiveUsed = true;
      projectName = await prompt(rl, 'Project name', projectName);
      stdout.write('Profiles:\n');
      for (const id of PROFILE_IDS) {
        stdout.write(`  ${id.padEnd(8)} ${PROFILES[id].description}\n`);
      }
      const profileAnswer = await prompt(
        rl,
        'Profile (minimal/node/python/go/rust/docs)',
        profileId,
      );
      if (isProfileId(profileAnswer.trim())) {
        profileId = profileAnswer.trim() as ProfileId;
      } else {
        stdout.write(`Unknown profile "${profileAnswer}", using "${profileId}".\n`);
      }
    } finally {
      rl.close();
    }
  }

  const target = resolveWithin(opts.rootDir, opts.outputPath);
  if (existsSync(target) && !opts.force) {
    return {
      text: `Refusing to overwrite existing ${opts.outputPath}. Re-run with --force to replace it.\n`,
      json: { ok: false, error: 'FILE_EXISTS', path: opts.outputPath },
      markdown: `**init failed:** \`${opts.outputPath}\` already exists (use \`--force\` to overwrite).\n`,
      exitCode: 1,
    };
  }

  const content = renderProfile(profileId, projectName);
  // Sanity check: never write a policy that does not validate.
  const validated = loadPolicyText(content, { path: opts.outputPath, source: 'generated' });
  if (!validated.resolved) {
    return {
      text: `Internal error: generated policy failed validation. Please report this.\n`,
      json: {
        ok: false,
        error: 'GENERATED_POLICY_INVALID',
        diagnostics: validated.diagnostics,
      },
      markdown: `**init failed:** generated policy failed validation (internal error).\n`,
      exitCode: 1,
    };
  }

  writeFileSync(target, content, { encoding: 'utf8' });

  const rel = relative(opts.rootDir, target) || opts.outputPath;
  const text =
    `Created ${rel} (profile: ${profileId}).\n` +
    `Next steps:\n` +
    `  1. contribspec validate\n` +
    `  2. contribspec explain\n` +
    `  3. Add the GitHub workflow from docs/QUICKSTART.md\n`;
  return {
    text,
    json: {
      ok: true,
      path: rel,
      profile: profileId,
      project: projectName,
      interactive: interactiveUsed,
    },
    markdown: `Created \`${rel}\` with profile **${profileId}**.\n\nNext: \`contribspec validate\`, then \`contribspec explain\`.\n`,
    exitCode: 0,
  };
}

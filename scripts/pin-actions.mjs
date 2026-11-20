#!/usr/bin/env node
/**
 * pin-actions.mjs — audit (and optionally pin) third-party GitHub Actions.
 *
 * Usage:
 *   node scripts/pin-actions.mjs .github/workflows          # report + suggest
 *   node scripts/pin-actions.mjs .github/workflows --check  # exit 1 if unpinned
 *
 * Suggested SHAs are resolved from the GitHub API at run time (never
 * hard-coded in this repository). Review each suggestion before applying.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const [, , targetDir = '.github/workflows', mode] = process.argv;
const check = mode === '--check';

const USES_RE = /^(\s*-\s*uses:\s*)([^\s#]+)(\s*#.*)?$/gm;
const SHA_RE = /^[^/@]+@[0-9a-f]{40}$/;

function ourOwn(ref) {
  return ref.includes('contribspec');
}

async function resolveTag(ref) {
  // owner/repo[/path]@tag
  const [repoPart, tag] = ref.split('@');
  const [owner, repo] = repoPart.split('/');
  const url = `https://api.github.com/repos/${owner}/${repo}/git/ref/tags/${tag}`;
  try {
    const res = await fetch(url, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'contribspec-pin-actions' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const body = await res.json();
    if (body.object?.type === 'tag') {
      // annotated tag → dereference
      const tagRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/tags/${body.object.sha}`,
        {
          headers: {
            accept: 'application/vnd.github+json',
            'user-agent': 'contribspec-pin-actions',
          },
          signal: AbortSignal.timeout(10_000),
        },
      );
      const tagBody = tagRes.ok ? await tagRes.json() : null;
      return tagBody?.object?.sha ?? null;
    }
    return body.object?.sha ?? null;
  } catch {
    return null;
  }
}

const files = readdirSync(targetDir).filter((f) => /\.ya?ml$/.test(f));
const unpinned = [];

for (const file of files) {
  const path = join(targetDir, file);
  const text = readFileSync(path, 'utf8');
  for (const match of text.matchAll(USES_RE)) {
    const ref = match[2];
    if (ourOwn(ref) || SHA_RE.test(ref)) continue;
    unpinned.push({ path, ref, line: match[0] });
  }
}

if (unpinned.length === 0) {
  console.log('All third-party actions are pinned to commit SHAs.');
  process.exit(0);
}

console.log(`${unpinned.length} unpinned action reference(s):\n`);
for (const item of unpinned) {
  const sha = await resolveTag(item.ref);
  if (sha) {
    console.log(`  ${item.path}: ${item.ref}`);
    console.log(`    -> ${item.ref}@${sha}`);
  } else {
    console.log(`  ${item.path}: ${item.ref}  (could not resolve tag automatically)`);
  }
}

if (check) {
  console.error('\n--check: unpinned actions found. Pin them before release (docs/RELEASING.md).');
  process.exit(1);
}

console.log('\nApply the pins manually (review each SHA), or run with --check in CI.');

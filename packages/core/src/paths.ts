/**
 * Path safety helpers (threat model T10).
 *
 * Policy and fixture paths are attacker-influenced in CI contexts; they must
 * never escape the allowed root via `..`, absolute paths, or symlinks.
 */

import { realpathSync, statSync } from 'node:fs';
import { isAbsolute, join, resolve, sep } from 'node:path';

export class PathTraversalError extends Error {
  constructor(readonly attempted: string) {
    super(
      `Refusing to use path "${attempted}": it resolves outside the allowed root. ` +
        `Paths must stay inside the project directory.`,
    );
    this.name = 'PathTraversalError';
  }
}

function tryRealpath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    // Not yet resolvable (missing file): normalize lexically only.
    return resolve(path);
  }
}

/**
 * Resolves `candidate` against `root` and returns the absolute path, rejecting
 * any path that escapes `root` after symlink resolution.
 */
export function resolveWithin(root: string, candidate: string): string {
  if (candidate.includes('\0')) {
    throw new PathTraversalError(candidate);
  }
  const absRoot = tryRealpath(resolve(root));
  const abs = isAbsolute(candidate) ? resolve(candidate) : resolve(join(absRoot, candidate));
  const real = tryRealpath(abs);
  if (real !== absRoot && !real.startsWith(absRoot + sep)) {
    throw new PathTraversalError(candidate);
  }
  return real;
}

/** True if `path` exists and is a regular file. */
export function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}
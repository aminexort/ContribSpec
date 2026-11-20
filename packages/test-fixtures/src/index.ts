/**
 * @contribspec/test-fixtures — conformance fixtures and sample inputs.
 *
 * `fixtures/conformance/` is the built-in conformance suite that
 * `contribspec policy test --suite builtin` runs (and that CI runs against
 * the engine). `fixtures/policies/` and `fixtures/malformed/` are sample and
 * hostile inputs used by the test suites and by documentation examples.
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

/** Package root (contains fixtures/), resolved from the compiled output. */
export function packageRoot(): string {
  return join(here, '..');
}

/** Built-in conformance suite directory. */
export function conformanceDir(): string {
  return join(packageRoot(), 'fixtures', 'conformance');
}

/** Sample valid policies (one per profile family). */
export function policiesDir(): string {
  return join(packageRoot(), 'fixtures', 'policies');
}

/** Deliberately malformed/hostile policies for negative tests. */
export function malformedDir(): string {
  return join(packageRoot(), 'fixtures', 'malformed');
}

/** Sample contribution/evidence inputs. */
export function contributionsDir(): string {
  return join(packageRoot(), 'fixtures', 'contributions');
}

/**
 * Bundles the GitHub Action into a single dependency-free ESM file.
 *
 * The bundle inlines the workspace packages (and the two approved runtime
 * dependencies, yaml and ajv) so the action ships one inspectable file with
 * no node_modules — ADR-0006.
 */
import { build } from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

await build({
  entryPoints: [join(root, 'packages', 'github-action', 'src', 'main.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: join(root, 'packages', 'github-action', 'dist', 'index.mjs'),
  minify: false,
  sourcemap: false,
  logLevel: 'info',
  banner: {
    // Some bundled CJS deps expect these globals to exist in ESM scope.
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
});

console.log('bundled packages/github-action/dist/index.mjs');
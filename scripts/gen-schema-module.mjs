#!/usr/bin/env node
/**
 * Generates packages/schema/src/generated-schema.ts from the normative JSON Schema file.
 *
 * The JSON file in packages/schema/schema/ is the single source of truth (ADR-0002).
 * This script embeds it as a typed module so runtimes and the bundled GitHub Action can
 * load it without filesystem access. CI verifies that regenerating produces no diff.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const schemaPath = join(root, 'packages', 'schema', 'schema', 'contribspec-policy-v1.schema.json');
const outPath = join(root, 'packages', 'schema', 'src', 'generated-schema.ts');

const schemaText = readFileSync(schemaPath, 'utf8');
// Parse to validate and normalize formatting deterministically.
const schema = JSON.parse(schemaText);
const serialized = JSON.stringify(schema, null, 2);

const output = `// GENERATED FILE — DO NOT EDIT.
// Regenerate with: node scripts/gen-schema-module.mjs
// Source of truth: packages/schema/schema/contribspec-policy-v1.schema.json

/** The normative ContribSpec policy schema (draft 2020-12), embedded at build time. */
export const policySchemaJson: Record<string, unknown> = ${serialized} as Record<string, unknown>;
`;

writeFileSync(outPath, output);
console.log(`wrote ${outPath} (${serialized.length} bytes of schema)`);

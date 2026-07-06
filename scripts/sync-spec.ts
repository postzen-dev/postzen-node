import { copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const defaultSpecPath = resolve(repoRoot, '../postzen/apps/docs/openapi.json');
const sourceSpecPath = resolve(process.env.POSTZEN_SPEC_PATH ?? defaultSpecPath);
const destinationSpecPath = resolve(repoRoot, 'openapi.json');

if (!existsSync(sourceSpecPath)) {
  throw new Error(`OpenAPI spec not found at ${sourceSpecPath}`);
}

copyFileSync(sourceSpecPath, destinationSpecPath);
console.log(`Synced ${sourceSpecPath} -> ${destinationSpecPath}`);

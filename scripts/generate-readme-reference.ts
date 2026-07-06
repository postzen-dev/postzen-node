import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

interface OpenAPISpec {
  paths: Record<string, Record<string, OperationObject | ParameterObject[] | undefined>>;
}

interface ParameterObject {
  name: string;
  in: string;
}

interface OperationObject {
  tags?: string[];
  operationId?: string;
  summary?: string;
}

interface ResourceMethod {
  name: string;
  fullPath: string;
  description: string;
}

const RESOURCE_ORDER = ['profiles', 'accounts', 'connect', 'media', 'posts'];
const DISPLAY_NAME_OVERRIDES: Record<string, string> = {
  connect: 'Connect (OAuth)',
};
const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete']);

function tagToResourceKey(tag: string): string {
  return tag.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function getMethodSortKey(methodName: string): [number, string] {
  const lower = methodName.toLowerCase();

  if (lower.startsWith('list')) return [0, methodName];
  if (lower.startsWith('create')) return [1, methodName];
  if (lower.startsWith('get')) return [2, methodName];
  if (lower.startsWith('update')) return [3, methodName];
  if (lower.startsWith('delete')) return [4, methodName];
  return [5, methodName];
}

function extractMethods(spec: OpenAPISpec): Record<string, ResourceMethod[]> {
  const resources: Record<string, ResourceMethod[]> = {};

  for (const pathItem of Object.values(spec.paths ?? {})) {
    for (const [method, maybeOperation] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method) || !maybeOperation || Array.isArray(maybeOperation)) {
        continue;
      }

      const operation = maybeOperation as OperationObject;
      const operationId = operation.operationId;
      const tag = operation.tags?.[0];

      if (!operationId || !tag) {
        continue;
      }

      const resource = tagToResourceKey(tag);
      resources[resource] ??= [];
      resources[resource].push({
        name: operationId,
        fullPath: `${resource}.${operationId}`,
        description: operation.summary ?? operationId,
      });
    }
  }

  for (const methods of Object.values(resources)) {
    methods.sort((a, b) => {
      const aKey = getMethodSortKey(a.name);
      const bKey = getMethodSortKey(b.name);

      if (aKey[0] !== bKey[0]) {
        return aKey[0] - bKey[0];
      }

      return aKey[1].localeCompare(bKey[1]);
    });
  }

  return resources;
}

function generateReference(resources: Record<string, ResourceMethod[]>): string {
  const lines = ['## SDK Reference', ''];

  for (const resource of RESOURCE_ORDER) {
    const methods = resources[resource] ?? [];

    if (methods.length === 0) {
      continue;
    }

    const displayName = DISPLAY_NAME_OVERRIDES[resource] ?? resource.charAt(0).toUpperCase() + resource.slice(1);
    lines.push(`### ${displayName}`);
    lines.push('| Method | Description |');
    lines.push('|--------|-------------|');

    for (const method of methods) {
      lines.push(`| \`${method.fullPath}()\` | ${method.description} |`);
    }

    lines.push('');
  }

  return lines.join('\n');
}

function updateReadme(readmePath: string, referenceSection: string): void {
  const content = readFileSync(readmePath, 'utf8');
  const pattern = /## SDK Reference\n[\s\S]*?(?=## Requirements)/;

  if (!pattern.test(content)) {
    throw new Error('README.md must contain ## SDK Reference before ## Requirements');
  }

  const nextContent = content.replace(pattern, `${referenceSection}\n`);

  if (nextContent !== content) {
    writeFileSync(readmePath, nextContent);
    console.log(`Updated ${readmePath}`);
  } else {
    console.log('README.md SDK Reference is already up to date');
  }
}

function main(): void {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(scriptDir, '..');
  const specPath = resolve(repoRoot, 'openapi.json');
  const readmePath = resolve(repoRoot, 'README.md');
  const spec = JSON.parse(readFileSync(specPath, 'utf8')) as OpenAPISpec;
  const referenceSection = generateReference(extractMethods(spec));

  if (process.argv.includes('--print')) {
    console.log(referenceSection);
    return;
  }

  updateReadme(readmePath, referenceSection);
}

main();

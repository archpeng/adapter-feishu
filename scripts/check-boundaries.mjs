#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = process.cwd();
const dependencyBuckets = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
const sourceRoots = ['src', 'scripts'];
const ignoredDirectories = new Set(['.git', 'node_modules', 'dist', 'coverage', '.local']);
const sourceFilePattern = /\.(?:mjs|cjs|js|ts|tsx)$/;

const forbiddenPackages = [
  { label: '@mariozechner/pi-agent-core', matches: (name) => name === '@mariozechner/pi-agent-core' || name.startsWith('@mariozechner/pi-agent-core/') },
  { label: '@mariozechner/pi-ai', matches: (name) => name === '@mariozechner/pi-ai' || name.startsWith('@mariozechner/pi-ai/') },
  { label: '@mariozechner/pi-coding-agent', matches: (name) => name === '@mariozechner/pi-coding-agent' || name.startsWith('@mariozechner/pi-coding-agent/') },
  { label: '@boston-bot/openai-agents-runtime', matches: (name) => name === '@boston-bot/openai-agents-runtime' || name.startsWith('@boston-bot/openai-agents-runtime/') },
  { label: 'OpenAI SDK', matches: (name) => name === 'openai' || name.startsWith('openai/') },
  { label: 'Anthropic SDK', matches: (name) => name === '@anthropic-ai/sdk' || name.startsWith('@anthropic-ai/sdk/') },
  { label: 'Google generative AI SDK', matches: (name) => name === '@google/generative-ai' || name.startsWith('@google/generative-ai/') },
  { label: 'LangChain runtime', matches: (name) => name === 'langchain' || name.startsWith('langchain/') || name.startsWith('@langchain/') },
];

const requiredAgentSnippets = [
  'adapter-feishu` owns Feishu ingress',
  'message/card delivery',
  'typed-card callback transport',
  'allowlists',
  'dedupe',
  'natural-language PMS chat is forwarded to `pms-agent-v2`',
  'typed-card callbacks are forwarded to fixed `pms-platform` pending-action endpoints',
  'Base writes remain managed/registry-bound and never PMS truth',
  'does not own Pi Agent runtime or LLM semantic routing',
  'does not own PMS workflow truth',
  'README must name the active `Feishu -> adapter-feishu -> pms-agent-v2 -> pms-platform` chain',
  '/health` must expose non-sensitive integration config state',
  'Form webhook success and duplicate responses must not expose raw Feishu Base target IDs',
  'explicit typed builders/parsers instead of unchecked `as unknown as` casts',
  'single-responsibility helper extraction'
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readJson(relativePath) {
  try {
    return JSON.parse(readText(relativePath));
  } catch (error) {
    throw new Error(`${relativePath}: invalid JSON: ${error.message}`);
  }
}

function readText(relativePath) {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

function collectFiles(relativeRoot, predicate) {
  const root = join(repoRoot, relativeRoot);
  if (!existsSync(root)) return [];

  const files = [];
  const stack = [relativeRoot];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(join(repoRoot, current), { withFileTypes: true })) {
      const relativePath = `${current}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) stack.push(relativePath);
        continue;
      }
      if (predicate(entry.name, relativePath)) files.push(relativePath);
    }
  }
  return files.sort();
}

function collectPackageManifests() {
  return ['package.json'];
}

function collectSourceFiles() {
  return sourceRoots.flatMap((root) => collectFiles(root, (name) => sourceFilePattern.test(name)));
}

function assertAllowedPackageName(packageName, context) {
  const forbidden = forbiddenPackages.find((rule) => rule.matches(packageName));
  assert(!forbidden, `${context} must not use ${packageName}; ${forbidden?.label ?? packageName} belongs outside adapter-feishu`);
}

function assertPackageManifest(relativePath) {
  const packageJson = readJson(relativePath);
  for (const bucket of dependencyBuckets) {
    for (const packageName of Object.keys(packageJson[bucket] ?? {})) {
      assertAllowedPackageName(packageName, `${relativePath} ${bucket}`);
    }
  }
}

function extractImportSpecifiers(text) {
  const specifiers = new Set();
  const patterns = [
    /(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      specifiers.add(match[1]);
    }
  }
  return [...specifiers];
}

function assertSourceFile(relativePath) {
  const text = readText(relativePath);
  for (const specifier of extractImportSpecifiers(text)) {
    assertAllowedPackageName(specifier, relativePath);
  }
}

assert(existsSync(join(repoRoot, 'AGENTS.md')), 'missing AGENTS.md boundary policy');
assert(existsSync(join(repoRoot, 'package.json')), 'missing package.json');

const agentsText = readText('AGENTS.md');
for (const snippet of requiredAgentSnippets) {
  assert(agentsText.includes(snippet), `AGENTS.md missing boundary snippet: ${snippet}`);
}

const rootPackageJson = readJson('package.json');
assert(
  typeof rootPackageJson.scripts?.['check:boundaries'] === 'string' && rootPackageJson.scripts['check:boundaries'].includes('scripts/check-boundaries.mjs'),
  'package.json missing check:boundaries script for scripts/check-boundaries.mjs'
);
assert(
  typeof rootPackageJson.scripts?.verify === 'string' && rootPackageJson.scripts.verify.includes('npm run check:boundaries'),
  'package.json verify must run npm run check:boundaries before build/test'
);

for (const relativePath of collectPackageManifests()) {
  assertPackageManifest(relativePath);
}

for (const relativePath of collectSourceFiles()) {
  assertSourceFile(relativePath);
}

console.log('adapter-feishu boundary check passed');

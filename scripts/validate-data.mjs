#!/usr/bin/env node
// Dependency-free validation of data/*.json and docs parity (en ↔ ja).
// Runs in CI before the build so broken data never ships.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const err = (m) => errors.push(m);

const REQUIRED = [
  'storage-classes.json',
  's3-pricing.json',
  'timeline.json',
  'commands.json',
  'competitors.json',
  'market.json',
  'cases.json',
  'ecosystem.json',
  'api.json',
  'quiz.json',
];

for (const f of REQUIRED) {
  const p = join(root, 'data', f);
  if (!existsSync(p)) {
    err(`data/${f} is missing`);
    continue;
  }
  try {
    JSON.parse(readFileSync(p, 'utf8'));
  } catch (e) {
    err(`data/${f} is not valid JSON: ${e.message}`);
  }
}

// Docs parity: each ja chapter needs an en counterpart with the same number of headings.
const ja = join(root, 'docs', 'ja');
const en = join(root, 'docs', 'en');
const headings = (p) =>
  readFileSync(p, 'utf8')
    .replace(/```[\s\S]*?```/g, '')
    .match(/^#{1,6} /gm)?.length ?? 0;
if (existsSync(ja)) {
  for (const f of readdirSync(ja).filter((x) => x.endsWith('.md'))) {
    const pe = join(en, f);
    if (!existsSync(pe)) {
      err(`docs/en/${f} is missing (translation of docs/ja/${f})`);
      continue;
    }
    const a = headings(join(ja, f));
    const b = headings(pe);
    if (Math.abs(a - b) > Math.max(2, a * 0.05)) err(`docs/${f}: ja has ${a} headings, en has ${b}`);
  }
}

if (errors.length) {
  console.error(`✗ ${errors.length} problem(s):\n  - ${errors.join('\n  - ')}`);
  process.exit(1);
}
console.log(`✓ data (${REQUIRED.length} files) and docs parity OK`);

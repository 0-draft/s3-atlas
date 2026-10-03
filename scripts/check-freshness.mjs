#!/usr/bin/env node
// Finds S3 announcements newer than the latest timeline entry and data files whose
// verification date is getting old. Writes a Markdown report to stdout; exits 0.
// Used by .github/workflows/freshness.yml to open or update a tracking issue.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FEED = 'https://aws.amazon.com/about-aws/whats-new/recent/feed/';
const STALE_DAYS = 120;
const S3_PATTERN =
  /\b(Amazon S3|S3 (Express|Tables|Vectors|Files|Glacier|Metadata|Storage Lens|Batch|Object|Intelligent|Access)|Amazon Glacier)\b/i;

const timeline = JSON.parse(readFileSync(join(root, 'data/timeline.json'), 'utf8'));
const latest = timeline
  .map((e) => e.date)
  .sort()
  .at(-1);

const decode = (s) =>
  s
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

async function announcements() {
  const res = await fetch(FEED, { headers: { 'user-agent': 's3-atlas-freshness' } });
  if (!res.ok) throw new Error(`feed returned ${res.status}`);
  const xml = await res.text();
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, item]) => {
    const tag = (name) => decode(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(item)?.[1] ?? '').trim();
    return { title: tag('title'), link: tag('link'), date: new Date(tag('pubDate')) };
  });
}

function staleData() {
  const now = Date.now();
  const out = [];
  for (const f of readdirSync(join(root, 'data')).filter((x) => x.endsWith('.json'))) {
    const text = readFileSync(join(root, 'data', f), 'utf8');
    for (const [, d] of text.matchAll(/"verifiedDate"\s*:\s*"(\d{4}-\d{2}-\d{2})"/g)) {
      const age = Math.floor((now - new Date(d).getTime()) / 86_400_000);
      if (age > STALE_DAYS) out.push({ file: f, date: d, age });
    }
  }
  const byFile = new Map();
  for (const s of out) byFile.set(s.file, Math.max(byFile.get(s.file) ?? 0, s.age));
  return [...byFile.entries()];
}

const lines = [`Latest timeline entry: **${latest}**`, ''];
try {
  const fresh = (await announcements()).filter(
    (a) => S3_PATTERN.test(a.title) && a.date.toISOString().slice(0, 10) > latest,
  );
  lines.push(`## New S3 announcements since then (${fresh.length})`, '');
  if (fresh.length === 0) lines.push('None in the current What’s New feed.');
  for (const a of fresh) lines.push(`- ${a.date.toISOString().slice(0, 10)}: [${a.title}](${a.link})`);
} catch (e) {
  lines.push(`Could not read the What’s New feed: ${e.message}`);
}
const stale = staleData();
lines.push('', `## Data verified more than ${STALE_DAYS} days ago (${stale.length} files)`, '');
if (stale.length === 0) lines.push('None.');
for (const [file, age] of stale) lines.push(`- \`data/${file}\`: oldest entry ${age} days old`);
lines.push(
  '',
  'Update `data/timeline.json`, the affected chapters in both `docs/ja` and `docs/en`, and any changed prices.',
);
console.log(lines.join('\n'));

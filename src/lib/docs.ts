import type { Lang } from './i18n';

// Docs live in /docs/<lang>/<slug>.md and are loaded lazily as raw strings.
const loaders = import.meta.glob<string>('../../docs/*/*.md', { query: '?raw', import: 'default' });

function key(lang: Lang, slug: string) {
  return `../../docs/${lang}/${slug}.md`;
}

export function hasDoc(lang: Lang, slug: string): boolean {
  return key(lang, slug) in loaders;
}

export async function loadDoc(lang: Lang, slug: string): Promise<{ body: string; lang: Lang } | null> {
  const order: Lang[] = lang === 'en' ? ['en', 'ja'] : ['ja', 'en'];
  for (const l of order) {
    const load = loaders[key(l, slug)];
    if (load) return { body: await load(), lang: l };
  }
  return null;
}

export function stripTitle(md: string): { title: string | null; rest: string } {
  const m = /^#\s+(.+)\n/.exec(md);
  if (!m) return { title: null, rest: md };
  return { title: m[1].trim(), rest: md.slice(m[0].length) };
}

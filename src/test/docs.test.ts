import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHAPTERS } from '../lib/chapters';
import { rewriteDocHref } from '../lib/links';

const root = join(process.cwd(), 'docs');

describe('docs', () => {
  for (const lang of ['en', 'ja'] as const) {
    it(`every chapter exists in ${lang}`, () => {
      const missing = CHAPTERS.filter((c) => !existsSync(join(root, lang, `${c.slug}.md`))).map(
        (c) => c.slug,
      );
      expect(missing).toEqual([]);
    });

    it(`${lang} has no stray chapter files`, () => {
      const slugs = new Set(CHAPTERS.map((c) => c.slug));
      const stray = readdirSync(join(root, lang))
        .filter((f) => f.endsWith('.md'))
        .map((f) => f.replace(/\.md$/, ''))
        .filter((s) => !slugs.has(s));
      expect(stray).toEqual([]);
    });

    it(`${lang} cross-chapter links resolve`, () => {
      const slugs = new Set(CHAPTERS.map((c) => c.slug));
      const broken: string[] = [];
      for (const c of CHAPTERS) {
        const p = join(root, lang, `${c.slug}.md`);
        if (!existsSync(p)) continue;
        const md = readFileSync(p, 'utf8');
        for (const m of md.matchAll(/\]\(((?!https?:)[^)\s]+\.md)(#[^)]*)?\)/g)) {
          const to = rewriteDocHref(m[1]);
          const slug = to?.replace('/docs/', '');
          if (!slug || !slugs.has(slug)) broken.push(`${c.slug} -> ${m[1]}`);
        }
      }
      expect(broken).toEqual([]);
    });

    it(`${lang} chapters start with a title`, () => {
      for (const c of CHAPTERS) {
        const p = join(root, lang, `${c.slug}.md`);
        if (!existsSync(p)) continue;
        expect(readFileSync(p, 'utf8').startsWith('# '), c.slug).toBe(true);
      }
    });
  }
});

import { createContext, useContext } from 'react';

export type Lang = 'en' | 'ja';
export type L<T = string> = { en: T; ja: T };

export type LangCtx = { lang: Lang; setLang: (l: Lang) => void; t: <T>(v: L<T> | T) => T };

export const LangContext = createContext<LangCtx | null>(null);

export function isLocalized<T>(v: unknown): v is L<T> {
  return typeof v === 'object' && v !== null && 'en' in v && 'ja' in v;
}

export function pick<T>(v: L<T> | T, lang: Lang): T {
  return isLocalized<T>(v) ? (v[lang] ?? v.en) : v;
}

export function useLang(): LangCtx {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('useLang must be used inside LangProvider');
  return ctx;
}

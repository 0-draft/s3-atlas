import type { Lang } from './i18n';

export function usd(n: number | null | undefined, lang: Lang, digits?: number): string {
  if (n == null || Number.isNaN(n)) return '—';
  const d = digits ?? (n !== 0 && Math.abs(n) < 0.01 ? 5 : n < 1 ? 4 : 2);
  return new Intl.NumberFormat(lang === 'ja' ? 'ja-JP' : 'en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: Math.min(2, d),
    maximumFractionDigits: d,
  }).format(n);
}

export function num(n: number, lang: Lang, digits = 0): string {
  return new Intl.NumberFormat(lang === 'ja' ? 'ja-JP' : 'en-US', { maximumFractionDigits: digits }).format(
    n,
  );
}

export function compact(n: number, lang: Lang): string {
  return new Intl.NumberFormat(lang === 'ja' ? 'ja-JP' : 'en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(n);
}

// Years until one expected object loss at 11 nines (annual loss probability 1e-11 per object).
export function yearsPerLoss(objects: number, nines = 11): number {
  return 1 / (objects * 10 ** -nines);
}

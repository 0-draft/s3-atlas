import { useState } from 'react';
import { useLang } from '../../lib/i18n';
import type { Market } from '../../lib/types';

type Row = Market['cloudShare'][number];
const KEYS = [
  { k: 'aws', label: 'AWS', color: 'var(--series-1)' },
  { k: 'azure', label: 'Microsoft Azure', color: 'var(--series-2)' },
  { k: 'gcp', label: 'Google Cloud', color: 'var(--series-3)' },
  { k: 'others', label: { en: 'Everyone else', ja: 'その他' }, color: 'var(--other)' },
] as const;

// 100% stacked horizontal bars, one per period. Shares in percent.
export function ShareBars({ rows }: { rows: Row[] }) {
  const { t } = useLang();
  const [hover, setHover] = useState<string | null>(null);
  return (
    <figure className="viz">
      <div className="viz-legend">
        {KEYS.map((s) => (
          <span key={s.k}>
            <i style={{ background: s.color }} />
            {t(s.label)}
          </span>
        ))}
      </div>
      <div className="share-rows">
        {rows.map((r) => (
          <div className="share-row" key={r.period}>
            <span className="share-period">{r.period}</span>
            <div className="share-bar">
              {KEYS.map((s) => {
                const v = r[s.k];
                const id = `${r.period}-${s.k}`;
                return (
                  <span
                    key={s.k}
                    tabIndex={0}
                    style={{ width: `${v}%`, background: s.color }}
                    onMouseEnter={() => setHover(id)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(id)}
                    onBlur={() => setHover(null)}
                    aria-label={`${t(s.label)} ${v}%`}
                  >
                    {v >= 9 && <em>{v}%</em>}
                    {hover === id && (
                      <span className="viz-tip inline">
                        <strong>{t(s.label)}</strong>
                        <span>
                          {r.period}: {v}%
                        </span>
                      </span>
                    )}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </figure>
  );
}

import { useState } from 'react';
import { useLang } from '../../lib/i18n';
import type { Market } from '../../lib/types';

type Row = Market['objectStorageMarket'][number];

const W = 620;
const H = 300;
const M = { t: 20, r: 12, b: 36, l: 48 };

export function MarketSize({ rows }: { rows: Row[] }) {
  const { lang } = useLang();
  const [hover, setHover] = useState<Row | null>(null);
  const max = Math.ceil(Math.max(...rows.map((r) => r.valueUSDBillions)) / 10) * 10 || 10;
  // Years sit on a true time axis so a 2030 forecast is not drawn next to 2026.
  const y0 = Math.min(...rows.map((r) => r.year));
  const y1 = Math.max(...rows.map((r) => r.year));
  const span = Math.max(1, y1 - y0);
  const plotW = W - M.l - M.r;
  const bw = Math.min(56, plotW / (span + 1) - 6);
  const cx = (year: number) => M.l + bw / 2 + 4 + ((year - y0) / span) * (plotW - bw - 8);
  const y = (v: number) => H - M.b - (v / max) * (H - M.t - M.b);
  const ticks = [0, max / 4, max / 2, (max * 3) / 4, max];
  return (
    <figure className="viz scatter">
      <div className="viz-legend">
        <span>
          <i style={{ background: 'var(--series-1)' }} />
          {lang === 'en' ? 'Reported / estimated' : '実績・推計'}
        </span>
        <span>
          <i className="hatch" />
          {lang === 'en' ? 'Forecast' : '予測'}
        </span>
      </div>
      <div className="viz-plot">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={lang === 'en' ? 'Object storage market size' : 'オブジェクトストレージ市場規模'}
        >
          <defs>
            <pattern
              id="hatch"
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="6" height="6" fill="color-mix(in srgb, var(--series-1) 30%, transparent)" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="var(--series-1)" strokeWidth="2" />
            </pattern>
          </defs>
          {ticks.map((v) => (
            <g key={v}>
              <line className="grid" x1={M.l} x2={W - M.r} y1={y(v)} y2={y(v)} />
              <text className="tick" x={M.l - 8} y={y(v) + 4} textAnchor="end">
                ${Math.round(v)}B
              </text>
            </g>
          ))}
          {rows.map((r) => {
            const x0 = cx(r.year) - bw / 2;
            const h = H - M.b - y(r.valueUSDBillions);
            return (
              <g
                key={r.year}
                tabIndex={0}
                onMouseEnter={() => setHover(r)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(r)}
                onBlur={() => setHover(null)}
              >
                <rect x={x0 - 4} y={M.t} width={bw + 8} height={H - M.t - M.b} fill="transparent" />
                <path
                  d={`M${x0} ${H - M.b} V${y(r.valueUSDBillions) + 4} q0 -4 4 -4 H${x0 + bw - 4} q4 0 4 4 V${H - M.b}Z`}
                  fill={r.isForecast ? 'url(#hatch)' : 'var(--series-1)'}
                  opacity={h > 0 ? 1 : 0}
                />
                <text className="tick" x={cx(r.year)} y={H - M.b + 18} textAnchor="middle">
                  {r.year}
                </text>
              </g>
            );
          })}
        </svg>
        {hover && (
          <div
            className="viz-tip"
            style={{
              left: `${(cx(hover.year) / W) * 100}%`,
              top: `${(y(hover.valueUSDBillions) / H) * 100}%`,
            }}
          >
            <strong>
              {hover.year}
              {hover.isForecast ? (lang === 'en' ? ' (forecast)' : '（予測）') : ''}
            </strong>
            <span>${hover.valueUSDBillions}B</span>
            <span className="muted">{hover.source}</span>
          </div>
        )}
      </div>
    </figure>
  );
}

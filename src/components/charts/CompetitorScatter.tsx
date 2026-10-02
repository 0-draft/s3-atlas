import { useState } from 'react';
import { useLang } from '../../lib/i18n';
import { usd } from '../../lib/format';
import type { Competitor } from '../../lib/types';
import { TYPE_COLOR, TYPE_LABEL } from '../../lib/labels';

const W = 560;
const H = 380;
const M = { t: 16, r: 20, b: 48, l: 58 };

function isS3(p: Competitor) {
  return p.vendor.toLowerCase().includes('amazon');
}

// "Google Cloud Storage (Standard)" → "Google Cloud Storage"
function shortName(p: Competitor) {
  return p.name.replace(/\s*\(.*\)\s*$/, '');
}

function niceMax(v: number) {
  const steps = [0.01, 0.02, 0.025, 0.03, 0.04, 0.05, 0.1, 0.12, 0.15, 0.2];
  return steps.find((s) => s >= v) ?? Math.ceil(v * 10) / 10;
}

export function CompetitorScatter({ items }: { items: Competitor[] }) {
  const { t, lang } = useLang();
  const [hover, setHover] = useState<Competitor | null>(null);
  const pts = items.filter((c) => c.storagePricePerGBMonth != null && c.egressPricePerGB != null);
  const xMax = niceMax(Math.max(...pts.map((p) => p.storagePricePerGBMonth!)) * 1.08);
  const yMax = niceMax(Math.max(...pts.map((p) => p.egressPricePerGB!)) * 1.08);
  const x = (v: number) => M.l + (v / xMax) * (W - M.l - M.r);
  const y = (v: number) => H - M.b - (v / yMax) * (H - M.t - M.b);
  const xt = Array.from({ length: 5 }, (_, i) => (xMax / 4) * i);
  const yt = Array.from({ length: 5 }, (_, i) => (yMax / 4) * i);
  const types = Array.from(new Set(pts.map((p) => p.type)));

  // Direct-label only where a label fits without colliding; the rest are reachable by hover.
  const labelled = new Set<string>();
  const boxes: [number, number, number, number][] = [];
  const priority = [...pts].sort(
    (a, b) => Number(isS3(b)) - Number(isS3(a)) || (a.type === 'hyperscaler' ? -1 : 1),
  );
  for (const p of priority) {
    const lx = x(p.storagePricePerGBMonth!) + 10;
    const ly = y(p.egressPricePerGB!) - 18;
    const box: [number, number, number, number] = [lx, ly, lx + shortName(p).length * 6.2, ly + 13];
    const hit = boxes.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1]);
    if (!hit && box[2] < W) {
      boxes.push(box);
      labelled.add(p.id);
    }
  }

  return (
    <figure className="viz scatter">
      <div className="viz-legend">
        {types.map((ty) => (
          <span key={ty}>
            <i style={{ background: TYPE_COLOR[ty] }} />
            {t(TYPE_LABEL[ty])}
          </span>
        ))}
      </div>
      <div className="viz-plot">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={lang === 'en' ? 'Storage price vs egress price' : '保存単価と転送単価'}
        >
          {yt.map((v) => (
            <g key={`y${v}`}>
              <line className="grid" x1={M.l} x2={W - M.r} y1={y(v)} y2={y(v)} />
              <text className="tick" x={M.l - 8} y={y(v) + 4} textAnchor="end">
                ${v.toFixed(2)}
              </text>
            </g>
          ))}
          {xt.map((v) => (
            <text key={`x${v}`} className="tick" x={x(v)} y={H - M.b + 18} textAnchor="middle">
              ${v.toFixed(3)}
            </text>
          ))}
          <text className="axis-label" x={(W + M.l) / 2} y={H - 8} textAnchor="middle">
            {lang === 'en' ? 'Storage, USD per GB-month' : '保存料 (USD / GB・月)'}
          </text>
          <text
            className="axis-label"
            transform={`translate(14 ${(H - M.b) / 2}) rotate(-90)`}
            textAnchor="middle"
          >
            {lang === 'en' ? 'Egress, USD per GB' : '転送料 (USD / GB)'}
          </text>
          {pts.map((p) => {
            const s3 = isS3(p);
            const cx = x(p.storagePricePerGBMonth!);
            const cy = y(p.egressPricePerGB!);
            return (
              <g
                key={p.id}
                className="pt"
                tabIndex={0}
                onMouseEnter={() => setHover(p)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(p)}
                onBlur={() => setHover(null)}
              >
                <circle cx={cx} cy={cy} r={14} fill="transparent" />
                <circle
                  cx={cx}
                  cy={cy}
                  r={s3 ? 8 : 6}
                  fill={TYPE_COLOR[p.type]}
                  stroke="var(--surface-1)"
                  strokeWidth={2}
                />
                {s3 && <circle cx={cx} cy={cy} r={13} fill="none" stroke="var(--buoy)" strokeWidth={1.5} />}
                {labelled.has(p.id) && (
                  <text className="pt-label" x={cx + 10} y={cy - 8}>
                    {shortName(p)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {hover && (
          <div
            className="viz-tip"
            style={{
              left: `${(x(hover.storagePricePerGBMonth!) / W) * 100}%`,
              top: `${(y(hover.egressPricePerGB!) / H) * 100}%`,
            }}
          >
            <strong>{hover.name}</strong>
            <span>
              {lang === 'en' ? 'Storage' : '保存'} {usd(hover.storagePricePerGBMonth, lang, 4)}/GB·mo
            </span>
            <span>
              {lang === 'en' ? 'Egress' : '転送'} {usd(hover.egressPricePerGB, lang, 3)}/GB
            </span>
          </div>
        )}
      </div>
    </figure>
  );
}

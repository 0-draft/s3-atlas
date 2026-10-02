import { Link } from 'react-router-dom';
import { DEPTH_VARS } from '../lib/labels';
import { columnClasses, storageClasses, depthRank } from '../lib/data/classes';
import { usd } from '../lib/format';
import { useLang } from '../lib/i18n';
import { UI } from '../lib/ui';

const TIER_LABEL = {
  hot: { en: 'Hot', ja: 'ホット' },
  warm: { en: 'Warm', ja: 'ウォーム' },
  cold: { en: 'Cold', ja: 'コールド' },
  archive: { en: 'Archive', ja: 'アーカイブ' },
} as const;

export default function Classes() {
  const { t, lang } = useLang();
  const en = lang === 'en';
  const others = storageClasses.filter((c) => depthRank(c.id) >= 99);
  const all = [...columnClasses, ...others];
  const maxPrice = Math.max(...columnClasses.map((c) => c.pricePerGBMonth ?? 0));

  return (
    <div className="wrap">
      <header className="page-head">
        <h1>{en ? 'Storage classes, layer by layer' : 'ストレージクラスを層ごとに'}</h1>
        <p>
          {en
            ? 'Each class trades storage price against access cost, latency, and minimum commitments. The bar shows storage price relative to the most expensive class.'
            : '各クラスは保存単価と、取り出しコスト・レイテンシ・最低保存期間をトレードオフしています。バーは最も高いクラスに対する保存単価の比率です。'}
        </p>
      </header>

      <ol className="class-stack">
        {all.map((c, i) => (
          <li
            key={c.id}
            id={c.id}
            className="class-layer"
            style={{ ['--layer' as string]: `var(${DEPTH_VARS[i] ?? '--silt'})` }}
          >
            <div className="class-head">
              <h2>{t(c.name)}</h2>
              <span className="pill">{t(TIER_LABEL[c.tier] ?? { en: c.tier, ja: c.tier })}</span>
            </div>
            <div className="class-price">
              <span className="big">{usd(c.pricePerGBMonth, lang)}</span>
              <span className="muted small">{en ? 'per GB-month, us-east-1' : '/ GB・月 (us-east-1)'}</span>
              <span className="price-bar" aria-hidden="true">
                <span style={{ width: `${Math.max(1.5, ((c.pricePerGBMonth ?? 0) / maxPrice) * 100)}%` }} />
              </span>
            </div>
            <dl className="class-facts">
              <div>
                <dt>{en ? 'First byte' : '初回バイト'}</dt>
                <dd>{t(c.firstByteLatency)}</dd>
              </div>
              <div>
                <dt>{en ? 'Durability' : '耐久性'}</dt>
                <dd>{t(c.durability)}</dd>
              </div>
              <div>
                <dt>{en ? 'Availability (design / SLA)' : '可用性 (設計 / SLA)'}</dt>
                <dd>
                  {t(c.availabilityDesign)} / {t(c.availabilitySLA)}
                </dd>
              </div>
              <div>
                <dt>{en ? 'Availability Zones' : 'AZ 数'}</dt>
                <dd>{String(c.azs)}</dd>
              </div>
              <div>
                <dt>{en ? 'Minimum duration' : '最低保存期間'}</dt>
                <dd>{c.minDurationDays ? `${c.minDurationDays} ${en ? 'days' : '日'}` : '—'}</dd>
              </div>
              <div>
                <dt>{en ? 'Minimum billable size' : '最小課金サイズ'}</dt>
                <dd>{c.minBillableKB ? `${c.minBillableKB} KB` : '—'}</dd>
              </div>
              <div>
                <dt>{en ? 'Retrieval fee' : '取り出し料金'}</dt>
                <dd>{c.retrievalFeePerGB ? `${usd(c.retrievalFeePerGB, lang)}/GB` : '—'}</dd>
              </div>
            </dl>
            {c.retrievalOptions?.length > 0 && (
              <div className="table-scroll retrieval">
                <table className="data">
                  <thead>
                    <tr>
                      <th>{en ? 'Retrieval option' : '取り出しオプション'}</th>
                      <th>{en ? 'Time' : '所要時間'}</th>
                      <th className="num">{en ? 'Per GB' : 'GB 単価'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.retrievalOptions.map((r, j) => (
                      <tr key={j}>
                        <td>{t(r.name)}</td>
                        <td>{t(r.time)}</td>
                        <td className="num">{usd(r.pricePerGB, lang)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="class-uses">
              <h3>{en ? 'Good for' : '向いている用途'}</h3>
              <ul>
                {t(c.useCases).map((u: string) => (
                  <li key={u}>{u}</li>
                ))}
              </ul>
              {t(c.notes) && <p className="muted small">{t(c.notes)}</p>}
            </div>
          </li>
        ))}
      </ol>

      <section className="section">
        <h2 className="section-title">{en ? 'The whole column in one table' : '全クラスを一つの表で'}</h2>
        <div className="table-scroll" style={{ marginTop: 24 }}>
          <table className="data">
            <thead>
              <tr>
                <th>{en ? 'Class' : 'クラス'}</th>
                <th className="num">{en ? '$/GB-mo' : '$/GB・月'}</th>
                <th>{en ? 'First byte' : '初回バイト'}</th>
                <th className="num">{en ? 'Min days' : '最低日数'}</th>
                <th className="num">{en ? 'Min KB' : '最小 KB'}</th>
                <th className="num">{en ? 'Retrieval $/GB' : '取り出し $/GB'}</th>
                <th>AZ</th>
              </tr>
            </thead>
            <tbody>
              {all.map((c) => (
                <tr key={c.id}>
                  <td>
                    <a href={`#${c.id}`}>{t(c.name)}</a>
                  </td>
                  <td className="num">{usd(c.pricePerGBMonth, lang)}</td>
                  <td>{t(c.firstByteLatency)}</td>
                  <td className="num">{c.minDurationDays || '—'}</td>
                  <td className="num">{c.minBillableKB ?? '—'}</td>
                  <td className="num">{c.retrievalFeePerGB ? usd(c.retrievalFeePerGB, lang) : '—'}</td>
                  <td>{String(c.azs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ marginTop: 24 }}>
          <Link className="btn" to="/docs/02-storage-classes">
            {t(UI.readChapter)}
          </Link>
        </p>
      </section>
    </div>
  );
}

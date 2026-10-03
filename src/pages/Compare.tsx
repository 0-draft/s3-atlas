import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CompetitorScatter } from '../components/charts/CompetitorScatter';
import { TYPE_LABEL } from '../lib/labels';
import { competitors } from '../lib/data/competitors';
import { usd } from '../lib/format';
import { useLang } from '../lib/i18n';
import type { Competitor } from '../lib/types';
import { UI } from '../lib/ui';

const FEATURES: { k: keyof Competitor['features']; label: { en: string; ja: string } }[] = [
  { k: 'versioning', label: { en: 'Versioning', ja: 'バージョニング' } },
  { k: 'objectLock', label: { en: 'Object Lock / WORM', ja: 'Object Lock / WORM' } },
  { k: 'lifecycle', label: { en: 'Lifecycle', ja: 'ライフサイクル' } },
  { k: 'replication', label: { en: 'Replication', ja: 'レプリケーション' } },
  { k: 'events', label: { en: 'Event notifications', ja: 'イベント通知' } },
  { k: 'iceberg', label: { en: 'Managed Iceberg tables', ja: 'Iceberg テーブル' } },
  { k: 'vectors', label: { en: 'Native vector storage', ja: 'ベクトル保存' } },
  { k: 'cdn', label: { en: 'Built-in CDN / edge', ja: 'CDN / エッジ' } },
];

const COMPAT = {
  native: { en: 'Native', ja: 'ネイティブ' },
  high: { en: 'High', ja: '高い' },
  partial: { en: 'Partial', ja: '部分的' },
  none: { en: 'None', ja: 'なし' },
};

function Mark({ v }: { v: boolean | null }) {
  if (v === null) return <span className="no">?</span>;
  return v ? <span className="yes">●</span> : <span className="no">–</span>;
}

export default function Compare() {
  const { t, lang } = useLang();
  const en = lang === 'en';
  const types = Array.from(new Set(competitors.map((c) => c.type)));
  const [type, setType] = useState<string>('all');
  const list = competitors.filter((c) => type === 'all' || c.type === type);

  return (
    <div className="wrap">
      <header className="page-head">
        <h1>{en ? 'S3 and everyone who copied its API' : 'S3 と、その API を追う者たち'}</h1>
        <p>
          {en
            ? 'Hot-tier list prices in a common US region. Many alternatives undercut S3 on storage and especially on egress; few match its feature depth.'
            : '代表的な米国リージョンのホット層定価です。多くの代替サービスは保存料、特に転送料で S3 を下回りますが、機能の深さで並ぶものはわずかです。'}
        </p>
      </header>

      <div className="toolbar">
        <div className="chips" role="group" aria-label={en ? 'Provider type' : '種別'}>
          <button type="button" className="chip" aria-pressed={type === 'all'} onClick={() => setType('all')}>
            {t(UI.all)}
          </button>
          {types.map((ty) => (
            <button
              key={ty}
              type="button"
              className="chip"
              aria-pressed={type === ty}
              onClick={() => setType(ty)}
            >
              {t(TYPE_LABEL[ty])}
            </button>
          ))}
        </div>
      </div>

      <CompetitorScatter items={list} />

      <section className="section">
        <h2 className="section-title">{en ? 'Price sheet' : '価格表'}</h2>
        <div className="table-scroll" style={{ marginTop: 24 }}>
          <table className="data">
            <thead>
              <tr>
                <th>{en ? 'Service' : 'サービス'}</th>
                <th>{en ? 'Type' : '種別'}</th>
                <th className="num">{en ? 'Storage $/GB-mo' : '保存 $/GB・月'}</th>
                <th className="num">{en ? 'Egress $/GB' : '転送 $/GB'}</th>
                <th className="num">PUT /1k</th>
                <th className="num">GET /1k</th>
                <th className="num">{en ? 'Min days' : '最低日数'}</th>
                <th>{en ? 'S3 API' : 'S3 互換'}</th>
                <th>{en ? 'Strong consistency' : '強整合性'}</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id}>
                  <td>
                    <a href={c.pricingUrl} target="_blank" rel="noreferrer noopener">
                      {c.name}
                    </a>
                    <div className="muted small">{c.vendor}</div>
                  </td>
                  <td>{t(TYPE_LABEL[c.type])}</td>
                  <td className="num">{usd(c.storagePricePerGBMonth, lang, 4)}</td>
                  <td className="num">
                    {c.egressPricePerGB === 0 ? (en ? 'Free' : '無料') : usd(c.egressPricePerGB, lang, 3)}
                  </td>
                  <td className="num">{usd(c.putPer1k, lang, 4)}</td>
                  <td className="num">{usd(c.getPer1k, lang, 5)}</td>
                  <td className="num">{c.minStorageDays ?? '—'}</td>
                  <td>{t(COMPAT[c.s3Compatible])}</td>
                  <td>
                    <Mark v={c.strongConsistency} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <h2 className="section-title">{en ? 'Feature matrix' : '機能マトリクス'}</h2>
        <p className="section-lede">
          {en ? '● supported, – not offered, ? not verified.' : '● 対応、– 非対応、? 未確認。'}
        </p>
        <div className="table-scroll" style={{ marginTop: 24 }}>
          <table className="data matrix">
            <thead>
              <tr>
                <th>{en ? 'Service' : 'サービス'}</th>
                {FEATURES.map((f) => (
                  <th key={f.k}>{t(f.label)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  {FEATURES.map((f) => (
                    <td key={f.k}>
                      <Mark v={c.features?.[f.k] ?? null} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <h2 className="section-title">{en ? 'Profiles' : '各サービスの特徴'}</h2>
        <div className="profiles">
          {list.map((c) => (
            <article key={c.id} className="profile">
              <h3>{c.name}</h3>
              <p className="muted small">{t(c.bestFor)}</p>
              <div className="profile-cols">
                <div>
                  <h4>{en ? 'Strengths' : '強み'}</h4>
                  <ul>
                    {t(c.strengths).map((s: string) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4>{en ? 'Weaknesses' : '弱み'}</h4>
                  <ul>
                    {t(c.weaknesses).map((s: string) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </div>
              </div>
              {c.pricingNote && <p className="muted small">{t(c.pricingNote)}</p>}
              <p className="muted small">
                {t(UI.verified)}: {c.verifiedDate}
              </p>
            </article>
          ))}
        </div>
        <p style={{ marginTop: 32 }}>
          <Link className="btn" to="/docs/09-competitors">
            {t(UI.readChapter)}
          </Link>
        </p>
      </section>
    </div>
  );
}

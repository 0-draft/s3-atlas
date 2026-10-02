import { useMemo, useState } from 'react';
import { columnClasses, s3Pricing, storageClasses } from '../lib/data/classes';
import { competitors } from '../lib/data/competitors';
import { competitorCost, s3ClassCost, type CostBreakdown, type Workload } from '../lib/cost';
import { usd, num } from '../lib/format';
import { useLang, type L } from '../lib/i18n';

const PRESETS: { id: string; label: L; w: Workload }[] = [
  {
    id: 'site',
    label: { en: 'Static site, 50 GB', ja: '静的サイト 50 GB' },
    w: { storageGB: 50, puts: 20_000, gets: 5_000_000, egressGB: 500, retrievalGB: 0, avgObjectKB: 200 },
  },
  {
    id: 'media',
    label: { en: 'Media library, 10 TB', ja: 'メディア 10 TB' },
    w: {
      storageGB: 10_240,
      puts: 500_000,
      gets: 10_000_000,
      egressGB: 5_120,
      retrievalGB: 500,
      avgObjectKB: 4_096,
    },
  },
  {
    id: 'lake',
    label: { en: 'Data lake, 200 TB', ja: 'データレイク 200 TB' },
    w: {
      storageGB: 204_800,
      puts: 50_000_000,
      gets: 400_000_000,
      egressGB: 0,
      retrievalGB: 2_000,
      avgObjectKB: 65_536,
    },
  },
  {
    id: 'archive',
    label: { en: 'Archive, 1 PB', ja: 'アーカイブ 1 PB' },
    w: {
      storageGB: 1_048_576,
      puts: 100_000,
      gets: 1_000,
      egressGB: 0,
      retrievalGB: 1_000,
      avgObjectKB: 1_048_576,
    },
  },
];

const FIELDS: { key: keyof Workload; label: L; step: number }[] = [
  { key: 'storageGB', label: { en: 'Stored (GB)', ja: '保存量 (GB)' }, step: 1 },
  {
    key: 'avgObjectKB',
    label: { en: 'Average object size (KB)', ja: '平均オブジェクトサイズ (KB)' },
    step: 1,
  },
  {
    key: 'puts',
    label: { en: 'PUT / LIST requests per month', ja: '月間 PUT / LIST リクエスト' },
    step: 1000,
  },
  { key: 'gets', label: { en: 'GET requests per month', ja: '月間 GET リクエスト' }, step: 1000 },
  {
    key: 'egressGB',
    label: { en: 'Internet egress per month (GB)', ja: '月間インターネット転送 (GB)' },
    step: 1,
  },
  {
    key: 'retrievalGB',
    label: { en: 'Retrieved from cold classes (GB)', ja: 'コールドクラスからの取り出し (GB)' },
    step: 1,
  },
];

const PARTS = [
  { k: 'storage', label: { en: 'Storage', ja: '保存' }, color: 'var(--series-1)' },
  { k: 'requests', label: { en: 'Requests', ja: 'リクエスト' }, color: 'var(--series-2)' },
  { k: 'retrieval', label: { en: 'Retrieval', ja: '取り出し' }, color: 'var(--series-3)' },
  { k: 'egress', label: { en: 'Egress', ja: '転送' }, color: 'var(--series-4)' },
] as const;

type Row = { id: string; name: string; cost: CostBreakdown; s3: boolean };

export default function Calculator() {
  const { t, lang } = useLang();
  const en = lang === 'en';
  const [w, setW] = useState<Workload>(PRESETS[1].w);
  const [preset, setPreset] = useState('media');
  const [hover, setHover] = useState<string | null>(null);

  const rows = useMemo<Row[]>(() => {
    // Free allowances are ignored for every provider so the comparison stays even.
    const pricing = { ...s3Pricing, egressFreeGBPerMonth: 0 };
    const standard = storageClasses.find((c) => c.id === 'STANDARD')?.pricePerGBMonth ?? 0.023;
    const s3 = columnClasses
      .filter((c) => !/express/i.test(c.id))
      .map((c) => ({
        id: c.id,
        name: `S3 ${t(c.name).replace(/^S3\s+/, '')}`,
        cost: s3ClassCost(c, w, pricing, standard),
        s3: true,
      }));
    const others = competitors
      .filter((c) => !/amazon/i.test(c.vendor))
      .map((c) => ({ id: c.id, name: c.name, cost: competitorCost(c, w), s3: false }))
      .filter((r): r is Row => r.cost !== null);
    return [...s3, ...others].sort((a, b) => a.cost.total - b.cost.total);
  }, [w, t]);

  const max = Math.max(...rows.map((r) => r.cost.total), 1);

  return (
    <div className="wrap">
      <header className="page-head">
        <h1>{en ? 'What will it cost?' : 'いくらかかる？'}</h1>
        <p>
          {en
            ? 'Monthly list-price estimate for one workload across every S3 class and the main alternatives. It ignores free tiers, committed-use discounts and minimum-duration penalties, so treat it as a comparison, not a quote.'
            : '1つのワークロードを全 S3 クラスと主要な代替サービスで月額試算します。無料枠、コミット割引、最低保存期間の違約金は含まないため、見積もりではなく比較として使ってください。'}
        </p>
      </header>

      <div className="calc">
        <form className="calc-form" onSubmit={(e) => e.preventDefault()}>
          <div className="chips" role="group" aria-label={en ? 'Presets' : 'プリセット'}>
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className="chip"
                aria-pressed={preset === p.id}
                onClick={() => {
                  setPreset(p.id);
                  setW(p.w);
                }}
              >
                {t(p.label)}
              </button>
            ))}
          </div>
          {FIELDS.map((f) => (
            <label key={f.key} className="field">
              <span>{t(f.label)}</span>
              <input
                type="number"
                min={0}
                step={f.step}
                value={w[f.key]}
                onChange={(e) => {
                  setPreset('');
                  setW({ ...w, [f.key]: Math.max(0, Number(e.target.value) || 0) });
                }}
              />
            </label>
          ))}
          <p className="muted small">
            {en ? 'S3 prices verified' : 'S3 価格の確認日'}: {s3Pricing.verifiedDate} ({s3Pricing.region})
          </p>
        </form>

        <figure className="viz calc-result">
          <div className="viz-legend">
            {PARTS.map((p) => (
              <span key={p.k}>
                <i style={{ background: p.color }} />
                {t(p.label)}
              </span>
            ))}
          </div>
          <ol className="cost-rows">
            {rows.map((r) => (
              <li
                key={r.id}
                className={r.s3 ? 's3' : ''}
                tabIndex={0}
                onMouseEnter={() => setHover(r.id)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(r.id)}
                onBlur={() => setHover(null)}
              >
                <span className="cost-name">{r.name}</span>
                <span className="cost-bar">
                  {PARTS.map((p) => {
                    const v = r.cost[p.k];
                    if (v <= 0) return null;
                    return <span key={p.k} style={{ width: `${(v / max) * 100}%`, background: p.color }} />;
                  })}
                </span>
                <span className="cost-total">{usd(r.cost.total, lang, 0)}</span>
                {hover === r.id && (
                  <span className="viz-tip inline right">
                    <strong>{r.name}</strong>
                    {PARTS.map((p) => (
                      <span key={p.k}>
                        {t(p.label)}: {usd(r.cost[p.k], lang, 2)}
                      </span>
                    ))}
                  </span>
                )}
              </li>
            ))}
          </ol>
          <figcaption className="muted small">
            {en
              ? `Sorted cheapest first. ${num(w.storageGB, lang)} GB stored, ${num(w.egressGB, lang)} GB egress. Competitor egress uses the single list rate in the dataset; providers with free egress allowances may cost even less.`
              : `安い順。保存 ${num(w.storageGB, lang)} GB、転送 ${num(w.egressGB, lang)} GB。競合の転送料はデータセットの単一レートで計算しており、無料転送枠のある事業者はさらに安くなる場合があります。`}
          </figcaption>
        </figure>
      </div>
    </div>
  );
}

import { Link } from 'react-router-dom';
import { ShareBars } from '../components/charts/ShareBars';
import { MarketSize } from '../components/charts/MarketSize';
import { market } from '../lib/data/market';
import { useLang } from '../lib/i18n';
import { UI } from '../lib/ui';

export default function Market() {
  const { t, lang } = useLang();
  const en = lang === 'en';
  const sizeSources = Array.from(new Set(market.objectStorageMarket.map((r) => r.source)));
  const [mainSource] = sizeSources;
  const sizeRows = market.objectStorageMarket.filter((r) => r.source === mainSource);
  const shareSources = Array.from(
    new Map(
      market.cloudShare.map((r) => [
        /^https?:/.test(r.source) ? new URL(r.source).hostname : r.source,
        r.source,
      ]),
    ),
  );

  return (
    <div className="wrap">
      <header className="page-head">
        <h1>{en ? 'Where S3 stands in the industry' : '業界における S3 の立ち位置'}</h1>
        <p>
          {en
            ? 'S3 is less a product than a protocol: the API every object store implements. These are the numbers behind that position.'
            : 'S3 は製品というよりプロトコルです。あらゆるオブジェクトストレージが実装する API。その地位を裏付ける数字を並べます。'}
        </p>
      </header>

      <section className="section" style={{ paddingTop: 0 }}>
        <h2 className="section-title">
          {en ? 'Cloud infrastructure market share' : 'クラウドインフラ市場シェア'}
        </h2>
        <p className="section-lede">
          {en
            ? 'Share of worldwide cloud infrastructure services spend, by quarter.'
            : '世界のクラウドインフラサービス支出に占めるシェア（四半期別）。'}
        </p>
        <div style={{ marginTop: 24 }}>
          <ShareBars rows={market.cloudShare} />
        </div>
        <p className="muted small" style={{ marginTop: 12 }}>
          {t(UI.sources)}:{' '}
          {shareSources.map(([label, href], i) => (
            <span key={label}>
              {i > 0 && ', '}
              {/^https?:/.test(href) ? (
                <a href={href} target="_blank" rel="noreferrer noopener">
                  {label}
                </a>
              ) : (
                label
              )}
            </span>
          ))}
        </p>
      </section>

      {sizeRows.length > 0 && (
        <section className="section" style={{ paddingTop: 0 }}>
          <h2 className="section-title">
            {en ? 'Object storage market size' : 'オブジェクトストレージ市場規模'}
          </h2>
          <p className="section-lede">
            {en
              ? 'One analyst series shown so years stay comparable. Estimates vary widely between firms; the chapter lists the others.'
              : '年ごとの比較ができるよう、1つの調査会社の系列のみ表示しています。調査会社ごとに推計値は大きく異なり、他の推計は章本文に掲載しています。'}
          </p>
          <div style={{ marginTop: 24 }}>
            <MarketSize rows={sizeRows} />
          </div>
          <p className="muted small" style={{ marginTop: 12 }}>
            {t(UI.sources)}: {new URL(mainSource).hostname}
          </p>
          <h3 style={{ marginTop: 40, fontSize: '1.1rem' }}>
            {en ? 'Every estimate we found' : '収集したすべての推計'}
          </h3>
          <div className="table-scroll" style={{ marginTop: 14 }}>
            <table className="data">
              <thead>
                <tr>
                  <th>{en ? 'Market definition' : '市場の定義'}</th>
                  <th className="num">{en ? 'Year' : '年'}</th>
                  <th className="num">{en ? 'USD billions' : '10億ドル'}</th>
                  <th>{en ? 'Type' : '種別'}</th>
                  <th>{t(UI.sources)}</th>
                </tr>
              </thead>
              <tbody>
                {market.objectStorageMarket.map((r) => (
                  <tr key={`${r.source}-${r.year}`}>
                    <td>{r.segment ?? '—'}</td>
                    <td className="num">{r.year}</td>
                    <td className="num">{r.valueUSDBillions}</td>
                    <td>{r.isForecast ? (en ? 'Forecast' : '予測') : en ? 'Estimate' : '推計'}</td>
                    <td>
                      <a href={r.source} target="_blank" rel="noreferrer noopener">
                        {new URL(r.source).hostname}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="section" style={{ paddingTop: 0 }}>
        <h2 className="section-title">{en ? 'S3 by the numbers' : '数字で見る S3'}</h2>
        <dl className="sonar-list">
          {market.s3Stats.map((s, i) => (
            <div key={i}>
              <dt>{t(s.label)}</dt>
              <dd>
                {t(s.value)}
                <a className="small muted" href={s.source} target="_blank" rel="noreferrer noopener">
                  {s.year}
                </a>
              </dd>
            </div>
          ))}
        </dl>
        {market.notes && (
          <p className="muted small" style={{ marginTop: 24, maxWidth: '72ch' }}>
            {t(market.notes)}
          </p>
        )}
        <p style={{ marginTop: 32 }}>
          <Link className="btn" to="/docs/10-industry">
            {t(UI.readChapter)}
          </Link>
        </p>
      </section>
    </div>
  );
}

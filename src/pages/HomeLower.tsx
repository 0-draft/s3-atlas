import { Link } from 'react-router-dom';
import { CompetitorScatter } from '../components/charts/CompetitorScatter';
import { competitors } from '../lib/data/competitors';
import { timeline } from '../lib/data/timeline';
import { useLang } from '../lib/i18n';
import { UI } from '../lib/ui';

export default function HomeLower() {
  const { t, lang } = useLang();
  const en = lang === 'en';
  const recent = timeline.slice(-6).reverse();
  return (
    <>
      {competitors.length > 0 && (
        <section className="section">
          <div className="wrap split">
            <div>
              <h2 className="section-title">{en ? 'Where S3 sits on price' : '価格で見る S3 の位置'}</h2>
              <p className="section-lede">
                {en
                  ? 'Storage price against internet egress price. S3 is rarely the cheapest per gigabyte; it wins on depth of features and ecosystem. Egress is where alternatives attack.'
                  : '保存単価とインターネット転送単価。S3 は GB 単価で最安になることは少なく、機能の深さとエコシステムで勝っています。競合が攻めるのは転送料です。'}
              </p>
              <p style={{ marginTop: 20 }}>
                <Link className="btn" to="/compare">
                  {en ? 'Open the full comparison' : '比較ページを開く'}
                </Link>
              </p>
            </div>
            <CompetitorScatter items={competitors} />
          </div>
        </section>
      )}

      {recent.length > 0 && (
        <section className="section">
          <div className="wrap">
            <h2 className="section-title">{en ? 'Latest on the timeline' : '年表の最新'}</h2>
            <ol className="recent-list">
              {recent.map((e) => (
                <li key={e.date + t(e.title)}>
                  <time dateTime={e.date}>{e.date}</time>
                  <span>{t(e.title)}</span>
                </li>
              ))}
            </ol>
            <p style={{ marginTop: 20 }}>
              <Link className="btn" to="/timeline">
                {t(UI.navTimeline)}
              </Link>
            </p>
          </div>
        </section>
      )}
    </>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { WaterColumn } from '../components/WaterColumn';
import { CompetitorScatter } from '../components/charts/CompetitorScatter';
import { CHAPTERS, GROUPS } from '../lib/chapters';
import { columnClasses } from '../lib/data/classes';
import { competitors } from '../lib/data/competitors';
import { market } from '../lib/data/market';
import { timeline } from '../lib/data/timeline';
import { compact, num, yearsPerLoss } from '../lib/format';
import { useLang } from '../lib/i18n';
import { UI } from '../lib/ui';

const TOOLS = [
  {
    to: '/classes',
    title: UI.navClasses,
    body: {
      en: 'Compare every class side by side and see which transitions lifecycle allows.',
      ja: '全クラスを横並びで比較し、ライフサイクルで可能な遷移を確認。',
    },
  },
  {
    to: '/calculator',
    title: UI.navCalc,
    body: {
      en: 'Price a workload across classes and providers, egress included.',
      ja: 'ワークロードをクラス別・事業者別に試算（転送料込み）。',
    },
  },
  {
    to: '/compare',
    title: UI.navCompare,
    body: {
      en: 'GCS, Azure, R2, B2, Wasabi, MinIO and more on price and features.',
      ja: 'GCS、Azure、R2、B2、Wasabi、MinIO などを価格と機能で比較。',
    },
  },
  {
    to: '/market',
    title: UI.navMarket,
    body: {
      en: 'Cloud market share, object storage market size and S3 by the numbers.',
      ja: 'クラウド市場シェア、オブジェクトストレージ市場規模、数字で見る S3。',
    },
  },
  {
    to: '/cases',
    title: UI.navCases,
    body: {
      en: 'Who runs on S3, how much they store, and who left.',
      ja: '誰が S3 を使い、どれだけ保存し、誰が離れたか。',
    },
  },
  {
    to: '/timeline',
    title: UI.navTimeline,
    body: { en: 'Twenty years of launches, price cuts and outages.', ja: '20年分のローンチ、値下げ、障害。' },
  },
  {
    to: '/commands',
    title: UI.navCommands,
    body: {
      en: 'Searchable, copyable CLI and SDK recipes. Destructive ones are flagged.',
      ja: '検索・コピーできる CLI / SDK レシピ。破壊的操作には印つき。',
    },
  },
  {
    to: '/api',
    title: UI.navApi,
    body: {
      en: 'Every S3, S3 Control, Tables and Vectors operation in one list.',
      ja: 'S3 / S3 Control / Tables / Vectors の全オペレーション。',
    },
  },
  {
    to: '/ecosystem',
    title: UI.navEcosystem,
    body: {
      en: 'The services and open-source tools that read and write S3.',
      ja: 'S3 を読み書きするサービスと OSS。',
    },
  },
  {
    to: '/quiz',
    title: UI.navQuiz,
    body: { en: 'Forty questions to check what stuck.', ja: '理解度を確かめる 40 問。' },
  },
] as const;

export default function Home() {
  const { t, lang } = useLang();
  const en = lang === 'en';
  const [exp, setExp] = useState(7); // 10^7 objects
  const objects = 10 ** exp;
  const years = yearsPerLoss(objects);
  const recent = timeline.slice(-6).reverse();

  return (
    <>
      <section className="hero">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <h1 className="hero-title">
              {en ? 'Amazon S3, from the surface to the seabed.' : 'Amazon S3 を、水面から海底まで。'}
            </h1>
            <p className="hero-lede">
              {en
                ? 'An atlas of the storage service the internet quietly runs on: how it works, what it costs, how to secure it, every command you will need, and where it stands against everyone else.'
                : 'インターネットを静かに支えるストレージの地図帳。仕組み、料金、セキュリティ、必要なコマンドのすべて、そして競合の中での立ち位置まで。'}
            </p>
            <div className="hero-cta">
              <Link className="btn primary" to="/docs/01-overview">
                {en ? 'Start at chapter 1' : '第1章から読む'}
              </Link>
              <Link className="btn" to="/docs">
                {en ? 'See all chapters' : '章一覧を見る'}
              </Link>
            </div>
            <p className="hero-hint muted small">
              {en
                ? 'The column is the whole idea: the deeper the layer, the cheaper the storage and the longer the wait.'
                : '右の水柱がこのサイトの軸です。深い層ほど安く、取り出しに時間がかかります。'}
            </p>
          </div>
          <WaterColumn classes={columnClasses} />
        </div>
      </section>

      <section className="section nines">
        <div className="wrap nines-grid">
          <div>
            <h2 className="section-title">
              {en ? 'Eleven nines, made tangible' : 'イレブンナインを実感する'}
            </h2>
            <p className="section-lede">
              {en
                ? 'S3 Standard is designed for 99.999999999% durability. Drag to choose how many objects you store.'
                : 'S3 Standard の設計耐久性は 99.999999999%。保存するオブジェクト数をスライダーで選んでください。'}
            </p>
            <label className="nines-slider">
              <span className="sr-only">{en ? 'Objects stored' : '保存オブジェクト数'}</span>
              <input
                type="range"
                min={3}
                max={14}
                step={1}
                value={exp}
                onChange={(e) => setExp(Number(e.target.value))}
              />
            </label>
          </div>
          <p className="nines-readout" aria-live="polite">
            <span className="nines-n">{compact(objects, lang)}</span>
            <span className="nines-mid">
              {en
                ? 'objects stored. Expect to lose one about once every'
                : '個を保存すると、1個失う期待値はおよそ'}
            </span>
            <span className="nines-y">
              {years >= 1 ? compact(years, lang) : num(years * 365, lang, 1)}
              <small>{years >= 1 ? (en ? ' years' : ' 年に1回') : en ? ' days' : ' 日に1回'}</small>
            </span>
            <span className="nines-foot muted small">
              {en
                ? 'AWS frames it the same way: 10,000,000 objects, one loss per 10,000 years on average. Durability is not backup; deletes and overwrites are yours to protect against.'
                : 'AWS 自身も「1,000万個なら平均1万年に1個」と説明しています。耐久性はバックアップではありません。削除や上書きからの保護は利用者の責任です。'}
            </span>
          </p>
        </div>
      </section>

      {market.s3Stats.length > 0 && (
        <section className="section sonar">
          <div className="wrap">
            <h2 className="section-title">{en ? 'S3 by the numbers' : '数字で見る S3'}</h2>
            <dl className="sonar-list">
              {market.s3Stats.slice(0, 6).map((s, i) => (
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
          </div>
        </section>
      )}

      <section className="section">
        <div className="wrap">
          <h2 className="section-title">{en ? 'The chapters' : '章立て'}</h2>
          <p className="section-lede">
            {en
              ? 'Eighteen chapters, ordered so each one builds on the last.'
              : '前の章を土台に次の章が積み上がるよう並べた全18章。'}
          </p>
          <div className="chapter-map compact">
            {GROUPS.map((g) => (
              <section key={g.id} className="chapter-group">
                <h3>{t(g.label)}</h3>
                <ol>
                  {CHAPTERS.filter((c) => c.group === g.id).map((c) => (
                    <li key={c.slug}>
                      <Link to={`/docs/${c.slug}`}>
                        <span className="ch-num">{String(c.num).padStart(2, '0')}</span>
                        <span className="ch-title">{t(c.title)}</span>
                      </Link>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        </div>
      </section>

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

      <section className="section">
        <div className="wrap">
          <h2 className="section-title">{en ? 'Explore by tool' : 'ツールで探る'}</h2>
          <ul className="tool-list">
            {TOOLS.map((tool) => (
              <li key={tool.to}>
                <Link to={tool.to}>
                  <span className="tool-title">{t(tool.title)}</span>
                  <span className="tool-body">{t(tool.body)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

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

import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import { WaterColumn } from '../components/WaterColumn';
import { DotMatrix } from '../components/DotMatrix';
import { CHAPTERS, GROUPS } from '../lib/chapters';
import { columnClasses } from '../lib/data/classes';
import { compact, num, yearsPerLoss } from '../lib/format';
import { useLang } from '../lib/i18n';
import { UI } from '../lib/ui';

// Below-the-fold sections pull in the competitor and timeline datasets; load them after first paint.
const HomeLower = lazy(() => import('./HomeLower'));

const TWENTY_YEARS = 'https://aws.amazon.com/blogs/aws/twenty-years-of-amazon-s3-and-building-whats-next/';

// Headline numbers, each from AWS's own published figures.
const READOUT = [
  {
    text: '500T+',
    label: { en: 'objects stored', ja: 'オブジェクトを保存' },
    year: 2026,
    source: TWENTY_YEARS,
  },
  {
    text: '200M+',
    label: { en: 'requests per second at peak', ja: 'ピーク時の毎秒リクエスト' },
    year: 2026,
    source: TWENTY_YEARS,
  },
  {
    text: '11 9s',
    label: { en: 'designed durability (99.999999999%)', ja: '設計上の耐久性 (99.999999999%)' },
    year: 2026,
    source: 'https://aws.amazon.com/s3/storage-classes/',
  },
] as const;

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

      <section className="readout" aria-label={en ? 'S3 at a glance' : 'ひと目でわかる S3'}>
        <div className="wrap readout-grid">
          {READOUT.map((r) => (
            <div key={r.text} className="readout-cell">
              <DotMatrix text={r.text} label={`${r.text} ${t(r.label)}`} />
              <p>
                {t(r.label)}{' '}
                <a className="muted small" href={r.source} target="_blank" rel="noreferrer noopener">
                  {r.year}
                </a>
              </p>
            </div>
          ))}
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
            <DotMatrix className="nines-n" text={compact(objects, 'en')} label={compact(objects, lang)} />
            <span className="nines-mid">
              {en
                ? 'objects stored. Expect to lose one about once every'
                : '個を保存すると、1個失う期待値はおよそ'}
            </span>
            <span className="nines-y">
              <DotMatrix
                text={years >= 1 ? compact(years, 'en') : num(years * 365, 'en', 1)}
                label={years >= 1 ? compact(years, lang) : num(years * 365, lang, 1)}
              />
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

      <Suspense fallback={null}>
        <HomeLower />
      </Suspense>
    </>
  );
}

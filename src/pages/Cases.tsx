import { useState } from 'react';
import { Link } from 'react-router-dom';
import { cases } from '../lib/data/cases';
import { useLang } from '../lib/i18n';
import { UI } from '../lib/ui';
import type { CaseStudy } from '../lib/types';

const KIND = {
  adopter: { en: 'Runs on S3', ja: 'S3 を活用' },
  'built-on-s3': { en: 'Product built on S3', ja: 'S3 上に構築された製品' },
  'migrated-away': { en: 'Moved off S3', ja: 'S3 から移行' },
} as const;

const REGION = {
  global: { en: 'Global', ja: 'グローバル' },
  japan: { en: 'Japan', ja: '日本' },
  us: { en: 'United States', ja: '米国' },
  eu: { en: 'Europe', ja: '欧州' },
  asia: { en: 'Asia', ja: 'アジア' },
} as const;

export default function Cases() {
  const { t, lang } = useLang();
  const en = lang === 'en';
  const [kind, setKind] = useState<'all' | CaseStudy['kind']>('all');
  const [region, setRegion] = useState<'all' | CaseStudy['region']>('all');
  const [q, setQ] = useState('');
  const regions = Array.from(new Set(cases.map((c) => c.region)));
  const query = q.trim().toLowerCase();
  const list = cases.filter(
    (c) =>
      (kind === 'all' || c.kind === kind) &&
      (region === 'all' || c.region === region) &&
      (!query ||
        [c.company, t(c.industry), t(c.summary), c.features.join(' ')]
          .join(' ')
          .toLowerCase()
          .includes(query)),
  );

  return (
    <div className="wrap">
      <header className="page-head">
        <h1>{en ? 'Who stores what on S3' : '誰が S3 に何を置いているか'}</h1>
        <p>
          {en
            ? 'Public case studies and engineering write-ups, including the companies that left. Every entry links to its source.'
            : '公開されている事例とエンジニアリングブログから。S3 を離れた企業も含みます。各項目に出典リンクがあります。'}
        </p>
      </header>
      <div className="toolbar">
        <input
          className="search"
          type="search"
          placeholder={en ? 'Search company, industry or feature' : '企業名・業界・機能で検索'}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label={t(UI.search)}
        />
        <div className="chips">
          <button type="button" className="chip" aria-pressed={kind === 'all'} onClick={() => setKind('all')}>
            {t(UI.all)}
          </button>
          {(Object.keys(KIND) as CaseStudy['kind'][]).map((k) => (
            <button
              key={k}
              type="button"
              className="chip"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
            >
              {t(KIND[k])}
            </button>
          ))}
        </div>
        <div className="chips">
          <button
            type="button"
            className="chip"
            aria-pressed={region === 'all'}
            onClick={() => setRegion('all')}
          >
            {en ? 'All regions' : '全地域'}
          </button>
          {regions.map((r) => (
            <button
              key={r}
              type="button"
              className="chip"
              aria-pressed={region === r}
              onClick={() => setRegion(r)}
            >
              {t(REGION[r])}
            </button>
          ))}
        </div>
      </div>
      {list.length === 0 && <p className="muted">{t(UI.noResults)}</p>}
      <ul className="case-list">
        {list.map((c) => (
          <li key={c.id} className={`case kind-${c.kind}`}>
            <div className="case-head">
              <h2>{c.company}</h2>
              <span className="muted small">
                {t(c.industry)}, {c.year}
              </span>
            </div>
            <p>{t(c.summary)}</p>
            {c.scale && <p className="case-scale">{t(c.scale)}</p>}
            <p className="case-outcome">{t(c.outcome)}</p>
            <div className="case-foot">
              <div className="chips">
                <span className={`pill${c.kind === 'migrated-away' ? ' warn' : ''}`}>{t(KIND[c.kind])}</span>
                {c.features.slice(0, 4).map((f) => (
                  <span className="pill" key={f}>
                    {f}
                  </span>
                ))}
              </div>
              <a href={c.url} target="_blank" rel="noreferrer noopener" className="small">
                {t(UI.sources)}
              </a>
            </div>
          </li>
        ))}
      </ul>
      <p style={{ marginBlock: 40 }}>
        <Link className="btn" to="/docs/15-case-studies">
          {t(UI.readChapter)}
        </Link>
      </p>
    </div>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ecosystem } from '../lib/data/ecosystem';
import { useLang } from '../lib/i18n';
import { UI } from '../lib/ui';
import type { EcoItem } from '../lib/types';
import { ECO_GROUP } from '../lib/labels';

export default function Ecosystem() {
  const { t, lang } = useLang();
  const en = lang === 'en';
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const list = ecosystem.filter(
    (e) => !query || `${e.name} ${t(e.howItUsesS3)}`.toLowerCase().includes(query),
  );
  const groups = (Object.keys(ECO_GROUP) as EcoItem['group'][]).map((g) => ({
    g,
    items: list.filter((e) => e.group === g),
  }));

  return (
    <div className="wrap">
      <header className="page-head">
        <h1>{en ? 'Everything that speaks S3' : 'S3 とつながるすべて'}</h1>
        <p>
          {en
            ? `${ecosystem.length} services and tools, and the one thing each does with your buckets.`
            : `${ecosystem.length} のサービスとツール、そしてそれぞれがバケットで何をするか。`}
        </p>
      </header>
      <div className="toolbar">
        <input
          className="search"
          type="search"
          placeholder={en ? 'Search: Athena, Iceberg, DuckDB…' : '検索: Athena, Iceberg, DuckDB…'}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label={t(UI.search)}
        />
      </div>
      <div className="eco-orbit">
        <div className="eco-core" aria-hidden="true">
          S3
        </div>
        {groups
          .filter((x) => x.items.length > 0)
          .map(({ g, items }) => (
            <section key={g} className={`eco-group g-${g}`}>
              <h2>
                {t(ECO_GROUP[g])} <span className="muted small">{items.length}</span>
              </h2>
              <ul>
                {items.map((e) => (
                  <li key={e.id}>
                    <a href={e.url} target="_blank" rel="noreferrer noopener">
                      {e.name}
                    </a>
                    <span>{t(e.howItUsesS3)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
      </div>
      {list.length === 0 && <p className="muted">{t(UI.noResults)}</p>}
      <p style={{ marginBlock: 40 }}>
        <Link className="btn" to="/docs/16-ecosystem">
          {t(UI.readChapter)}
        </Link>
      </p>
    </div>
  );
}

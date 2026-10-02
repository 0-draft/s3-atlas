import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiOps } from '../lib/data/api';
import { useLang } from '../lib/i18n';
import { UI } from '../lib/ui';
import type { ApiOp } from '../lib/types';

const SERVICE: Record<ApiOp['service'], string> = {
  s3: 'Amazon S3',
  s3control: 'S3 Control',
  s3tables: 'S3 Tables',
  s3vectors: 'S3 Vectors',
  s3outposts: 'S3 on Outposts',
  s3files: 'S3 Files',
};

export default function Api() {
  const { t, lang } = useLang();
  const en = lang === 'en';
  const [q, setQ] = useState('');
  const [svc, setSvc] = useState<'all' | ApiOp['service']>('all');
  const query = q.trim().toLowerCase();
  const list = apiOps.filter(
    (o) =>
      (svc === 'all' || o.service === svc) &&
      (!query || `${o.name} ${o.category} ${t(o.description)}`.toLowerCase().includes(query)),
  );
  const groups = new Map<string, ApiOp[]>();
  for (const o of list) {
    const k = `${SERVICE[o.service]} / ${o.category}`;
    groups.set(k, [...(groups.get(k) ?? []), o]);
  }
  const services = Array.from(new Set(apiOps.map((o) => o.service)));

  return (
    <div className="wrap">
      <header className="page-head">
        <h1>{en ? `${apiOps.length} API operations` : `${apiOps.length} の API オペレーション`}</h1>
        <p>
          {en
            ? 'Every operation across S3, S3 Control, S3 Tables, S3 Vectors, S3 Files and S3 on Outposts, grouped by what it does.'
            : 'S3、S3 Control、S3 Tables、S3 Vectors、S3 Files、S3 on Outposts の全オペレーションを目的別に。'}
        </p>
      </header>
      <div className="toolbar">
        <input
          className="search"
          type="search"
          placeholder={en ? 'Search: Multipart, Lifecycle, Vector…' : '検索: Multipart, Lifecycle, Vector…'}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label={t(UI.search)}
        />
        <div className="chips">
          <button type="button" className="chip" aria-pressed={svc === 'all'} onClick={() => setSvc('all')}>
            {t(UI.all)}
          </button>
          {services.map((s) => (
            <button key={s} type="button" className="chip" aria-pressed={svc === s} onClick={() => setSvc(s)}>
              {SERVICE[s]}
            </button>
          ))}
        </div>
      </div>
      {list.length === 0 && <p className="muted">{t(UI.noResults)}</p>}
      <div className="api-groups">
        {Array.from(groups.entries()).map(([g, ops]) => (
          <section key={g} className="api-group">
            <h2>
              {g} <span className="muted small">{ops.length}</span>
            </h2>
            <dl>
              {ops.map((o) => (
                <div key={o.service + o.name}>
                  <dt>
                    {o.method && <span className={`method m-${o.method.toLowerCase()}`}>{o.method}</span>}
                    <code>{o.name}</code>
                  </dt>
                  <dd>{t(o.description)}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <p style={{ marginBlock: 40 }}>
        <Link className="btn" to="/docs/17-api-reference">
          {t(UI.readChapter)}
        </Link>
      </p>
    </div>
  );
}

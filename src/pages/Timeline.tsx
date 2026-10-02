import { useState } from 'react';
import { timeline } from '../lib/data/timeline';
import { useLang } from '../lib/i18n';
import { UI } from '../lib/ui';
import type { TimelineCategory } from '../lib/types';
import { CATEGORY } from '../lib/labels';

export default function Timeline() {
  const { t, lang } = useLang();
  const en = lang === 'en';
  const [cat, setCat] = useState<'all' | TimelineCategory>('all');
  const cats = Array.from(new Set(timeline.map((e) => e.category)));
  const list = timeline.filter((e) => cat === 'all' || e.category === cat);
  const byYear = new Map<string, typeof list>();
  for (const e of list) {
    const y = e.date.slice(0, 4);
    byYear.set(y, [...(byYear.get(y) ?? []), e]);
  }

  return (
    <div className="wrap">
      <header className="page-head">
        <h1>{en ? 'Twenty years of S3' : 'S3 の20年'}</h1>
        <p>
          {en
            ? 'From a simple storage web service in 2006 to tables and vectors. Filter by what changed.'
            : '2006年のシンプルなストレージ Web サービスから、テーブルとベクトルまで。変化の種類で絞り込めます。'}
        </p>
      </header>
      <div className="toolbar">
        <div className="chips">
          <button type="button" className="chip" aria-pressed={cat === 'all'} onClick={() => setCat('all')}>
            {t(UI.all)}
          </button>
          {cats.map((c) => (
            <button key={c} type="button" className="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>
              {t(CATEGORY[c] ?? { en: c, ja: c })}
            </button>
          ))}
        </div>
      </div>
      <ol className="timeline">
        {Array.from(byYear.entries()).map(([year, events]) => (
          <li key={year} className="tl-year">
            <h2>{year}</h2>
            <ol>
              {events.map((e) => (
                <li key={e.date + t(e.title)} className={`tl-event cat-${e.category}`}>
                  <time dateTime={e.date}>{e.date}</time>
                  <div>
                    <h3>
                      {e.url ? (
                        <a href={e.url} target="_blank" rel="noreferrer noopener">
                          {t(e.title)}
                        </a>
                      ) : (
                        t(e.title)
                      )}
                    </h3>
                    <p className="muted">{t(e.description)}</p>
                    <span className="pill">
                      {t(CATEGORY[e.category] ?? { en: e.category, ja: e.category })}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>
    </div>
  );
}

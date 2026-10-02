import { Link } from 'react-router-dom';
import { CHAPTERS, GROUPS } from '../lib/chapters';
import { useLang } from '../lib/i18n';

export default function DocsIndex() {
  const { t, lang } = useLang();
  return (
    <div className="wrap">
      <header className="page-head">
        <h1>{lang === 'en' ? 'Eighteen chapters, surface to seabed' : '水面から海底まで、全18章'}</h1>
        <p>
          {lang === 'en'
            ? 'Read in order for a full course, or jump to the part you need. Each chapter is sourced from official AWS documentation and public material, with references at the end.'
            : '順に読めば体系的な講座に、必要な章だけ拾えばリファレンスに。各章は AWS 公式ドキュメントと公開情報を元にし、末尾に参考文献を載せています。'}
        </p>
      </header>
      <ChapterMap />
    </div>
  );

  function ChapterMap() {
    return (
      <div className="chapter-map">
        {GROUPS.map((g) => (
          <section key={g.id} className="chapter-group">
            <h2>{t(g.label)}</h2>
            <ol>
              {CHAPTERS.filter((c) => c.group === g.id).map((c) => (
                <li key={c.slug} value={c.num}>
                  <Link to={`/docs/${c.slug}`}>
                    <span className="ch-num">{String(c.num).padStart(2, '0')}</span>
                    <span className="ch-title">{t(c.title)}</span>
                    <span className="ch-blurb">{t(c.blurb)}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    );
  }
}

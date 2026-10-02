import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Markdown } from '../components/Markdown';
import { Loading } from '../components/Loading';
import { CHAPTERS, chapterBySlug } from '../lib/chapters';
import { loadDoc, stripTitle } from '../lib/docs';
import { useLang, type Lang } from '../lib/i18n';
import { UI } from '../lib/ui';
import NotFound from './NotFound';

type Toc = { id: string; text: string; depth: number }[];

export default function DocPage() {
  const { slug = '' } = useParams();
  const { t, lang } = useLang();
  const chapter = chapterBySlug(slug);
  const docKey = `${lang}:${slug}`;
  const [loaded, setLoaded] = useState<{ key: string; doc: { body: string; lang: Lang } | null } | null>(
    null,
  );
  const doc = loaded?.key === docKey ? loaded.doc : undefined;
  const { hash } = useLocation();
  // Keyed by doc so a previous chapter's outline never shows while the next one loads.
  const [tocState, setTocState] = useState<{ key: string; items: Toc }>({ key: '', items: [] });
  const toc = tocState.key === docKey ? tocState.items : [];
  const [active, setActive] = useState<string>('');
  const articleRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let live = true;
    void loadDoc(lang, slug).then((d) => {
      if (live) setLoaded({ key: `${lang}:${slug}`, doc: d });
    });
    return () => {
      live = false;
    };
  }, [lang, slug]);

  useEffect(() => {
    const el = articleRef.current;
    if (!el || !doc) return;
    const hs = Array.from(el.querySelectorAll<HTMLHeadingElement>('h2[id], h3[id]'));
    setTocState({
      key: docKey,
      items: hs.map((h) => ({ id: h.id, text: h.textContent ?? '', depth: h.tagName === 'H2' ? 2 : 3 })),
    });
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { rootMargin: '-80px 0px -70% 0px' },
    );
    hs.forEach((h) => io.observe(h));
    return () => io.disconnect();
  }, [doc, docKey]);

  // Scroll to "#/docs/<slug>#<id>" on load and whenever the fragment changes within a chapter.
  useEffect(() => {
    if (!doc || !hash) return;
    let id = hash.slice(1);
    try {
      id = decodeURIComponent(id);
    } catch {
      /* malformed fragment: use it as-is */
    }
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  }, [doc, hash]);

  if (!chapter) return <NotFound />;
  const idx = CHAPTERS.indexOf(chapter);
  const prev = CHAPTERS[idx - 1];
  const next = CHAPTERS[idx + 1];
  const parsed = doc ? stripTitle(doc.body) : null;
  const depth = idx / (CHAPTERS.length - 1);

  return (
    <div className="doc-layout wrap" style={{ ['--depth' as string]: depth }}>
      <aside className="doc-side" aria-label={t(UI.navDocs)}>
        <ol>
          {CHAPTERS.map((c) => (
            <li key={c.slug}>
              <Link to={`/docs/${c.slug}`} aria-current={c.slug === slug ? 'page' : undefined}>
                <span className="ch-num">{String(c.num).padStart(2, '0')}</span> {t(c.title)}
              </Link>
            </li>
          ))}
        </ol>
      </aside>
      <article className="doc-main" ref={articleRef}>
        <p className="doc-kicker">
          <span className="depth-gauge" aria-hidden="true">
            <span style={{ height: `${Math.max(6, depth * 100)}%` }} />
          </span>
          {String(chapter.num).padStart(2, '0')} / {CHAPTERS.length}
        </p>
        <h1 className="doc-title">{parsed?.title ?? t(chapter.title)}</h1>
        {doc && doc.lang !== lang && <p className="notice">{t(UI.fallbackNotice)}</p>}
        {doc === undefined && <Loading />}
        {doc === null && <p className="notice">{t(UI.notFound)}</p>}
        {parsed && <Markdown source={parsed.rest} />}
        <nav className="doc-pager">
          {prev ? (
            <Link to={`/docs/${prev.slug}`}>
              <span className="muted small">{t(UI.prev)}</span>
              {t(prev.title)}
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link to={`/docs/${next.slug}`} className="next">
              <span className="muted small">{t(UI.next)}</span>
              {t(next.title)}
            </Link>
          )}
        </nav>
      </article>
      <aside className="doc-toc" aria-label={t(UI.onThisPage)}>
        {toc.length > 0 && (
          <>
            <p className="toc-title">{t(UI.onThisPage)}</p>
            <ul>
              {toc.map((h) => (
                <li key={h.id} className={`d${h.depth}${active === h.id ? ' on' : ''}`}>
                  <Link to={{ hash: h.id }} replace>
                    {h.text}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </aside>
    </div>
  );
}

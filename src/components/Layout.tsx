import { Suspense, useEffect, useState } from 'react';
import { NavLink, Link, Outlet, useLocation } from 'react-router-dom';
import { useLang } from '../lib/i18n';
import { UI } from '../lib/ui';
import { Loading } from './Loading';
import { ErrorBoundary } from './ErrorBoundary';

const NAV = [
  ['/docs', UI.navDocs],
  ['/classes', UI.navClasses],
  ['/calculator', UI.navCalc],
  ['/compare', UI.navCompare],
  ['/market', UI.navMarket],
  ['/cases', UI.navCases],
  ['/timeline', UI.navTimeline],
  ['/commands', UI.navCommands],
  ['/api', UI.navApi],
  ['/ecosystem', UI.navEcosystem],
  ['/quiz', UI.navQuiz],
] as const;

export function BucketMark() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path
        d="M6 8h20l-2.6 16.4a2 2 0 0 1-2 1.6h-10.8a2 2 0 0 1-2-1.6z"
        fill="none"
        stroke="var(--glacier)"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path d="M7.4 14.5h17.2" stroke="var(--d1)" strokeWidth="2.2" />
      <path d="M8.3 20.5h15.4" stroke="var(--d5)" strokeWidth="2.2" />
    </svg>
  );
}

export function Layout() {
  const { t, lang, setLang } = useLang();
  const [open, setOpen] = useState(false);
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (!hash) window.scrollTo(0, 0);
  }, [pathname, hash]);

  return (
    <>
      <a
        href="#main"
        className="sr-only"
        onClick={(e) => {
          // A bare "#main" would be routed by HashRouter; move focus instead.
          e.preventDefault();
          const main = document.getElementById('main');
          main?.focus();
          main?.scrollIntoView();
        }}
      >
        {t(UI.skip)}
      </a>
      <div className="marine-snow" aria-hidden="true" />
      <header className="site-header">
        <div className="wrap">
          <Link to="/" className="brand" aria-label="S3 Atlas home">
            <BucketMark />
            S3 Atlas
          </Link>
          <nav className={`nav${open ? ' open' : ''}`} aria-label="Main">
            {NAV.map(([to, label]) => (
              <NavLink key={to} to={to} onClick={() => setOpen(false)}>
                {t(label)}
              </NavLink>
            ))}
          </nav>
          <div className="lang-toggle" role="group" aria-label={t(UI.language)}>
            <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>
              EN
            </button>
            <button type="button" aria-pressed={lang === 'ja'} onClick={() => setLang('ja')}>
              日本語
            </button>
          </div>
          <button
            type="button"
            className="menu-button"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {t(UI.menu)}
          </button>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        <ErrorBoundary key={pathname} message={t(UI.pageFailed)} action={t(UI.reload)}>
          <Suspense fallback={<Loading />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
      <footer className="site-footer">
        <div className="wrap">
          <p style={{ maxWidth: '70ch' }}>{t(UI.footerNote)}</p>
          <p>
            <a href="https://github.com/0-draft/s3-atlas">github.com/0-draft/s3-atlas</a>
          </p>
        </div>
      </footer>
    </>
  );
}

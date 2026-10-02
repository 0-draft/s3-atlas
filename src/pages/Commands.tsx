import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CopyButton } from '../components/CopyButton';
import { commands } from '../lib/data/commands';
import { useLang } from '../lib/i18n';
import { UI } from '../lib/ui';

export default function Commands() {
  const { t, lang } = useLang();
  const en = lang === 'en';
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [safeOnly, setSafeOnly] = useState(false);
  const cats = useMemo(() => Array.from(new Set(commands.map((c) => t(c.category)))), [t]);
  const query = q.trim().toLowerCase();
  const list = commands.filter(
    (c) =>
      (cat === 'all' || t(c.category) === cat) &&
      (!safeOnly || !c.danger) &&
      (!query || [t(c.title), t(c.description), c.command].join(' ').toLowerCase().includes(query)),
  );

  return (
    <div className="wrap">
      <header className="page-head">
        <h1>{en ? 'The command cookbook' : 'コマンド大全'}</h1>
        <p>
          {en
            ? `${commands.length} recipes for the AWS CLI, SDKs and third-party tools. Commands that delete or overwrite data are marked; read them twice before running.`
            : `AWS CLI、SDK、サードパーティツールのレシピ ${commands.length} 件。データを削除・上書きするコマンドには印をつけています。実行前に必ず読み返してください。`}
        </p>
      </header>
      <div className="toolbar">
        <input
          className="search"
          type="search"
          placeholder={
            en ? 'Search: sync, presign, lifecycle, glacier…' : '検索: sync, presign, lifecycle, glacier…'
          }
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label={t(UI.search)}
        />
        <label className="check">
          <input type="checkbox" checked={safeOnly} onChange={(e) => setSafeOnly(e.target.checked)} />
          {en ? 'Hide destructive commands' : '破壊的コマンドを隠す'}
        </label>
      </div>
      <div className="chips" style={{ marginBottom: 28 }}>
        <button type="button" className="chip" aria-pressed={cat === 'all'} onClick={() => setCat('all')}>
          {t(UI.all)}
        </button>
        {cats.map((c) => (
          <button key={c} type="button" className="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>
            {c}
          </button>
        ))}
      </div>
      {list.length === 0 && <p className="muted">{t(UI.noResults)}</p>}
      <ul className="cmd-list">
        {list.map((c) => (
          <li key={c.id} className={c.danger ? 'danger' : ''}>
            <div className="cmd-head">
              <h2>{t(c.title)}</h2>
              <span className="muted small">{t(c.category)}</span>
              {c.danger && <span className="pill warn">{t(UI.destructive)}</span>}
            </div>
            <p className="muted">{t(c.description)}</p>
            <div className="code-block">
              <div className="code-bar">
                <span>
                  {/^(import|from|const|package|resource|s3 =|client)/m.test(c.command) ? 'code' : 'shell'}
                </span>
                <CopyButton text={c.command} />
              </div>
              <pre className="md-pre">
                <code>{c.command}</code>
              </pre>
            </div>
          </li>
        ))}
      </ul>
      <p style={{ marginBlock: 40 }}>
        <Link className="btn" to="/docs/07-cli-cookbook">
          {t(UI.readChapter)}
        </Link>
      </p>
    </div>
  );
}

import { Link } from 'react-router-dom';
import { useLang } from '../lib/i18n';
import { UI } from '../lib/ui';

export default function NotFound() {
  const { t } = useLang();
  return (
    <div className="wrap page-head">
      <h1>404</h1>
      <p>{t(UI.notFound)}</p>
      <p style={{ marginTop: 24 }}>
        <Link className="btn" to="/">
          {t(UI.backHome)}
        </Link>
      </p>
    </div>
  );
}

import { useLang } from '../lib/i18n';
import { UI } from '../lib/ui';

export function Loading() {
  const { t } = useLang();
  return (
    <div className="wrap loading" role="status">
      <span className="loading-drop" aria-hidden="true" />
      {t(UI.loading)}
    </div>
  );
}

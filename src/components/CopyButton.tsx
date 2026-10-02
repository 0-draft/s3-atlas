import { useState } from 'react';
import { useLang } from '../lib/i18n';
import { UI } from '../lib/ui';

export function CopyButton({ text, className = 'copy-btn' }: { text: string; className?: string }) {
  const { t } = useLang();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        });
      }}
    >
      {done ? t(UI.copied) : t(UI.copy)}
    </button>
  );
}

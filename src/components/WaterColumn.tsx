import { Link } from 'react-router-dom';
import { useLang } from '../lib/i18n';
import type { StorageClass } from '../lib/types';
import { usd } from '../lib/format';
import { DEPTH_VARS } from '../lib/labels';

// The hero: storage classes stacked as layers of a water column, hottest on top.
export function WaterColumn({ classes }: { classes: StorageClass[] }) {
  const { t, lang } = useLang();
  return (
    <div
      className="column"
      aria-label={lang === 'en' ? 'Storage classes by access speed' : 'アクセス速度順のストレージクラス'}
    >
      <div className="column-surface" aria-hidden="true">
        <svg viewBox="0 0 400 24" preserveAspectRatio="none">
          <path d="M0 12 Q 25 4 50 12 T 100 12 T 150 12 T 200 12 T 250 12 T 300 12 T 350 12 T 400 12 V24 H0Z" />
        </svg>
      </div>
      <span className="column-drop" aria-hidden="true" />
      <ol className="column-layers">
        {classes.map((c, i) => (
          <li
            key={c.id}
            style={{ ['--layer' as string]: `var(${DEPTH_VARS[i] ?? '--d6'})`, ['--i' as string]: i }}
          >
            <Link to={`/classes#${c.id}`}>
              <span className="layer-name">{t(c.name)}</span>
              <span className="layer-latency">{t(c.firstByteLatency)}</span>
              <span className="layer-price">
                {usd(c.pricePerGBMonth, lang)}
                <span className="unit">/GB·mo</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
      <div className="column-floor" aria-hidden="true" />
    </div>
  );
}

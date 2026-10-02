import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { LangContext, pick, type Lang, type LangCtx } from './i18n';

const STORAGE_KEY = 's3-atlas:lang';

function readStoredLang(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'en' || v === 'ja') return v;
  } catch {
    /* storage unavailable */
  }
  return 'en';
}

export function LangProvider({ children, initial }: { children: ReactNode; initial?: Lang }) {
  const [lang, setLangState] = useState<Lang>(initial ?? readStoredLang);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* storage unavailable */
    }
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const value = useMemo<LangCtx>(() => ({ lang, setLang, t: (v) => pick(v, lang) }), [lang, setLang]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

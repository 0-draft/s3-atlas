import { useMemo, useState } from 'react';
import { quiz } from '../lib/data/quiz';
import { useLang } from '../lib/i18n';

const DIFF = {
  easy: { en: 'Easy', ja: '初級' },
  medium: { en: 'Medium', ja: '中級' },
  hard: { en: 'Hard', ja: '上級' },
} as const;

export default function Quiz() {
  const { t, lang } = useLang();
  const en = lang === 'en';
  const [level, setLevel] = useState<'all' | keyof typeof DIFF>('all');
  const items = useMemo(() => quiz.filter((q) => level === 'all' || q.difficulty === level), [level]);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const q = items[i];

  function restart(l = level) {
    setLevel(l);
    setI(0);
    setPicked(null);
    setScore(0);
    setDone(false);
  }

  return (
    <div className="wrap quiz-wrap">
      <header className="page-head">
        <h1>{en ? 'How deep did you go?' : 'どこまで潜れた？'}</h1>
        <p>{en ? 'Pick an answer to see the explanation.' : '選択肢を選ぶと解説が表示されます。'}</p>
      </header>
      <div className="chips" style={{ marginBottom: 28 }}>
        {(['all', 'easy', 'medium', 'hard'] as const).map((l) => (
          <button
            key={l}
            type="button"
            className="chip"
            aria-pressed={level === l}
            onClick={() => restart(l)}
          >
            {l === 'all' ? (en ? 'All levels' : '全レベル') : t(DIFF[l])}
          </button>
        ))}
      </div>
      {done || !q ? (
        <div className="quiz-card">
          <h2>
            {score} / {items.length}
          </h2>
          <p className="muted">
            {score / Math.max(1, items.length) >= 0.8
              ? en
                ? 'Deep Archive level. You know S3.'
                : 'Deep Archive 級。S3 を理解しています。'
              : en
                ? 'Worth another dive. The chapters cover every answer.'
                : 'もう一度潜ってみましょう。全問の答えは各章にあります。'}
          </p>
          <button type="button" className="btn primary" onClick={() => restart()}>
            {en ? 'Start again' : 'もう一度'}
          </button>
        </div>
      ) : (
        <div className="quiz-card">
          <div className="quiz-meta">
            <span>
              {i + 1} / {items.length}
            </span>
            <span className="pill">{t(DIFF[q.difficulty])}</span>
            <span className="pill">{t(q.topic)}</span>
          </div>
          <h2>{t(q.question)}</h2>
          <ol className="quiz-choices">
            {t(q.choices).map((c: string, k: number) => {
              const state =
                picked === null ? '' : k === q.answer ? ' right' : k === picked ? ' wrong' : ' dim';
              return (
                <li key={k}>
                  <button
                    type="button"
                    className={`choice${state}`}
                    disabled={picked !== null}
                    onClick={() => {
                      setPicked(k);
                      if (k === q.answer) setScore((s) => s + 1);
                    }}
                  >
                    {c}
                  </button>
                </li>
              );
            })}
          </ol>
          {picked !== null && (
            <div className="quiz-explain" aria-live="polite">
              <strong>
                {picked === q.answer ? (en ? 'Correct.' : '正解。') : en ? 'Not quite.' : '不正解。'}
              </strong>{' '}
              {t(q.explanation)}
              <div style={{ marginTop: 16 }}>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => {
                    if (i + 1 >= items.length) setDone(true);
                    else {
                      setI(i + 1);
                      setPicked(null);
                    }
                  }}
                >
                  {i + 1 >= items.length
                    ? en
                      ? 'See score'
                      : '結果を見る'
                    : en
                      ? 'Next question'
                      : '次の問題'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

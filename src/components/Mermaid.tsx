import { useEffect, useId, useRef, useState } from 'react';

let mermaidPromise: Promise<typeof import('mermaid').default> | null = null;

function getMermaid() {
  mermaidPromise ??= import('mermaid').then((m) => {
    m.default.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      fontFamily: 'Instrument Sans, Zen Kaku Gothic New, sans-serif',
      themeVariables: {
        darkMode: true,
        background: '#0b1f33',
        primaryColor: '#0f2a44',
        primaryTextColor: '#e6f1f5',
        primaryBorderColor: '#3fa9e8',
        secondaryColor: '#13324d',
        tertiaryColor: '#0b1f33',
        lineColor: '#7fd4f5',
        textColor: '#e6f1f5',
        mainBkg: '#0f2a44',
        nodeBorder: '#3fa9e8',
        clusterBkg: '#0b1f33',
        clusterBorder: '#1b4364',
        edgeLabelBackground: '#0b1f33',
        noteBkgColor: '#13324d',
        noteTextColor: '#e6f1f5',
        actorBkg: '#0f2a44',
        actorBorder: '#3fa9e8',
        actorTextColor: '#e6f1f5',
        signalColor: '#9ab8c8',
        signalTextColor: '#e6f1f5',
        quadrant1Fill: '#0f2a44',
        quadrant2Fill: '#0b1f33',
        quadrant3Fill: '#0b1f33',
        quadrant4Fill: '#0f2a44',
        pie1: '#3fa9e8',
        pie2: '#ffb547',
        pie3: '#5ee0a8',
        pie4: '#8152c4',
        pie5: '#ff7a6b',
        pie6: '#6cf0d8',
      },
    });
    return m.default;
  });
  return mermaidPromise;
}

export function Mermaid({ code }: { code: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getMermaid()
      .then((m) => m.render(`mmd-${id}`, code))
      .then(({ svg }) => {
        if (!cancelled && ref.current) ref.current.innerHTML = svg;
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [code, id]);

  if (failed) {
    return (
      <pre className="md-pre">
        <code>{code}</code>
      </pre>
    );
  }
  return <div className="mermaid-box" ref={ref} role="img" aria-label="diagram" />;
}
